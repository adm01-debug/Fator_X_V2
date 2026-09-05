-- ═══════════════════════════════════════════════════════════════
-- ETAPA 10/50 — audit_log: append-only + insert via service_role only
-- Mitiga: A-05 (audit log tampering)
-- Severity: 🔴 CRÍTICO
-- ═══════════════════════════════════════════════════════════════
-- PROBLEMA 1: INSERT com WITH CHECK (user_id = auth.uid())
--   → usuário pode inserir logs em seu próprio nome (falsificação)
-- PROBLEMA 2: Não há trigger append-only
--   → UPDATE/DELETE são possíveis (log tampering)
-- PROBLEMA 3: Tabela sem workspace_id (difícil filtrar por workspace)
-- SOLUÇÃO: trigger append-only + RPC para insert via service_role +
--           workspace_id adicionado + policy refinada
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- PASSO 1: Trigger append-only (impede UPDATE e DELETE)
-- Se aplicada em produção, RECRIAR a tabela se precisar reverter (não há rollback)
CREATE OR REPLACE FUNCTION public.make_audit_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only: UPDATE and DELETE are prohibited';
END;
$$;

-- Recria trigger se já existir
DROP TRIGGER IF EXISTS prevent_audit_log_update ON public.audit_log;
DROP TRIGGER IF EXISTS prevent_audit_log_delete ON public.audit_log;

CREATE TRIGGER prevent_audit_log_update
    BEFORE UPDATE ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.make_audit_log_immutable();

CREATE TRIGGER prevent_audit_log_delete
    BEFORE DELETE ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.make_audit_log_immutable();

-- PASSO 2: Adicionar workspace_id para filtragem
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='audit_log' AND column_name='workspace_id') THEN
        ALTER TABLE public.audit_log ADD COLUMN workspace_id UUID;
        COMMENT ON COLUMN audit_log.workspace_id IS
            'ETAPA 10: denormalizado do workspace do actor para filtragem RLS';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON public.audit_log(workspace_id);

-- PASSO 3: Refinar policies — service_role faz INSERT, membros leem
-- Drop policies existentes
DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.audit_log;

-- service_role: INSERT (Edge Functions e cron jobs insertam via service_role)
DROP POLICY IF EXISTS "audit_log_service_insert" ON public.audit_log;
CREATE POLICY "audit_log_service_insert" ON public.audit_log
    FOR INSERT WITH CHECK (current_setting('request.jwt.claim.role', true) = 'service_role');

-- Admins + owners do workspace leem logs do workspace
DROP POLICY IF EXISTS "audit_log_workspace_read" ON public.audit_log;
CREATE POLICY "audit_log_workspace_read" ON public.audit_log
    FOR SELECT USING (
        (
            workspace_id IN (
                SELECT workspace_id FROM public.workspace_members
                WHERE user_id = auth.uid()
                  AND role IN ('owner', 'admin')
            )
        )
        OR
        (
            -- Own logs são sempre visíveis
            user_id = auth.uid()
        )
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

-- UPDATE/DELETE: apenas service_role (para operações de migração legítimas)
-- Mas a trigger impede UPDATE/DELETE, então isso é redundante
REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated;
GRANT UPDATE, DELETE ON public.audit_log TO service_role;

-- PASSO 4: RPC para inserting audit log (chamado por Edge Functions)
-- Este RPC insere com workspace_id preenchido automaticamente
CREATE OR REPLACE FUNCTION public.insert_audit_log(
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor_id UUID := NULLIF(current_setting('request.jwt.claim.sub', TRUE), '')::UUID;
    v_workspace_id UUID := NULLIF(current_setting('request.jwt.claim.workspace_id', TRUE), '')::UUID;
    v_new_id UUID;
BEGIN
    INSERT INTO public.audit_log (
        user_id, action, entity_type, entity_id,
        metadata, ip_address, workspace_id
    ) VALUES (
        COALESCE(v_actor_id, auth.uid()),
        p_action,
        p_entity_type,
        p_entity_id,
        p_metadata,
        p_ip_address,
        v_workspace_id
    ) RETURNING id INTO v_new_id;

    RETURN v_new_id;
EXCEPTION WHEN OTHERS THEN
    -- Se o insert falhar, retorna NULL (não bloqueia a operação principal)
    -- O erro é logged pelo caller
    RETURN NULL;
END;
$$;

-- PASSO 5: Validar campos text contra NULL bytes (Log Injection)
CREATE OR REPLACE FUNCTION public.validate_audit_log_fields(
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    -- Verifica NULL bytes (indicação de Log Injection)
    IF p_action LIKE '%' || chr(0) || '%' THEN
        RAISE EXCEPTION 'Invalid action: NULL byte detected';
    END IF;
    IF p_entity_type LIKE '%' || chr(0) || '%' THEN
        RAISE EXCEPTION 'Invalid entity_type: NULL byte detected';
    END IF;
    IF p_entity_id LIKE '%' || chr(0) || '%' THEN
        RAISE EXCEPTION 'Invalid entity_id: NULL byte detected';
    END IF;
    IF p_ip_address LIKE '%' || chr(0) || '%' THEN
        RAISE EXCEPTION 'Invalid ip_address: NULL byte detected';
    END IF;
END;
$$;

-- Atualiza insert_audit_log para usar validação
CREATE OR REPLACE FUNCTION public.insert_audit_log(
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor_id UUID := NULLIF(current_setting('request.jwt.claim.sub', TRUE), '')::UUID;
    v_workspace_id UUID := NULLIF(current_setting('request.jwt.claim.workspace_id', TRUE), '')::UUID;
    v_new_id UUID;
BEGIN
    -- Validação anti-Log-Injection
    PERFORM public.validate_audit_log_fields(p_action, p_entity_type, p_entity_id, p_ip_address);

    INSERT INTO public.audit_log (
        user_id, action, entity_type, entity_id,
        metadata, ip_address, workspace_id
    ) VALUES (
        COALESCE(v_actor_id, auth.uid()),
        p_action,
        p_entity_type,
        p_entity_id,
        p_metadata,
        p_ip_address,
        v_workspace_id
    ) RETURNING id INTO v_new_id;

    RETURN v_new_id;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- PASSO 6: Index para Retention Policy (LGPD — retenção de 5 anos)
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at_retention
    ON public.audit_log(created_at DESC);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
    -- Confirma que os triggers append-only existem
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.audit_log'::regclass
          AND tgname = 'prevent_audit_log_update'
    ) THEN
        RAISE EXCEPTION 'Trigger prevent_audit_log_update não existe!';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.audit_log'::regclass
          AND tgname = 'prevent_audit_log_delete'
    ) THEN
        RAISE EXCEPTION 'Trigger prevent_audit_log_delete não existe!';
    END IF;

    -- Confirma que insert_audit_log RPC existe
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'insert_audit_log'
          AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) THEN
        RAISE EXCEPTION 'insert_audit_log RPC não existe!';
    END IF;

    RAISE NOTICE 'ETAPA 10 OK: audit_log append-only + service_role insert + log injection protection';
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- NOTA DE MIGRAÇÃO DE DADOS LEGADOS
-- ═══════════════════════════════════════════════════════════════
-- Para popular workspace_id em logs existentes (se viável):
-- UPDATE public.audit_log al
-- SET workspace_id = (
--     SELECT wm.workspace_id FROM public.workspace_members wm
--     WHERE wm.user_id = al.user_id LIMIT 1
-- )
-- WHERE al.workspace_id IS NULL
--   AND al.user_id IS NOT NULL;
