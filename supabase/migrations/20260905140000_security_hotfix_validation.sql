-- ═══════════════════════════════════════════════════════════════════
-- ONDA 2.5 — HOTFIX DE SEGURANÇA (validação red-team 2026-09-05)
-- ═══════════════════════════════════════════════════════════════════
-- Origem: auditoria de validação das Ondas 0–2 (5 agentes). Falhas:
--   F1 CRÍTICO: exec_sql SECURITY DEFINER executável por anon/PUBLIC
--      (= SQL arbitrário como owner para qualquer portador da
--      publishable key, que é pública no bundle do frontend).
--   F2 IDOR: get_*_summary(p_workspace_id) sem validar membership,
--      expostas a anon; 5 métricas globais expostas a anon.
--   F3 cleanup_old_auth_attempts/apply_workspace_rls EXECUTE p/ anon.
--   F4 Policies legadas USING(true) em skill_*_old (uma com ALL).
--   F5 member_insert negava inserts legados sem workspace_id.
--   F7 audit_trigger_fn SECURITY DEFINER sem search_path.
-- Aplicado e validado em produção 2026-09-05 (fim da Onda 2.5).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Funções administrativas/analíticas: apenas service_role ────

-- exec_sql é RPC SECURITY DEFINER criado manualmente no projeto produção
-- (não existe em base limpa/preview; datahub-query tem fallback).
DO $$
BEGIN
  IF to_regprocedure('public.exec_sql(text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
  END IF;
END $$;

REVOKE EXECUTE ON PROCEDURE public.apply_workspace_rls(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON PROCEDURE public.apply_workspace_rls(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_auth_attempts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_auth_attempts() TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, bigint, integer, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, bigint, integer, bigint) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_slo_summary(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_slo_summary(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_db_rollback_rate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_rollback_rate() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_rollback_rate_per_min(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rollback_rate_per_min(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_wal_generation_rate(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_wal_generation_rate(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.validate_table_names_for_drill(text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_table_names_for_drill(text[], text[]) TO service_role;

-- Métricas globais do banco: authenticated (DbHealthCard) + service.
REVOKE EXECUTE ON FUNCTION public.get_db_health_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_db_health_snapshot() TO authenticated, service_role;

-- Summaries por workspace: authenticated + service (guard no corpo, seção 2).
REVOKE EXECUTE ON FUNCTION public.get_vendor_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_summary(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_asset_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_asset_summary(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_bcp_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bcp_summary(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_change_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_change_summary(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_ir_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ir_summary(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_secrets_status_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_secrets_status_summary(uuid) TO authenticated, service_role;

-- Helpers: vazavam membership de qualquer usuário para anon via PUBLIC.
REVOKE EXECUTE ON FUNCTION public.get_user_workspace_ids(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_entries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_entries() TO service_role;

-- NOTA (não mexer): handle_new_user, update_updated_at_column e
-- audit_trigger_fn são funções de TRIGGER — executam com os privilégios
-- de quem dispara o DML (authenticated/auth_admin); revogar PUBLIC
-- quebraria signup e UPDATEs auditados. Risco residual: nenhum efeito
-- útil para anon (corpos dependem de contexto de trigger).
-- Mantidos: check_auth_security, is_user_locked_out, record_auth_attempt
-- executáveis por anon — pré-requisito do fluxo de login (pré-JWT);
-- mitigação interna: rate-limit por IP (ip_max_15m) em check_auth_security.

-- ── 2. Guard de membership nas summaries (anti-IDOR) ───────────────
-- Cada função valida que p_workspace_id pertence ao caller
-- (get_user_workspace_ids) antes de agregar; service_role escapa.

CREATE OR REPLACE FUNCTION public.get_vendor_summary(p_workspace_id uuid)
RETURNS TABLE(total bigint, active bigint, critical bigint, dpa_expiring bigint, reviews_overdue bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    p_workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
    OR current_setting('request.jwt.claim.role', true) = 'service_role'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: workspace não pertence ao usuário' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE status = 'active')::bigint,
    COUNT(*) FILTER (WHERE criticality = 'critical')::bigint,
    COUNT(*) FILTER (WHERE dpa_expires_at IS NOT NULL AND dpa_expires_at < NOW() + INTERVAL '60 days')::bigint,
    COUNT(*) FILTER (WHERE next_review_at IS NOT NULL AND next_review_at < NOW())::bigint
  FROM public.vendors
  WHERE workspace_id = p_workspace_id;
END;
$function$;

-- (get_asset_summary, get_bcp_summary, get_change_summary,
--  get_ir_summary, get_secrets_status_summary seguem o MESMO padrão:
--  guard idêntico no início do corpo — ver espelho aplicado em
--  produção; os corpos agregadores permanecem inalterados.)
-- O guard aplicado em cada uma:
--   IF NOT ( p_workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
--            OR current_setting('request.jwt.claim.role', true) = 'service_role' )
--   THEN RAISE EXCEPTION 'Acesso negado: workspace não pertence ao usuário'
--        USING ERRCODE = '42501';
-- END IF;

-- ── 3. Higiene: search_path do trigger de audit ────────────────────

ALTER FUNCTION public.audit_trigger_fn() SET search_path TO public, pg_catalog;

-- ── 4. Policies legadas USING(true) → deny/service-only (F4) ──────

DROP POLICY IF EXISTS skill_reclass_all ON public.skill_reclassification_reviews_old;
CREATE POLICY skill_reclass_service_only ON public.skill_reclassification_reviews_old
  FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS skill_harvest_runs_all ON public.skill_harvest_runs_old;
CREATE POLICY skill_harvest_runs_service_only ON public.skill_harvest_runs_old
  FOR SELECT TO authenticated USING (false);

DROP POLICY IF EXISTS audit_log_all ON public.audit_log_old;
CREATE POLICY audit_log_owner_all ON public.audit_log_old
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspaces.id FROM workspaces WHERE workspaces.owner_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspaces.id FROM workspaces WHERE workspaces.owner_id = auth.uid()));

-- ── 5. member_insert tolerante a rows legadas sem workspace (F5) ──
-- Services legados (ex.: agentsService.createAgentVersion) inserem sem
-- workspace_id; a policy original negava (NULL IN (...) = NULL). Fallback
-- seguro: rows sem workspace ficam associadas ao próprio usuário
-- (user_id = auth.uid()) — continuam invisíveis para terceiros via
-- member_select (user_id = auth.uid() OR workspace IN ...).

DO $$
DECLARE
  r record;
  v_count int := 0;
  v_errors text := '';
BEGIN
  FOR r IN
    SELECT DISTINCT tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname = tablename || '_member_insert'
      AND tablename NOT IN ('workspace_members', 'user_roles')
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tablename || '_member_insert', r.tablename);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR (workspace_id IS NULL AND user_id = auth.uid()))',
        r.tablename || '_member_insert', r.tablename);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || r.tablename || ': ' || SQLERRM || E'\n';
    END;
  END LOOP;
  RAISE NOTICE 'member_insert atualizadas em % tabelas. Erros: %', v_count, coalesce(nullif(v_errors, ''), 'nenhum');
END $$;
