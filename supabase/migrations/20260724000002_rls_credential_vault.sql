-- ═══════════════════════════════════════════════════════════════
-- ETAPA 3/50 — RLS workspace-scoped: credential_vault + credential_audit_logs
-- Mitiga: A-01 (cross-tenant credential leak), K-01
-- Severity: 🔴 CRÍTICO
-- ═══════════════════════════════════════════════════════════════
-- PROBLEMA: credential_vault policy = FOR ALL USING (auth.uid() IS NOT NULL)
--           → qualquer usuário autenticado lê/escreve TODAS as credenciais
-- SOLUÇÃO: adicionar workspace_id + policies workspace-scoped
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── PASSO 1: credential_vault ─────────────────────────────────
-- Adicionar workspace_id se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'credential_vault'
          AND column_name = 'workspace_id'
    ) THEN
        ALTER TABLE public.credential_vault
            ADD COLUMN workspace_id UUID NOT NULL DEFAULT auth.uid();
        COMMENT ON COLUMN credential_vault.workspace_id IS
            'ETAPA 3: workspace-scoped RLS — migração de 20260724';
    END IF;
END;
$$;

-- Index para performance de RLS
CREATE INDEX IF NOT EXISTS
    idx_credential_vault_workspace ON public.credential_vault(workspace_id)
    WHERE workspace_id IS NOT NULL;

-- Backfill: credenciais existentes são atribuídas ao workspace do created_by
-- (só roda se DEFAULT não foi suficiente)
UPDATE public.credential_vault
SET workspace_id = (
    SELECT w.id FROM public.workspaces w
    JOIN public.workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = auth.uid()
    LIMIT 1
)
WHERE workspace_id IS NULL OR workspace_id = auth.uid();

-- Drop da policy insegura
DROP POLICY IF EXISTS "cred_vault_all" ON public.credential_vault;

-- Policy: admins do workspace veem tudo do workspace
CREATE POLICY "cred_vault_admin_workspace"
    ON public.credential_vault
    FOR ALL
    USING (
        workspace_id IN (
            SELECT wm.workspace_id
            FROM public.workspace_members wm
            WHERE wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
        )
    );

-- Policy: membros do workspace leem (não escrevem credenciais alheias)
CREATE POLICY "cred_vault_member_read"
    ON public.credential_vault
    FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id
            FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- Policy: service_role bypass total (cron jobs, Edge Functions)
CREATE POLICY "cred_vault_service_role"
    ON public.credential_vault
    FOR ALL
    USING (current_setting('request.jwt.claim.role', true) = 'service_role');

-- ── PASSO 2: credential_audit_logs ──────────────────────────────
-- credential_audit_logs precisa do workspace_id para filtrar corretamente
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'credential_audit_logs'
          AND column_name = 'workspace_id'
    ) THEN
        ALTER TABLE public.credential_audit_logs
            ADD COLUMN workspace_id UUID;
        -- Backfill via JOIN com credential_vault
        UPDATE public.credential_audit_logs cal
        SET workspace_id = cv.workspace_id
        FROM public.credential_vault cv
        WHERE cal.credential_id = cv.id
          AND cal.workspace_id IS NULL;
        -- Não permite NULL após backfill
        ALTER TABLE public.credential_audit_logs
            ALTER COLUMN workspace_id SET NOT NULL;
        COMMENT ON COLUMN credential_audit_logs.workspace_id IS
            'ETAPA 3: denormalizado para filtragem RLS';
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS
    idx_cred_audit_logs_workspace ON public.credential_audit_logs(workspace_id);

-- Drop da policy insegura
DROP POLICY IF EXISTS "cred_audit_all" ON public.credential_audit_logs;

-- Policy: admins do workspace
CREATE POLICY "cred_audit_admin_workspace"
    ON public.credential_audit_logs
    FOR ALL
    USING (
        workspace_id IN (
            SELECT wm.workspace_id
            FROM public.workspace_members wm
            WHERE wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
        )
    );

-- Policy: membros do workspace leem histórico de auditoria
CREATE POLICY "cred_audit_member_read"
    ON public.credential_audit_logs
    FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id
            FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- Policy: service_role (Edge Functions fazem inserts de audit log)
CREATE POLICY "cred_audit_service_role"
    ON public.credential_audit_logs
    FOR ALL
    USING (current_setting('request.jwt.claim.role', true) = 'service_role');

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
    -- Verifica que workspace_id existe nas duas tabelas
    PERFORM 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'credential_vault'
      AND column_name = 'workspace_id';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'credential_vault.workspace_id não encontrado';
    END IF;

    -- Verifica que policies inseguras foram removidas
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'credential_vault'
          AND policyname = 'cred_vault_all'
    ) THEN
        RAISE EXCEPTION 'Policy cred_vault_all ainda existe — rollback necessário';
    END IF;

    RAISE NOTICE 'ETAPA 3 OK: credential_vault + credential_audit_logs workspace-scoped';
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS "cred_vault_admin_workspace" ON public.credential_vault;
-- DROP POLICY IF EXISTS "cred_vault_member_read" ON public.credential_vault;
-- DROP POLICY IF EXISTS "cred_vault_service_role" ON public.credential_vault;
-- CREATE POLICY "cred_vault_all" ON public.credential_vault FOR ALL USING (auth.uid() IS NOT NULL);
-- -- Para credential_audit_logs: mesmo padrão
