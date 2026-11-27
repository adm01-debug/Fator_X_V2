# Matriz edge function x tabela

> Gerado por `node scripts/ci/gerar-matriz-edge-tabela.mjs` — não editar à mão.
> Fonte: chamadas `.from('tabela')` em `supabase/functions/<funcao>/**/*.ts` (sem testes e sem `_shared`).
>
> Não cobre: tabelas acessadas por `.rpc()` (chamada de função, não de tabela), por nome em variável
> (`from(nome)`) nem por SQL cru. Chamadas `storage.from('bucket')` são bucket de storage, não tabela, e ficam de fora.

## Por função

| Função | Tabelas |
|---|---|
| `a2a-server` | `agents` |
| `agent-conversational-builder` | — |
| `agent-eval-runner` | `agent_eval_datasets`, `agent_eval_results`, `agent_eval_runs`, `agents` |
| `agent-workflow-runner` | `agent_workflow_runs`, `agent_workflows`, `agents` |
| `audio-transcribe` | — |
| `automation-pipeline` | `automation_logs`, `automation_rules` |
| `bitrix24-api` | `workspace_secrets` |
| `bitrix24-oauth` | `workspace_secrets` |
| `bitrix24-webhook` | `agent_routing_config`, `bitrix24_webhook_events`, `trace_events`, `workspace_secrets` |
| `browser-agent-run` | `browser_sessions` |
| `browser-session-cancel` | `browser_sessions` |
| `cerebro-brain` | `agent_memories`, `agent_traces`, `agents`, `chunks`, `documents`, `entity_resolution_logs`, `knowledge_bases`, `knowledge_entities`, `knowledge_relations`, `tool_integrations`, `workflow_steps`, `workflows`, `workspace_members` |
| `cerebro-query` | `agent_traces`, `agents`, `chunks`, `collections`, `knowledge_bases`, `workspace_members` |
| `code-interpreter-execute` | `code_executions` |
| `computer-use-execute` | — |
| `cost-calculator` | `model_pricing` |
| `crm-bitrix-sync` | `crm_activities`, `workspace_secrets` |
| `crm-cadence-runner` | `crm_activities`, `crm_cadence_enrollments`, `crm_cadence_runs`, `crm_cadence_steps`, `crm_cadences`, `crm_companies`, `crm_contacts`, `crm_deals`, `slack_channel_routes` |
| `crm-enrich` | `crm_activities`, `crm_companies`, `crm_contacts` |
| `cron-executor` | `cron_schedule_executions`, `cron_schedules` |
| `datahub-mcp-server` | — |
| `datahub-query` | — |
| `doc-ocr` | — |
| `doc-parse` | `audit_events`, `chunks`, `collections`, `document_ingestions`, `documents` |
| `doc-rechunk` | `audit_events`, `chunks`, `documents`, `workspace_members` |
| `dr-orchestrator` | `dr_drills`, `dr_snapshots` |
| `eval-engine-v2` | `eval_runs` |
| `eval-judge` | `agents`, `evaluation_runs`, `test_cases`, `workspace_members`, `workspace_secrets` |
| `geo-code` | — |
| `global-search` | `agent_eval_datasets`, `agent_workflows`, `agents`, `automation_rules`, `documents`, `kb_articles`, `knowledge_bases` |
| `graph-execute` | `agent_graphs`, `agents`, `graph_executions` |
| `guardrails-engine` | — |
| `guardrails-ml` | — |
| `health-check` | `workspaces` |
| `hf-autotrain` | `agent_traces`, `workspace_members` |
| `image-analysis` | — |
| `incident-orchestrator` | `agents`, `chaos_experiments`, `incident_playbooks` |
| `kb-analyze-gaps` | `kb_query_gaps`, `oracle_history` |
| `kb-translate-article` | `kb_articles`, `kb_translations` |
| `lgpd-manager` | `agent_eval_runs`, `agent_memories`, `consent_records`, `data_deletion_requests`, `security_events`, `sessions`, `traces`, `workspace_members` |
| `llm-gateway` | `agent_traces`, `agent_usage`, `agents`, `audit_events`, `budgets`, `model_pricing`, `session_traces`, `sessions`, `trace_events`, `usage_records`, `workspace_members`, `workspace_secrets` |
| `memory-manager` | `agent_memories` |
| `memory-tools` | `agent_memories`, `workspace_members` |
| `nlp-pipeline` | — |
| `notebook-podcast-generate` | `collections`, `document_ingestions`, `notebook_notes`, `notebook_podcasts`, `workspace_members` |
| `notification-sender` | `notification_templates`, `notifications` |
| `openclaw-proxy` | `openclaw_events` |
| `openclaw-webhook` | `openclaw_events`, `openclaw_whatsapp_instances`, `openclaw_whatsapp_messages`, `webhook_events` |
| `oracle-council` | — |
| `oracle-research` | `oracle_history` |
| `pg-net-smoke-test` | — |
| `product-mockup` | — |
| `queue-worker` | `queue_items`, `task_queues` |
| `quick-agent-test` | — |
| `rag-embed-backfill` | `agent_memories_v2`, `chunks` |
| `rag-embed-v2` | `workspace_members`, `workspace_secrets` |
| `rag-ingest` | `chunks`, `documents`, `workspace_members`, `workspace_secrets` |
| `rag-rerank` | `workspace_members`, `workspace_secrets` |
| `rag-rerank-v2` | `workspace_members`, `workspace_secrets` |
| `replay-fork-execute` | `replay_forks` |
| `sbom-scanner` | `sbom_components`, `sbom_snapshots` |
| `semantic-search` | `chunks`, `documents` |
| `skill-classify-llm` | — |
| `skill-describe-llm` | — |
| `skill-harvester` | `skill_harvest_candidates`, `skill_harvest_runs` |
| `slack-agent-notify` | `audit_events`, `slack_agent_notifications` |
| `slack-alert-dispatcher` | `audit_events`, `slack_channel_routes`, `slack_dispatch_dlq` |
| `slack-dlq-discard` | `slack_dispatch_dlq` |
| `slack-dlq-retry` | `slack_dispatch_dlq` |
| `slack-events-webhook` | `audit_events`, `slack_bot_bindings`, `slack_workspace_config` |
| `slack-rag-sync` | `agent_memories_v2`, `slack_rag_sources` |
| `slack-verify-connection` | `audit_events`, `slack_workspace_config` |
| `smart-model-router` | — |
| `smolagent-runtime` | `agent_traces`, `workspace_members` |
| `synthetic-runner` | `synthetic_checks`, `synthetic_results` |
| `test-runner` | `agents` |
| `text-to-speech` | — |
| `validate-access` | `access_blocked_log`, `geo_allowed_countries`, `ip_whitelist` |
| `visual-search` | — |
| `voice-session` | `voice_sessions`, `workspaces` |
| `voice-synthesize` | `agents`, `voice_sessions` |
| `voice-transcribe` | `voice_sessions` |
| `webhook-receiver` | `webhook_endpoints`, `webhook_events` |
| `whatsapp-outbound` | `workspace_secrets` |
| `whatsapp-router` | `openclaw_events`, `openclaw_whatsapp_instances`, `openclaw_whatsapp_messages` |
| `whatsapp-webhook` | `agent_routing_config`, `openclaw_events`, `trace_events`, `whatsapp_webhook_events`, `workspace_secrets` |
| `widget-proxy` | `agents` |
| `workflow-engine-v2` | `workflow_runs`, `workflow_steps`, `workflows` |

## Por tabela

| Tabela | Funções |
|---|---|
| `access_blocked_log` | `validate-access` |
| `agent_eval_datasets` | `agent-eval-runner`, `global-search` |
| `agent_eval_results` | `agent-eval-runner` |
| `agent_eval_runs` | `agent-eval-runner`, `lgpd-manager` |
| `agent_graphs` | `graph-execute` |
| `agent_memories` | `cerebro-brain`, `lgpd-manager`, `memory-manager`, `memory-tools` |
| `agent_memories_v2` | `rag-embed-backfill`, `slack-rag-sync` |
| `agent_routing_config` | `bitrix24-webhook`, `whatsapp-webhook` |
| `agent_traces` | `cerebro-brain`, `cerebro-query`, `hf-autotrain`, `llm-gateway`, `smolagent-runtime` |
| `agent_usage` | `llm-gateway` |
| `agent_workflow_runs` | `agent-workflow-runner` |
| `agent_workflows` | `agent-workflow-runner`, `global-search` |
| `agents` | `a2a-server`, `agent-eval-runner`, `agent-workflow-runner`, `cerebro-brain`, `cerebro-query`, `eval-judge`, `global-search`, `graph-execute`, `incident-orchestrator`, `llm-gateway`, `test-runner`, `voice-synthesize`, `widget-proxy` |
| `audit_events` | `doc-parse`, `doc-rechunk`, `llm-gateway`, `slack-agent-notify`, `slack-alert-dispatcher`, `slack-events-webhook`, `slack-verify-connection` |
| `automation_logs` | `automation-pipeline` |
| `automation_rules` | `automation-pipeline`, `global-search` |
| `bitrix24_webhook_events` | `bitrix24-webhook` |
| `browser_sessions` | `browser-agent-run`, `browser-session-cancel` |
| `budgets` | `llm-gateway` |
| `chaos_experiments` | `incident-orchestrator` |
| `chunks` | `cerebro-brain`, `cerebro-query`, `doc-parse`, `doc-rechunk`, `rag-embed-backfill`, `rag-ingest`, `semantic-search` |
| `code_executions` | `code-interpreter-execute` |
| `collections` | `cerebro-query`, `doc-parse`, `notebook-podcast-generate` |
| `consent_records` | `lgpd-manager` |
| `crm_activities` | `crm-bitrix-sync`, `crm-cadence-runner`, `crm-enrich` |
| `crm_cadence_enrollments` | `crm-cadence-runner` |
| `crm_cadence_runs` | `crm-cadence-runner` |
| `crm_cadence_steps` | `crm-cadence-runner` |
| `crm_cadences` | `crm-cadence-runner` |
| `crm_companies` | `crm-cadence-runner`, `crm-enrich` |
| `crm_contacts` | `crm-cadence-runner`, `crm-enrich` |
| `crm_deals` | `crm-cadence-runner` |
| `cron_schedule_executions` | `cron-executor` |
| `cron_schedules` | `cron-executor` |
| `data_deletion_requests` | `lgpd-manager` |
| `document_ingestions` | `doc-parse`, `notebook-podcast-generate` |
| `documents` | `cerebro-brain`, `doc-parse`, `doc-rechunk`, `global-search`, `rag-ingest`, `semantic-search` |
| `dr_drills` | `dr-orchestrator` |
| `dr_snapshots` | `dr-orchestrator` |
| `entity_resolution_logs` | `cerebro-brain` |
| `eval_runs` | `eval-engine-v2` |
| `evaluation_runs` | `eval-judge` |
| `geo_allowed_countries` | `validate-access` |
| `graph_executions` | `graph-execute` |
| `incident_playbooks` | `incident-orchestrator` |
| `ip_whitelist` | `validate-access` |
| `kb_articles` | `global-search`, `kb-translate-article` |
| `kb_query_gaps` | `kb-analyze-gaps` |
| `kb_translations` | `kb-translate-article` |
| `knowledge_bases` | `cerebro-brain`, `cerebro-query`, `global-search` |
| `knowledge_entities` | `cerebro-brain` |
| `knowledge_relations` | `cerebro-brain` |
| `model_pricing` | `cost-calculator`, `llm-gateway` |
| `notebook_notes` | `notebook-podcast-generate` |
| `notebook_podcasts` | `notebook-podcast-generate` |
| `notification_templates` | `notification-sender` |
| `notifications` | `notification-sender` |
| `openclaw_events` | `openclaw-proxy`, `openclaw-webhook`, `whatsapp-router`, `whatsapp-webhook` |
| `openclaw_whatsapp_instances` | `openclaw-webhook`, `whatsapp-router` |
| `openclaw_whatsapp_messages` | `openclaw-webhook`, `whatsapp-router` |
| `oracle_history` | `kb-analyze-gaps`, `oracle-research` |
| `queue_items` | `queue-worker` |
| `replay_forks` | `replay-fork-execute` |
| `sbom_components` | `sbom-scanner` |
| `sbom_snapshots` | `sbom-scanner` |
| `security_events` | `lgpd-manager` |
| `session_traces` | `llm-gateway` |
| `sessions` | `lgpd-manager`, `llm-gateway` |
| `skill_harvest_candidates` | `skill-harvester` |
| `skill_harvest_runs` | `skill-harvester` |
| `slack_agent_notifications` | `slack-agent-notify` |
| `slack_bot_bindings` | `slack-events-webhook` |
| `slack_channel_routes` | `crm-cadence-runner`, `slack-alert-dispatcher` |
| `slack_dispatch_dlq` | `slack-alert-dispatcher`, `slack-dlq-discard`, `slack-dlq-retry` |
| `slack_rag_sources` | `slack-rag-sync` |
| `slack_workspace_config` | `slack-events-webhook`, `slack-verify-connection` |
| `synthetic_checks` | `synthetic-runner` |
| `synthetic_results` | `synthetic-runner` |
| `task_queues` | `queue-worker` |
| `test_cases` | `eval-judge` |
| `tool_integrations` | `cerebro-brain` |
| `trace_events` | `bitrix24-webhook`, `llm-gateway`, `whatsapp-webhook` |
| `traces` | `lgpd-manager` |
| `usage_records` | `llm-gateway` |
| `voice_sessions` | `voice-session`, `voice-synthesize`, `voice-transcribe` |
| `webhook_endpoints` | `webhook-receiver` |
| `webhook_events` | `openclaw-webhook`, `webhook-receiver` |
| `whatsapp_webhook_events` | `whatsapp-webhook` |
| `workflow_runs` | `workflow-engine-v2` |
| `workflow_steps` | `cerebro-brain`, `workflow-engine-v2` |
| `workflows` | `cerebro-brain`, `workflow-engine-v2` |
| `workspace_members` | `cerebro-brain`, `cerebro-query`, `doc-rechunk`, `eval-judge`, `hf-autotrain`, `lgpd-manager`, `llm-gateway`, `memory-tools`, `notebook-podcast-generate`, `rag-embed-v2`, `rag-ingest`, `rag-rerank`, `rag-rerank-v2`, `smolagent-runtime` |
| `workspace_secrets` | `bitrix24-api`, `bitrix24-oauth`, `bitrix24-webhook`, `crm-bitrix-sync`, `eval-judge`, `llm-gateway`, `rag-embed-v2`, `rag-ingest`, `rag-rerank`, `rag-rerank-v2`, `whatsapp-outbound`, `whatsapp-webhook` |
| `workspaces` | `health-check`, `voice-session` |
