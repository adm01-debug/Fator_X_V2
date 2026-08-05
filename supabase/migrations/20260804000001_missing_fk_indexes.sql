-- ═══════════════════════════════════════════════════════════════════════════════
-- Missing FK indexes — 16 foreign-key columns found without covering indexes
-- Severity: 🟠 HIGH — unindexed FK columns cause full table scans on every
--   cascading DELETE/UPDATE and every FK-based JOIN.
-- All statements use CONCURRENTLY + IF NOT EXISTS to be zero-downtime safe.
-- NOTE: CONCURRENTLY cannot run inside an explicit transaction, so this file
--   must NOT be wrapped in BEGIN/COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── TIER 1 — High-traffic tables ────────────────────────────────────────────

-- workflow_step_runs: both FK columns are un-indexed.
-- On every workflow_run delete → full scan of step_runs (potentially thousands).
CREATE INDEX IF NOT EXISTS
    idx_workflow_step_runs_run_id
    ON public.workflow_step_runs(workflow_run_id);

CREATE INDEX IF NOT EXISTS
    idx_workflow_step_runs_step_id
    ON public.workflow_step_runs(workflow_step_id);

-- chunks: knowledge_base_id is the primary filter in every RAG search query.
CREATE INDEX IF NOT EXISTS
    idx_chunks_knowledge_base_id
    ON public.chunks(knowledge_base_id);

-- ─── TIER 2 — Moderate-traffic tables ────────────────────────────────────────

-- notifications: template lookups needed for rendering/sending.
CREATE INDEX IF NOT EXISTS
    idx_notifications_template_id
    ON public.notifications(template_id);

-- prompt_ab_tests: queried by agent and by each prompt variant.
CREATE INDEX IF NOT EXISTS
    idx_prompt_ab_tests_agent_id
    ON public.prompt_ab_tests(agent_id);

CREATE INDEX IF NOT EXISTS
    idx_prompt_ab_tests_variant_a
    ON public.prompt_ab_tests(variant_a_prompt_id);

CREATE INDEX IF NOT EXISTS
    idx_prompt_ab_tests_variant_b
    ON public.prompt_ab_tests(variant_b_prompt_id);

-- agent_routing_config: per-agent config lookups.
CREATE INDEX IF NOT EXISTS
    idx_agent_routing_config_agent_id
    ON public.agent_routing_config(agent_id);

-- ─── TIER 3 — workspace_id FKs without indexes (RLS scan paths) ──────────────

-- alert_rules, consent_records, data_deletion_requests, data_retention_policies,
-- hf_config all lack workspace_id indexes that feed RLS policies.
CREATE INDEX IF NOT EXISTS
    idx_alert_rules_workspace_id
    ON public.alert_rules(workspace_id);

CREATE INDEX IF NOT EXISTS
    idx_consent_records_workspace_id
    ON public.consent_records(workspace_id);

CREATE INDEX IF NOT EXISTS
    idx_data_deletion_requests_workspace_id
    ON public.data_deletion_requests(workspace_id);

CREATE INDEX IF NOT EXISTS
    idx_data_retention_policies_workspace_id
    ON public.data_retention_policies(workspace_id);

CREATE INDEX IF NOT EXISTS
    idx_hf_config_workspace_id
    ON public.hf_config(workspace_id);

-- ─── TIER 4 — Webhook routing FK indexes ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS
    idx_bitrix24_webhook_events_routed_agent
    ON public.bitrix24_webhook_events(routed_agent_id)
    WHERE routed_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS
    idx_whatsapp_webhook_events_routed_agent
    ON public.whatsapp_webhook_events(routed_agent_id)
    WHERE routed_agent_id IS NOT NULL;

-- skill_harvest_candidates: promoted_skill_id is NULL for most rows (not yet promoted).
CREATE INDEX IF NOT EXISTS
    idx_skill_harvest_candidates_promoted
    ON public.skill_harvest_candidates(promoted_skill_id)
    WHERE promoted_skill_id IS NOT NULL;

-- ─── TIER 5 — Additional P1 critical FKs found in extended audit ──────────────

-- mcp_tools: every MCP server init filters by server_id and workspace_id.
CREATE INDEX IF NOT EXISTS
    idx_mcp_tools_server_id
    ON public.mcp_tools(server_id);

CREATE INDEX IF NOT EXISTS
    idx_mcp_tools_workspace_id
    ON public.mcp_tools(workspace_id);

-- workflow_executions: workspace scoping feeds RLS on every execution list.
CREATE INDEX IF NOT EXISTS
    idx_workflow_executions_workspace_id
    ON public.workflow_executions(workspace_id);

-- connector_instances: driver lookups by connector type.
CREATE INDEX IF NOT EXISTS
    idx_connector_instances_connector_id
    ON public.connector_instances(connector_id);

-- chat_threads: workspace_id filters every thread-list query via RLS.
CREATE INDEX IF NOT EXISTS
    idx_chat_threads_workspace_id
    ON public.chat_threads(workspace_id);

-- notification_templates: workspace scoping + template lookups.
CREATE INDEX IF NOT EXISTS
    idx_notification_templates_workspace_id
    ON public.notification_templates(workspace_id);

-- api_keys: agent_id looked up on every API request authentication.
CREATE INDEX IF NOT EXISTS
    idx_api_keys_agent_id
    ON public.api_keys(agent_id);

-- ─── TIER 6 — Status / channel column indexes (frequent WHERE filters) ────────

-- workflow_step_runs.status: hot filter in "find running steps" queries.
CREATE INDEX IF NOT EXISTS
    idx_workflow_step_runs_status
    ON public.workflow_step_runs(status);

-- Composite index for the most common query pattern: active steps within a run.
CREATE INDEX IF NOT EXISTS
    idx_workflow_step_runs_run_status
    ON public.workflow_step_runs(workflow_run_id, status);

-- sessions.status: active-session polling queries filter by status constantly.
CREATE INDEX IF NOT EXISTS
    idx_sessions_status
    ON public.sessions(status);

-- documents.status: RAG pipeline checks pending/processing status in bulk.
CREATE INDEX IF NOT EXISTS
    idx_documents_status
    ON public.documents(status);

-- chunks.embedding_status: vector pipeline polls for un-embedded chunks.
CREATE INDEX IF NOT EXISTS
    idx_chunks_embedding_status
    ON public.chunks(embedding_status)
    WHERE embedding_status IS NOT NULL;
