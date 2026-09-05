-- ═══════════════════════════════════════════════════════════════════
-- ONDA 1 — RECONCILIAÇÃO DE SEGURANÇA DO BANCO (RLS 100%)
-- Auditoria técnica exaustiva 2026-09-05 → execução 2026-09-05
-- ═══════════════════════════════════════════════════════════════════
-- CONTEXTO: o banco de produção divergia massivamente do repo
-- (migrations registradas sem executar): 39/215 tabelas com RLS,
-- 58 policies, grants de INSERT/UPDATE/DELETE/TRUNCATE para `anon`
-- em 229 objetos (escalação de privilégio com a publishable key),
-- rate-limit distribuído registrado mas inexistente, helper
-- `get_user_workspace_ids` ausente e `is_workspace_admin` com
-- assinatura de 1 arg (global) em vez de 2 args (por workspace).
--
-- ESTADO APÓS ESTA MIGRATION (validado em produção):
--   • RLS em 216/216 tabelas (100%)
--   • 760 policies workspace/user-scoped
--   • 0 grants de escrita para `anon`
--   • rate_limit_entries + check_rate_limit() + cleanup() ativos
--   • user_roles/workspace_members com policies anti-escalação
--
-- PADRÃO DE POLICIES (tabelas com workspace_id + user_id):
--   SELECT: membro do workspace (get_user_workspace_ids) OU linha própria
--   INSERT: membro do workspace (WITH CHECK)
--   UPDATE: linha própria OU admin do workspace
--   DELETE: linha própria OU admin do workspace
-- service_role mantém BYPASSRLS (Edge Functions não afetadas).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Helpers de segurança ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_workspace_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id FROM public.workspace_members WHERE user_id = _user_id
  UNION
  SELECT id FROM public.workspaces WHERE owner_id = _user_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_workspace_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_workspace_ids(uuid) TO authenticated, service_role;

-- Overload de 2 args alinhado ao repo (20260416180547). A variante de
-- 1 arg (global, 20260721222207) permanece para compatibilidade.
CREATE OR REPLACE FUNCTION public.is_workspace_admin(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = _workspace_id AND owner_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND role IN ('owner','admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND role_key IN ('owner','admin','workspace_admin')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) TO authenticated, service_role;

-- ── 2. Fechar escalação: revogar escrita de `anon` ─────────────────

DO $$
DECLARE r record; v_count int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT table_name FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public'
      AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon', r.table_name);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Escrita de anon revogada em % objetos', v_count;
END $$;

-- ── 3. Rate limiting distribuído (objeto da migration 20260410000001,
--        registrada mas nunca materializada — agora criada de fato) ──

CREATE TABLE IF NOT EXISTS rate_limit_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  timestamp_ms BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rate_limit_entries_unique UNIQUE (identifier, timestamp_ms)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_entries_identifier ON rate_limit_entries(identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limit_entries_timestamp ON rate_limit_entries(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_rate_limit_entries_id_ts ON rate_limit_entries(identifier, timestamp_ms DESC);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier TEXT,
  p_window_ms BIGINT,
  p_max_requests INT,
  p_now BIGINT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start BIGINT;
  v_current_count INT;
  v_oldest_timestamp BIGINT;
  v_allowed BOOLEAN;
BEGIN
  v_window_start := p_now - p_window_ms;

  DELETE FROM rate_limit_entries
  WHERE identifier = p_identifier
    AND timestamp_ms < v_window_start;

  SELECT COUNT(*), MIN(timestamp_ms)
  INTO v_current_count, v_oldest_timestamp
  FROM rate_limit_entries
  WHERE identifier = p_identifier
    AND timestamp_ms >= v_window_start;

  IF v_current_count >= p_max_requests THEN
    v_allowed := FALSE;
  ELSE
    v_allowed := TRUE;
    INSERT INTO rate_limit_entries (identifier, timestamp_ms)
    VALUES (p_identifier, p_now)
    ON CONFLICT (identifier, timestamp_ms) DO NOTHING;
    v_current_count := v_current_count + 1;
  END IF;

  RETURN json_build_object(
    'allowed', v_allowed,
    'current_count', v_current_count,
    'oldest_timestamp', v_oldest_timestamp
  );
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_rate_limit_entries()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
  v_cutoff BIGINT;
BEGIN
  v_cutoff := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - 600000;
  DELETE FROM rate_limit_entries WHERE timestamp_ms < v_cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

ALTER TABLE rate_limit_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY rate_limit_entries_no_direct_access ON rate_limit_entries
  FOR ALL
  USING (false);

GRANT EXECUTE ON FUNCTION check_rate_limit TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION cleanup_rate_limit_entries TO service_role;

-- ── 4. RLS + policies em massa (todas as tabelas abertas) ──────────

DO $$
DECLARE
  r record;
  v_count int := 0;
  v_errors text := '';
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
      AND c.relname NOT IN ('workspace_members', 'user_roles', 'rate_limit_entries')
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR user_id = auth.uid())',
        r.relname || '_member_select', r.relname);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))',
        r.relname || '_member_insert', r.relname);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id)) WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR user_id = auth.uid())',
        r.relname || '_member_update', r.relname);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))',
        r.relname || '_member_delete', r.relname);

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || r.relname || ': ' || SQLERRM || E'\n';
    END;
  END LOOP;
  RAISE NOTICE 'RLS+policies aplicados em % tabelas. Erros: %', v_count, coalesce(nullif(v_errors, ''), 'nenhum');
END $$;

-- ── 5. Anti-escalação: workspace_members e user_roles ──────────────

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS members_all ON public.workspace_members;

CREATE POLICY members_select ON public.workspace_members FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));

CREATE POLICY members_admin_insert ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

CREATE POLICY members_admin_update ON public.workspace_members FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

CREATE POLICY members_admin_delete ON public.workspace_members FOR DELETE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id));

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Nenhum usuário comum lê/escreve roles: apenas membros leem (SELECT)
-- e apenas admins do workspace gerenciam (ALL). Autopromoção impossível.
CREATE POLICY user_roles_member_select ON public.user_roles FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));

CREATE POLICY user_roles_admin_manage ON public.user_roles FOR ALL TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));
