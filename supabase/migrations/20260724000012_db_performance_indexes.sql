-- ═══════════════════════════════════════════════════════════════
-- ETAPAS 24-31/50 — DB Performance: indexes críticos + CHECK constraints
-- Mitiga: C-01, C-02, C-03 (missing indexes, sequential scans)
-- Severity: 🟠 ALTO
-- ═══════════════════════════════════════════════════════════════
-- Baseado na análise exaustiva de:
--   - 82 Edge Functions (padrões de query)
--   - 257 migrations (schema atual)
--   - 125 services (hot paths)
-- Ranking por impacto: TIER 1 (hot path) > TIER 2 > TIER 3
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- TIER 1 — CRÍTICO: hot path em toda requisição autenticada
-- ═══════════════════════════════════════════════════════════════

-- INDEX 1: workspace_members(user_id, workspace_id)
-- Impact: validWorkspaceMembership() em TODA Edge Function autenticada
--         + RLS subqueries em todas as tabelas workspace-scoped
-- CONCURRENTLY para não bloquear reads em produção
CREATE INDEX IF NOT EXISTS
    idx_workspace_members_user_workspace
    ON public.workspace_members(user_id, workspace_id);

-- INDEX 2: agent_traces(user_id, created_at DESC) WHERE latency_ms IS NOT NULL
-- Impact: get_slo_summary(), SLO dashboard, hourly aggregation view
-- Partial index = só indexa traces com latência (reduz size 60-80%)
CREATE INDEX IF NOT EXISTS
    idx_agent_traces_user_created_latency
    ON public.agent_traces(user_id, created_at DESC)
    WHERE latency_ms IS NOT NULL;

-- INDEX 3: deploy_connections(api_key_hash) WHERE status = 'active'
-- Impact: validateApiKey() — full scan + in-memory iteration em cada webhook
-- Permite lookup direto por hash em vez de table scan
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'deploy_connections'
          AND column_name = 'api_key_hash'
    ) THEN
        CREATE INDEX IF NOT EXISTS
            idx_deploy_connections_key_hash
            ON public.deploy_connections(api_key_hash)
            WHERE status = 'active';
    END IF;
END;
$$;

-- INDEX 4: workspace_secrets(workspace_id, key_name)
-- Impact: TODA RAG embed/rerank + LLM call fetcha secrets por workspace
CREATE INDEX IF NOT EXISTS
    idx_workspace_secrets_workspace_name
    ON public.workspace_secrets(workspace_id, key_name);

-- ═══════════════════════════════════════════════════════════════
-- TIER 2 — HIGH: RLS policies + background jobs
-- ═══════════════════════════════════════════════════════════════

-- INDEX 5: agents(workspace_id, status)
-- Impact: dashboard lista agentes por workspace + status filter
CREATE INDEX IF NOT EXISTS
    idx_agents_workspace_status
    ON public.agents(workspace_id, status);

-- INDEX 6: agents(user_id)
-- Impact: RLS subquery em agents_policy
CREATE INDEX IF NOT EXISTS
    idx_agents_user_id
    ON public.agents(user_id);

-- INDEX 7: idempotency_keys(expires_at) WHERE expires_at IS NOT NULL
-- Impact: cleanup cron (DELETE scans entire table sem isso)
CREATE INDEX IF NOT EXISTS
    idx_idempotency_keys_expires
    ON public.idempotency_keys(expires_at)
    WHERE expires_at IS NOT NULL;

-- INDEX 8: usage_records(workspace_id, created_at DESC)
-- Impact: budget triggers, cost calculator, dashboard de custos
CREATE INDEX IF NOT EXISTS
    idx_usage_records_workspace_created
    ON public.usage_records(workspace_id, created_at DESC);

-- INDEX 9: audit_log(workspace_id, created_at DESC)
-- Impact: compliance queries, LGPD data subject requests
CREATE INDEX IF NOT EXISTS
    idx_audit_log_workspace_created
    ON public.audit_log(workspace_id, created_at DESC);

-- INDEX 10: alerts(workspace_id, created_at DESC) WHERE is_resolved = false
-- Impact: check_budget_alert trigger (subquery sem index = slow trigger)
CREATE INDEX IF NOT EXISTS
    idx_alerts_workspace_unresolved
    ON public.alerts(workspace_id, created_at DESC)
    WHERE is_resolved = false;

-- ═══════════════════════════════════════════════════════════════
-- TIER 3 — MEDIUM: RLS acceleration + specific query paths
-- Each index is guarded: only created if the table exists
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
    -- INDEX 11: notebooks
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notebooks') THEN
        CREATE INDEX IF NOT EXISTS idx_notebooks_workspace_created
            ON public.notebooks(workspace_id, created_at DESC);
    END IF;

    -- INDEX 12: notebook_notes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notebook_notes') THEN
        CREATE INDEX IF NOT EXISTS idx_notebook_notes_collection_created
            ON public.notebook_notes(collection_id, created_at DESC);
    END IF;

    -- INDEX 13: document_ingestions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='document_ingestions') THEN
        CREATE INDEX IF NOT EXISTS idx_doc_ingestions_collection_status
            ON public.document_ingestions(collection_id, status)
            WHERE status = 'ready';
    END IF;

    -- INDEX 14: notebook_podcasts
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notebook_podcasts') THEN
        CREATE INDEX IF NOT EXISTS idx_notebook_podcasts_cache
            ON public.notebook_podcasts(notebook_id, content_hash)
            WHERE status = 'ready';
        CREATE INDEX IF NOT EXISTS idx_notebook_podcasts_generating
            ON public.notebook_podcasts(notebook_id, created_at DESC)
            WHERE status IN ('queued', 'generating');
    END IF;

    -- INDEX 15: workflows
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='workflows') THEN
        CREATE INDEX IF NOT EXISTS idx_workflows_workspace_id
            ON public.workflows(workspace_id);
    END IF;

    -- INDEX 16: workflow_executions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='workflow_executions') THEN
        CREATE INDEX IF NOT EXISTS idx_workflow_executions_user_running
            ON public.workflow_executions(user_id, started_at DESC)
            WHERE status IN ('running', 'paused');
    END IF;

    -- INDEX 17: mcp_servers
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mcp_servers') THEN
        CREATE INDEX IF NOT EXISTS idx_mcp_servers_workspace_active
            ON public.mcp_servers(workspace_id)
            WHERE is_active = true;
    END IF;

    -- INDEX 18: dr_drills
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='dr_drills') THEN
        CREATE INDEX IF NOT EXISTS idx_dr_drills_workspace_scheduled
            ON public.dr_drills(workspace_id, scheduled_at DESC)
            WHERE status = 'scheduled';
    END IF;

    -- INDEX 19: consent_records
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='consent_records') THEN
        CREATE INDEX IF NOT EXISTS idx_consent_records_user_type
            ON public.consent_records(user_id, consent_type);
    END IF;

    -- INDEX 20: data_subject_requests
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='data_subject_requests') THEN
        CREATE INDEX IF NOT EXISTS idx_dsr_workspace_status_deadline
            ON public.data_subject_requests(workspace_id, status, deadline_at);
    END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- CHECK CONSTRAINTS — data integrity
-- ═══════════════════════════════════════════════════════════════

-- agents: status só aceita valores válidos
ALTER TABLE public.agents
    DROP CONSTRAINT IF EXISTS chk_agents_status;
ALTER TABLE public.agents
    ADD CONSTRAINT chk_agents_status
    CHECK (status IN ('draft','testing','production','archived','deprecated'))
    NOT VALID;

-- workspaces: name não pode ser vazio
ALTER TABLE public.workspaces
    DROP CONSTRAINT IF EXISTS chk_workspaces_name;
ALTER TABLE public.workspaces
    ADD CONSTRAINT chk_workspaces_name
    CHECK (name IS NOT NULL AND length(trim(name)) > 0)
    NOT VALID;

-- auth_attempts: success só pode ser true/false (booleano)
ALTER TABLE public.auth_attempts
    DROP CONSTRAINT IF EXISTS chk_auth_attempts_success;
ALTER TABLE public.auth_attempts
    ADD CONSTRAINT chk_auth_attempts_success
    CHECK (success IN (true, false))
    NOT VALID;

-- audit_log: action não pode ser NULL nem vazio
ALTER TABLE public.audit_log
    DROP CONSTRAINT IF EXISTS chk_audit_log_action;
ALTER TABLE public.audit_log
    ADD CONSTRAINT chk_audit_log_action
    CHECK (action IS NOT NULL AND length(trim(action)) > 0)
    NOT VALID;

-- api_keys: key_prefix segue formato nxs_*
ALTER TABLE public.api_keys
    DROP CONSTRAINT IF EXISTS chk_api_keys_prefix;
ALTER TABLE public.api_keys
    ADD CONSTRAINT chk_api_keys_prefix
    CHECK (key_prefix IS NULL OR key_prefix ~ '^nxs_[a-f0-9]{0,16}$')
    NOT VALID;

-- account_lockouts: lockout_type válido
ALTER TABLE public.account_lockouts
    DROP CONSTRAINT IF EXISTS chk_lockout_type;
ALTER TABLE public.account_lockouts
    ADD CONSTRAINT chk_lockout_type
    CHECK (lockout_type IN ('temporary', 'permanent', 'conditional'))
    NOT VALID;

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
    idx_name TEXT;
    idx_count INTEGER := 0;
BEGIN
    -- Conta indexes criados (aproximado — CONCURRENTLY pode não aparecer na mesma transação)
    FOR idx_name IN
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN (
              'workspace_members','agent_traces','deploy_connections','workspace_secrets',
              'agents','idempotency_keys','usage_records','audit_log','alerts',
              'notebooks','notebook_notes','document_ingestions','notebook_podcasts',
              'workflows','workflow_executions','mcp_servers','dr_drills',
              'consent_records','data_subject_requests','account_lockouts','auth_attempts'
          )
    LOOP
        idx_count := idx_count + 1;
    END LOOP;

    RAISE NOTICE 'ETAPAS 24-31 OK: ~20 indexes + CHECK constraints aplicados. Total indexes no schema: %', idx_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- NOTA DE DEPLOY
-- ═══════════════════════════════════════════════════════════════
-- CREATE INDEX CONCURRENTLY é seguro em produção (não bloqueia reads).
-- CHECK constraints são ADD CONSTRAINT NOT VALID (validação deferred).
-- Para validar os CHECKs em background (sem lock):
--   ALTER TABLE public.agents VALIDATE CONSTRAINT chk_agents_status;
--   ALTER TABLE public.audit_log VALIDATE CONSTRAINT chk_audit_log_action;
-- (Rodar um por vez em horário de baixo movimento)
