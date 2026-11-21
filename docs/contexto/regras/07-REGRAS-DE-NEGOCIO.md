# 07 · REGRAS DE NEGÓCIO

> Gerado automaticamente por AI Context Sync v1.3.2 · commit `fbe64eef7d` · branch `main` · 2026-11-21 17:12 UTC
> Não edite à mão — regras humanas vão em `manual/`.

## A. Regras escritas por humanos (`manual/` — prioridade máxima, nunca sobrescrito)

_Nenhum arquivo em `manual/`. Copie `manual/TEMPLATE-regras-de-negocio.md` para `manual/regras.md` e preencha._

## B. Quem pode ver/alterar o quê (RLS — conforme migrations do repo; schema real em `06`)

| Tabela | Política | Comando | Roles | Modo | USING | WITH CHECK |
|---|---|---|---|---|---|---|
| `workspaces` | Owner can update workspace | UPDATE | authenticated | permissive | `owner_id = auth.uid()` |  |
| `workspaces` | Users can insert workspaces | INSERT | authenticated | permissive |  | `owner_id = auth.uid()` |
| `workspace_members` | Members see workspace members | SELECT | authenticated | permissive | `workspace_id IN ( SELECT workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid() )` |  |
| `agent_templates` | templates_public_select | SELECT | authenticated | permissive | `is_public = true OR created_by = auth.uid()` |  |
| `agent_templates` | templates_insert | INSERT | authenticated | permissive |  | `created_by = auth.uid()` |
| `workspace_secrets` | Admins can insert workspace secrets | INSERT | authenticated | permissive |  | `workspace_id IN ( SELECT ws.id FROM public.workspaces ws WHERE ws.owner_id = auth.uid() )` |
| `workspace_secrets` | Admins can update workspace secrets | UPDATE | authenticated | permissive | `workspace_id IN ( SELECT ws.id FROM public.workspaces ws WHERE ws.owner_id = auth.uid() )` |  |
| `workspace_secrets` | Admins can delete workspace secrets | DELETE | authenticated | permissive | `workspace_id IN ( SELECT ws.id FROM public.workspaces ws WHERE ws.owner_id = auth.uid() )` |  |
| `oracle_history` | Users can insert own oracle history | INSERT | authenticated | permissive |  | `auth.uid() = user_id` |
| `oracle_history` | Users can view own oracle history | SELECT | authenticated | permissive | `auth.uid() = user_id` |  |
| `oracle_history` | Users can delete own oracle history | DELETE | authenticated | permissive | `auth.uid() = user_id` |  |
| `agents` | Users can delete own agents | DELETE | authenticated | permissive | `user_id = auth.uid()` |  |
| `agents` | Users can insert own agents | INSERT | authenticated | permissive |  | `user_id = auth.uid()` |
| `agents` | Users can update own agents | UPDATE | authenticated | permissive | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `agent_usage` | Users can insert own usage | INSERT | authenticated | permissive |  | `user_id = auth.uid()` |
| `agent_usage` | Users can update own usage | UPDATE | authenticated | permissive | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `agent_usage` | Users can delete own usage | DELETE | authenticated | permissive | `user_id = auth.uid()` |  |
| `agent_usage` | Users can view own usage | SELECT | authenticated | permissive | `user_id = auth.uid()` |  |
| `agent_memories` | ws_agent_memories_all | ALL | authenticated | permissive | `user_id = auth.uid() OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` | `user_id = auth.uid() OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` |
| `mcp_servers` | ws_mcp_servers_all | ALL | authenticated | permissive | `workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` | `workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` |
| `mcp_tools` | ws_mcp_tools_all | ALL | authenticated | permissive | `workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` | `workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` |
| `workflows` | ws_workflows_all | ALL | authenticated | permissive | `workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` | `workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` |
| `workflow_executions` | ws_workflow_executions_all | ALL | authenticated | permissive | `workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` | `workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` |
| `workspaces` | Owner can delete workspace | DELETE | authenticated | permissive | `owner_id = auth.uid()` |  |
| `workspace_members` | Workspace owners can add members | INSERT | authenticated | permissive |  | `EXISTS ( SELECT 1 FROM public.workspaces WHERE workspaces.id = workspace_id AND workspaces.owner_id = auth.uid() )` |
| `sessions` | sessions_all | ALL | authenticated | permissive | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `model_pricing` | pricing_read | SELECT | authenticated | permissive | `true` |  |
| `agent_memories` | memories_all | ALL | authenticated | permissive | `workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid())` | `workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid())` |
| `workflow_step_runs` | step_runs_all | ALL | authenticated | permissive | `workflow_run_id IN (SELECT wr.id FROM public.workflow_runs wr WHERE wr.workflow_id IN (SELECT w.id FROM public.workflows w WHERE w.workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid())))` | `workflow_run_id IN (SELECT wr.id FROM public.workflow_runs wr WHERE wr.workflow_id IN (SELECT w.id FROM public.workflows w WHERE w.workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid())))` |
| `alert_rules` | alert_rules_all | ALL | authenticated | permissive | `workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid())` | `workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid())` |
| `prompt_ab_tests` | ab_tests_all | ALL | authenticated | permissive | `agent_id IN (SELECT a.id FROM public.agents a WHERE a.user_id = auth.uid())` | `agent_id IN (SELECT a.id FROM public.agents a WHERE a.user_id = auth.uid())` |
| `audit_log` | Audit log insert for authenticated | INSERT | authenticated | permissive |  | `true` |
| `agent_versions` | Agent versions readable by workspace | SELECT | authenticated | permissive | `agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())` |  |
| `agent_versions` | Agent versions insertable by owner | INSERT | authenticated | permissive |  | `agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())` |
| `consent_records` | Consent readable by user | ALL | authenticated | permissive | `user_id = auth.uid()` |  |
| `data_deletion_requests` | Deletion requests by user | ALL | authenticated | permissive | `user_id = auth.uid()` |  |
| `model_pricing` | Authenticated users can read pricing | SELECT | authenticated | permissive | `true` |  |
| `audit_log` | Block direct insert on audit_log | INSERT | authenticated | permissive |  | `false` |
| `audit_log` | Block update on audit_log | UPDATE | authenticated | permissive | `false` | `false` |
| `audit_log` | Block delete on audit_log | DELETE | authenticated | permissive | `false` |  |
| `agent_memories` | Users can manage memories in their workspace | ALL | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |
| `alerts` | alerts_all | ALL | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |
| `budgets` | budgets_all | ALL | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |
| `environments` | environments_all | ALL | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |
| `evaluation_datasets` | evaluation_datasets_all | ALL | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |
| `evaluation_runs` | evals_workspace_all | ALL | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |
| `guardrail_policies` | guardrail_policies_all | ALL | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |
| `knowledge_bases` | kb_workspace_all | ALL | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |
| `usage_records` | usage_records_all | ALL | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |
| `workflows` | workflows_all | ALL | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |
| `workflow_steps` | workflow_steps_all | ALL | authenticated | permissive | `workflow_id IN (SELECT w.id FROM workflows w WHERE w.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` | `workflow_id IN (SELECT w.id FROM workflows w WHERE w.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` |
| `workflow_runs` | workflow_runs_all | ALL | authenticated | permissive | `workflow_id IN (SELECT w.id FROM workflows w WHERE w.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` | `workflow_id IN (SELECT w.id FROM workflows w WHERE w.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` |
| `collections` | collections_all | ALL | authenticated | permissive | `knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHERE kb.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` | `knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHERE kb.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` |
| `documents` | documents_all | ALL | authenticated | permissive | `collection_id IN (SELECT col.id FROM collections col WHERE col.knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHERE kb.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))))` | `collection_id IN (SELECT col.id FROM collections col WHERE col.knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHERE kb.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))))` |
| `chunks` | chunks_all | ALL | authenticated | permissive | `document_id IN (SELECT doc.id FROM documents doc WHERE doc.collection_id IN (SELECT col.id FROM collections col WHERE col.knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHERE kb.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))))` | `document_id IN (SELECT doc.id FROM documents doc WHERE doc.collection_id IN (SELECT col.id FROM collections col WHERE col.knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHERE kb.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))))` |
| `vector_indexes` | vector_indexes_all | ALL | authenticated | permissive | `knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHERE kb.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` | `knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHERE kb.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` |
| `test_cases` | test_cases_all | ALL | authenticated | permissive | `dataset_id IN (SELECT ed.id FROM evaluation_datasets ed WHERE ed.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` | `dataset_id IN (SELECT ed.id FROM evaluation_datasets ed WHERE ed.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` |
| `workspaces` | Users see own workspaces | SELECT | authenticated | permissive | `owner_id = auth.uid() OR id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `agent_versions` | Users can update agent versions | UPDATE | authenticated | permissive | `agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())` | `agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())` |
| `agent_versions` | Users can delete agent versions | DELETE | authenticated | permissive | `agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())` |  |
| `agent_versions` | Users can create agent versions | INSERT | authenticated | permissive |  | `agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())` |
| `agent_versions` | Users can view agent versions | SELECT | authenticated | permissive | `agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())` |  |
| `finetune_jobs` | Users can view finetune jobs in their workspace | SELECT | public | permissive | `workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())` |  |
| `finetune_jobs` | Users can create finetune jobs in their workspace | INSERT | public | permissive |  | `workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())` |
| `finetune_jobs` | Users can update finetune jobs they created | UPDATE | public | permissive | `user_id = auth.uid()` |  |
| `hf_config` | Users can view HF config for their workspace | SELECT | public | permissive | `workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())` |  |
| `hf_config` | Admins can manage HF config | ALL | public | permissive | `workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role = 'admin')` |  |
| `rate_limit_logs` | Service role can manage rate_limit_logs | ALL | public | permissive | `auth.role() = 'service_role'` |  |
| `api_keys` | Users can manage own workspace API keys | ALL | public | permissive | `workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )` |  |
| `security_events` | Users can read own workspace security events | SELECT | public | permissive | `user_id = auth.uid() OR workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )` |  |
| `security_events` | Service role can manage security events | ALL | public | permissive | `auth.role() = 'service_role'` |  |
| `roles` | Authenticated users can read roles | SELECT | public | permissive | `auth.role() = 'authenticated'` |  |
| `permissions` | Authenticated users can read permissions | SELECT | public | permissive | `auth.role() = 'authenticated'` |  |
| `role_permissions` | Authenticated users can read role_permissions | SELECT | public | permissive | `auth.role() = 'authenticated'` |  |
| `user_roles` | Users can read roles in own workspace | SELECT | public | permissive | `workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )` |  |
| `user_roles` | Admins can manage user roles | ALL | public | permissive | `EXISTS ( SELECT 1 FROM public.user_roles ur JOIN public.roles r ON ur.role_key = r.key WHERE ur.user_id = auth.uid() AND ur.workspace_id = user_roles.workspace_id AND r.level >= 100 )` |  |
| `agent_permissions` | Users can read own agent permissions | SELECT | public | permissive | `user_id = auth.uid()` |  |
| `roles` | Service role manages all | ALL | public | permissive | `auth.role() = 'service_role'` |  |
| `permissions` | Service role manages permissions | ALL | public | permissive | `auth.role() = 'service_role'` |  |
| `role_permissions` | Service role manages role_permissions | ALL | public | permissive | `auth.role() = 'service_role'` |  |
| `agent_permissions` | Service role manages agent_permissions | ALL | public | permissive | `auth.role() = 'service_role'` |  |
| `mcp_servers` | Users can manage own workspace MCP servers | ALL | public | permissive | `workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )` |  |
| `mcp_servers` | Service role manages MCP servers | ALL | public | permissive | `auth.role() = 'service_role'` |  |
| `workspace_secrets` | No direct SELECT on secrets | SELECT | authenticated | permissive | `false` |  |
| `audit_log` | Users can read own audit log | SELECT | authenticated | permissive | `auth.uid() = user_id` |  |
| `api_keys` | Users can read own api_keys | SELECT | authenticated | permissive | `auth.uid() = user_id` |  |
| `api_keys` | Users can create own api_keys | INSERT | authenticated | permissive |  | `auth.uid() = user_id` |
| `api_keys` | Users can update own api_keys | UPDATE | authenticated | permissive | `auth.uid() = user_id` |  |
| `api_keys` | Users can delete own api_keys | DELETE | authenticated | permissive | `auth.uid() = user_id` |  |
| `consent_records` | Users can manage own consents | INSERT | authenticated | permissive |  | `auth.uid() = user_id` |
| `consent_records` | Users can update own consents | UPDATE | authenticated | permissive | `auth.uid() = user_id` |  |
| `consent_records` | Users can view own consents | SELECT | authenticated | permissive | `auth.uid() = user_id` |  |
| `data_deletion_requests` | Users can create deletion requests | INSERT | authenticated | permissive |  | `auth.uid() = user_id` |
| `data_deletion_requests` | Users can view own deletion requests | SELECT | authenticated | permissive | `auth.uid() = user_id` |  |
| `workflow_executions` | Users can manage own workflow executions | ALL | public | permissive | `auth.uid() = user_id` |  |
| `workflow_checkpoints` | Users can view checkpoints of own executions | ALL | public | permissive | `EXISTS ( SELECT 1 FROM public.workflow_executions we WHERE we.id = workflow_checkpoints.execution_id AND we.user_id = auth.uid() )` |  |
| `workflow_handoffs` | Users can view handoffs of own executions | ALL | public | permissive | `EXISTS ( SELECT 1 FROM public.workflow_executions we WHERE we.id = workflow_handoffs.execution_id AND we.user_id = auth.uid() )` |  |
| `cron_schedules` | cron_schedules_all | ALL | public | permissive | `auth.uid() IS NOT NULL` |  |
| `cron_schedule_executions` | cron_exec_all | ALL | public | permissive | `auth.uid() IS NOT NULL` |  |
| `webhook_endpoints` | webhooks_all | ALL | public | permissive | `auth.uid() IS NOT NULL` |  |
| `webhook_events` | webhook_events_all | ALL | public | permissive | `auth.uid() IS NOT NULL` |  |
| `execution_history` | exec_hist_all | ALL | public | permissive | `auth.uid() IS NOT NULL` |  |
| `connector_instances` | conn_inst_all | ALL | public | permissive | `auth.uid() IS NOT NULL` |  |
| `batch_jobs` | batch_jobs_all | ALL | public | permissive | `auth.uid() IS NOT NULL` |  |
| `tool_policies` | tool_policies_agent_owner | ALL | authenticated | permissive | `agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())` | `agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())` |
| `session_traces` | session_traces_select | SELECT | authenticated | permissive | `session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid())` |  |
| `session_traces` | session_traces_insert | INSERT | authenticated | permissive |  | `session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid())` |
| `trace_events` | trace_events_select | SELECT | authenticated | permissive | `session_trace_id IN ( SELECT st.id FROM session_traces st JOIN sessions s ON st.session_id = s.id WHERE s.user_id = auth.uid() )` |  |
| `trace_events` | trace_events_insert | INSERT | authenticated | permissive |  | `session_trace_id IN ( SELECT st.id FROM session_traces st JOIN sessions s ON st.session_id = s.id WHERE s.user_id = auth.uid() )` |
| `deploy_connections` | deploy_connections_select | SELECT | authenticated | permissive | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))` |  |
| `deploy_connections` | deploy_connections_insert | INSERT | authenticated | permissive |  | `workspace_id IN (SELECT workspaces.id FROM workspaces WHERE workspaces.owner_id = auth.uid())` |
| `deploy_connections` | deploy_connections_update | UPDATE | authenticated | permissive | `workspace_id IN (SELECT workspaces.id FROM workspaces WHERE workspaces.owner_id = auth.uid())` |  |
| `deploy_connections` | deploy_connections_delete | DELETE | authenticated | permissive | `workspace_id IN (SELECT workspaces.id FROM workspaces WHERE workspaces.owner_id = auth.uid())` |  |
| `session_traces` | Block update on session_traces | UPDATE | authenticated | permissive | `false` | `false` |
| `session_traces` | Block delete on session_traces | DELETE | authenticated | permissive | `false` |  |
| `trace_events` | Block update on trace_events | UPDATE | authenticated | permissive | `false` | `false` |
| `trace_events` | Block delete on trace_events | DELETE | authenticated | permissive | `false` |  |
| `data_deletion_requests` | Block update on data_deletion_requests | UPDATE | authenticated | permissive | `false` | `false` |
| `data_deletion_requests` | Block delete on data_deletion_requests | DELETE | authenticated | permissive | `false` |  |
| `agent_routing_config` | Members can view routing config | SELECT | public | permissive | `workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )` |  |
| `agent_routing_config` | Members can manage routing config | ALL | public | permissive | `workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )` |  |
| `bitrix24_webhook_events` | Members can view webhook events | SELECT | public | permissive | `workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )` |  |
| `bitrix24_webhook_events` | Service role inserts webhook events | INSERT | public | permissive |  | `true` |
| `whatsapp_webhook_events` | Members can view whatsapp webhook events | SELECT | public | permissive | `workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )` |  |
| `whatsapp_webhook_events` | Service role inserts whatsapp webhook events | INSERT | public | permissive |  | `true` |
| `tool_integrations` | Owners can view tool integrations | SELECT | authenticated | permissive | `workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` |  |
| `tool_integrations` | Owners can insert tool integrations | INSERT | authenticated | permissive |  | `workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` |
| `tool_integrations` | Owners can update tool integrations | UPDATE | authenticated | permissive | `workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` |  |
| `tool_integrations` | Owners can delete tool integrations | DELETE | authenticated | permissive | `workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())` |  |
| `roles` | Authenticated users can view active roles | SELECT | authenticated | permissive | `is_active = true` |  |
| `permissions` | Authenticated users can view permissions | SELECT | authenticated | permissive | `true` |  |
| `role_permissions` | Authenticated users can view role_permissions | SELECT | authenticated | permissive | `true` |  |
| `user_roles` | Users can view roles in their workspaces | SELECT | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `user_2fa` | Users manage own 2FA | ALL | authenticated | permissive | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `kb_articles` | Public read published articles | SELECT | public | permissive | `status = 'published'` |  |
| `kb_articles` | Workspace members manage articles | ALL | authenticated | permissive | `knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())))` | `knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())))` |
| `kb_article_versions` | Workspace members read versions | SELECT | authenticated | permissive | `article_id IN (SELECT id FROM public.kb_articles WHERE knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))))` |  |
| `kb_article_versions` | Workspace members create versions | INSERT | authenticated | permissive |  | `article_id IN (SELECT id FROM public.kb_articles WHERE knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))))` |
| `kb_translations` | Workspace members manage translations | ALL | authenticated | permissive | `article_id IN (SELECT id FROM public.kb_articles WHERE knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))))` | `article_id IN (SELECT id FROM public.kb_articles WHERE knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))))` |
| `kb_query_gaps` | Workspace members manage query gaps | ALL | authenticated | permissive | `knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())))` | `knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())))` |
| `ip_whitelist` | ws admins manage ip_whitelist | ALL | authenticated | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` | `public.is_workspace_admin(auth.uid(), workspace_id)` |
| `geo_allowed_countries` | ws admins manage geo countries | ALL | authenticated | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` | `public.is_workspace_admin(auth.uid(), workspace_id)` |
| `automation_rules` | members read rules | SELECT | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `automation_rules` | members create rules | INSERT | authenticated | permissive |  | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) AND created_by = auth.uid()` |
| `automation_rules` | admins update rules | UPDATE | authenticated | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` | `public.is_workspace_admin(auth.uid(), workspace_id)` |
| `automation_rules` | admins delete rules | DELETE | authenticated | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `automation_logs` | members read logs | SELECT | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `agent_experiments` | members read experiments | SELECT | authenticated | permissive | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))` |  |
| `agent_experiments` | members create experiments | INSERT | authenticated | permissive |  | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) AND created_by = auth.uid()` |
| `agent_experiments` | members update own experiments | UPDATE | authenticated | permissive | `created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id)` | `created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id)` |
| `agent_experiments` | admins delete experiments | DELETE | authenticated | permissive | `is_workspace_admin(auth.uid(), workspace_id) OR created_by = auth.uid()` |  |
| `agent_experiment_runs` | members read runs | SELECT | authenticated | permissive | `experiment_id IN ( SELECT id FROM public.agent_experiments WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) )` |  |
| `agent_experiment_runs` | members create runs | INSERT | authenticated | permissive |  | `experiment_id IN ( SELECT id FROM public.agent_experiments WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) )` |
| `agent_experiment_runs` | members delete runs | DELETE | authenticated | permissive | `experiment_id IN ( SELECT id FROM public.agent_experiments WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) AND (created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id)) )` |  |
| `agent_eval_datasets` | members read eval datasets | SELECT | authenticated | permissive | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))` |  |
| `agent_eval_datasets` | members create eval datasets | INSERT | authenticated | permissive |  | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) AND created_by = auth.uid()` |
| `agent_eval_datasets` | members update own eval datasets | UPDATE | authenticated | permissive | `created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id)` | `created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id)` |
| `agent_eval_datasets` | members delete own eval datasets | DELETE | authenticated | permissive | `created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id)` |  |
| `agent_eval_runs` | members read eval runs | SELECT | authenticated | permissive | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))` |  |
| `agent_eval_runs` | members create eval runs | INSERT | authenticated | permissive |  | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) AND created_by = auth.uid()` |
| `agent_eval_runs` | members update eval runs | UPDATE | authenticated | permissive | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))` | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))` |
| `agent_eval_runs` | members delete eval runs | DELETE | authenticated | permissive | `created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id)` |  |
| `agent_eval_results` | members read eval results | SELECT | authenticated | permissive | `run_id IN (SELECT id FROM public.agent_eval_runs WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())))` |  |
| `agent_eval_results` | members insert eval results | INSERT | authenticated | permissive |  | `run_id IN (SELECT id FROM public.agent_eval_runs WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())))` |
| `agent_workflows` | Workspace members view workflows | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `agent_workflows` | Workspace members create workflows | INSERT | public | permissive |  | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) AND created_by = auth.uid()` |
| `agent_workflows` | Workspace members update workflows | UPDATE | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `agent_workflows` | Workspace members delete workflows | DELETE | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `replay_forks` | Users can view their own forks | SELECT | public | permissive | `auth.uid() = user_id` |  |
| `replay_forks` | Users can create their own forks | INSERT | public | permissive |  | `auth.uid() = user_id` |
| `replay_forks` | Users can update their own forks | UPDATE | public | permissive | `auth.uid() = user_id` |  |
| `replay_forks` | Users can delete their own forks | DELETE | public | permissive | `auth.uid() = user_id` |  |
| `code_executions` | Users view own code executions | SELECT | public | permissive | `auth.uid() = user_id` |  |
| `code_executions` | Users insert own code executions | INSERT | public | permissive |  | `auth.uid() = user_id` |
| `code_executions` | Users delete own code executions | DELETE | public | permissive | `auth.uid() = user_id` |  |
| `skill_marketplace_meta` | anyone reads marketplace meta | SELECT | authenticated | permissive | `true` |  |
| `skill_marketplace_meta` | creator inserts own meta | INSERT | authenticated | permissive |  | `creator_id = auth.uid()` |
| `skill_marketplace_meta` | creator updates own meta | UPDATE | authenticated | permissive | `creator_id = auth.uid()` | `creator_id = auth.uid()` |
| `skill_marketplace_meta` | creator deletes own meta | DELETE | authenticated | permissive | `creator_id = auth.uid()` |  |
| `skill_purchases` | buyer reads own purchases | SELECT | authenticated | permissive | `buyer_id = auth.uid() OR creator_id = auth.uid()` |  |
| `skill_purchases` | buyer inserts purchases | INSERT | authenticated | permissive |  | `buyer_id = auth.uid()` |
| `skill_reviews` | anyone reads reviews | SELECT | authenticated | permissive | `true` |  |
| `skill_reviews` | reviewer inserts own review | INSERT | authenticated | permissive |  | `reviewer_id = auth.uid()` |
| `skill_reviews` | reviewer updates own review | UPDATE | authenticated | permissive | `reviewer_id = auth.uid()` |  |
| `skill_reviews` | reviewer deletes own review | DELETE | authenticated | permissive | `reviewer_id = auth.uid()` |  |
| `creator_payouts` | creator reads own payouts | SELECT | authenticated | permissive | `creator_id = auth.uid()` |  |
| `prompt_experiments` | members read prompt experiments | SELECT | authenticated | permissive | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))` |  |
| `prompt_experiments` | members create prompt experiments | INSERT | authenticated | permissive |  | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) AND created_by = auth.uid()` |
| `prompt_experiments` | owner or admin update prompt experiments | UPDATE | authenticated | permissive | `created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id)` | `created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id)` |
| `prompt_experiments` | owner or admin delete prompt experiments | DELETE | authenticated | permissive | `created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id)` |  |
| `prompt_experiment_runs` | members read experiment runs | SELECT | authenticated | permissive | `experiment_id IN ( SELECT id FROM public.prompt_experiments WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) )` |  |
| `prompt_experiment_runs` | members insert experiment runs | INSERT | authenticated | permissive |  | `experiment_id IN ( SELECT id FROM public.prompt_experiments WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) )` |
| `voice_sessions` | voice_sessions_select_own | SELECT | public | permissive | `auth.uid() = user_id` |  |
| `voice_sessions` | voice_sessions_insert_own | INSERT | public | permissive |  | `auth.uid() = user_id` |
| `voice_sessions` | voice_sessions_update_own | UPDATE | public | permissive | `auth.uid() = user_id` |  |
| `voice_sessions` | voice_sessions_delete_own | DELETE | public | permissive | `auth.uid() = user_id` |  |
| `browser_sessions` | Users view own browser sessions | SELECT | public | permissive | `auth.uid() = user_id OR workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `browser_sessions` | Users create own browser sessions | INSERT | public | permissive |  | `auth.uid() = user_id` |
| `browser_sessions` | Users update own browser sessions | UPDATE | public | permissive | `auth.uid() = user_id` |  |
| `browser_sessions` | Users delete own browser sessions | DELETE | public | permissive | `auth.uid() = user_id` |  |
| `agent_graphs` | members read graphs | SELECT | authenticated | permissive | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))` |  |
| `agent_graphs` | members create graphs | INSERT | authenticated | permissive |  | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) AND created_by = auth.uid()` |
| `agent_graphs` | members update graphs | UPDATE | authenticated | permissive | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))` | `workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))` |
| `agent_graphs` | members delete graphs | DELETE | authenticated | permissive | `created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id)` |  |
| `graph_executions` | users read executions | SELECT | authenticated | permissive | `auth.uid() = user_id OR (workspace_id IS NOT NULL AND workspace_id IN (SELECT get_user_workspace_ids(auth.uid())))` |  |
| `graph_executions` | users create executions | INSERT | authenticated | permissive |  | `auth.uid() = user_id` |
| `graph_executions` | users update own executions | UPDATE | authenticated | permissive | `auth.uid() = user_id` |  |
| `graph_executions` | users delete own executions | DELETE | authenticated | permissive | `auth.uid() = user_id` |  |
| `chaos_experiments` | Members can view chaos experiments | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `chaos_experiments` | Admins can create chaos experiments | INSERT | public | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid()` |
| `chaos_experiments` | Admins can update chaos experiments | UPDATE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `chaos_experiments` | Admins can delete chaos experiments | DELETE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `synthetic_checks` | Members view synthetic_checks | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `synthetic_checks` | Admins insert synthetic_checks | INSERT | public | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid()` |
| `synthetic_checks` | Admins update synthetic_checks | UPDATE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `synthetic_checks` | Admins delete synthetic_checks | DELETE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `synthetic_results` | Members view synthetic_results | SELECT | public | permissive | `check_id IN ( SELECT id FROM public.synthetic_checks WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) )` |  |
| `cost_baselines` | members view baselines | SELECT | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `cost_alerts` | members view alerts | SELECT | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `cost_alerts` | admins acknowledge alerts | UPDATE | authenticated | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` | `public.is_workspace_admin(auth.uid(), workspace_id)` |
| `workspace_budgets` | Members can view workspace budget | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `workspace_budgets` | Admins can insert workspace budget | INSERT | public | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid()` |
| `workspace_budgets` | Admins can update workspace budget | UPDATE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `workspace_budgets` | Admins can delete workspace budget | DELETE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `budget_events` | Members can view budget events | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `game_days` | members can view game days | SELECT | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `game_days` | admins can schedule game days | INSERT | authenticated | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id) AND facilitator_id = auth.uid()` |
| `game_days` | facilitator or admin can update | UPDATE | authenticated | permissive | `facilitator_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `game_days` | admins can delete game days | DELETE | authenticated | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `game_day_events` | members can view events | SELECT | authenticated | permissive | `game_day_id IN ( SELECT id FROM public.game_days WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) )` |  |
| `game_day_events` | participants can record events | INSERT | authenticated | permissive |  | `actor_id = auth.uid() AND game_day_id IN ( SELECT id FROM public.game_days WHERE status = 'running' AND (facilitator_id = auth.uid() OR auth.uid() = ANY(participants) OR public.is_workspace_admin(auth.uid(), workspace_id)) )` |
| `game_day_scorecards` | members can view scorecards | SELECT | authenticated | permissive | `game_day_id IN ( SELECT id FROM public.game_days WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) )` |  |
| `game_day_scorecards` | facilitator or admin can create scorecard | INSERT | authenticated | permissive |  | `created_by = auth.uid() AND game_day_id IN ( SELECT id FROM public.game_days WHERE facilitator_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id) )` |
| `incident_playbooks` | Members view playbooks | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `incident_playbooks` | Admins insert playbooks | INSERT | public | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid()` |
| `incident_playbooks` | Admins update playbooks | UPDATE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `incident_playbooks` | Admins delete playbooks | DELETE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `incident_runs` | Members view runs | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `oncall_schedule` | Admins manage oncall | ALL | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` | `public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid()` |
| `dr_drills` | Members can view drills | SELECT | authenticated | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `dr_drills` | Admins can insert drills | INSERT | authenticated | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid()` |
| `dr_drills` | Admins can update drills | UPDATE | authenticated | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `dr_drills` | Admins can delete drills | DELETE | authenticated | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `dr_snapshots` | Members can view snapshots | SELECT | authenticated | permissive | `drill_id IN (SELECT id FROM public.dr_drills WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` |  |
| `dr_restore_logs` | Members can view restore logs | SELECT | authenticated | permissive | `drill_id IN (SELECT id FROM public.dr_drills WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` |  |
| `postmortems` | members view postmortems | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `postmortems` | members create postmortems | INSERT | public | permissive |  | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) AND author_id = auth.uid()` |
| `postmortems` | author or admin update postmortems | UPDATE | public | permissive | `author_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `postmortems` | author or admin delete postmortems | DELETE | public | permissive | `author_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `postmortem_action_items` | members view action items | SELECT | public | permissive | `postmortem_id IN ( SELECT id FROM public.postmortems WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) )` |  |
| `postmortem_action_items` | author or admin manage action items | ALL | public | permissive | `EXISTS ( SELECT 1 FROM public.postmortems p WHERE p.id = postmortem_id AND (p.author_id = auth.uid() OR public.is_workspace_admin(auth.uid(), p.workspace_id)) ) OR owner_id = auth.uid()` | `EXISTS ( SELECT 1 FROM public.postmortems p WHERE p.id = postmortem_id AND (p.author_id = auth.uid() OR public.is_workspace_admin(auth.uid(), p.workspace_id)) )` |
| `compliance_frameworks` | Frameworks viewable by authenticated | SELECT | authenticated | permissive | `true` |  |
| `compliance_controls` | Controls viewable by authenticated | SELECT | authenticated | permissive | `true` |  |
| `compliance_reports` | Members view compliance reports | SELECT | authenticated | permissive | `EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = compliance_reports.workspace_id AND wm.user_id = auth.uid() )` |  |
| `compliance_evidence` | Members view compliance evidence | SELECT | authenticated | permissive | `EXISTS ( SELECT 1 FROM public.compliance_reports r JOIN public.workspace_members wm ON wm.workspace_id = r.workspace_id WHERE r.id = compliance_evidence.report_id AND wm.user_id = auth.uid() )` |  |
| `sbom_snapshots` | Members view sbom snapshots | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `sbom_snapshots` | Admins insert sbom snapshots | INSERT | public | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id)` |
| `sbom_snapshots` | Admins delete sbom snapshots | DELETE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `sbom_components` | Members view sbom components | SELECT | public | permissive | `snapshot_id IN (SELECT id FROM public.sbom_snapshots WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` |  |
| `sbom_components` | Admins insert sbom components | INSERT | public | permissive |  | `snapshot_id IN (SELECT id FROM public.sbom_snapshots WHERE public.is_workspace_admin(auth.uid(), workspace_id))` |
| `vulnerability_findings` | Members view vulnerabilities | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `vulnerability_findings` | Admins insert vulnerabilities | INSERT | public | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id)` |
| `vulnerability_findings` | Admins update vulnerabilities | UPDATE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `managed_secrets` | Workspace members can view managed secrets | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `managed_secrets` | Workspace admins can insert managed secrets | INSERT | public | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid()` |
| `managed_secrets` | Workspace admins can update managed secrets | UPDATE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `managed_secrets` | Workspace admins can delete managed secrets | DELETE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `secret_rotation_events` | Workspace members can view rotation events | SELECT | public | permissive | `secret_id IN ( SELECT id FROM public.managed_secrets WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) )` |  |
| `secret_rotation_events` | Workspace admins can insert rotation events | INSERT | public | permissive |  | `rotated_by = auth.uid() AND secret_id IN ( SELECT id FROM public.managed_secrets WHERE public.is_workspace_admin(auth.uid(), workspace_id) )` |
| `pentest_engagements` | Members view engagements | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `pentest_engagements` | Admins insert engagements | INSERT | public | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id)` |
| `pentest_engagements` | Admins update engagements | UPDATE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `pentest_engagements` | Admins delete engagements | DELETE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `pentest_findings` | Members view findings | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `pentest_findings` | Admins insert findings | INSERT | public | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id)` |
| `pentest_findings` | Admins update findings | UPDATE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `pentest_findings` | Admins delete findings | DELETE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `risk_register` | Members view risks | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `risk_register` | Admins insert risks | INSERT | public | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id)` |
| `risk_register` | Admins update risks | UPDATE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `risk_review_events` | Members view reviews | SELECT | public | permissive | `risk_id IN (SELECT id FROM public.risk_register WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` |  |
| `risk_review_events` | Admins insert reviews | INSERT | public | permissive |  | `risk_id IN (SELECT id FROM public.risk_register WHERE public.is_workspace_admin(auth.uid(), workspace_id))` |
| `vendors` | vendors_select_members | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `vendors` | vendors_insert_admins | INSERT | public | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid()` |
| `vendors` | vendors_update_admins | UPDATE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `vendors` | vendors_delete_admins | DELETE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `vendor_assessments` | vendor_assessments_select_members | SELECT | public | permissive | `vendor_id IN ( SELECT id FROM public.vendors WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) )` |  |
| `vendor_assessments` | vendor_assessments_insert_admins | INSERT | public | permissive |  | `assessed_by = auth.uid() AND vendor_id IN ( SELECT id FROM public.vendors WHERE public.is_workspace_admin(auth.uid(), workspace_id) )` |
| `vendor_documents` | vendor_documents_select_members | SELECT | public | permissive | `vendor_id IN ( SELECT id FROM public.vendors WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) )` |  |
| `vendor_documents` | vendor_documents_insert_admins | INSERT | public | permissive |  | `uploaded_by = auth.uid() AND vendor_id IN ( SELECT id FROM public.vendors WHERE public.is_workspace_admin(auth.uid(), workspace_id) )` |
| `vendor_documents` | vendor_documents_delete_admins | DELETE | public | permissive | `vendor_id IN ( SELECT id FROM public.vendors WHERE public.is_workspace_admin(auth.uid(), workspace_id) )` |  |
| `business_systems` | members_select_business_systems | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `business_systems` | admins_insert_business_systems | INSERT | public | permissive |  | `public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid()` |
| `business_systems` | admins_update_business_systems | UPDATE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `business_systems` | admins_delete_business_systems | DELETE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id)` |  |
| `bcp_test_runs` | members_select_bcp_tests | SELECT | public | permissive | `system_id IN (SELECT id FROM public.business_systems WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` |  |
| `bcp_test_runs` | admins_insert_bcp_tests | INSERT | public | permissive |  | `executed_by = auth.uid() AND system_id IN (SELECT id FROM public.business_systems WHERE public.is_workspace_admin(auth.uid(), workspace_id))` |
| `change_requests` | Members view change requests | SELECT | public | permissive | `workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |  |
| `change_requests` | Members create change requests | INSERT | public | permissive |  | `requested_by = auth.uid() AND workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))` |
| `change_requests` | Requester or admin updates change requests | UPDATE | public | permissive | `public.is_workspace_admin(auth.uid(), workspace_id) OR (requested_by = auth.uid() AND workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))` |  |
| … +341 linhas — lista completa em `context.json` | | | | | | |

## C. Restrições de dados (obrigatório / único / default / CHECK / FK / calculada)

| Tabela | Coluna | Regra |
|---|---|---|
| `agents` | `id` | PK; default gen_random_uuid() |
| `agents` | `is_template` | default false |
| `agents` | `created_at` | default NOW() |
| `agents` | `updated_at` | default NOW() |
| `agents` | `name` | default 'Novo |
| `agents` | `config` | obrigatório |
| `agents` | `(tabela)` | constraint chk_agents_status CHECK (status IN ('draft','testing','production','archived','deprecated')) NOT VALID |
| `agent_usage` | `id` | PK; default gen_random_uuid() |
| `agent_usage` | `requests` | default 0 |
| `agent_usage` | `created_at` | obrigatório |
| `prompt_versions` | `id` | PK; default gen_random_uuid() |
| `prompt_versions` | `content` | obrigatório |
| `prompt_versions` | `created_at` | obrigatório |
| `prompt_versions` | `user_id` | obrigatório |
| `prompt_versions` | `version` | obrigatório |
| `notifications` | `id` | PK; default gen_random_uuid() |
| `notifications` | `channel` | obrigatório; CHECK channel IN ('email','whatsapp','slack','webhook','sms') |
| `notifications` | `priority` | default 'normal'; CHECK priority IN ('low','normal','high','urgent') |
| `notifications` | `status` | default 'pending'; CHECK status IN ('pending','sent','failed') |
| `notifications` | `recipient_address` | obrigatório |
| `notifications` | `body` | obrigatório |
| `notifications` | `template_id` | FK → notification_templates.id ON DELETE SET NULL |
| `notifications` | `template_vars` | default '{}'::jsonb |
| `notifications` | `metadata` | default '{}'::jsonb |
| `notifications` | `source_type` | default 'system' |
| `notifications` | `created_at` | default now() |
| `user_roles` | `id` | PK; default gen_random_uuid() |
| `user_roles` | `user_id` | obrigatório |
| `user_roles` | `role_key` | obrigatório |
| `user_roles` | `workspace_id` | obrigatório; FK → workspaces.id ON DELETE CASCADE |
| `user_roles` | `created_at` | default now() |
| `user_roles` | `(tabela)` | UNIQUE(user_id, workspace_id) |
| `auth_attempts` | `id` | PK; default gen_random_uuid() |
| `auth_attempts` | `email` | obrigatório |
| `auth_attempts` | `success` | obrigatório |
| `auth_attempts` | `created_at` | default now() |
| `auth_attempts` | `(tabela)` | constraint chk_auth_attempts_success CHECK (success IN (true, false)) NOT VALID |
| `chunks` | `id` | PK; default gen_random_uuid() |
| `chunks` | `document_id` | FK → documents.id ON DELETE CASCADE |
| `chunks` | `content` | obrigatório |
| `chunks` | `chunk_index` | default 0 |
| `chunks` | `token_count` | default 0 |
| `chunks` | `metadata` | default '{}' |
| `chunks` | `embedding_status` | default 'pending'; CHECK embedding_status IN ('pending','processing','done','failed') |
| `chunks` | `created_at` | default now() |
| `chunks` | `parent_chunk_id` | FK → chunks.id |
| `chunks` | `chunk_version` | default 1 |
| `chunks` | `embed_attempts` | default 0 |
| `chunks` | `is_active` | obrigatório |
| `chunks` | `(tabela)` | constraint chunks_embedding_provenance_ck CHECK ( (embedding IS NULL AND embedding_model IS NULL AND embedded_at IS NULL) OR (embedding IS NOT NULL AND embedding_model IS NOT NULL AND embedded_at IS NOT NULL) ) |
| `vector_indexes` | `id` | PK; default gen_random_uuid() |
| `vector_indexes` | `knowledge_base_id` | FK → knowledge_bases.id ON DELETE CASCADE |
| `vector_indexes` | `provider` | default 'pgvector' |
| `vector_indexes` | `model` | default 'text-embedding-3-large' |
| `vector_indexes` | `dimensions` | default 3072 |
| `vector_indexes` | `status` | default 'active' |
| `vector_indexes` | `config` | default '{}' |
| `vector_indexes` | `created_at` | default now() |
| `workspaces` | `id` | PK; default gen_random_uuid() |
| `workspaces` | `name` | default 'Meu |
| `workspaces` | `owner_id` | FK → users.id ON DELETE CASCADE |
| `workspaces` | `plan` | default 'free' |
| `workspaces` | `max_agents` | default 5 |
| `workspaces` | `created_at` | default NOW() |
| `workspaces` | `pii_redaction_enabled` | default true |
| `workspaces` | `version` | default 1 |
| `workspaces` | `(tabela)` | constraint chk_workspaces_name CHECK (name IS NOT NULL AND length(trim(name)) > 0) NOT VALID |
| `workspace_members` | `id` | PK; default gen_random_uuid() |
| `workspace_members` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `workspace_members` | `user_id` | obrigatório; FK → users.id ON DELETE CASCADE |
| `workspace_members` | `role` | default 'editor' |
| `workspace_members` | `invited_at` | default NOW() |
| `workspace_members` | `(tabela)` | UNIQUE(workspace_id, user_id) |
| `knowledge_bases` | `id` | PK; default gen_random_uuid() |
| `knowledge_bases` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `knowledge_bases` | `name` | obrigatório |
| `knowledge_bases` | `description` | default '' |
| `knowledge_bases` | `vector_db` | default 'pgvector' |
| `knowledge_bases` | `embedding_model` | default 'text-embedding-3-large' |
| `knowledge_bases` | `document_count` | default 0 |
| `knowledge_bases` | `chunk_count` | default 0 |
| `knowledge_bases` | `status` | default 'active' |
| `knowledge_bases` | `created_at` | default NOW() |
| `knowledge_bases` | `updated_at` | default NOW() |
| `knowledge_bases` | `contextual_chunking_enabled` | default false |
| `knowledge_bases` | `version` | default 1 |
| `agent_templates` | `id` | PK; default gen_random_uuid() |
| `agent_templates` | `name` | obrigatório |
| `agent_templates` | `description` | default '' |
| `agent_templates` | `category` | default 'general' |
| `agent_templates` | `icon` | default '🤖' |
| `agent_templates` | `config` | default '{}' |
| `agent_templates` | `is_public` | default true |
| `agent_templates` | `usage_count` | default 0 |
| `agent_templates` | `created_by` | FK → users.id |
| `agent_templates` | `created_at` | default NOW() |
| `evaluation_runs` | `id` | PK; default gen_random_uuid() |
| `evaluation_runs` | `agent_id` | FK → agents.id ON DELETE CASCADE |
| `evaluation_runs` | `workspace_id` | FK → workspaces.id |
| `evaluation_runs` | `name` | obrigatório |
| `evaluation_runs` | `status` | default 'queued' |
| `evaluation_runs` | `test_cases` | default 0 |
| `evaluation_runs` | `pass_rate` | default 0 |
| `evaluation_runs` | `results` | default '{}' |
| `evaluation_runs` | `created_at` | default NOW() |
| `evaluation_runs` | `judge_model` | default 'claude-haiku-4-5-20251001' |
| `evaluation_runs` | `judge_scores` | default '{}'::jsonb |
| `workspace_secrets` | `id` | PK; default gen_random_uuid() |
| `workspace_secrets` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `workspace_secrets` | `key_name` | obrigatório |
| `workspace_secrets` | `created_at` | default NOW() |
| `workspace_secrets` | `updated_at` | default NOW() |
| `workspace_secrets` | `(tabela)` | UNIQUE(workspace_id, key_name) |
| `oracle_history` | `id` | PK; default gen_random_uuid() |
| `oracle_history` | `user_id` | obrigatório |
| `oracle_history` | `query` | obrigatório |
| `oracle_history` | `mode` | obrigatório |
| `oracle_history` | `preset_id` | obrigatório |
| `oracle_history` | `enable_thinking` | default false |
| `oracle_history` | `results` | default '{}'::jsonb |
| `oracle_history` | `created_at` | default now() |
| `collections` | `id` | PK; default gen_random_uuid() |
| `collections` | `knowledge_base_id` | FK → knowledge_bases.id ON DELETE CASCADE |
| `collections` | `name` | obrigatório |
| `collections` | `description` | default '' |
| `collections` | `metadata` | default '{}' |
| `collections` | `created_at` | default now() |
| `collections` | `updated_at` | default now() |
| `collections` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `collections` | `color` | obrigatório |
| `collections` | `icon` | obrigatório |
| `collections` | `is_archived` | obrigatório |
| `documents` | `id` | PK; default gen_random_uuid() |
| `documents` | `collection_id` | FK → collections.id ON DELETE CASCADE |
| `documents` | `title` | obrigatório |
| `documents` | `source_type` | default 'upload' |
| `documents` | `size_bytes` | default 0 |
| `documents` | `status` | default 'pending'; CHECK status IN ('pending','processing','indexed','failed') |
| `documents` | `metadata` | default '{}' |
| `documents` | `created_at` | default now() |
| `documents` | `updated_at` | default now() |
| `documents` | `chunk_size` | default 1000 |
| `documents` | `chunk_overlap` | obrigatório |
| `documents` | `chunk_strategy` | obrigatório |
| `documents` | `chunk_version` | obrigatório |
| `documents` | `(tabela)` | constraint documents_status_check CHECK (status IN ('pending','processing','indexed','failed')) |
| `documents` | `(tabela)` | constraint documents_chunk_strategy_check CHECK (chunk_strategy IN ('fixed','paragraph','sentence')) |
| `documents` | `(tabela)` | constraint documents_chunk_size_check CHECK (chunk_size BETWEEN 200 AND 4000 AND chunk_overlap >= 0 AND chunk_overlap < chunk_size) |
| `tool_integrations` | `id` | PK; default gen_random_uuid() |
| `tool_integrations` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `tool_integrations` | `name` | obrigatório |
| `tool_integrations` | `type` | default 'api' |
| `tool_integrations` | `description` | default '' |
| `tool_integrations` | `config` | default '{}' |
| `tool_integrations` | `is_enabled` | default true |
| `tool_integrations` | `created_at` | default now() |
| `tool_integrations` | `updated_at` | default now() |
| `tool_policies` | `id` | PK; default gen_random_uuid() |
| `tool_policies` | `agent_id` | obrigatório; FK → agents.id ON DELETE CASCADE |
| `tool_policies` | `tool_integration_id` | FK → tool_integrations.id ON DELETE CASCADE |
| `tool_policies` | `environment` | default 'development' |
| `tool_policies` | `is_allowed` | default true |
| `tool_policies` | `requires_approval` | default false |
| `tool_policies` | `config` | default '{}' |
| `tool_policies` | `created_at` | default now() |
| `workflows` | `id` | PK; default gen_random_uuid() |
| `workflows` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `workflows` | `name` | obrigatório |
| `workflows` | `description` | default '' |
| `workflows` | `status` | default 'draft'; CHECK status IN ('draft','active','archived') |
| `workflows` | `config` | default '{}' |
| `workflows` | `created_at` | default now() |
| `workflows` | `updated_at` | default now() |
| `workflow_steps` | `id` | PK; default gen_random_uuid() |
| `workflow_steps` | `workflow_id` | FK → workflows.id ON DELETE CASCADE |
| `workflow_steps` | `agent_id` | FK → agents.id ON DELETE SET NULL |
| `workflow_steps` | `name` | obrigatório |
| `workflow_steps` | `role` | default 'executor' |
| `workflow_steps` | `step_order` | default 0 |
| `workflow_steps` | `config` | default '{}' |
| `workflow_steps` | `created_at` | default now() |
| `evaluation_datasets` | `id` | PK; default gen_random_uuid() |
| `evaluation_datasets` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `evaluation_datasets` | `name` | obrigatório |
| `evaluation_datasets` | `description` | default '' |
| `evaluation_datasets` | `case_count` | default 0 |
| `evaluation_datasets` | `created_at` | default now() |
| `evaluation_datasets` | `updated_at` | default now() |
| `test_cases` | `id` | PK; default gen_random_uuid() |
| `test_cases` | `dataset_id` | FK → evaluation_datasets.id ON DELETE CASCADE |
| `test_cases` | `input` | obrigatório |
| `test_cases` | `tags` | default '{}' |
| `test_cases` | `metadata` | default '{}' |
| `test_cases` | `created_at` | default now() |
| `environments` | `id` | PK; default gen_random_uuid() |
| `environments` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `environments` | `name` | default 'development' |
| `environments` | `config` | default '{}' |
| `environments` | `created_at` | default now() |
| `sessions` | `id` | PK; default gen_random_uuid() |
| `sessions` | `agent_id` | FK → agents.id ON DELETE CASCADE |
| `sessions` | `user_id` | obrigatório |
| `sessions` | `status` | default 'active'; CHECK status IN ('active','ended','error') |
| `sessions` | `metadata` | default '{}' |
| `sessions` | `started_at` | default now() |
| `session_traces` | `id` | PK; default gen_random_uuid() |
| `session_traces` | `session_id` | FK → sessions.id ON DELETE CASCADE |
| `session_traces` | `trace_type` | default 'llm_call' |
| `session_traces` | `metadata` | default '{}' |
| `session_traces` | `created_at` | default now() |
| `trace_events` | `id` | PK; default gen_random_uuid() |
| `trace_events` | `session_trace_id` | FK → session_traces.id ON DELETE CASCADE |
| `trace_events` | `event_type` | obrigatório |
| `trace_events` | `data` | default '{}' |
| `trace_events` | `created_at` | default now() |
| `guardrail_policies` | `id` | PK; default gen_random_uuid() |
| `guardrail_policies` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `guardrail_policies` | `name` | obrigatório |
| `guardrail_policies` | `type` | default 'content_filter' |
| `guardrail_policies` | `config` | default '{}' |
| `guardrail_policies` | `is_enabled` | default true |
| `guardrail_policies` | `created_at` | default now() |
| `guardrail_policies` | `updated_at` | default now() |
| `alerts` | `id` | PK; default gen_random_uuid() |
| `alerts` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `alerts` | `agent_id` | FK → agents.id ON DELETE SET NULL |
| `alerts` | `severity` | default 'warning'; CHECK severity IN ('info','warning','critical') |
| `alerts` | `title` | obrigatório |
| `alerts` | `message` | default '' |
| `alerts` | `is_resolved` | default false |
| `alerts` | `created_at` | default now() |
| `usage_records` | `id` | PK; default gen_random_uuid() |
| `usage_records` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `usage_records` | `agent_id` | FK → agents.id ON DELETE SET NULL |
| `usage_records` | `record_type` | default 'llm_call' |
| `usage_records` | `tokens` | default 0 |
| `usage_records` | `cost_usd` | default 0 |
| `usage_records` | `metadata` | default '{}' |
| `usage_records` | `created_at` | default now() |
| `usage_records` | `tags` | default '{}'::jsonb |
| `budgets` | `id` | PK; default gen_random_uuid() |
| `budgets` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `budgets` | `name` | default 'Mensal' |
| `budgets` | `limit_usd` | default 100 |
| `budgets` | `current_usd` | default 0 |
| `budgets` | `period` | default 'monthly'; CHECK period IN ('daily','weekly','monthly') |
| `budgets` | `alert_threshold` | default 0.8 |
| `budgets` | `is_active` | default true |
| `budgets` | `created_at` | default now() |
| `budgets` | `updated_at` | default now() |
| `agent_memories` | `id` | PK; default gen_random_uuid() |
| `agent_memories` | `workspace_id` | obrigatório; FK → workspaces.id ON DELETE CASCADE |
| `agent_memories` | `memory_type` | default 'semantic' |
| `agent_memories` | `content` | obrigatório |
| `agent_memories` | `source` | default 'Manual' |
| `agent_memories` | `relevance_score` | default 1 |
| `agent_memories` | `created_at` | default now() |
| `agent_memories` | `updated_at` | default now() |
| `model_pricing` | `id` | PK; default gen_random_uuid() |
| `model_pricing` | `model_pattern` | obrigatório |
| `model_pricing` | `input_cost_per_1k` | default 0 |
| `model_pricing` | `output_cost_per_1k` | default 0 |
| `model_pricing` | `created_at` | default now() |
| `workflow_runs` | `id` | PK; default gen_random_uuid() |
| `workflow_runs` | `workflow_id` | obrigatório; FK → workflows.id ON DELETE CASCADE |
| `workflow_runs` | `status` | default 'pending' |
| `workflow_runs` | `started_at` | default now() |
| `workflow_runs` | `current_step` | default 0 |
| `workflow_runs` | `total_steps` | default 0 |
| `workflow_runs` | `created_at` | default now() |
| `workflow_step_runs` | `id` | PK; default gen_random_uuid() |
| `workflow_step_runs` | `workflow_run_id` | FK → workflow_runs.id ON DELETE CASCADE |
| `workflow_step_runs` | `workflow_step_id` | FK → workflow_steps.id ON DELETE SET NULL |
| `workflow_step_runs` | `step_order` | obrigatório |
| `workflow_step_runs` | `status` | default 'pending'; CHECK status IN ('pending','running','completed','failed','skipped') |
| `workflow_step_runs` | `input` | default '{}' |
| `workflow_step_runs` | `output` | default '{}' |
| `workflow_step_runs` | `tokens_used` | default 0 |
| `workflow_step_runs` | `cost_usd` | default 0 |
| `workflow_step_runs` | `latency_ms` | default 0 |
| `deploy_connections` | `id` | PK; default gen_random_uuid() |
| `deploy_connections` | `agent_id` | obrigatório; FK → agents.id ON DELETE CASCADE |
| `deploy_connections` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `deploy_connections` | `channel` | obrigatório |
| `deploy_connections` | `status` | default 'inactive' |
| `deploy_connections` | `config` | default '{}' |
| `deploy_connections` | `message_count` | default 0 |
| `deploy_connections` | `created_at` | default now() |
| `deploy_connections` | `updated_at` | default now() |
| `deploy_connections` | `(tabela)` | UNIQUE(agent_id, channel) |
| `deploy_connections` | `(tabela)` | constraint deploy_connections_channel_check CHECK (channel IN ('api','whatsapp','web_chat','slack','email','bitrix24','telegram','discord','huggingface_space')) |
| `alert_rules` | `id` | PK; default gen_random_uuid() |
| `alert_rules` | `workspace_id` | FK → workspaces.id ON DELETE CASCADE |
| `alert_rules` | `name` | obrigatório |
| `alert_rules` | `metric` | obrigatório |
| `alert_rules` | `operator` | obrigatório; CHECK operator IN ('>','<','>=','<=','==') |
| `alert_rules` | `threshold` | obrigatório |
| `alert_rules` | `severity` | default 'warning'; CHECK severity IN ('info','warning','critical') |
| `alert_rules` | `cooldown_minutes` | default 60 |
| `alert_rules` | `is_enabled` | default true |
| … +2197 linhas — lista completa em `context.json` | | |

## D. Automações no banco (triggers e funções — regras que rodam sozinhas)

| Trigger | Quando | Tabela | Executa | Condição |
|---|---|---|---|---|
| on_auth_user_created | AFTER INSERT | `auth.users` | `handle_new_user` |  |
| update_agents_updated_at | BEFORE UPDATE | `agents` | `update_updated_at_column` |  |
| trg_usage_update_budget | AFTER INSERT | `usage_records` | `update_budget_on_usage` |  |
| trg_budget_alert | AFTER UPDATE OF CURRENT_USD | `budgets` | `check_budget_alert` |  |
| trg_chunks_search_vector | BEFORE INSERT OR UPDATE OF CONTENT | `chunks` | `chunks_search_vector_trigger` |  |
| update_deploy_connections_updated_at | BEFORE UPDATE | `deploy_connections` | `update_updated_at_column` |  |
| update_consent_records_updated_at | BEFORE UPDATE | `consent_records` | `update_updated_at_column` |  |
| trg_auto_assign_admin | AFTER INSERT | `workspace_members` | `auto_assign_admin_role` |  |
| trg_chunks_bm25 | BEFORE INSERT OR UPDATE OF CONTENT | `chunks` | `chunks_update_bm25` |  |
| update_api_keys_updated_at | BEFORE UPDATE | `api_keys` | `update_updated_at_column` |  |
| trg_agent_routing_updated_at | BEFORE UPDATE | `agent_routing_config` | `touch_agent_routing_updated_at` |  |
| update_roles_updated_at | BEFORE UPDATE | `roles` | `update_updated_at_column` |  |
| update_user_2fa_updated_at | BEFORE UPDATE | `user_2fa` | `update_updated_at_column` |  |
| trg_ip_whitelist_updated | BEFORE UPDATE | `ip_whitelist` | `update_updated_at_column` |  |
| tr_help_centers_updated | BEFORE UPDATE | `help_centers` | `update_updated_at_column` |  |
| tr_kb_articles_updated | BEFORE UPDATE | `kb_articles` | `update_updated_at_column` |  |
| tr_kb_translations_updated | BEFORE UPDATE | `kb_translations` | `update_updated_at_column` |  |
| tr_forum_posts_updated | BEFORE UPDATE | `forum_posts` | `update_updated_at_column` |  |
| tr_kb_article_version | BEFORE UPDATE | `kb_articles` | `kb_article_create_version` |  |
| tr_forum_thread_stats | AFTER INSERT OR DELETE | `forum_posts` | `forum_update_thread_stats` |  |
| set_automation_rules_updated_at | BEFORE UPDATE | `automation_rules` | `update_updated_at_column` |  |
| trg_agent_experiments_updated_at | BEFORE UPDATE | `agent_experiments` | `update_updated_at_column` |  |
| update_agent_eval_datasets_updated_at | BEFORE UPDATE | `agent_eval_datasets` | `update_updated_at_column` |  |
| trg_agent_workflows_updated | BEFORE UPDATE | `agent_workflows` | `update_updated_at_column` |  |
| trg_smm_updated_at | BEFORE UPDATE | `skill_marketplace_meta` | `update_updated_at_column` |  |
| trg_recalc_rating | AFTER INSERT OR UPDATE OR DELETE | `skill_reviews` | `recalc_skill_rating` |  |
| trg_prompt_experiments_updated_at | BEFORE UPDATE | `prompt_experiments` | `update_updated_at_column` |  |
| voice_sessions_updated_at | BEFORE UPDATE | `voice_sessions` | `update_updated_at_column` |  |
| trg_agent_graphs_updated | BEFORE UPDATE | `agent_graphs` | `update_updated_at_column` |  |
| update_synthetic_checks_updated_at | BEFORE UPDATE | `synthetic_checks` | `update_updated_at_column` |  |
| trg_workspace_budgets_updated | BEFORE UPDATE | `workspace_budgets` | `update_updated_at_column` |  |
| update_incident_playbooks_updated_at | BEFORE UPDATE | `incident_playbooks` | `update_updated_at_column` |  |
| trg_dr_drills_updated_at | BEFORE UPDATE | `dr_drills` | `update_updated_at_column` |  |
| trg_postmortems_updated_at | BEFORE UPDATE | `postmortems` | `update_updated_at_column` |  |
| trg_pm_action_items_updated_at | BEFORE UPDATE | `postmortem_action_items` | `update_updated_at_column` |  |
| trg_compliance_reports_updated | BEFORE UPDATE | `compliance_reports` | `update_updated_at_column` |  |
| trg_secret_rotation_event | AFTER INSERT | `secret_rotation_events` | `handle_secret_rotation_event` |  |
| trg_managed_secrets_updated_at | BEFORE UPDATE | `managed_secrets` | `update_updated_at_column` |  |
| trg_pentest_finding_due_date | BEFORE INSERT OR UPDATE | `pentest_findings` | `set_pentest_finding_due_date` |  |
| trg_pentest_finding_count | AFTER INSERT OR DELETE | `pentest_findings` | `update_engagement_finding_count` |  |
| trg_pentest_engagement_updated | BEFORE UPDATE | `pentest_engagements` | `update_updated_at_column` |  |
| trg_pentest_finding_updated | BEFORE UPDATE | `pentest_findings` | `update_updated_at_column` |  |
| trg_risk_register_updated | BEFORE UPDATE | `risk_register` | `update_updated_at_column` |  |
| trg_risk_review_event | AFTER INSERT | `risk_review_events` | `handle_risk_review_event` |  |
| trg_vendors_updated_at | BEFORE UPDATE | `vendors` | `update_updated_at_column` |  |
| trg_vendor_assessment | BEFORE INSERT | `vendor_assessments` | `handle_vendor_assessment` |  |
| trg_business_systems_updated | BEFORE UPDATE | `business_systems` | `update_updated_at_column` |  |
| trg_bcp_test_run_after_insert | AFTER INSERT | `bcp_test_runs` | `handle_bcp_test_run` |  |
| trg_change_requests_updated_at | BEFORE UPDATE | `change_requests` | `update_updated_at_column` |  |
| trg_change_requests_freeze | BEFORE INSERT OR UPDATE | `change_requests` | `enforce_freeze_window` |  |
| trg_ir_playbooks_updated | BEFORE UPDATE | `ir_playbooks` | `update_updated_at_column` |  |
| trg_ir_tabletop_after_insert | AFTER INSERT | `ir_tabletop_exercises` | `handle_ir_tabletop` |  |
| trg_asset_audit | AFTER INSERT | `asset_audits` | `handle_asset_audit` |  |
| trg_assets_updated_at | BEFORE UPDATE | `assets` | `update_updated_at_column` |  |
| trg_touch_user_filter_preferences | BEFORE UPDATE | `user_filter_preferences` | `touch_user_filter_preferences` |  |
| trg_restore_field_presets_updated_at | BEFORE UPDATE | `restore_field_presets` | `update_updated_at_column` |  |
| trg_audit_log_partition | BEFORE INSERT | `audit_log` | `trg_auto_partition` |  |
| trg_agent_traces_partition | BEFORE INSERT | `agent_traces` | `trg_auto_partition` |  |
| increment_agent_graphs_version | BEFORE UPDATE | `agent_graphs` | `increment_version_column` |  |
| increment_knowledge_bases_version | BEFORE UPDATE | `knowledge_bases` | `increment_version_column` |  |
| increment_workspaces_version | BEFORE UPDATE | `workspaces` | `increment_version_column` |  |
| increment_agent_installed_skills_version | BEFORE UPDATE | `agent_installed_skills` | `increment_version_column` |  |
| increment_agent_skills_version | BEFORE UPDATE | `agent_skills` | `increment_version_column` |  |
| trg_auth_failure_alert | AFTER INSERT | `auth_attempts` | `handle_auth_failure_alert` | `NEW.success = false` |
| trg_validate_oncall_workspace | BEFORE INSERT OR UPDATE | `oncall_schedule` | `validate_oncall_workspace_consistency` |  |
| update_user_research_configs_updated_at | BEFORE UPDATE | `user_research_configs` | `update_updated_at_column` |  |
| update_mcp_servers_updated_at | BEFORE UPDATE | `mcp_servers` | `update_updated_at_column` |  |
| update_openclaw_deployments_updated_at | BEFORE UPDATE | `openclaw_deployments` | `update_updated_at_column` |  |
| update_openclaw_whatsapp_instances_updated_at | BEFORE UPDATE | `openclaw_whatsapp_instances` | `update_updated_at_column` |  |
| openclaw_whatsapp_autoreply_ai | AFTER INSERT | `openclaw_whatsapp_messages` | `trg_openclaw_whatsapp_autoreply` |  |
| update_openclaw_agent_templates_updated_at | BEFORE UPDATE | `openclaw_agent_templates` | `update_updated_at_column` |  |
| trg_slack_workspace_config_updated_at | BEFORE UPDATE | `slack_workspace_config` | `update_updated_at_column` |  |
| trg_slack_channel_routes_updated_at | BEFORE UPDATE | `slack_channel_routes` | `update_updated_at_column` |  |
| trg_slack_agent_notif_updated | BEFORE UPDATE | `slack_agent_notifications` | `update_updated_at_column` |  |
| trg_slack_rag_updated | BEFORE UPDATE | `slack_rag_sources` | `update_updated_at_column` |  |
| trg_slack_bot_updated | BEFORE UPDATE | `slack_bot_bindings` | `update_updated_at_column` |  |
| trg_dispatch_security_alert_to_slack | AFTER INSERT | `security_alerts` | `dispatch_security_alert_to_slack` |  |
| collections_fill_workspace_trg | BEFORE INSERT OR UPDATE | `collections` | `collections_fill_workspace` |  |
| update_notebook_notes_updated_at | BEFORE UPDATE | `notebook_notes` | `update_updated_at_column` |  |
| trg_notebook_podcasts_updated_at | BEFORE UPDATE | `notebook_podcasts` | `update_updated_at_column` |  |
| trg_notebook_canvases_updated_at | BEFORE UPDATE | `notebook_canvases` | `tg_notebook_canvases_updated_at` |  |
| trg_note_templates_updated_at | BEFORE UPDATE | `notebook_note_templates` | `update_updated_at_column` |  |
| trg_note_snapshot | BEFORE UPDATE | `notebook_notes` | `snapshot_note_version` |  |
| prevent_audit_log_update | BEFORE UPDATE | `audit_log` | `make_audit_log_immutable` |  |
| prevent_audit_log_delete | BEFORE DELETE | `audit_log` | `make_audit_log_immutable` |  |
| update_data_subject_requests_at | BEFORE UPDATE | `data_subject_requests` | `update_updated_at_column` |  |
| update_dpr_at | BEFORE UPDATE | `data_processing_register` | `update_updated_at_column` |  |
| update_pdi_at | BEFORE UPDATE | `personal_data_inventory` | `update_updated_at_column` |  |
| update_dbl_at | BEFORE UPDATE | `data_breach_log` | `update_updated_at_column` |  |
| update_lgpd_settings_at | BEFORE UPDATE | `lgpd_settings` | `update_updated_at_column` |  |
| update_drp_at | BEFORE UPDATE | `data_retention_policies` | `update_updated_at_column` |  |
| update_crm_companies_updated_at | BEFORE UPDATE | `crm_companies` | `update_updated_at_column` |  |
| update_crm_contacts_updated_at | BEFORE UPDATE | `crm_contacts` | `update_updated_at_column` |  |
| update_crm_pipelines_updated_at | BEFORE UPDATE | `crm_pipelines` | `update_updated_at_column` |  |
| update_crm_stages_updated_at | BEFORE UPDATE | `crm_stages` | `update_updated_at_column` |  |
| update_crm_deals_updated_at | BEFORE UPDATE | `crm_deals` | `update_updated_at_column` |  |
| update_crm_activities_updated_at | BEFORE UPDATE | `crm_activities` | `update_updated_at_column` |  |
| trg_crm_icp_updated_at | BEFORE UPDATE | `crm_icp_profiles` | `update_updated_at_column` |  |
| trg_crm_cadences_updated_at | BEFORE UPDATE | `crm_cadences` | `update_updated_at_column` |  |
| trg_crm_cadence_steps_updated_at | BEFORE UPDATE | `crm_cadence_steps` | `update_updated_at_column` |  |
| trg_crm_cadence_enrollments_updated_at | BEFORE UPDATE | `crm_cadence_enrollments` | `update_updated_at_column` |  |
| trg_task_queues_updated | BEFORE UPDATE | `task_queues` | `set_updated_at` |  |
| trg_queue_items_updated | BEFORE UPDATE | `queue_items` | `set_updated_at` |  |
| trg_cron_schedules_updated | BEFORE UPDATE | `cron_schedules` | `set_updated_at` |  |
| trg_notification_templates_updated | BEFORE UPDATE | `notification_templates` | `set_updated_at` |  |
| trg_shc_updated_at | BEFORE UPDATE | `skill_harvest_candidates` | `update_updated_at_column` |  |
| trg_shr_updated_at | BEFORE UPDATE | `skill_harvest_runs` | `update_updated_at_column` |  |
| update_template_skill_links_updated_at | BEFORE UPDATE | `template_skill_links` | `update_updated_at_column` |  |
| trg_template_skill_links_actor | BEFORE INSERT OR UPDATE | `template_skill_links` | `template_skill_links_set_actor` |  |
| trg_stamp_skill_curation | BEFORE UPDATE | `skill_registry` | `stamp_skill_curation` |  |
| update_skill_reclass_updated_at | BEFORE UPDATE | `skill_reclassification_reviews` | `update_updated_at_column` |  |
| update_skill_harvest_checkpoints_updated_at | BEFORE UPDATE | `skill_harvest_checkpoints` | `update_updated_at_column` |  |
| trg_touch_document_ingestions | BEFORE UPDATE | `document_ingestions` | `touch_document_ingestions` |  |
| trg_log_ingestion_event_ins | AFTER INSERT | `document_ingestions` | `log_ingestion_event` |  |
| trg_log_ingestion_event_upd | AFTER UPDATE | `document_ingestions` | `log_ingestion_event` |  |
| trg_chat_threads_updated_at | BEFORE UPDATE | `chat_threads` | `update_updated_at_column` |  |
| trg_touch_chat_thread | AFTER INSERT OR DELETE | `chat_messages` | `touch_chat_thread` |  |
| game_days_updated_at | BEFORE UPDATE | `game_days` | `update_updated_at_column` |  |

Erros lançados por funções SQL (`RAISE EXCEPTION` = regra de negócio no banco):

| Função | Mensagem | Origem |
|---|---|---|
| `purchase_skill` | auth required | `supabase/migrations/20260417003407_330346ce-b72c-4e9a-adb6-2adcc9b8b568.sql` |
| `promote_experiment_winner` | invalid winner | `supabase/migrations/20260417004130_ee762e16-1bf5-48d0-9d18-1c49ad503d7d.sql` |
| `promote_experiment_winner` | experiment not found | `supabase/migrations/20260417004130_ee762e16-1bf5-48d0-9d18-1c49ad503d7d.sql` |
| `promote_experiment_winner` | forbidden | `supabase/migrations/20260417004130_ee762e16-1bf5-48d0-9d18-1c49ad503d7d.sql` |
| `disable_all_chaos` | forbidden: workspace admin required | `supabase/migrations/20260417233026_dc3dfc7c-1b5d-4880-b111-d3000c55ff7f.sql` |
| `get_synthetic_summary` | forbidden | `supabase/migrations/20260418004657_189a00bb-82e4-42da-b2e8-0779af06d4fb.sql` |
| `acknowledge_cost_alert` | alert not found | `supabase/migrations/20260418011629_10215e66-8af6-43ef-8878-dfad3008e2ef.sql` |
| `acknowledge_cost_alert` | forbidden: workspace admin required | `supabase/migrations/20260418011629_10215e66-8af6-43ef-8878-dfad3008e2ef.sql` |
| `get_current_spend` | forbidden | `supabase/migrations/20260418102513_4d1ac25f-4111-4ff9-921c-33a1b4a8e0e2.sql` |
| `reset_workspace_budget` | forbidden: workspace admin required | `supabase/migrations/20260418102513_4d1ac25f-4111-4ff9-921c-33a1b4a8e0e2.sql` |
| `complete_dr_drill` | drill not found | `supabase/migrations/20260418121735_2fa94f72-43dd-4a19-ba73-c3b0ac4301e5.sql` |
| `complete_dr_drill` | forbidden | `supabase/migrations/20260418121735_2fa94f72-43dd-4a19-ba73-c3b0ac4301e5.sql` |
| `generate_postmortem_from_incident` | incident run not found | `supabase/migrations/20260418122307_29b4ef1a-a934-4d96-8c77-694968072357.sql` |
| `generate_postmortem_from_incident` | forbidden | `supabase/migrations/20260418122307_29b4ef1a-a934-4d96-8c77-694968072357.sql` |
| `generate_postmortem_from_gameday` | game day not found | `supabase/migrations/20260418122307_29b4ef1a-a934-4d96-8c77-694968072357.sql` |
| `generate_postmortem_from_gameday` | forbidden | `supabase/migrations/20260418122307_29b4ef1a-a934-4d96-8c77-694968072357.sql` |
| `publish_postmortem` | postmortem not found | `supabase/migrations/20260418122307_29b4ef1a-a934-4d96-8c77-694968072357.sql` |
| `publish_postmortem` | forbidden | `supabase/migrations/20260418122307_29b4ef1a-a934-4d96-8c77-694968072357.sql` |
| `publish_postmortem` | summary required (min 10 chars) | `supabase/migrations/20260418122307_29b4ef1a-a934-4d96-8c77-694968072357.sql` |
| `publish_postmortem` | root cause required (min 10 chars) | `supabase/migrations/20260418122307_29b4ef1a-a934-4d96-8c77-694968072357.sql` |
| `publish_postmortem` | at least 1 action item required | `supabase/migrations/20260418122307_29b4ef1a-a934-4d96-8c77-694968072357.sql` |
| `generate_compliance_report` | Only admins can generate compliance reports | `supabase/migrations/20260418123453_fbfb5bbd-3026-4439-84c4-02d9d66ead8b.sql` |
| `generate_compliance_report` | Framework % not found | `supabase/migrations/20260418123453_fbfb5bbd-3026-4439-84c4-02d9d66ead8b.sql` |
| `publish_compliance_report` | Only admins can publish reports | `supabase/migrations/20260418123453_fbfb5bbd-3026-4439-84c4-02d9d66ead8b.sql` |
| `create_sbom_snapshot` | forbidden: workspace admin required | `supabase/migrations/20260418125950_10d9c8a1-51e3-48ea-aa8b-c20f60835b0e.sql` |
| `record_vulnerability` | snapshot not found | `supabase/migrations/20260418125950_10d9c8a1-51e3-48ea-aa8b-c20f60835b0e.sql` |
| `acknowledge_vulnerability` | finding not found | `supabase/migrations/20260418125950_10d9c8a1-51e3-48ea-aa8b-c20f60835b0e.sql` |
| `acknowledge_vulnerability` | forbidden | `supabase/migrations/20260418125950_10d9c8a1-51e3-48ea-aa8b-c20f60835b0e.sql` |
| `mark_vulnerability_fixed` | finding not found | `supabase/migrations/20260418125950_10d9c8a1-51e3-48ea-aa8b-c20f60835b0e.sql` |
| `mark_vulnerability_fixed` | forbidden | `supabase/migrations/20260418125950_10d9c8a1-51e3-48ea-aa8b-c20f60835b0e.sql` |
| `register_managed_secret` | forbidden: workspace admin required | `supabase/migrations/20260418130622_50bc8bdd-4752-4321-b754-607b67617c40.sql` |
| `record_secret_rotation` | secret not found | `supabase/migrations/20260418130622_50bc8bdd-4752-4321-b754-607b67617c40.sql` |
| `record_secret_rotation` | forbidden: workspace admin required | `supabase/migrations/20260418130622_50bc8bdd-4752-4321-b754-607b67617c40.sql` |
| `mark_secret_retired` | secret not found | `supabase/migrations/20260418130622_50bc8bdd-4752-4321-b754-607b67617c40.sql` |
| `mark_secret_retired` | forbidden: workspace admin required | `supabase/migrations/20260418130622_50bc8bdd-4752-4321-b754-607b67617c40.sql` |
| `get_secrets_status_summary` | forbidden | `supabase/migrations/20260418130622_50bc8bdd-4752-4321-b754-607b67617c40.sql` |
| `create_pentest_engagement` | forbidden: workspace admin required | `supabase/migrations/20260418132552_7ea64f19-f06f-4331-ae2b-3bcfdda427e8.sql` |
| `record_pentest_finding` | engagement not found | `supabase/migrations/20260418132552_7ea64f19-f06f-4331-ae2b-3bcfdda427e8.sql` |
| `record_pentest_finding` | forbidden: workspace admin required | `supabase/migrations/20260418132552_7ea64f19-f06f-4331-ae2b-3bcfdda427e8.sql` |
| `update_pentest_finding_status` | finding not found | `supabase/migrations/20260418132552_7ea64f19-f06f-4331-ae2b-3bcfdda427e8.sql` |
| `update_pentest_finding_status` | forbidden: workspace admin required | `supabase/migrations/20260418132552_7ea64f19-f06f-4331-ae2b-3bcfdda427e8.sql` |
| `get_pentest_summary` | forbidden | `supabase/migrations/20260418132552_7ea64f19-f06f-4331-ae2b-3bcfdda427e8.sql` |
| `register_risk` | forbidden: workspace admin required | `supabase/migrations/20260418134141_767d2a2b-4edb-4e37-9a3e-59845e843de2.sql` |
| `review_risk` | risk not found | `supabase/migrations/20260418134141_767d2a2b-4edb-4e37-9a3e-59845e843de2.sql` |
| `review_risk` | forbidden: workspace admin required | `supabase/migrations/20260418134141_767d2a2b-4edb-4e37-9a3e-59845e843de2.sql` |
| `review_risk` | residual score must be between 1 and 25 | `supabase/migrations/20260418134141_767d2a2b-4edb-4e37-9a3e-59845e843de2.sql` |
| `close_risk` | risk not found | `supabase/migrations/20260418134141_767d2a2b-4edb-4e37-9a3e-59845e843de2.sql` |
| `close_risk` | forbidden: workspace admin required | `supabase/migrations/20260418134141_767d2a2b-4edb-4e37-9a3e-59845e843de2.sql` |
| `get_risk_summary` | forbidden | `supabase/migrations/20260418134141_767d2a2b-4edb-4e37-9a3e-59845e843de2.sql` |
| `register_vendor` | forbidden: workspace admin required | `supabase/migrations/20260418140149_8c99b7b5-9e49-4a90-ac85-77c1f5136dbb.sql` |
| `assess_vendor` | vendor not found | `supabase/migrations/20260418140149_8c99b7b5-9e49-4a90-ac85-77c1f5136dbb.sql` |
| `assess_vendor` | forbidden: workspace admin required | `supabase/migrations/20260418140149_8c99b7b5-9e49-4a90-ac85-77c1f5136dbb.sql` |
| `offboard_vendor` | vendor not found | `supabase/migrations/20260418140149_8c99b7b5-9e49-4a90-ac85-77c1f5136dbb.sql` |
| `offboard_vendor` | forbidden: workspace admin required | `supabase/migrations/20260418140149_8c99b7b5-9e49-4a90-ac85-77c1f5136dbb.sql` |
| `register_business_system` | forbidden: workspace admin required | `supabase/migrations/20260418142049_5591a5aa-c9f5-46a6-aceb-48695c6f648a.sql` |
| `record_bcp_test` | system not found | `supabase/migrations/20260418142049_5591a5aa-c9f5-46a6-aceb-48695c6f648a.sql` |
| `record_bcp_test` | forbidden: workspace admin required | `supabase/migrations/20260418142049_5591a5aa-c9f5-46a6-aceb-48695c6f648a.sql` |
| `get_bcp_summary` | forbidden | `supabase/migrations/20260418142049_5591a5aa-c9f5-46a6-aceb-48695c6f648a.sql` |
| `enforce_freeze_window` | Mudança agendada dentro de janela de freeze ativa: % | `supabase/migrations/20260418143754_22af56b9-e9e9-44ee-89c3-792d14d4af75.sql` |
| `submit_change_request` | Acesso negado | `supabase/migrations/20260418143754_22af56b9-e9e9-44ee-89c3-792d14d4af75.sql` |
| `decide_change` | Mudança não encontrada | `supabase/migrations/20260418143754_22af56b9-e9e9-44ee-89c3-792d14d4af75.sql` |
| `decide_change` | Apenas admins podem decidir mudanças | `supabase/migrations/20260418143754_22af56b9-e9e9-44ee-89c3-792d14d4af75.sql` |
| `execute_change` | Mudança não encontrada | `supabase/migrations/20260418143754_22af56b9-e9e9-44ee-89c3-792d14d4af75.sql` |
| `execute_change` | Apenas admins executam mudanças | `supabase/migrations/20260418143754_22af56b9-e9e9-44ee-89c3-792d14d4af75.sql` |
| `execute_change` | Mudança não está em estado executável (atual: %) | `supabase/migrations/20260418143754_22af56b9-e9e9-44ee-89c3-792d14d4af75.sql` |
| `rollback_change` | Mudança não encontrada | `supabase/migrations/20260418143754_22af56b9-e9e9-44ee-89c3-792d14d4af75.sql` |
| `rollback_change` | Apenas admins podem fazer rollback | `supabase/migrations/20260418143754_22af56b9-e9e9-44ee-89c3-792d14d4af75.sql` |
| `rollback_change` | post_mortem_url é obrigatório para rollback | `supabase/migrations/20260418143754_22af56b9-e9e9-44ee-89c3-792d14d4af75.sql` |
| `get_change_summary` | Acesso negado | `supabase/migrations/20260418143754_22af56b9-e9e9-44ee-89c3-792d14d4af75.sql` |
| `activate_ir_playbook` | playbook not found | `supabase/migrations/20260418144313_34245c62-9cfd-42b3-ad13-f8a1aa177335.sql` |
| `activate_ir_playbook` | forbidden: workspace admin required | `supabase/migrations/20260418144313_34245c62-9cfd-42b3-ad13-f8a1aa177335.sql` |
| `get_ir_summary` | forbidden | `supabase/migrations/20260418144313_34245c62-9cfd-42b3-ad13-f8a1aa177335.sql` |
| `register_asset` | forbidden: workspace admin required | `supabase/migrations/20260418151333_f71cf0bb-06c1-4f23-820c-398fdd4b6ffc.sql` |
| `audit_asset` | asset not found | `supabase/migrations/20260418151333_f71cf0bb-06c1-4f23-820c-398fdd4b6ffc.sql` |
| `audit_asset` | forbidden: workspace admin required | `supabase/migrations/20260418151333_f71cf0bb-06c1-4f23-820c-398fdd4b6ffc.sql` |
| `decommission_asset` | asset not found | `supabase/migrations/20260418151333_f71cf0bb-06c1-4f23-820c-398fdd4b6ffc.sql` |
| `decommission_asset` | forbidden: workspace admin required | `supabase/migrations/20260418151333_f71cf0bb-06c1-4f23-820c-398fdd4b6ffc.sql` |
| `get_asset_summary` | forbidden | `supabase/migrations/20260418151333_f71cf0bb-06c1-4f23-820c-398fdd4b6ffc.sql` |
| `get_workspace_members_full` | forbidden: workspace admin required | `supabase/migrations/20260418162623_6eb54ed6-a251-4320-ade6-49183e9d45ad.sql` |
| `get_oncall_with_contacts` | forbidden: workspace admin required | `supabase/migrations/20260418162623_6eb54ed6-a251-4320-ade6-49183e9d45ad.sql` |
| `get_pending_invites_for_email` | forbidden: can only query own invites | `supabase/migrations/20260418174123_a78c29c9-123c-4a64-9855-64d956286345.sql` |
| `invite_workspace_member` | forbidden: only admins can invite members | `supabase/migrations/20260418174123_a78c29c9-123c-4a64-9855-64d956286345.sql` |
| `get_slo_summary` | authentication required | `supabase/migrations/20260423115924_e275fccc-e6d1-4eda-880a-630f67958f81.sql` |
| `validate_oncall_workspace_consistency` | User % is not a member of workspace % | `supabase/migrations/20260711153020_4670c8df-86cc-4af0-9999-6042e6635a44.sql` |
| `validate_oncall_workspace_consistency` | Creator % is not a member of workspace % | `supabase/migrations/20260711153020_4670c8df-86cc-4af0-9999-6042e6635a44.sql` |
| `reset_embedding_dead_letter` | unauthorized | `supabase/migrations/20260721224950_8bf5f6f9-9202-46b4-a4ae-c37e89f80164.sql` |
| `get_db_health_snapshot` | Admin only | `supabase/migrations/20260722125118_5ca7daa2-9a79-43cf-90e6-2fa8734fad1e.sql` |
| `explain_query_plan` | forbidden: admin required | `supabase/migrations/20260722132911_a991de8e-58cb-41ae-88f4-5ae6df5e4d27.sql` |
| `explain_query_plan` | only SELECT/WITH queries are allowed | `supabase/migrations/20260722132911_a991de8e-58cb-41ae-88f4-5ae6df5e4d27.sql` |
| `explain_query_plan` | mutating keywords are not allowed | `supabase/migrations/20260722132911_a991de8e-58cb-41ae-88f4-5ae6df5e4d27.sql` |
| `get_db_health_timeseries` | permission denied | `supabase/migrations/20260722145902_bffbbc2f-7da7-4f0e-b6a8-be6145c81fd8.sql` |
| `smoke_test_wal_growth` | detector ausente | `supabase/migrations/20260722154138_2ef2284f-1a62-42ab-86d6-2a9568b047aa.sql` |
| `smoke_test_connections_saturation` | detector ausente | `supabase/migrations/20260722154138_2ef2284f-1a62-42ab-86d6-2a9568b047aa.sql` |
| `get_detector_slo_status` | admin only | `supabase/migrations/20260722154138_2ef2284f-1a62-42ab-86d6-2a9568b047aa.sql` |
| `start_dr_drill` | drill not found | `supabase/migrations/20260724000007_sanitize_dr_drill.sql` |
| `start_dr_drill` | forbidden: workspace admin required | `supabase/migrations/20260724000007_sanitize_dr_drill.sql` |
| `start_dr_drill` | drill not in scheduled state (current: %) | `supabase/migrations/20260724000007_sanitize_dr_drill.sql` |
| `record_dr_step` | Invalid step name: "%". Allowed: % | `supabase/migrations/20260724000007_sanitize_dr_drill.sql` |
| `record_dr_step` | Invalid step status: "%" | `supabase/migrations/20260724000007_sanitize_dr_drill.sql` |
| `make_audit_log_immutable` | audit_log is append-only: UPDATE and DELETE are prohibited | `supabase/migrations/20260724000009_audit_log_append_only.sql` |
| `validate_audit_log_fields` | Invalid action: NULL byte detected | `supabase/migrations/20260724000009_audit_log_append_only.sql` |
| `validate_audit_log_fields` | Invalid entity_type: NULL byte detected | `supabase/migrations/20260724000009_audit_log_append_only.sql` |
| `validate_audit_log_fields` | Invalid entity_id: NULL byte detected | `supabase/migrations/20260724000009_audit_log_append_only.sql` |
| `validate_audit_log_fields` | Invalid ip_address: NULL byte detected | `supabase/migrations/20260724000009_audit_log_append_only.sql` |
| `rotate_cron_token` | Token de cron desconhecido: % | `supabase/migrations/20260726203759_8287fd33-e03c-435d-b1b6-f8a4d3de0a88.sql` |
| `get_partition_health_snapshot` | unauthorized | `supabase/migrations/20260726204355_90a04af6-4543-45c9-91ec-0b63a63cb84b.sql` |
| `get_cron_job_health` | access denied | `supabase/migrations/20260726205416_3215b858-4366-4e15-9634-11031376ad5c.sql` |
| `get_wal_generation_rate` | access denied | `supabase/migrations/20260726205416_3215b858-4366-4e15-9634-11031376ad5c.sql` |
| `purge_removed_template_skill_links` | janela de retenção inválida: % | `supabase/migrations/20260727222828_0e04ba87-95df-4fb1-a15f-c0f1884b826b.sql` |
| `apply_skill_description` | Apenas administradores podem aplicar descricoes geradas. | `supabase/migrations/20260728135235_60736cf3-6ae5-4baf-8b18-c334aaacc6e2.sql` |
| `apply_skill_description` | Confianca % abaixo do minimo % exigido. | `supabase/migrations/20260728135235_60736cf3-6ae5-4baf-8b18-c334aaacc6e2.sql` |
| `apply_skill_description` | Descricao gerada fora do tamanho aceitavel (40-600 caracteres). | `supabase/migrations/20260728135235_60736cf3-6ae5-4baf-8b18-c334aaacc6e2.sql` |
| `apply_skill_description` | Skill nao encontrada. | `supabase/migrations/20260728135235_60736cf3-6ae5-4baf-8b18-c334aaacc6e2.sql` |
| `apply_skill_description` | Enriquecimento automatico so vale para skills importadas. | `supabase/migrations/20260728135235_60736cf3-6ae5-4baf-8b18-c334aaacc6e2.sql` |
| `apply_skill_description` | A skill ja possui descricao — nada foi sobrescrito. | `supabase/migrations/20260728135235_60736cf3-6ae5-4baf-8b18-c334aaacc6e2.sql` |
| `decide_skill_reclassification` | Autenticacao obrigatoria | `supabase/migrations/20260728174744_9e520a50-3058-41f4-8e9f-6171959bc730.sql` |
| `decide_skill_reclassification` | Apenas administradores podem decidir reclassificacoes | `supabase/migrations/20260728174744_9e520a50-3058-41f4-8e9f-6171959bc730.sql` |
| `decide_skill_reclassification` | Revisao nao encontrada | `supabase/migrations/20260728174744_9e520a50-3058-41f4-8e9f-6171959bc730.sql` |
| `decide_skill_reclassification` | Revisao ja decidida (%). | `supabase/migrations/20260728174744_9e520a50-3058-41f4-8e9f-6171959bc730.sql` |
| `decide_skill_reclassification` | Conflito: departamento atual (%) difere do analisado (%). | `supabase/migrations/20260728174744_9e520a50-3058-41f4-8e9f-6171959bc730.sql` |
| `validate_table_names_for_drill` | allowed_tables list is empty — all tables rejected. | `supabase/migrations/20260805000001_security_bug_corrections.sql` |
| `validate_table_names_for_drill` | Table "%" is not in allowed drill target list | `supabase/migrations/20260805000001_security_bug_corrections.sql` |
| `validate_table_names_for_drill` | Invalid table name format: "%" | `supabase/migrations/20260805000001_security_bug_corrections.sql` |
| `get_vendor_summary` | Acesso negado: workspace não pertence ao usuário | `supabase/migrations/20260905140000_security_hotfix_validation.sql` |
| `start_game_day` | game day not found | `supabase/migrations/20261121120000_finish_partial_work_entidades.sql` |
| `start_game_day` | forbidden: only facilitator or admin can start | `supabase/migrations/20261121120000_finish_partial_work_entidades.sql` |
| `start_game_day` | game day is not in scheduled state | `supabase/migrations/20261121120000_finish_partial_work_entidades.sql` |
| `complete_game_day` | game day not found | `supabase/migrations/20261121120000_finish_partial_work_entidades.sql` |
| `complete_game_day` | forbidden | `supabase/migrations/20261121120000_finish_partial_work_entidades.sql` |

## E. Estados, máquinas de estado e transições

### E.1 Colunas de status no banco

| Tabela | Coluna | Valores permitidos (enum/CHECK) | Default |
|---|---|---|---|
| `agents` | `status` | `draft`, `configured`, `testing`, `staging`, `review`, `production`, `monitoring`, `deprecated`, `archived` |  |
| `notifications` | `status` | `failed`, `pending`, `sent` | `pending` |
| `chunks` | `embedding_status` | `done`, `failed`, `pending`, `processing` | `pending` |
| `vector_indexes` | `status` | **livre (sem enum/CHECK)** | `active` |
| `knowledge_bases` | `status` | **livre (sem enum/CHECK)** | `active` |
| `evaluation_runs` | `status` | **livre (sem enum/CHECK)** | `queued` |
| `documents` | `status` | `failed`, `indexed`, `pending`, `processing` | `pending` |
| `workflows` | `status` | `active`, `archived`, `draft` | `draft` |
| `workflow_steps` | `step_order` | **livre (sem enum/CHECK)** | `0` |
| `sessions` | `status` | `active`, `ended`, `error` | `active` |
| `workflow_runs` | `status` | **livre (sem enum/CHECK)** | `pending` |
| `workflow_runs` | `current_step` | **livre (sem enum/CHECK)** | `0` |
| `workflow_step_runs` | `step_order` | **livre (sem enum/CHECK)** |  |
| `workflow_step_runs` | `status` | `completed`, `failed`, `pending`, `running`, `skipped` | `pending` |
| `deploy_connections` | `status` | **livre (sem enum/CHECK)** | `inactive` |
| `prompt_ab_tests` | `status` | `cancelled`, `completed`, `draft`, `running` | `draft` |
| `data_deletion_requests` | `status` | **livre (sem enum/CHECK)** | `pending` |
| `finetune_jobs` | `status` | `cancelled`, `completed`, `failed`, `preparing`, `training`, `uploading` | `preparing` |
| `mcp_servers` | `status` | `connected`, `disconnected`, `error` | `disconnected` |
| `workflow_executions` | `status` | `cancelled`, `completed`, `failed`, `paused`, `running` | `running` |
| `workflow_checkpoints` | `step_index` | **livre (sem enum/CHECK)** | `0` |
| `workflow_checkpoints` | `state` | **livre (sem enum/CHECK)** |  |
| `workflow_checkpoints` | `status` | `completed`, `failed`, `pending`, `running`, `skipped` | `completed` |
| `workflow_handoffs` | `status` | `completed`, `failed`, `pending`, `rejected` | `completed` |
| `cron_schedules` | `status` | `active`, `completed`, `failed`, `paused` | `active` |
| `cron_schedule_executions` | `status` | `failed`, `skipped`, `success` |  |
| `webhook_endpoints` | `status` | **livre (sem enum/CHECK)** | `active` |
| `webhook_events` | `status` | **livre (sem enum/CHECK)** |  |
| `dead_letter_queue` | `status` | `discarded`, `pending`, `resolved`, `retried` | `pending` |
| `credential_vault` | `status` | `active`, `expired`, `revoked`, `rotating` | `active` |
| `installed_templates` | `status` | `configured`, `error`, `installed`, `paused`, `running` | `installed` |
| `execution_history` | `status` | `cancelled`, `failed`, `running`, `success`, `timeout`, `waiting` | `running` |
| `connector_registry` | `status` | **livre (sem enum/CHECK)** | `available` |
| `connector_instances` | `status` | **livre (sem enum/CHECK)** | `connected` |
| `queue_items` | `status` | `completed`, `dead_letter`, `failed`, `pending`, `processing` | `pending` |
| `batch_jobs` | `status` | `cancelled`, `completed`, `failed`, `partial`, `paused`, `pending`, `running` | `pending` |
| `bitrix24_webhook_events` | `routing_status` | `failed`, `invalid_signature`, `no_route`, `pending`, `routed` | `pending` |
| `whatsapp_webhook_events` | `routing_status` | **livre (sem enum/CHECK)** | `pending` |
| `kb_articles` | `status` | `archived`, `draft`, `published` | `draft` |
| `kb_query_gaps` | `status` | `dismissed`, `in_progress`, `open`, `resolved` | `open` |
| `automation_logs` | `status` | `failed`, `running`, `skipped`, `success` |  |
| `agent_experiments` | `status` | `completed`, `draft`, `paused`, `running` | `draft` |
| `agent_eval_runs` | `status` | **livre (sem enum/CHECK)** | `queued` |
| `agent_workflows` | `status` | **livre (sem enum/CHECK)** | `draft` |
| `agent_workflow_runs` | `status` | **livre (sem enum/CHECK)** | `running` |
| `replay_forks` | `fork_step_index` | **livre (sem enum/CHECK)** | `0` |
| `replay_forks` | `state_snapshot` | **livre (sem enum/CHECK)** |  |
| `replay_forks` | `status` | **livre (sem enum/CHECK)** | `pending` |
| `code_executions` | `status` | `completed`, `failed`, `pending`, `running`, `timeout` | `pending` |
| `skill_purchases` | `status` | `completed`, `failed`, `pending`, `refunded` | `completed` |
| `creator_payouts` | `status` | `failed`, `paid`, `pending`, `processing` | `pending` |
| `prompt_experiments` | `status` | `completed`, `draft`, `paused`, `running` | `draft` |
| `voice_sessions` | `status` | `active`, `ended`, `error` | `active` |
| `browser_sessions` | `status` | `cancelled`, `completed`, `failed`, `running` | `running` |
| `graph_executions` | `status` | **livre (sem enum/CHECK)** | `running` |
| `synthetic_checks` | `expected_status_max_ms` | **livre (sem enum/CHECK)** | `3000` |
| `game_days` | `status` | `aborted`, `completed`, `running`, `scheduled` | `scheduled` |
| `incident_runs` | `status` | `failed`, `partial`, `running`, `succeeded` | `running` |
| `dr_drills` | `status` | `cancelled`, `completed`, `failed`, `restoring`, `scheduled`, `snapshotting`, `validating` | `scheduled` |
| `dr_restore_logs` | `step` | `cleanup`, `isolate`, `restore`, `snapshot`, `validate` |  |
| `dr_restore_logs` | `status` | `failed`, `skipped`, `started`, `succeeded` |  |
| `postmortems` | `status` | `draft`, `published`, `review` | `draft` |
| `postmortem_action_items` | `status` | `cancelled`, `done`, `in_progress`, `open` | `open` |
| `compliance_reports` | `status` | **livre (sem enum/CHECK)** | `draft` |
| `compliance_evidence` | `status` | **livre (sem enum/CHECK)** | `pending` |
| `vulnerability_findings` | `status` | `accepted_risk`, `acknowledged`, `fixed`, `open` | `open` |
| `managed_secrets` | `status` | `active`, `overdue`, `pending_rotation`, `retired` | `active` |
| `pentest_engagements` | `status` | `cancelled`, `completed`, `in_progress`, `reporting`, `scoping` | `scoping` |
| `pentest_findings` | `status` | `accepted_risk`, `false_positive`, `fixed`, `in_remediation`, `open` | `open` |
| `risk_register` | `status` | `assessed`, `closed`, `identified`, `monitored`, `treated` | `identified` |
| `vendors` | `status` | `active`, `offboarded`, `suspended`, `under_review` | `active` |
| `business_systems` | `status` | `operational`, `degraded`, `down`, `retired` | `operational` |
| `change_requests` | `status` | `draft`, `pending_approval`, `approved`, `rejected`, `scheduled`, `in_progress`, `completed`, `rolled_back`, `failed` | `draft` |
| `ir_playbooks` | `status` | `draft`, `active`, `archived` | `draft` |
| `ir_playbook_steps` | `step_order` | **livre (sem enum/CHECK)** | `0` |
| `ir_playbook_steps` | `phase` | `detect`, `contain`, `eradicate`, `recover`, `postmortem` |  |
| `assets` | `status` | `active`, `maintenance`, `decommissioned`, `lost` | `active` |
| `asset_audits` | `status_after` | `active`, `maintenance`, `decommissioned`, `lost` | `active` |
| `audit_log_v2` | `status` | **livre (sem enum/CHECK)** | `success` |
| `trace_events_v2` | `status` | **livre (sem enum/CHECK)** | `ok` |
| `retention_job_runs` | `status` | `failed`, `running`, `success` | `running` |
| `openclaw_deployments` | `status` | `deployed`, `failed`, `pending`, `rolled_back` | `pending` |
| `openclaw_whatsapp_instances` | `status` | `connected`, `disconnected`, `error`, `expired`, `pending` | `pending` |
| `openclaw_whatsapp_messages` | `status` | `failed`, `human_takeover`, `received`, `sent` | `received` |
| `slack_rag_sources` | `last_sync_status` | **livre (sem enum/CHECK)** |  |
| `document_ingestions` | `status` | `cancelled`, `chunking`, `embedding`, `error`, `ocr`, `parsing`, `pending`, `ready`, `uploading` | `pending` |
| `document_ingestion_events` | `status` | **livre (sem enum/CHECK)** |  |
| `notebook_podcasts` | `status` | `canceled`, `failed`, `generating`, `queued`, `ready` | `queued` |
| `data_subject_requests` | `status` | `completed`, `denied`, `partial`, `processing`, `received` | `received` |
| `data_breach_log` | `status` | `contained`, `investigating`, `open`, `resolved` | `investigating` |
| `crm_deals` | `status` | `lost`, `open`, `won` | `open` |
| `crm_cadence_enrollments` | `status` | `active`, `completed`, `failed`, `stopped` | `active` |
| `crm_cadence_enrollments` | `current_step` | **livre (sem enum/CHECK)** | `0` |
| `webhook_delivery_logs` | `status` | `delivered`, `failed` |  |
| `traces` | `status` | `cancelled`, `error`, `ok`, `running` | `running` |
| `spans` | `status` | **livre (sem enum/CHECK)** |  |
| `skill_harvest_runs` | `status` | **livre (sem enum/CHECK)** | `running` |
| `skill_harvest_candidates` | `status` | `accepted`, `auto_rejected`, `pending`, `promoted`, `rejected` | `pending` |
| `skill_reclassification_reviews` | `status` | `aprovado`, `pendente`, `rejeitado` | `pendente` |
| `audit_log_v2_2026_04` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2026_06` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2026_07` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2026_08` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2026_09` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2026_10` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2026_11` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2026_12` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2027_01` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2027_02` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2027_03` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2027_04` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2027_05` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2027_06` | `status` | **livre (sem enum/CHECK)** |  |
| `audit_log_v2_2027_07` | `status` | **livre (sem enum/CHECK)** |  |
| `forensic_snapshots` | `state_after` | **livre (sem enum/CHECK)** |  |
| `forensic_snapshots` | `state_before` | **livre (sem enum/CHECK)** |  |
| `forensic_snapshots` | `step_index` | **livre (sem enum/CHECK)** |  |
| `spans_2026_04` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2026_05` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2026_06` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2026_07` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2026_08` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2026_09` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2026_10` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2026_11` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2026_12` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2027_01` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2027_02` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2027_03` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2027_04` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2027_05` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2027_06` | `status` | **livre (sem enum/CHECK)** |  |
| `spans_2027_07` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2026_04` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2026_05` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2026_06` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2026_07` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2026_08` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2026_09` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2026_10` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2026_11` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2026_12` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2027_01` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2027_02` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2027_03` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2027_04` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2027_05` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2027_06` | `status` | **livre (sem enum/CHECK)** |  |
| `trace_events_v2_2027_07` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2026_04` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2026_05` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2026_06` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2026_07` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2026_08` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2026_09` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2026_10` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2026_11` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2026_12` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2027_01` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2027_02` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2027_03` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2027_04` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2027_05` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2027_06` | `status` | **livre (sem enum/CHECK)** |  |
| `traces_2027_07` | `status` | **livre (sem enum/CHECK)** |  |

### E.2 Mapas de transição declarados no código

_nenhum mapa explícito encontrado — transições só existem implicitamente nos `if`s (veja E.3)_

### E.3 Valores de status usados no código (escreve / compara / filtra)

| Campo | Valor | Uso | Onde |
|---|---|---|---|
| `type` | `ADD_TOAST` | compara, escreve | `src/hooks/use-toast.ts` |
| `type` | `COMPROU` | escreve | `src/pages/KnowledgeGraphPage.tsx` |
| `type` | `CONTÉM` | escreve | `src/pages/KnowledgeGraphPage.tsx` |
| `type` | `Cache` | escreve | `src/pages/DataStoragePage.tsx` |
| `type` | `DISMISS_TOAST` | compara, escreve | `src/hooks/use-toast.ts` |
| `type` | `EMITIU` | escreve | `src/pages/KnowledgeGraphPage.tsx` |
| `type` | `Empresa` | escreve | `src/pages/KnowledgeGraphPage.tsx` |
| `type` | `Files` | escreve | `src/pages/DataStoragePage.tsx` |
| `type` | `Localidade` | escreve | `src/pages/KnowledgeGraphPage.tsx` |
| `type` | `Pessoa` | escreve | `src/pages/KnowledgeGraphPage.tsx` |
| `type` | `Produto` | escreve | `src/pages/KnowledgeGraphPage.tsx` |
| `type` | `REMOVE_TOAST` | compara, escreve | `src/hooks/use-toast.ts` |
| `type` | `RESIDE_EM` | escreve | `src/pages/KnowledgeGraphPage.tsx` |
| `type` | `RUN_ERROR` | escreve | `src/lib/ag-ui/protocol.ts`<br>`supabase/functions/smolagent-runtime/index.ts` |
| `type` | `RUN_FINISHED` | escreve | `src/hooks/useStreamingResponse.ts`<br>`src/lib/ag-ui/protocol.ts`<br>`supabase/functions/smolagent-runtime/index.ts` |
| `type` | `RUN_STARTED` | escreve | `src/hooks/useStreamingResponse.ts`<br>`supabase/functions/smolagent-runtime/index.ts` |
| `type` | `SKIP_WAITING` | compara | `public/sw.js` |
| `type` | `STATE_DELTA` | compara, escreve | `src/hooks/useStreamingResponse.ts`<br>`src/lib/ag-ui/protocol.ts`<br>`supabase/functions/smolagent-runtime/index.ts` |
| `type` | `TEXT_MESSAGE_CONTENT` | escreve | `src/hooks/useStreamingResponse.ts`<br>`src/lib/ag-ui/protocol.ts`<br>`supabase/functions/smolagent-runtime/index.ts` |
| `type` | `TOOL_CALL_ARGS` | escreve | `src/hooks/useStreamingResponse.ts` |
| `type` | `TOOL_CALL_END` | escreve | `src/lib/ag-ui/protocol.ts`<br>`supabase/functions/smolagent-runtime/index.ts` |
| `type` | `TOOL_CALL_START` | escreve | `src/lib/ag-ui/protocol.ts`<br>`supabase/functions/smolagent-runtime/index.ts` |
| `type` | `Tipo` | escreve | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| `type` | `Transação` | escreve | `src/pages/KnowledgeGraphPage.tsx` |
| `type` | `UPDATE_TOAST` | compara, escreve | `src/hooks/use-toast.ts` |
| `type` | `ack` | compara, escreve | `src/pages/VulnerabilitiesPage.tsx` |
| `type` | `action` | compara, escreve | `src/config/workflow-templates.ts`<br>`src/pages/ComputerUsePage.tsx`<br>`src/services/automationTemplateService.ts`<br>`src/services/presets/connectorPresets.ts` |
| `type` | `actions` | escreve | `supabase/functions/_shared/slack.ts` |
| `type` | `add` | compara, escreve | `src/components/replay/StateDiff.tsx` |
| `type` | `added` | compara, escreve | `src/components/agents/wizard/quickSteps/PromptUnlockDiffDialog.tsx`<br>`src/components/agents/wizard/quickSteps/PromptVariantDiffDialog.tsx`<br>`src/components/prompts/PromptDiff.tsx` |
| `type` | `agent` | compara, escreve | `src/components/agent-builder/orchestrator/nodes/CustomNodes.tsx`<br>`src/components/shared/CommandPalette.tsx`<br>`src/components/super-cerebro/ExpertDiscoveryTab.tsx`<br>`src/components/super-cerebro/KnowledgeGraphSvg.tsx`<br>`src/config/workflow-templates.ts`<br>… +4 |
| `type` | `alert` | compara | `src/components/shared/GenerativeUI.tsx` |
| `type` | `analyst` | compara, escreve | `src/components/agents/CreateAgentWizard.tsx`<br>`src/data/quickAgentTemplates.ts` |
| `type` | `api_key` | escreve | `src/services/presets/credentialPresets.ts` |
| `type` | `app_mention` | compara, escreve | `supabase/functions/slack-events-webhook/index.ts`<br>`supabase/functions/test-runner/contract_test.ts`<br>`supabase/functions/test-runner/versioning_contract_test.ts` |
| `type` | `approve` | compara, escreve | `src/components/deployments/ApprovalQueuePanel.tsx` |
| `type` | `array` | escreve | `supabase/functions/global-search/index.ts` |
| `type` | `article` | escreve | `supabase/functions/global-search/index.ts` |
| `type` | `automation` | escreve | `supabase/functions/global-search/index.ts` |
| `type` | `batch_optimization` | escreve | `src/components/billing/CostOptimizationPanel.tsx` |
| `type` | `bearer_token` | escreve | `src/services/presets/credentialPresets.ts` |
| `type` | `bias` | escreve | `supabase/functions/automation-pipeline/index.ts` |
| `type` | `blob` | compara, escreve | `src/services/vaultSyncService.ts`<br>`supabase/functions/skill-harvester/index.ts` |
| `type` | `body` | escreve | `src/services/whatsappOutboundService.ts` |
| `type` | `boolean` | compara, escreve | `src/components/datahub/CreateRecordDialog.tsx`<br>`src/components/datahub/DataBrowser.tsx`<br>`src/components/datahub/DataBrowserFilters.tsx`<br>`src/config/datahub-columns.ts`<br>`supabase/functions/agent-conversational-builder/index.ts`<br>… +1 |
| `type` | `button` | escreve | `src/components/agents/wizard/quickSteps/PromptSectionUsage.tsx`<br>`supabase/functions/_shared/slack.ts` |
| `type` | `cache_opportunity` | escreve | `src/components/billing/CostOptimizationPanel.tsx` |
| `type` | `calendar` | compara, escreve | `src/pages/EmailCalendarTriggersPage.tsx` |
| `type` | `card` | compara | `src/components/shared/GenerativeUI.tsx` |
| `type` | `chatbot` | escreve | `src/data/quickAgentTemplates.ts`<br>`src/lib/validations/quickAgentSchema.ts` |
| `type` | `clear` | compara, escreve | `src/hooks/useFilterPersistence.ts` |
| `type` | `clear-event` | compara, escreve | `src/components/agents/traces/EmptyTracesForAgent.tsx`<br>`src/pages/AgentTracesPage.tsx` |
| `type` | `clear-level` | compara, escreve | `src/components/agents/traces/EmptyTracesForAgent.tsx`<br>`src/pages/AgentTracesPage.tsx` |
| `type` | `cnpj` | compara, escreve | `supabase/functions/nlp-pipeline/index.ts` |
| `type` | `code` | compara | `src/components/shared/GenerativeUI.tsx` |
| `type` | `condition` | compara, escreve | `src/components/agent-builder/orchestrator/nodes/CustomNodes.tsx`<br>`src/components/workflows/WorkflowCanvas.tsx`<br>`src/config/workflow-templates.ts`<br>`src/services/automationTemplateService.ts`<br>`supabase/functions/agent-workflow-runner/index.ts` |
| `type` | `conditional` | compara | `supabase/functions/workflow-engine-v2/index.ts` |
| `type` | `contains` | compara | `src/services/agentHandoffService.ts` |
| `type` | `content_block_delta` | compara | `supabase/functions/llm-gateway/index.ts` |
| `type` | `content_filter` | escreve | `src/data/guardrailPresets.ts` |
| `type` | `context` | escreve | `src/components/replay/StateDiff.tsx`<br>`supabase/functions/_shared/slack.ts` |
| `type` | `context_overflow` | escreve | `src/services/agentTestSimulationService.ts` |
| `type` | `copilot` | escreve | `src/data/quickAgentTemplates.ts` |
| `type` | `cpf` | compara, escreve | `supabase/functions/nlp-pipeline/index.ts` |
| `type` | `critic` | escreve | `src/components/workflows/WorkflowCanvasTab.tsx` |
| `type` | `crm` | escreve | `src/types/agentTypes.ts` |
| `type` | `custom` | compara, escreve | `src/data/guardrailPresets.ts`<br>`src/services/agentHandoffService.ts` |
| `type` | `data` | escreve | `supabase/functions/a2a-server/index.ts` |
| `type` | `decision` | escreve | `src/pages/AgentDebuggerPage.tsx` |
| `type` | `default` | escreve | `src/components/orchestration/GraphCanvas.tsx`<br>`src/components/super-cerebro/notebook/CanvasEditor.tsx` |
| `type` | `delay` | escreve | `src/services/automationTemplateService.ts` |
| `type` | `disable_chaos` | compara | `supabase/functions/incident-orchestrator/index.ts` |
| `type` | `disc` | escreve | `supabase/functions/automation-pipeline/index.ts` |
| `type` | `doc` | escreve | `src/pages/KnowledgeManagementPage.tsx` |
| `type` | `document` | escreve | `src/services/whatsappOutboundService.ts`<br>`supabase/functions/global-search/index.ts` |
| `type` | `email` | compara, escreve | `src/pages/EmailCalendarTriggersPage.tsx`<br>`supabase/functions/nlp-pipeline/index.ts` |
| `type` | `end` | compara, escreve | `supabase/functions/workflow-engine-v2/index.ts` |
| `type` | `enum` | compara, escreve | `src/components/skills/composer/InputsBuilder.tsx`<br>`src/lib/skillComposer/skillDraft.ts`<br>`src/services/skillsSimulationService.ts` |
| `type` | `eq` | compara, escreve | `src/services/agentHandoffService.ts`<br>`supabase/functions/automation-pipeline/index.ts` |
| `type` | `error` | compara, escreve | `src/components/shared/NotificationsDrawer.tsx`<br>`src/pages/ComputerUsePage.tsx`<br>`src/pages/SwarmOrchestrationPage.tsx`<br>`src/services/healthAlertsService.ts`<br>`src/stores/oracleStore.ts` |
| `type` | `eval_dataset` | escreve | `supabase/functions/global-search/index.ts` |
| `type` | `evaluation` | compara, escreve | `src/components/shared/NotificationsDrawer.tsx` |
| `type` | `event_callback` | compara, escreve | `supabase/functions/slack-events-webhook/index.ts`<br>`supabase/functions/test-runner/contract_test.ts`<br>`supabase/functions/test-runner/versioning_contract_test.ts` |
| `type` | `executor` | escreve | `src/components/workflows/WorkflowCanvasTab.tsx`<br>`src/pages/WorkflowsPage.tsx` |
| `type` | `exists` | compara | `src/services/agentHandoffService.ts` |
| `type` | `final` | compara | `src/pages/ComputerUsePage.tsx`<br>`src/stores/oracleStore.ts` |
| `type` | `fix` | escreve | `src/pages/VulnerabilitiesPage.tsx` |
| `type` | `full` | compara, escreve | `src/pages/DisasterRecoveryPage.tsx` |
| `type` | `function` | escreve | `supabase/functions/agent-conversational-builder/index.ts`<br>`supabase/functions/browser-agent-run/index.ts`<br>`supabase/functions/global-search/index.ts`<br>`supabase/functions/skill-classify-llm/index.ts`<br>`supabase/functions/skill-describe-llm/index.ts` |
| `type` | `good` | compara, escreve | `src/components/super-cerebro/OverviewTab.tsx` |
| `type` | `gt` | compara | `src/services/agentHandoffService.ts` |
| `type` | `gte` | compara | `src/services/agentHandoffService.ts` |
| `type` | `hallucination` | escreve | `src/services/agentTestSimulationService.ts` |
| `type` | `handshake` | compara, escreve | `src/pages/SwarmOrchestrationPage.tsx` |
| `type` | `header` | escreve | `supabase/functions/_shared/slack.ts` |
| `type` | `hitl_gate` | compara | `supabase/functions/workflow-engine-v2/index.ts` |
| `type` | `human` | compara, escreve | `src/components/super-cerebro/ExpertDiscoveryTab.tsx`<br>`supabase/functions/cerebro-brain/index.ts` |
| `type` | `idle_agent` | escreve | `src/components/billing/CostOptimizationPanel.tsx` |
| `type` | `image` | compara, escreve | `src/components/super-cerebro/notebook/CanvasEditor.tsx`<br>`src/services/whatsappOutboundService.ts` |
| `type` | `image_url` | escreve | `supabase/functions/browser-agent-run/index.ts`<br>`supabase/functions/doc-ocr/index.ts`<br>`supabase/functions/image-analysis/index.ts`<br>`supabase/functions/visual-search/index.ts`<br>`supabase/functions/voice-transcribe/index.ts` |
| `type` | `incremental` | escreve | `src/pages/DisasterRecoveryPage.tsx` |
| `type` | `info` | escreve | `src/components/dashboard/DashboardInsight.tsx`<br>`src/components/super-cerebro/OverviewTab.tsx`<br>`src/stores/notificationStore.ts` |
| `type` | `intent` | compara | `src/services/agentHandoffService.ts` |
| `type` | `json_object` | escreve | `supabase/functions/code-interpreter-execute/index.ts`<br>`supabase/functions/crm-enrich/index.ts` |
| `type` | `keyword` | compara, escreve | `src/services/agentHandoffService.ts`<br>`src/services/types/agentHandoffTypes.ts` |
| `type` | `knowledge_base` | compara, escreve | `src/components/super-cerebro/KnowledgeGraphSvg.tsx`<br>`src/components/super-cerebro/KnowledgeHealthTab.tsx`<br>`supabase/functions/cerebro-brain/index.ts`<br>`supabase/functions/global-search/index.ts` |
| `type` | `llm` | escreve | `src/pages/AgentDebuggerPage.tsx` |
| `type` | `llm_call` | compara, escreve | `supabase/functions/workflow-engine-v2/index.ts` |
| `type` | `loop` | escreve | `src/services/automationTemplateService.ts` |
| `type` | `lt` | compara | `src/services/agentHandoffService.ts` |
| `type` | `lte` | compara | `src/services/agentHandoffService.ts` |
| `type` | `member_response` | compara | `src/stores/oracleStore.ts` |
| `type` | `memory` | escreve | `src/pages/AgentDebuggerPage.tsx`<br>`src/services/knowledgeDecayService.ts` |
| `type` | `message` | compara, escreve | `supabase/functions/slack-events-webhook/index.ts`<br>`supabase/functions/test-runner/contract_test.ts`<br>`supabase/functions/test-runner/versioning_contract_test.ts` |
| `type` | `message_delta` | compara | `supabase/functions/llm-gateway/index.ts` |
| `type` | `message_start` | compara | `supabase/functions/llm-gateway/index.ts` |
| `type` | `model` | escreve | `supabase/functions/hf-autotrain/index.ts` |
| `type` | `model_downgrade` | escreve | `src/components/billing/CostOptimizationPanel.tsx` |
| `type` | `mrkdwn` | escreve | `supabase/functions/_shared/slack.ts` |
| `type` | `msg` | escreve | `src/pages/ChatWithAgentPage.tsx` |
| `type` | `note` | compara, escreve | `src/components/super-cerebro/notebook/CanvasEditor.tsx`<br>`src/pages/GameDayLivePage.tsx`<br>`src/services/canvasesService.ts` |
| `type` | `notification` | compara, escreve | `src/components/automation/AutomationTemplatesPanel.tsx`<br>`src/services/automationTemplateService.ts` |
| `type` | `notify` | compara, escreve | `src/pages/IncidentPlaybooksPage.tsx`<br>`src/services/incidentService.ts`<br>`supabase/functions/incident-orchestrator/index.ts` |
| `type` | `number` | compara, escreve | `src/components/datahub/CreateRecordDialog.tsx`<br>`src/components/skills/composer/InputsBuilder.tsx`<br>`src/services/skillsSimulationService.ts`<br>`supabase/functions/browser-agent-run/index.ts`<br>`supabase/functions/datahub-mcp-server/index.ts`<br>… +3 |
| `type` | `oauth2` | escreve | `src/services/presets/credentialPresets.ts` |
| `type` | `object` | escreve | `supabase/functions/agent-conversational-builder/index.ts`<br>`supabase/functions/browser-agent-run/index.ts`<br>`supabase/functions/datahub-mcp-server/index.ts`<br>`supabase/functions/global-search/index.ts`<br>`supabase/functions/skill-classify-llm/index.ts`<br>… +1 |
| `type` | `orchestrator` | compara, escreve | `src/components/agents/CreateAgentWizard.tsx`<br>`src/data/quickAgentTemplates.ts` |
| `type` | `output` | compara, escreve | `src/components/agent-builder/orchestrator/nodes/CustomNodes.tsx`<br>`src/components/workflows/WorkflowCanvas.tsx`<br>`supabase/functions/agent-workflow-runner/index.ts` |
| `type` | `page` | escreve | `src/components/shared/CommandPalette.tsx` |
| `type` | `page_oncall` | compara, escreve | `src/services/incidentService.ts`<br>`supabase/functions/incident-orchestrator/index.ts` |
| `type` | `parsing_error` | escreve | `src/services/agentTestSimulationService.ts` |
| `type` | `participates` | escreve | `supabase/functions/cerebro-brain/index.ts` |
| `type` | `pause_agent` | compara, escreve | `src/services/incidentService.ts`<br>`supabase/functions/incident-orchestrator/index.ts` |
| `type` | `pdf` | escreve | `src/components/agent-builder/modules/RAGModule.tsx`<br>`src/types/agentTypes.ts` |
| `type` | `phone` | compara, escreve | `supabase/functions/nlp-pipeline/index.ts` |
| `type` | `pii_detection` | compara, escreve | `src/data/guardrailPresets.ts`<br>`src/services/securityService.ts` |
| `type` | `plain_text` | escreve | `supabase/functions/_shared/slack.ts` |
| `type` | `planner` | escreve | `src/components/workflows/WorkflowCanvasTab.tsx` |
| `type` | `position` | compara, escreve | `src/components/orchestration/GraphCanvas.tsx` |
| `type` | `problem` | escreve | `eslint-plugins/nexus-design.js` |
| `type` | `progress` | compara | `src/components/knowledge/KnowledgeBaseDetail.tsx`<br>`src/components/shared/GenerativeUI.tsx` |
| `type` | `prompt_injection` | compara, escreve | `src/data/guardrailPresets.ts`<br>`src/services/securityService.ts` |
| `type` | `rag` | escreve | `src/config/workflow-templates.ts` |
| `type` | `rate_limit` | escreve | `src/services/agentTestSimulationService.ts` |
| `type` | `reject` | escreve | `src/components/deployments/ApprovalQueuePanel.tsx` |
| `type` | `remove` | compara, escreve | `src/components/replay/StateDiff.tsx` |
| `type` | `remove-agent` | compara, escreve | `src/components/agents/traces/EmptyTracesForAgent.tsx`<br>`src/pages/AgentTracesPage.tsx` |
| `type` | `removed` | compara, escreve | `src/components/agents/wizard/quickSteps/PromptUnlockDiffDialog.tsx`<br>`src/components/agents/wizard/quickSteps/PromptVariantDiffDialog.tsx`<br>`src/components/prompts/PromptDiff.tsx` |
| `type` | `researcher` | compara, escreve | `src/components/agents/CreateAgentWizard.tsx`<br>`src/components/workflows/WorkflowCanvasTab.tsx`<br>`src/data/quickAgentTemplates.ts` |
| `type` | `resource` | escreve | `src/lib/webVitals.ts` |
| `type` | `response` | escreve | `src/pages/SwarmOrchestrationPage.tsx` |
| `type` | `retriever` | escreve | `src/components/workflows/WorkflowCanvasTab.tsx` |
| `type` | `review_complete` | compara | `src/stores/oracleStore.ts` |
| `type` | `same` | compara, escreve | `src/components/agents/wizard/quickSteps/PromptVariantDiffDialog.tsx`<br>`src/components/prompts/PromptDiff.tsx` |
| `type` | `schedule` | compara | `src/services/agentHandoffService.ts` |
| `type` | `screenshot` | compara | `src/pages/ComputerUsePage.tsx` |
| `type` | `sdr` | compara, escreve | `src/components/agents/CreateAgentWizard.tsx`<br>`src/data/quickAgentTemplates.ts` |
| `type` | `search` | escreve | `src/services/presets/connectorPresets.ts` |
| `type` | `section` | escreve | `supabase/functions/_shared/slack.ts` |
| `type` | `select` | compara, escreve | `src/components/datahub/CreateRecordDialog.tsx`<br>`src/components/datahub/DataBrowser.tsx`<br>`src/components/datahub/DataBrowserFilters.tsx`<br>`src/config/datahub-columns.ts` |
| `type` | `sep` | compara, escreve | `src/pages/ChatWithAgentPage.tsx` |
| `type` | `set` | compara, escreve | `src/hooks/useFilterPersistence.ts` |
| `type` | `smolagent_runtime` | compara | `supabase/functions/workflow-engine-v2/index.ts` |
| `type` | `smtp` | escreve | `src/services/presets/credentialPresets.ts` |
| `type` | `stage` | compara | `src/stores/oracleStore.ts` |
| `type` | `start` | compara | `src/components/workflows/WorkflowCanvas.tsx` |
| `type` | `status` | compara | `src/components/knowledge/KnowledgeBaseDetail.tsx`<br>`src/pages/ComputerUsePage.tsx` |
| `type` | `stdout` | compara, escreve | `supabase/functions/code-interpreter-execute/index.ts` |
| `type` | `string` | compara, escreve | `src/components/skills/composer/InputsBuilder.tsx`<br>`src/components/skills/composer/OutputsAndPromptBuilder.tsx`<br>`src/hooks/useStreamingResponse.ts`<br>`src/services/skillsSimulationService.ts`<br>`supabase/functions/agent-conversational-builder/index.ts`<br>… +7 |
| `type` | `success` | compara, escreve | `src/components/dashboard/DashboardInsight.tsx`<br>`src/components/shared/NotificationsDrawer.tsx`<br>`src/services/healthAlertsService.ts` |
| `type` | `support` | compara, escreve | `src/components/agents/CreateAgentWizard.tsx`<br>`src/data/quickAgentTemplates.ts` |
| `type` | `switch_provider` | compara, escreve | `src/services/incidentService.ts`<br>`supabase/functions/incident-orchestrator/index.ts` |
| `type` | `table` | compara, escreve | `src/components/shared/GenerativeUI.tsx` |
| `type` | `task` | escreve | `src/pages/SwarmOrchestrationPage.tsx` |
| `type` | `template` | escreve | `src/services/whatsappOutboundService.ts` |
| `type` | `text` | compara, escreve | `src/components/datahub/CreateRecordDialog.tsx`<br>`src/components/integrations/A2APanel.tsx`<br>`src/components/shared/GenerativeUI.tsx`<br>`src/config/datahub-columns.ts`<br>`src/lib/mcp/mcpClient.ts`<br>… +10 |
| `type` | `thought` | compara | `src/pages/ComputerUsePage.tsx` |
| `type` | `threshold` | compara | `src/services/agentHandoffService.ts` |
| `type` | `timeout` | escreve | `src/services/agentTestSimulationService.ts` |
| `type` | `tool` | compara, escreve | `src/components/agent-builder/orchestrator/nodes/CustomNodes.tsx`<br>`src/components/super-cerebro/KnowledgeGraphSvg.tsx`<br>`src/config/workflow-templates.ts`<br>`src/pages/AgentDebuggerPage.tsx`<br>`supabase/functions/agent-workflow-runner/index.ts`<br>… +1 |
| `type` | `tool_call` | compara | `supabase/functions/workflow-engine-v2/index.ts` |
| `type` | `tool_failure` | escreve | `src/services/agentTestSimulationService.ts` |
| `type` | `toxicity` | escreve | `src/data/guardrailPresets.ts` |
| `type` | `trace` | escreve | `src/components/shared/NotificationsDrawer.tsx` |
| `type` | `trace-create` | escreve | `src/lib/tracing/tracingExporters.ts` |
| `type` | `transform` | compara, escreve | `src/components/agent-builder/orchestrator/nodes/CustomNodes.tsx`<br>`supabase/functions/agent-workflow-runner/index.ts` |
| `type` | `trigger` | compara, escreve | `src/components/agent-builder/orchestrator/nodes/CustomNodes.tsx`<br>`src/components/automation/AutomationTemplatesPanel.tsx`<br>`src/config/workflow-templates.ts`<br>`src/services/automationTemplateService.ts`<br>`src/services/presets/connectorPresets.ts`<br>… +2 |
| `type` | `unknown_type` | escreve | `supabase/functions/_shared/edge-contract_test.ts` |
| `type` | `unsafe_output` | escreve | `src/services/agentTestSimulationService.ts` |
| `type` | `url_verification` | compara, escreve | `supabase/functions/slack-events-webhook/index.ts`<br>`supabase/functions/test-runner/contract_test.ts`<br>`supabase/functions/test-runner/versioning_contract_test.ts` |
| `type` | `warn` | compara, escreve | `src/components/super-cerebro/OverviewTab.tsx` |
| `type` | `warning` | compara, escreve | `src/components/dashboard/DashboardInsight.tsx`<br>`src/components/shared/NotificationsDrawer.tsx`<br>`src/services/healthAlertsService.ts` |
| `type` | `widen-window` | compara, escreve | `src/components/agents/traces/EmptyTracesForAgent.tsx`<br>`src/pages/AgentTracesPage.tsx` |
| `type` | `workflow` | escreve | `src/components/super-cerebro/KnowledgeGraphSvg.tsx`<br>`supabase/functions/cerebro-brain/index.ts`<br>`supabase/functions/global-search/index.ts` |
| `status` | `Active` | compara, escreve | `src/pages/ObservabilityOTelPage.tsx` |
| `status` | `Aviso` | escreve | `src/pages/SettingsPage.tsx` |
| `status` | `CHANNEL_ERROR` | compara | `src/components/shared/IncidentRunsMounter.tsx`<br>`src/hooks/useCurationRealtime.ts` |
| `status` | `FinOps` | escreve | `src/pages/DeploymentsPage.tsx` |
| `status` | `Inactive` | escreve | `src/pages/ObservabilityOTelPage.tsx` |
| `status` | `Incidents` | escreve | `src/pages/DeploymentsPage.tsx` |
| `status` | `Nominal` | compara, escreve | `src/pages/DashboardPage.tsx`<br>`src/pages/SettingsPage.tsx` |
| `status` | `Ok` | escreve | `src/components/deployments/DeploymentWizard.tsx` |
| `status` | `Online` | escreve | `src/pages/DashboardPage.tsx` |
| `status` | `Optimized` | escreve | `src/pages/DashboardPage.tsx` |
| `status` | `P95` | escreve | `src/pages/DeploymentsPage.tsx` |
| `status` | `Passou` | escreve | `src/components/deployments/DeploymentWizard.tsx` |
| `status` | `Paused` | escreve | `src/pages/ObservabilityOTelPage.tsx` |
| `status` | `SUBSCRIBED` | compara | `src/components/billing/RealTimeCostStream.tsx` |
| `status` | `Throughput` | escreve | `src/pages/DeploymentsPage.tsx` |
| `status` | `aborted` | compara, escreve | `src/pages/GameDaysPage.tsx` |
| `status` | `accepted` | escreve | `src/services/agentHandoffService.ts` |
| `status` | `accepted_risk` | compara | `src/services/pentestService.ts` |
| `status` | `acknowledged` | compara | `src/pages/VulnerabilitiesPage.tsx` |
| `status` | `acting` | escreve | `supabase/functions/smolagent-runtime/index.ts` |
| `status` | `active` | compara, escreve, filtra | `src/components/agent-builder/modules/DeployModule.tsx`<br>`src/components/agents/traces/AgentContextPanel.tsx`<br>`src/components/automation/CredentialVaultPanel.tsx`<br>`src/components/automation/WebhookManagerPanel.tsx`<br>`src/components/crm/CadencesPanel.tsx`<br>… +30 |
| `status` | `added` | compara | `src/components/agents/versioning/GuardrailsDiffPanel.tsx`<br>`src/components/agents/versioning/VersionComparePanel.tsx` |
| `status` | `aguardando_retry` | compara | `src/components/skills/SkillReclassifyDialog.tsx` |
| `status` | `all` | compara | `src/services/crmService.ts`<br>`src/services/skillHarvestService.ts` |
| `status` | `answered` | escreve | `supabase/functions/whatsapp-router/index.ts` |
| `status` | `approved` | compara | `src/lib/skills/observability.ts`<br>`src/pages/ChangeManagementPage.tsx` |
| `status` | `aprovado` | compara | `src/lib/skills/observability.ts` |
| `status` | `archived` | compara, escreve | `src/components/agents/AgentCard.tsx`<br>`src/components/agents/AgentCardGrid.tsx`<br>`src/components/agents/traces/AgentContextPanel.tsx`<br>`src/components/knowledge/RagVersionControl.tsx`<br>`src/components/shared/NotificationsDrawer.tsx`<br>… +3 |
| `status` | `atencao` | compara | `src/lib/skills/calibrationGovernance.ts` |
| `status` | `auto_rejected` | compara | `src/pages/SkillHarvestPage.tsx` |
| `status` | `available` | compara, escreve | `src/components/settings/HuggingFaceTab.tsx`<br>`src/services/connectorRegistryService.ts`<br>`src/services/presets/connectorPresets.ts` |
| `status` | `awaiting_approval` | escreve, filtra | `src/services/approvalService.ts`<br>`supabase/functions/workflow-engine-v2/index.ts` |
| `status` | `breakpoint` | compara, escreve | `src/pages/AgentDebuggerPage.tsx` |
| `status` | `canary` | compara, escreve | `src/pages/CanaryDeploymentsPage.tsx` |
| `status` | `cancelado` | compara | `src/lib/skills/queueFailureSummary.ts` |
| `status` | `canceled` | escreve | `supabase/functions/notebook-podcast-generate/index.ts` |
| `status` | `cancelled` | compara, escreve | `src/components/super-cerebro/DocumentUploadTab.tsx`<br>`src/services/batchProcessorService.ts`<br>`src/services/documentIngestionService.ts`<br>`src/services/notificationEngineService.ts`<br>`supabase/functions/browser-agent-run/index.ts`<br>… +2 |
| `status` | `closed` | compara | `src/pages/RiskRegisterPage.tsx`<br>`supabase/migrations/20260418134141_767d2a2b-4edb-4e37-9a3e-59845e843de2.sql` |
| `status` | `completed` | compara, escreve, filtra | `src/components/agent-builder/modules/EvalsModule.tsx`<br>`src/components/agent-builder/modules/ExperimentsModule.tsx`<br>`src/components/agent-builder/modules/ObservabilityModule.tsx`<br>`src/components/agent-builder/modules/OrchestratorModule.tsx`<br>`src/components/knowledge/IngestionLogsPanel.tsx`<br>… +43 |
| `status` | `compliant` | compara | `src/components/security/ComplianceFrameworks.tsx` |
| `status` | `concluido` | compara | `src/services/skillEnrichmentService.ts`<br>`src/services/skillReclassificationService.ts` |
| `status` | `connected` | compara, escreve | `src/components/automation/ConnectorRegistryPanel.tsx`<br>`src/components/datahub/ConnectionCard.tsx`<br>`src/components/integrations/MCPServerManager.tsx`<br>`src/components/settings/MCPServersPanel.tsx`<br>`src/lib/mcp/mcpClient.ts`<br>… +8 |
| `status` | `critical` | compara | `src/components/agents/detail/InteractiveSLOPanel.tsx`<br>`src/components/agents/detail/SLOViolationTimeline.tsx`<br>`src/components/agents/detail/sloReportPdf.ts` |
| `status` | `critico` | compara | `src/lib/skills/calibrationGovernance.ts` |
| `status` | `current` | compara, escreve | `src/pages/AgentDebuggerPage.tsx` |
| `status` | `dead_letter` | compara | `src/services/queueManagerService.ts` |
| `status` | `decommissioned` | compara | `src/pages/AssetInventoryPage.tsx`<br>`src/services/assetInventoryService.ts`<br>`supabase/migrations/20260418151333_f71cf0bb-06c1-4f23-820c-398fdd4b6ffc.sql` |
| `status` | `degraded` | compara | `src/components/shared/SystemHealthBanner.tsx`<br>`src/services/healthService.ts` |
| `status` | `delivered` | compara, escreve | `src/components/shared/NotificationBell.tsx`<br>`src/hooks/useNotifications.ts`<br>`src/services/notificationEngineService.ts` |
| `status` | `denied` | compara | `src/components/admin/AuditTrailPanel.tsx` |
| `status` | `deployed` | escreve | `src/components/agent-builder/modules/DeployModule.tsx` |
| `status` | `deprecated` | compara | `src/components/agents/AgentCard.tsx`<br>`src/components/agents/AgentCardGrid.tsx`<br>`src/components/shared/NotificationsDrawer.tsx` |
| `status` | `desconhecido` | escreve | `src/lib/skills/promptEvidenceLedger.ts` |
| `status` | `discarded` | compara | `src/services/retryEngineService.ts` |
| `status` | `disconnected` | compara, escreve | `src/components/datahub/ConnectionCard.tsx`<br>`src/components/integrations/MCPServerManager.tsx`<br>`supabase/functions/openclaw-webhook/index.ts` |
| `status` | `done` | compara, escreve | `src/pages/AgentDebuggerPage.tsx`<br>`src/pages/PostmortemEditorPage.tsx`<br>`src/pages/PostmortemsPage.tsx`<br>`src/services/postmortemService.ts` |
| `status` | `down` | compara, escreve | `src/components/shared/SystemHealthBanner.tsx`<br>`src/services/healthService.ts`<br>`supabase/functions/health-check/index.ts` |
| `status` | `draft` | compara, escreve | `src/components/agent-builder/modules/ExperimentsModule.tsx`<br>`src/components/agents/AgentCard.tsx`<br>`src/components/agents/AgentCardGrid.tsx`<br>`src/components/agents/CreateAgentWizard.tsx`<br>`src/components/agents/traces/AgentContextPanel.tsx`<br>… +17 |
| `status` | `ended` | compara, escreve | `src/pages/VoiceAgentsPage.tsx`<br>`supabase/functions/voice-session/index.ts` |
| `status` | `err` | escreve | `src/components/integrations/Bitrix24ApiTester.tsx` |
| `status` | `erro` | compara | `src/lib/skills/observability.ts` |
| `status` | `error` | compara, escreve | `src/components/agent-builder/modules/DeployModule.tsx`<br>`src/components/agents/detail/ErrorAnalysisPanel.tsx`<br>`src/components/chat/ChatComposer.tsx`<br>`src/components/datahub/ConnectionCard.tsx`<br>`src/components/monitoring/SpanTreeView.tsx`<br>… +19 |
| `status` | `executando` | compara | `src/components/skills/SkillDescriptionEnrichPanel.tsx` |
| `status` | `expired` | compara, escreve | `src/components/automation/CredentialVaultPanel.tsx`<br>`src/pages/FreezeWindowsPage.tsx`<br>`src/services/credentialVaultService.ts` |
| `status` | `fail` | compara, escreve | `src/services/evaluationsService.ts` |
| `status` | `failed` | compara, escreve | `src/components/admin/AuditTrailPanel.tsx`<br>`src/components/agent-builder/modules/DeployModule.tsx`<br>`src/components/agent-builder/modules/EvalsModule.tsx`<br>`src/components/agent-builder/modules/OrchestratorModule.tsx`<br>`src/components/agent-builder/modules/TestingModule.tsx`<br>… +39 |
| `status` | `falhou` | compara | `src/components/skills/SkillReclassifyDialog.tsx`<br>`src/lib/skills/queueFailureSummary.ts` |
| `status` | `false_positive` | compara | `src/pages/PentestFindingsPage.tsx`<br>`src/services/pentestService.ts` |
| `status` | `fixed` | compara, escreve | `src/pages/PentestFindingsPage.tsx`<br>`src/pages/PentestPage.tsx`<br>`src/pages/VulnerabilitiesPage.tsx`<br>`src/services/pentestService.ts` |
| `status` | `fulfilled` | compara | `src/components/skills/SkillClassificationEfficacyCard.tsx`<br>`src/hooks/useAutomation.ts`<br>`supabase/functions/doc-parse/index.ts`<br>`supabase/functions/oracle-council/index.ts` |
| `status` | `gap` | compara, escreve | `src/services/skillsSimulationService.ts` |
| `status` | `generating` | compara, escreve | `src/components/super-cerebro/notebook/PodcastPanel.tsx`<br>`src/services/notebookPodcastsService.ts`<br>`supabase/functions/notebook-podcast-generate/index.ts` |
| `status` | `granted` | escreve | `supabase/functions/lgpd-manager/index.ts` |
| `status` | `healthy` | compara, escreve | `src/components/agents/detail/SLOViolationTimeline.tsx`<br>`src/components/agents/detail/agentMetricsHelpers.ts`<br>`src/components/agents/detail/sloReportPdf.ts`<br>`src/components/openclaw/OpenclawStatusBadge.tsx`<br>`src/components/shared/SystemHealthBanner.tsx`<br>… +7 |
| `status` | `hibernated` | compara, escreve | `src/components/datahub/ConnectionCard.tsx`<br>`src/pages/DataHubPage.tsx` |
| `status` | `idle` | compara, escreve | `src/components/workflows/WorkflowCanvas.tsx`<br>`src/hooks/use-workflow-persistence.ts`<br>`src/pages/AgentTracesPage.tsx` |
| `status` | `in_progress` | compara | `src/pages/ChangeManagementPage.tsx`<br>`src/pages/PentestPage.tsx`<br>`src/pages/PostmortemsPage.tsx` |
| `status` | `in_remediation` | compara | `src/pages/PentestFindingsPage.tsx` |
| `status` | `inactive` | compara, escreve | `src/components/agent-builder/modules/DeployModule.tsx`<br>`src/components/agents/traces/AgentContextPanel.tsx` |
| `status` | `indexed` | escreve, filtra | `supabase/functions/doc-parse/index.ts`<br>`supabase/functions/rag-ingest/index.ts` |
| `status` | `installed` | escreve | `src/services/automationTemplateService.ts` |
| `status` | `kept` | compara | `src/components/agents/versioning/GuardrailsDiffPanel.tsx`<br>`src/components/agents/versioning/VersionComparePanel.tsx` |
| `status` | `loading` | compara | `src/pages/AgentTracesPage.tsx` |
| `status` | `misconfigured` | escreve | `src/services/openclawDeployService.ts` |
| `status` | `missing` | compara, escreve | `src/components/agents/wizard/quickSteps/PromptHighlightOverlay.tsx`<br>`src/components/agents/wizard/quickSteps/PromptSectionGutter.tsx`<br>`src/components/agents/wizard/quickSteps/PromptSectionUsage.tsx`<br>`src/components/agents/wizard/quickSteps/StepQuickPrompt.tsx`<br>`src/lib/promptSectionLocator.ts` |
| `status` | `modified` | compara | `src/components/agents/versioning/GuardrailsDiffPanel.tsx` |
| `status` | `monitoring` | compara | `src/components/agents/AgentCard.tsx`<br>`src/components/agents/AgentCardGrid.tsx`<br>`src/components/billing/CostOptimizationPanel.tsx`<br>`src/components/dashboard/DashboardInsight.tsx`<br>`src/components/shared/NotificationsDrawer.tsx`<br>… +1 |
| `status` | `new` | escreve | `supabase/functions/test-runner/versioning_contract_test.ts` |
| `status` | `no_budget` | escreve | `src/services/billingService.ts` |
| `status` | `noop` | compara, escreve | `src/components/super-cerebro/DocumentChunkingDialog.tsx`<br>`supabase/functions/doc-rechunk/index.ts` |
| `status` | `number` | compara | `src/services/skillEnrichmentService.ts`<br>`src/services/skillReclassificationService.ts` |
| `status` | `offboarded` | compara | `src/pages/VendorsPage.tsx`<br>`src/services/vendorRiskService.ts`<br>`supabase/migrations/20260418140149_8c99b7b5-9e49-4a90-ac85-77c1f5136dbb.sql`<br>`supabase/migrations/20260905140000_security_hotfix_validation.sql` |
| `status` | `ok` | compara, escreve | `src/components/agents/wizard/quickSteps/PromptHighlightOverlay.tsx`<br>`src/components/agents/wizard/quickSteps/PromptSectionGutter.tsx`<br>`src/components/agents/wizard/quickSteps/PromptSectionUsage.tsx`<br>`src/components/agents/wizard/quickSteps/StepQuickPrompt.tsx`<br>`src/components/integrations/Bitrix24ApiTester.tsx`<br>… +17 |
| `status` | `only-a` | compara, escreve | `src/components/agents/traces/CompareTracesSheet.tsx` |
| `status` | `only-b` | compara | `src/components/agents/traces/CompareTracesSheet.tsx` |
| `status` | `open` | compara, escreve, filtra | `src/pages/KnowledgeManagementPage.tsx`<br>`src/pages/PentestFindingsPage.tsx`<br>`src/pages/PentestPage.tsx`<br>`src/pages/PostmortemEditorPage.tsx`<br>`src/pages/PostmortemsPage.tsx`<br>… +7 |
| `status` | `others` | compara, escreve | `src/components/agents/wizard/quickSteps/PromptSectionUsage.tsx` |
| `status` | `overdue` | compara | `src/services/secretsRotationService.ts`<br>`supabase/migrations/20260418130622_50bc8bdd-4752-4321-b754-607b67617c40.sql` |
| `status` | `paid` | compara | `src/pages/CreatorPayoutsPage.tsx` |
| `status` | `parsing` | escreve | `src/services/documentIngestionService.ts` |
| `status` | `partial` | compara | `src/components/oracle/ResearchHistoryPanel.tsx`<br>`src/components/security/ComplianceFrameworks.tsx`<br>`src/services/batchProcessorService.ts` |
| `status` | `pass` | compara, escreve | `src/components/security/ComplianceFrameworks.tsx`<br>`src/components/security/SecurityPosture.tsx`<br>`src/services/securityService.ts`<br>`src/services/skillsSimulationService.ts`<br>`src/services/types/evaluationsTypes.ts` |
| `status` | `passed` | compara | `src/components/agent-builder/modules/TestingModule.tsx`<br>`src/pages/ComplianceReportsPage.tsx` |
| `status` | `paused` | compara, escreve | `src/components/agent-builder/modules/ExperimentsModule.tsx`<br>`src/pages/AgentExperimentsPage.tsx`<br>`src/services/batchProcessorService.ts`<br>`src/services/cronSchedulerService.ts`<br>`src/services/workflowCheckpointService.ts`<br>… +1 |
| `status` | `pendente` | compara, escreve | `src/components/skills/SkillDescriptionEnrichPanel.tsx`<br>`src/components/skills/SkillReclassificationReviewPanel.tsx`<br>`src/lib/skills/llmClassificationQueue.ts`<br>`src/lib/skills/observability.ts`<br>`src/services/skillReclassificationReviewService.ts` |
| `status` | `pending` | compara, escreve, filtra | `src/components/agent-builder/HandoffPanel.tsx`<br>`src/components/agent-builder/modules/DeployModule.tsx`<br>`src/components/agent-builder/modules/TestingModule.tsx`<br>`src/components/chat/ChatComposer.tsx`<br>`src/components/datahub/DataHubSyncTab.tsx`<br>… +23 |
| … +121 linhas — lista completa em `context.json` | | | |

### E.4 Enums e listas de valores

| Nome | Valores | Onde |
|---|---|---|
| bcp_category | `core`, `supporting`, `analytical`, `external` | banco |
| bcp_criticality | `tier_1`, `tier_2`, `tier_3`, `tier_4` | banco |
| bcp_system_status | `operational`, `degraded`, `down`, `retired` | banco |
| bcp_test_type | `tabletop`, `walkthrough`, `simulation`, `full_failover` | banco |
| change_type | `standard`, `normal`, `emergency` | banco |
| change_risk_level | `low`, `medium`, `high`, `critical` | banco |
| change_status | `draft`, `pending_approval`, `approved`, `rejected`, `scheduled`, `in_progress`, `completed`, `rolled_back`, `failed` | banco |
| change_decision | `approve`, `reject`, `request_changes` | banco |
| ir_incident_type | `data_breach`, `ddos`, `ransomware`, `account_takeover`, `insider_threat`, `service_outage`, `supply_chain`, `other` | banco |
| ir_severity | `low`, `medium`, `high`, `critical` | banco |
| ir_playbook_status | `draft`, `active`, `archived` | banco |
| ir_phase | `detect`, `contain`, `eradicate`, `recover`, `postmortem` | banco |
| ir_tabletop_outcome | `pass`, `partial`, `fail`, `scheduled` | banco |
| asset_type | `hardware`, `software`, `cloud_resource`, `saas_account`, `network_device`, `mobile_device`, `iot`, `other` | banco |
| asset_environment | `production`, `staging`, `development`, `testing` | banco |
| asset_classification | `public`, `internal`, `confidential`, `restricted` | banco |
| asset_status | `active`, `maintenance`, `decommissioned`, `lost` | banco |
| agent_status | `draft`, `configured`, `testing`, `staging`, `review`, `production`, `monitoring`, `deprecated`, `archived` | banco |
| trace_level | `debug`, `info`, `warning`, `error`, `critical` | banco |
| ViolationKind | p95 \| p99 \| error | `src/components/agents/detail/SLOViolationTimeline.tsx` |
| ViolationRule | p95 \| p99 \| error | `src/components/agents/detail/agentMetricsHelpers.ts` |
| CauseTone | positive \| negative \| neutral | `src/components/agents/detail/kpiInsights.ts` |
| RiskLevel | critical \| high \| medium \| low | `src/components/agents/detail/restoreDiffHelpers.ts` |
| IssueSeverity | error \| warning | `src/components/agents/detail/restoreValidation.ts` |
| RangeMode | off \| version \| time | `src/components/agents/versioning/TimelineRangeFilter.tsx` |
| TimelineTag | prompt \| tools \| model \| guardrails \| rag \| rollback \| failure | `src/components/agents/versioning/timelineFilters.ts` |
| RestoreMode | full \| partial | `src/components/agents/wizard/DraftRecoveryBanner.tsx` |
| TEMPLATE_STEPS | { key: "select", label: "Escolher Template", icon: LayoutTemplate, description: "Selecione um modelo" }, { key: "customize", label: "Personalizar", icon: PenTool, description: "Ajuste nome e prompt" }, { key: "review", label: "Revisar & Criar", icon: Rocket, description: "Confirme e crie" }, | `src/components/agents/wizard/wizardConstants.ts` |
| PromptLockEventKind | locked-manual-edit \| locked-paste \| unlocked-template \| unlocked-variant \| unlocked-type-change \| unlocked-draft-restore \| unlocked-safe-reset \| unlocked-manual \| unlocked-restore-template \| unlocked-checklist | `src/components/agents/wizard/quickSteps/PromptLockEventLog.tsx` |
| DateRange | 24h \| 7d \| 14d \| 30d \| 90d | `src/components/dashboard/DateRangePicker.tsx` |
| MemoryTier | core \| active \| warm \| cold \| archive | `src/components/memory/MemoryTierBadge.tsx` |
| ChunkStrategy | fixed \| paragraph \| sentence | `src/components/super-cerebro/DocumentChunkingDialog.tsx` |
| Resolution | local \| incoming \| merge | `src/components/super-cerebro/notebook/ConflictResolver.tsx` |
| AutocompleteMode | wikilink \| tag | `src/components/super-cerebro/notebook/EditorAutocomplete.tsx` |
| SandboxRuntime | docker \| wasm \| local \| none | `src/components/workflows/sandbox/sandboxTypes.ts` |
| KNOWLEDGE_DOMAINS | 'comercial', 'compras', 'logistica', 'rh', 'produtos', 'financeiro' | `src/config/auto-facts.ts` |
| HF_LLM_MODELS | { id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', label: 'Llama 4 Scout 17B', params: '17B MoE', }, { id: 'Qwen/Qwen3-30B-A3B', label: 'Qwen3 30B', params: '30B MoE' }, { id: 'mistralai/Mistral-Small-24B-Instruct-2501', label: 'Mistral Small 24B', params: '24B' }, { id: 'google/gemma-3-12b-it', lab … | `src/config/huggingface.ts` |
| AUTO_CLASSIFY_CATEGORIES | 'comercial', 'suporte', 'produto', 'financeiro', 'logística', 'rh', 'técnico', 'criativo', | `src/config/huggingface.ts` |
| WORKFLOW_TOOL_TYPES | 'hf_inference', 'webhook', 'edge_function', 'translation', 'qa_extractive', 'image_generation', | `src/config/huggingface.ts` |
| HF_EDGE_FUNCTIONS | 'llm-gateway', 'rag-ingest', 'rag-rerank', 'cerebro-brain', 'eval-judge', 'datahub-query', 'workflow-engine-v2', 'hf-autotrain', 'audio-transcribe', 'doc-ocr', 'image-analysis', 'text-to-speech', | `src/config/huggingface.ts` |
| SKILL_DEPARTMENTS | 'financeiro', 'comercial', 'rh', 'ti', 'marketing', 'juridico', 'logistica', 'pos_venda', 'dados', 'executivo', 'transversal', | `src/config/skill-departments.ts` |
| ALLOWED_LICENSES | 'MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0', 'Unlicense', '0BSD', | `src/config/skill-departments.ts` |
| BLOCKED_LICENSES | 'GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'SSPL-1.0', 'BUSL-1.1', | `src/config/skill-departments.ts` |
| TEMPLATE_CATEGORIES | { value: 'all', label: 'Todos', color: '#9ca3af' }, { value: 'sales', label: 'Vendas', color: '#4D96FF' }, { value: 'support', label: 'Atendimento', color: '#6BCB77' }, { value: 'ops', label: 'Operações', color: '#E67E22' }, { value: 'data', label: 'Dados', color: '#9B59B6' }, { value: 'compliance', … | `src/config/workflow-templates.ts` |
| SkillCategory | tools \| knowledge \| prompts \| workflows \| integrations | `src/data/curatedSkills.ts` |
| GuardrailPresetCategory | pii \| safety \| injection \| compliance \| quality \| cost | `src/data/guardrailPresets.ts` |
| QuickAgentType | chatbot \| copilot \| analyst \| sdr \| support \| researcher \| orchestrator | `src/data/quickAgentTemplates.ts` |
| PromptVariantId | balanced \| concise \| detailed | `src/data/quickAgentTemplates.ts` |
| ExperimentStatus | draft \| running \| paused \| completed | `src/hooks/useAgentExperiments.ts` |
| ExperimentVariant | a \| b | `src/hooks/useAgentExperiments.ts` |
| TriggerType | interaction_created \| interaction_length \| manual \| scheduled \| webhook | `src/hooks/useAutomationRules.ts` |
| ActionType | disc_analysis \| eq_analysis \| bias_analysis \| full_pipeline \| notify \| webhook | `src/hooks/useAutomationRules.ts` |
| LogStatus | success \| failed \| running \| skipped | `src/hooks/useAutomationRules.ts` |
| SyncStatus | idle \| loading \| synced \| local \| saving | `src/hooks/useFilterPersistence.ts` |
| OpenclawTemplateCategory | vendas \| atendimento \| produtividade \| observabilidade \| conteudo \| pessoal | `src/hooks/useOpenclawTemplates.ts` |
| SlackSeverity | info \| warning \| error \| critical | `src/hooks/useSlackConfig.ts` |
| SlackCategory | security_alert \| partition_automation_failure \| circuit_breaker \| high_cost \| agent_failure \| system_error \| custom | `src/hooks/useSlackConfig.ts` |
| AGUIEventType | RUN_STARTED \| RUN_FINISHED \| RUN_ERROR \| TEXT_MESSAGE_START \| TEXT_MESSAGE_CONTENT \| TEXT_MESSAGE_END \| TOOL_CALL_START \| TOOL_CALL_ARGS \| TOOL_CALL_END \| STATE_DELTA \| STATE_SNAPSHOT \| MESSAGES_SNAPSHOT \| RAW | `src/hooks/useStreamingResponse.ts` |
| EXTENDED_TABLES | 'agent_memories', 'model_pricing', 'workflow_runs', 'workflow_step_runs', 'deploy_connections', 'alert_rules', 'prompt_ab_tests', 'environments', 'vector_indexes', 'tool_policies', | `src/integrations/supabase/types.extended.ts` |
| ChangelogKind | added \| removed \| modified \| prompt_changed | `src/lib/agentChangelog.ts` |
| AlertMetric | latency_ms \| cost_per_exec \| cost_window \| tool_failure_rate \| tool_failures_count \| memory_mb \| error_rate | `src/lib/alertMetrics.ts` |
| AlertAggregation | avg \| p95 \| p99 \| max \| sum \| count \| rate | `src/lib/alertMetrics.ts` |
| CitationIssueCode | too_many \| duplicate_n \| missing_reference \| unused_citation \| non_sequential \| duplicate_chunk \| missing_field | `src/lib/citationValidation.ts` |
| MaturityLevel | prototype \| tested \| production-ready | `src/lib/maturityScore.ts` |
| MetricRuleMetric | total_cost_usd \| p95_latency_ms \| total_tokens \| error_rate | `src/lib/metricsAlertRules.ts` |
| MetricRuleOperator | > \| >= \| < \| <= | `src/lib/metricsAlertRules.ts` |
| MetricRuleSeverity | info \| warning \| critical | `src/lib/metricsAlertRules.ts` |
| FixerId | invisible \| empty \| longLines \| truncate | `src/lib/promptAutoFixers.ts` |
| SectionStatus | ok \| thin \| missing | `src/lib/promptSectionLocator.ts` |
| ResearchDepth | quick \| standard \| deep | `src/lib/researchConfig.ts` |
| SearchStrategy | broad \| balanced \| focused | `src/lib/researchConfig.ts` |
| SynthesisModel | claude-sonnet-4-6 \| claude-opus-4-8 \| gpt-5-large \| gemini-2-5-pro | `src/lib/researchConfig.ts` |
| Language | pt \| en \| es | `src/lib/researchConfig.ts` |
| Comparator | = \| != \| > \| >= \| < \| <= | `src/lib/searchDsl.ts` |
| WikilinkTargetType | note \| document \| entity \| tag | `src/lib/wikilink.ts` |
| MemoryTier | core \| active \| warm \| cold \| archive | `src/lib/memory/tiers.ts` |
| LicenseFilter | all \| native \| permissive \| copyleft \| unlicensed | `src/lib/skills/attribution.ts` |
| KNOWN_LICENSES | 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-3.0', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'Unlicense', | `src/lib/skills/attribution.ts` |
| CALIBRATION_CSV_HEADERS | 'data', 'regua', 'de', 'para', 'direcao', 'amostra', 'acuracia', 'sob_alerta', 'justificativa', | `src/lib/skills/calibrationCsv.ts` |
| CalibrationPostureStatus | sem-dados \| saudavel \| atencao \| critico | `src/lib/skills/calibrationGovernance.ts` |
| ConfidenceScale | dominio \| plataforma | `src/lib/skills/classificationEfficacy.ts` |
| ProposalOrigin | lexico \| ia | `src/lib/skills/classificationEfficacy.ts` |
| EfficacyVerdict | corrigido \| preenchido \| confirmado \| descartado | `src/lib/skills/classificationEfficacy.ts` |
| RECLASSIFICATION_AUDIT_ACTIONS | 'skill_reclassification.approved', 'skill_reclassification.rejected', | `src/lib/skills/classificationEfficacy.ts` |
| DECISION_SOURCES | 'unknown', 'heuristic', 'platform_heuristic', 'llm', 'human', 'import', | `src/lib/skills/classificationEfficacy.ts` |
| CONFIDENCE_SCALES | 'dominio', 'plataforma' | `src/lib/skills/classificationEfficacy.ts` |
| EFFICACY_VERDICTS | 'corrigido', 'preenchido', 'confirmado', 'descartado' | `src/lib/skills/classificationEfficacy.ts` |
| ProposalSource | lexico \| ia | `src/lib/skills/departmentReclassification.ts` |
| DescriptionSource | humano \| repositorio \| ia | `src/lib/skills/descriptionEnrichment.ts` |
| IneligibleReason | nao_importada \| ja_descrita \| descricao_humana | `src/lib/skills/descriptionEnrichment.ts` |
| RejectionReason | vazia \| curta \| longa \| eco \| confianca_baixa \| insuficiente | `src/lib/skills/descriptionEnrichment.ts` |
| InstallCapSeverity | dentro_do_teto \| proximo_do_teto \| estourou_o_teto | `src/lib/skills/installCapAudit.ts` |
| InstallGuardVerdict | ok \| atencao \| bloqueio_recomendado | `src/lib/skills/installGuard.ts` |
| QueueItemStatus | pendente \| executando \| aguardando_retry \| concluido \| falhou \| cancelado | `src/lib/skills/llmClassificationQueue.ts` |
| ObservabilityAlertLevel | critico \| atencao | `src/lib/skills/observability.ts` |
| SkillChangeKind | adicionada \| removida \| entrou_no_prompt \| saiu_do_prompt \| alterada \| inalterada | `src/lib/skills/promptDiff.ts` |
| OverflowSeverity | ok \| atencao \| critico | `src/lib/skills/promptOverflowAlert.ts` |
| SanitizationKind | html \| controle \| quebra_linha \| truncado | `src/lib/skills/promptSimulation.ts` |
| SkillDisposition | injetada \| overflow \| duplicada \| descartada | `src/lib/skills/promptSimulation.ts` |
| FailureCategory | creditos \| taxa \| permissao \| rede \| servidor \| invalido \| contrato \| cancelado \| desconhecido | `src/lib/skills/queueFailureSummary.ts` |
| DemandTier | zero \| baixa \| media \| alta | `src/lib/skills/skillDemand.ts` |
| DepartmentFilter | all \| none | `src/lib/skills/skillDemand.ts` |
| DEPARTMENT_SOURCES | 'unknown', 'heuristic', 'lexical', 'platform_heuristic', 'llm', 'human', 'import', | `src/lib/skills/skillDemand.ts` |
| CalibrationScale | dominio \| plataforma | `src/lib/skills/thresholdCalibration.ts` |
| CalibrationTimelineFilter | all \| overridden | `src/lib/skills/thresholdCalibration.ts` |
| SLOStatus | healthy \| warning \| breached | `src/lib/slo/sloTargets.ts` |
| SpanKind | llm \| tool \| rag \| guardrail \| memory \| agent \| workflow \| http \| db \| custom | `src/lib/tracing/tracingTypes.ts` |
| SpanStatus | unset \| ok \| error | `src/lib/tracing/tracingTypes.ts` |
| VersionIssueLevel | error \| warning | `src/lib/validations/agentVersionValidator.ts` |
| RAIL_IDS | 'prompt_injection', 'pii_detection', 'toxicity', 'secret_leakage' | `src/lib/validations/guardrailPolicy.ts` |
| RAIL_LAYERS | 'input', 'output' | `src/lib/validations/guardrailPolicy.ts` |
| RAIL_ACTIONS | 'block', 'warn', 'log_only' | `src/lib/validations/guardrailPolicy.ts` |
| ContradictionKind | polarity \| numeric \| language | `src/lib/validations/promptContradictions.ts` |
| PromptDiagnosticId | control_chars \| zero_width \| dangerous_html \| js_uri \| long_line \| empty_block \| exceeds_chars \| exceeds_lines \| rule_contradiction | `src/lib/validations/promptSanitizer.ts` |
| PromptFixerId | invisible \| longLines \| truncate \| empty | `src/lib/validations/promptSanitizer.ts` |
| SKILL_CATEGORY_VALUES | 'tools', 'knowledge', 'prompts', 'workflows', 'integrations', | `src/lib/validations/skillImport.ts` |
| HARVEST_STATUS_VALUES | 'pending', 'accepted', 'rejected', 'promoted', 'auto_rejected', | `src/lib/validations/skillImport.ts` |
| ALLOWED_ADMIN_TABLES | 'agents', 'agent_traces', 'knowledge_bases', 'prompt_versions', 'evaluation_runs', 'oracle_history', | `src/services/adminCrudService.ts` |
| RoutingSource | bitrix24 \| whatsapp \| gmail \| slack | `src/services/agentRoutingService.ts` |
| SimulatedErrorType | timeout \| rate_limit \| tool_failure \| hallucination \| context_overflow \| unsafe_output \| parsing_error | `src/services/agentTestSimulationService.ts` |
| TraceLevel | info \| warning \| error | `src/services/agentTracesService.ts` |
| AlertOperator | > \| < \| >= \| <= \| == | `src/services/alertRulesService.ts` |
| AlertSeverity | info \| warning \| critical | `src/services/alertRulesService.ts` |
| AlertChannel | toast \| email \| webhook | `src/services/alertRulesService.ts` |
| TranscribeAction | transcribe \| translate | `src/services/audioService.ts` |
| TranscribeFormat | text \| srt \| vtt \| json | `src/services/audioService.ts` |
| TTSLanguage | pt \| en \| es | `src/services/audioService.ts` |
| AuditAction | delete \| bulk_delete \| update \| create \| revoke \| rotate \| export \| import \| deploy \| undeploy \| promote \| role_change \| permission_grant \| permission_revoke \| credential_access \| data_erasure \| settings_change | `src/services/auditLogService.ts` |
| AuditStatus | success \| failed \| denied | `src/services/auditLogService.ts` |
| TemplateCategory | vendas \| compras \| logistica \| financeiro \| arte \| atendimento \| rh \| marketing \| integracao \| monitoramento | `src/services/automationTemplateService.ts` |
| TemplateDifficulty | beginner \| intermediate \| advanced | `src/services/automationTemplateService.ts` |
| Operator | eq \| ne \| contains \| in \| gt \| lt \| gte \| lte \| exists \| not_exists | `src/services/basesService.ts` |
| SortDir | asc \| desc | `src/services/basesService.ts` |
| BUILTIN_COLUMNS | "title", "updated_at", "created_at", "tags", "wikilinks_out", | `src/services/basesService.ts` |
| BcpCategory | core \| supporting \| analytical \| external | `src/services/bcpService.ts` |
| BcpCriticality | tier_1 \| tier_2 \| tier_3 \| tier_4 | `src/services/bcpService.ts` |
| BcpSystemStatus | operational \| degraded \| down \| retired | `src/services/bcpService.ts` |
| BcpTestType | tabletop \| walkthrough \| simulation \| full_failover | `src/services/bcpService.ts` |
| ChangeType | standard \| normal \| emergency | `src/services/changeManagementService.ts` |
| ChangeRiskLevel | low \| medium \| high \| critical | `src/services/changeManagementService.ts` |
| ChangeStatus | draft \| pending_approval \| approved \| rejected \| scheduled \| in_progress \| completed \| rolled_back \| failed | `src/services/changeManagementService.ts` |
| ChangeDecision | approve \| reject \| request_changes | `src/services/changeManagementService.ts` |
| ChaosTarget | llm-gateway \| agent-workflow-runner | `src/services/chaosService.ts` |
| ChaosFaultType | latency \| error_500 \| error_429 \| timeout | `src/services/chaosService.ts` |
| CodeRuntime | python \| node \| deno | `src/services/codeInterpreterService.ts` |
| CadenceChannel | email \| whatsapp \| slack \| task | `src/services/crmCadenceService.ts` |
| EnrollmentStatus | active \| completed \| stopped \| failed | `src/services/crmCadenceService.ts` |
| LeadTier | hot \| qualified \| nurture \| cold | `src/services/crmScoringService.ts` |
| DealStatus | open \| won \| lost | `src/services/crmService.ts` |
| CompanySizeBand | micro \| small \| medium \| large \| enterprise | `src/services/crmService.ts` |
| ActivityType | note \| email \| call \| message \| stage_change \| task \| system | `src/services/crmService.ts` |
| DeployChannel | widget \| api \| whatsapp \| slack \| bitrix24 \| telegram | `src/services/deploymentsService.ts` |
| IngestionStatus | pending \| uploading \| parsing \| ocr \| chunking \| embedding \| ready \| error \| cancelled | `src/services/documentIngestionService.ts` |
| ExtractionMethod | text \| ocr \| hybrid \| docx | `src/services/documentIngestionService.ts` |
| AutoSyncPhase | disabled \| idle \| running \| success \| error \| conflicts | `src/services/e2eeAutoSync.ts` |
| ExpectedOutcome | insert \| update \| keep \| conflict | `src/services/e2eeSimulationService.ts` |
| DatasetSource | traces \| test_cases \| custom | `src/services/fineTuningService.ts` |
| TaskType | text-generation \| text-classification \| embedding | `src/services/fineTuningService.ts` |
| GameDayScenario | provider_outage \| cost_spike \| db_slowdown \| auth_failure \| custom | `src/services/gameDayService.ts` |
| GameDayStatus | scheduled \| running \| completed \| aborted | `src/services/gameDayService.ts` |
| GameDayEventType | fault_injected \| detection \| mitigation \| resolution \| note | `src/services/gameDayService.ts` |
| HealthStatus | healthy \| degraded \| down \| unknown | `src/services/healthService.ts` |
| TriggerType | slo_breach \| synthetic_fail \| cost_anomaly \| budget_block \| manual | `src/services/incidentService.ts` |
| ActionType | notify \| disable_chaos \| pause_agent \| switch_provider \| page_oncall | `src/services/incidentService.ts` |
| IRIncidentType | data_breach \| ddos \| ransomware \| account_takeover \| insider_threat \| service_outage \| supply_chain \| other | `src/services/irPlaybookService.ts` |
| IRSeverity | low \| medium \| high \| critical | `src/services/irPlaybookService.ts` |
| IRPlaybookStatus | draft \| active \| archived | `src/services/irPlaybookService.ts` |
| IRPhase | detect \| contain \| eradicate \| recover \| postmortem | `src/services/irPlaybookService.ts` |
| IRTabletopOutcome | pass \| partial \| fail \| scheduled | `src/services/irPlaybookService.ts` |
| DEFAULT_COLUMNS | "backlog", "doing", "review", "done" | `src/services/kanbanService.ts` |
| DecayLevel | fresh \| review \| refresh \| archive | `src/services/knowledgeDecayService.ts` |
| MemoryType | episodic \| semantic \| procedural \| short_term \| user_profile \| team \| external | `src/services/memoryService.ts` |
| MemoryScope | session \| user \| agent \| org | `src/services/memoryService.ts` |
| MemoryManagerAction | add \| search \| list \| forget \| forget_all \| promote_to_fact | `src/services/memoryService.ts` |
| OpenclawAction | health \| chat \| agents \| agent.create \| agent.update \| agent.delete \| agent.publish \| skills \| skill.deploy \| whatsapp.pair \| whatsapp.status \| whatsapp.send | `src/services/openclawDeployService.ts` |
| EngagementType | black_box \| grey_box \| white_box \| red_team | `src/services/pentestService.ts` |
| EngagementStatus | scoping \| in_progress \| reporting \| completed \| cancelled | `src/services/pentestService.ts` |
| FindingSeverity | critical \| high \| medium \| low \| info | `src/services/pentestService.ts` |
| FindingCategory | auth \| injection \| xss \| csrf \| crypto \| config \| logic \| info_disclosure \| other | `src/services/pentestService.ts` |
| FindingStatus | open \| in_remediation \| fixed \| accepted_risk \| false_positive | `src/services/pentestService.ts` |
| PostmortemSeverity | SEV1 \| SEV2 \| SEV3 \| SEV4 | `src/services/postmortemService.ts` |
| PostmortemStatus | draft \| review \| published | `src/services/postmortemService.ts` |
| PostmortemSource | incident_run \| game_day \| dr_drill \| manual | `src/services/postmortemService.ts` |
| ActionPriority | P0 \| P1 \| P2 | `src/services/postmortemService.ts` |
| ActionStatus | open \| in_progress \| done \| cancelled | `src/services/postmortemService.ts` |
| ExperimentStatus | draft \| running \| paused \| completed | `src/services/promptExperimentService.ts` |
| ExperimentVariant | a \| b | `src/services/promptExperimentService.ts` |
| SuccessMetric | quality \| latency \| cost \| success_rate | `src/services/promptExperimentService.ts` |
| PermissionKey | agents.create \| agents.read \| agents.update \| agents.delete \| agents.deploy \| agents.test \| workflows.create \| workflows.read \| workflows.update \| workflows.delete \| workflows.execute \| knowledge.read \| knowledge.write \| knowledge.delete \| knowledge.manage \| oracle.query \| oracle.configure \| oracle.history \| oracle.write \| datahub.read \| datahub.write \| datahub.connections \| team.read \| team.invite \| team.remove \| team.roles \| settings.read \| settings.write \| settings.api_keys \| settings.billing \| monitoring.read \| monitoring.traces \| monitoring.audit \| tools.read \| tools.write \| integrations.read \| integrations.write | `src/services/rbacService.ts` |
| RoleKey | workspace_admin \| agent_editor \| agent_viewer \| operator \| auditor | `src/services/rbacService.ts` |
| RiskCategory | strategic \| operational \| technical \| security \| compliance \| financial \| reputational | `src/services/riskService.ts` |
| RiskTreatment | accept \| mitigate \| transfer \| avoid | `src/services/riskService.ts` |
| RiskStatus | identified \| assessed \| treated \| monitored \| closed | `src/services/riskService.ts` |
| SecretCategory | api_key \| oauth_client \| db_password \| jwt_signing \| webhook_secret \| encryption_key \| ssh_key \| certificate | `src/services/secretsRotationService.ts` |
| SecretEnvironment | prod \| staging \| dev | `src/services/secretsRotationService.ts` |
| SecretStatus | active \| pending_rotation \| overdue \| retired | `src/services/secretsRotationService.ts` |
| RotationReason | scheduled \| compromised \| employee_offboarding \| manual \| policy_change | `src/services/secretsRotationService.ts` |
| ClassificationTier | domain \| transversal \| platform \| none | `src/services/skillDepartmentClassifier.ts` |
| ApplyFailureKind | permission \| confidence \| conflict \| network \| unknown | `src/services/skillEnrichmentService.ts` |
| CandidateStatus | pending \| approved \| rejected \| auto_rejected \| promoted | `src/services/skillHarvestService.ts` |
| DepartmentSource | heuristic \| platform \| llm \| human | `src/services/skillLibraryService.ts` |
| ReviewStatus | pendente \| aprovado \| rejeitado | `src/services/skillReclassificationReviewService.ts` |
| ReviewErrorKind | permission \| conflict \| duplicate \| already_decided \| not_found \| network \| unknown | `src/services/skillReclassificationReviewService.ts` |
| ReclassifyFailureKind | permission \| conflict \| network \| unknown | `src/services/skillReclassificationService.ts` |
| SkillbookPeriod | 7d \| 30d \| 90d \| all | `src/services/skillbookAuditService.ts` |
| SKILL_CATEGORIES | { id: 'tools', name: 'Ferramentas', icon: '🔧', description: 'APIs, webhooks, integrações' }, { id: 'knowledge', name: 'Conhecimento', icon: '📚', description: 'RAG, bases de conhecimento' }, { id: 'prompts', name: 'Prompts', icon: '💬', description: 'Templates e chains de prompt' }, { id: 'workflows', … | `src/services/skillsRegistryService.ts` |
| SimSuite | recommender \| composer \| skillbook \| registry | `src/services/skillsSimulationService.ts` |
| SimStatus | pass \| gap | `src/services/skillsSimulationService.ts` |
| SyntheticTarget | llm-gateway \| agent-workflow-runner \| health | `src/services/syntheticService.ts` |
| RestoreFailureKind | permission \| network \| unknown | `src/services/templateSkillLinkService.ts` |
| CurationFeedKind | linked \| unlinked | `src/services/templateSkillLinkService.ts` |
| CurationFeedFilter | all \| linked \| unlinked | `src/services/templateSkillLinkService.ts` |
| CurationActorScope | everyone \| me | `src/services/templateSkillLinkService.ts` |
| CURATION_CSV_HEADER | 'dia', 'hora', 'evento', 'template_id', 'template', 'skill_id', 'skill', 'motivo', 'autor', | `src/services/templateSkillLinkService.ts` |
| TemporalWindow | 1h \| 24h \| 7d \| 30d \| 90d \| all | `src/services/temporalKnowledgeService.ts` |
| FilterScope | agent_traces \| skills_marketplace \| skill_demand | `src/services/userFilterPreferencesService.ts` |
| VendorType | saas \| processor \| api \| infra \| consulting \| other | `src/services/vendorRiskService.ts` |
| Criticality | critical \| high \| medium \| low | `src/services/vendorRiskService.ts` |
| DataClassification | pii \| phi \| financial \| confidential \| public | `src/services/vendorRiskService.ts` |
| VendorStatus | active \| under_review \| suspended \| offboarded | `src/services/vendorRiskService.ts` |
| DocType | dpa \| soc2 \| iso27001 \| pentest_report \| questionnaire \| contract \| other | `src/services/vendorRiskService.ts` |
| VisionAction | analyze \| classify \| nsfw_check \| mockup \| compare | `src/services/visionService.ts` |
| WhatsAppProvider | twilio \| meta \| zapi \| evolution | `src/services/whatsappOutboundService.ts` |
| WHATSAPP_PROVIDERS | { id: 'twilio', label: 'Twilio', tokenEnv: 'WHATSAPP_TWILIO_AUTH_TOKEN' }, { id: 'meta', label: 'Meta Cloud API', tokenEnv: 'WHATSAPP_META_APP_SECRET' }, { id: 'zapi', label: 'Z-API', tokenEnv: 'WHATSAPP_ZAPI_TOKEN' }, { id: 'evolution', label: 'Evolution API', tokenEnv: 'WHATSAPP_EVOLUTION_TOKEN' } … | `src/services/whatsappWebhookService.ts` |
| HandoffReason | skill_mismatch \| escalation \| delegation \| triage \| human_required \| load_balancing \| specialization \| fallback \| custom | `src/services/types/agentHandoffTypes.ts` |
| HandoffStatus | pending \| accepted \| rejected \| completed \| failed \| cancelled | `src/services/types/agentHandoffTypes.ts` |
| BatchStatus | pending \| running \| paused \| completed \| failed \| cancelled \| partial | `src/services/types/batchProcessorTypes.ts` |
| BatchErrorPolicy | stop_on_first \| continue_all \| threshold | `src/services/types/batchProcessorTypes.ts` |
| ConnectorCategory | crm \| communication \| payment \| storage \| database \| ai_ml \| productivity \| marketing \| logistics \| analytics \| social \| custom | `src/services/types/connectorRegistryTypes.ts` |
| ConnectorStatus | available \| connected \| error \| deprecated \| beta | `src/services/types/connectorRegistryTypes.ts` |
| ConnectorAuthType | none \| api_key \| oauth2 \| basic \| bearer \| custom | `src/services/types/connectorRegistryTypes.ts` |
| CredentialType | api_key \| oauth2 \| basic_auth \| bearer_token \| ssh_key \| database \| smtp \| webhook_secret \| custom | `src/services/types/credentialVaultTypes.ts` |
| CredentialStatus | active \| expired \| revoked \| rotating | `src/services/types/credentialVaultTypes.ts` |
| ScheduleFrequency | once \| interval \| cron \| daily \| weekly \| monthly | `src/services/types/cronSchedulerTypes.ts` |
| ScheduleStatus | active \| paused \| completed \| failed \| expired | `src/services/types/cronSchedulerTypes.ts` |
| ExecutionType | workflow \| agent \| automation \| webhook \| schedule \| manual | `src/services/types/executionHistoryTypes.ts` |
| ExecutionStatus | running \| success \| failed \| cancelled \| timeout \| waiting | `src/services/types/executionHistoryTypes.ts` |
| DocOcrAction | ocr \| describe \| extract_table \| extract_fields | `src/services/types/knowledgeTypes.ts` |
| NotificationChannel | email \| whatsapp \| slack \| push \| sms \| in_app \| webhook | `src/services/types/notificationTypes.ts` |
| NotificationPriority | low \| normal \| high \| urgent | `src/services/types/notificationTypes.ts` |
| NotificationStatus | pending \| sent \| delivered \| read \| failed \| cancelled | `src/services/types/notificationTypes.ts` |
| SkillCategory | core \| data \| communication \| analysis \| automation \| integration \| creative \| security \| custom | `src/services/types/progressiveSkillTypes.ts` |
| QueueStrategy | fifo \| lifo \| priority | `src/services/types/queueManagerTypes.ts` |
| QueueItemStatus | pending \| processing \| completed \| failed \| dead_letter | `src/services/types/queueManagerTypes.ts` |
| BackoffStrategy | fixed \| linear \| exponential \| exponential_jitter | `src/services/types/retryEngineTypes.ts` |
| CircuitState | closed \| open \| half_open | `src/services/types/retryEngineTypes.ts` |
| DeadLetterAction | log \| notify \| store \| retry_manual | `src/services/types/retryEngineTypes.ts` |
| WebhookMethod | GET \| POST \| PUT \| PATCH \| DELETE | `src/services/types/webhookTriggerTypes.ts` |
| WebhookStatus | active \| inactive \| rate_limited \| revoked | `src/services/types/webhookTriggerTypes.ts` |
| WebhookAuthType | none \| header \| hmac_sha256 \| basic \| bearer \| api_key | `src/services/types/webhookTriggerTypes.ts` |
| OracleMode | council \| researcher \| validator \| executor \| advisor | `src/stores/types/oracleTypes.ts` |
| AgentLifecycleStage | draft \| configured \| testing \| staging \| review \| production \| monitoring \| deprecated \| archived | `src/types/agentTypes.ts` |
| AgentPersona | assistant \| specialist \| coordinator \| analyst \| creative \| autonomous | `src/types/agentTypes.ts` |
| LLMModel | claude-opus-4.6 \| claude-sonnet-4.6 \| claude-haiku-4.5 \| gpt-4o \| gemini-2.5-pro \| llama-4 \| huggingface/meta-llama/Llama-4-Scout-17B-16E-Instruct \| huggingface/Qwen/Qwen3-30B-A3B \| huggingface/mistralai/Mistral-Small-24B-Instruct-2501 \| custom | `src/types/agentTypes.ts` |
| ReasoningPattern | react \| cot \| tot \| reflection \| plan_execute \| smolagent | `src/types/agentTypes.ts` |
| ConsolidationStrategy | hot_path \| background \| hybrid | `src/types/agentTypes.ts` |
| RAGArchitecture | naive \| advanced \| modular \| agentic \| graph_rag | `src/types/agentTypes.ts` |
| VectorDB | chroma \| qdrant \| pinecone \| pgvector \| weaviate \| lancedb | `src/types/agentTypes.ts` |
| OrchestrationPattern | single \| sequential \| hierarchical \| swarm | `src/types/agentTypes.ts` |
| DeployEnvironment | cloud_api \| self_hosted \| hybrid | `src/types/agentTypes.ts` |
| OutputFormat | text \| json \| markdown \| structured | `src/types/agentTypes.ts` |
| DeployChannel | api \| whatsapp \| web_chat \| slack \| email \| bitrix24 \| telegram \| discord \| huggingface_space | `src/types/agentTypes.ts` |
| ChatRole | user \| assistant \| system | `supabase/functions/_shared/alternation.ts` |
| ChunkStrategy | fixed \| paragraph \| sentence | `supabase/functions/_shared/chunker.ts` |
| CrmEntityKind | deal \| contact \| company \| lead | `supabase/functions/_shared/crmNormalize.ts` |
| MemoryTier | core \| active \| warm \| cold \| archive | `supabase/functions/_shared/memory-tiers.ts` |
| SpanKind | server \| client \| llm \| tool \| auth \| guardrail \| db \| http \| custom | `supabase/functions/_shared/otel.ts` |
| SpanStatus | unset \| ok \| error | `supabase/functions/_shared/otel.ts` |
| SKILL_DEPARTMENTS | 'financeiro', 'comercial', 'rh', 'ti', 'marketing', 'juridico', 'logistica', 'pos_venda', 'dados', 'executivo', 'transversal', | `supabase/functions/skill-classify-llm/departments.ts` |
| SKILL_DEPARTMENTS | 'financeiro', 'comercial', 'rh', 'ti', 'marketing', 'juridico', 'logistica', 'pos_venda', 'dados', 'executivo', 'transversal', | `supabase/functions/skill-harvester/departments.ts` |

## F. Validações de entrada

### F.1 Schemas Zod

- **skillsStepSchema** (`src/components/agents/wizard/QuickCreateWizard.tsx`, z.object):
  ```ts
  {}
  ```
- **inputTypeSchema** (`src/lib/skillComposer/skillDraft.ts`, z.enum):
  ```ts
  ['string', 'number', 'boolean', 'enum', 'json']
  ```
- **skillInputSchema** (`src/lib/skillComposer/skillDraft.ts`, z.object):
  ```ts
  { id: z.string().min(1), name: z .string() .trim() .min(1, 'Nome obrigatório') .max(40, 'Máx 40 caracteres') .regex(/^[a-z][a-z0-9_]*$/i, 'Somente letras, dígitos e "_"; comece com letra'), type: inputTypeSchema, required: z.boolean(), description: z.string().trim().max(200, 'Máx 200 caracteres').default(''), defaultValue: z.string().trim().max(200).optional().default(''), validation: z .object({ min: z.number().optional(), max: z.number().optional(), pattern: z.string().trim().max(200).optional().default(''), enumValues: z.array(z.string().trim().min(1).max(40)).max(20).default([]), }) .default({ pattern: '', enumValues: [] }), }
  ```
- **skillOutputSchema** (`src/lib/skillComposer/skillDraft.ts`, z.object):
  ```ts
  { id: z.string().min(1), name: z .string() .trim() .min(1, 'Nome obrigatório') .max(40, 'Máx 40 caracteres') .regex(/^[a-z][a-z0-9_]*$/i, 'Somente letras, dígitos e "_"; comece com letra'), type: inputTypeSchema, description: z.string().trim().max(200).default(''), }
  ```
- **skillPromptSchema** (`src/lib/skillComposer/skillDraft.ts`, z.object):
  ```ts
  { systemMessage: z.string().trim().max(2000).default(''), template: z.string().trim().max(4000).default(''), }
  ```
- **executionKindSchema** (`src/lib/skillComposer/skillDraft.ts`, z.enum):
  ```ts
  ['http', 'llm', 'workflow', 'rag', 'integration']
  ```
- **httpHeaderSchema** (`src/lib/skillComposer/skillDraft.ts`, z.object):
  ```ts
  { key: z.string().trim().min(1).max(80), value: z.string().trim().max(200), }
  ```
- **workflowStepSchema** (`src/lib/skillComposer/skillDraft.ts`, z.object):
  ```ts
  { id: z.string(), name: z.string().trim().min(1).max(60), action: z.enum(['transform', 'http_call', 'llm_call', 'delay', 'notify']), params: z.string().trim().max(500).default(''), }
  ```
- **skillExecutionSchema** (`src/lib/skillComposer/skillDraft.ts`, z.object):
  ```ts
  { kind: executionKindSchema, http: z .object({ url: z.string().trim().max(500).default(''), method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'), headers: z.array(httpHeaderSchema).max(20).default([]), bodyTemplate: z.string().trim().max(2000).default(''), }) .default({ url: '', method: 'POST', headers: [], bodyTemplate: '' }), llm: z .object({ provider: z.enum(['lovable-ai', 'openai', 'anthropic', 'google']).default('lovable-ai'), model: z.string().trim().max(80).default('google/gemini-2.5-flash'), temperature: z.number().min(0).max(2).default(0.7), maxTokens: z.number().int().min(1).max(32000).default(2000), }) .default({ provider: 'lovable-ai', model: 'google/gemini-2.5-flash', temperature: 0.7, maxTokens: 2000, }), workflow: z .object({ steps: z.array(workflowStepS …
  ```
- **skillCategorySchema** (`src/lib/skillComposer/skillDraft.ts`, z.enum):
  ```ts
  [ 'tools', 'knowledge', 'prompts', 'workflows', 'integrations', ]
  ```
- **skillDraftBaseSchema** (`src/lib/skillComposer/skillDraft.ts`, z.object):
  ```ts
  { name: z.string().trim().min(3, 'Mínimo 3 caracteres').max(80, 'Máximo 80 caracteres'), slug: z .string() .trim() .min(3) .max(80) .regex(/^[a-z0-9-]+$/, 'Apenas minúsculas, números e hífen'), description: z.string().trim().min(20, 'Mínimo 20 caracteres').max(500, 'Máximo 500 caracteres'), category: skillCategorySchema, version: z .string() .trim() .regex(/^\d+\.\d+\.\d+$/, 'Formato: X.Y.Z (ex: 1.0.0)'), tags: z.array(z.string().trim().min(1).max(24)).max(8, 'Máximo 8 tags'), inputs: z.array(skillInputSchema).max(20, 'Máximo 20 inputs'), outputs: z.array(skillOutputSchema).max(20, 'Máximo 20 outputs'), prompt: skillPromptSchema, execution: skillExecutionSchema, }
  ```
- **agentLifecycleStageSchema** (`src/lib/validations/agentSchema.ts`, z.enum):
  ```ts
  [ 'draft', 'configured', 'testing', 'staging', 'review', 'production', 'monitoring', 'deprecated', 'archived', ]
  ```
- **agentPersonaSchema** (`src/lib/validations/agentSchema.ts`, z.enum):
  ```ts
  [ 'assistant', 'specialist', 'coordinator', 'analyst', 'creative', 'autonomous', ]
  ```
- **llmModelSchema** (`src/lib/validations/agentSchema.ts`, z.enum):
  ```ts
  [ 'claude-opus-4.6', 'claude-sonnet-4.6', 'claude-haiku-4.5', 'gpt-4o', 'gemini-2.5-pro', 'llama-4', 'custom', ]
  ```
- **reasoningPatternSchema** (`src/lib/validations/agentSchema.ts`, z.enum):
  ```ts
  [ 'react', 'cot', 'tot', 'reflection', 'plan_execute', ]
  ```
- **outputFormatSchema** (`src/lib/validations/agentSchema.ts`, z.enum):
  ```ts
  ['text', 'json', 'markdown', 'structured']
  ```
- **orchestrationPatternSchema** (`src/lib/validations/agentSchema.ts`, z.enum):
  ```ts
  ['single', 'sequential', 'hierarchical', 'swarm']
  ```
- **deployEnvironmentSchema** (`src/lib/validations/agentSchema.ts`, z.enum):
  ```ts
  ['cloud_api', 'self_hosted', 'hybrid']
  ```
- **agentIdentitySchema** (`src/lib/validations/agentSchema.ts`, z.object):
  ```ts
  { name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'), mission: z.string().min(10, 'Missão deve ter pelo menos 10 caracteres').max(2000), persona: agentPersonaSchema, avatar_emoji: z.string().min(1).max(4), scope: z.string().max(2000).default(''), formality: z.number().min(0).max(100), proactivity: z.number().min(0).max(100), creativity: z.number().min(0).max(100), verbosity: z.number().min(0).max(100), }
  ```
- **agentBrainSchema** (`src/lib/validations/agentSchema.ts`, z.object):
  ```ts
  { model: llmModelSchema, model_fallback: llmModelSchema.optional(), reasoning: reasoningPatternSchema, temperature: z.number().min(0).max(2), top_p: z.number().min(0).max(1), max_tokens: z.number().min(100).max(128000), retry_count: z.number().min(0).max(10), }
  ```
- **guardrailConfigSchema** (`src/lib/validations/agentSchema.ts`, z.object):
  ```ts
  { id: z.string().uuid(), category: z.enum(['input_validation', 'output_safety', 'access_control', 'operational']), name: z.string().min(1).max(100), description: z.string().max(500), enabled: z.boolean(), severity: z.enum(['block', 'warn', 'log']), config: z.record(z.unknown()).optional(), }
  ```
- **budgetSchema** (`src/lib/validations/agentSchema.ts`, z.object):
  ```ts
  { monthly_budget: z.number().min(0).max(100000).optional(), budget_alert_threshold: z.number().min(0).max(100), budget_kill_switch: z.boolean(), }
  ```
- **knowledgeBaseSchema** (`src/lib/validations/agentSchema.ts`, z.object):
  ```ts
  { name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100), description: z.string().max(1000).default(''), vector_db: z.string().default('pgvector'), embedding_model: z.string().default('text-embedding-3-large'), }
  ```
- **memorySchema** (`src/lib/validations/agentSchema.ts`, z.object):
  ```ts
  { content: z.string().min(1, 'Conteúdo é obrigatório').max(10000, 'Máximo 10.000 caracteres'), memory_type: z.enum(['short_term', 'episodic', 'semantic', 'user_profile', 'team', 'external']), source: z.string().max(200).optional(), }
  ```
- **workflowSchema** (`src/lib/validations/agentSchema.ts`, z.object):
  ```ts
  { name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100), steps: z.array(z.string().min(1)).min(2, 'Precisa de pelo menos 2 etapas'), }
  ```
- **environmentSchema** (`src/lib/validations/agentSchema.ts`, z.object):
  ```ts
  { name: z.string().min(1, 'Nome é obrigatório').max(50, 'Máximo 50 caracteres').regex(/^[a-zA-Z0-9_-]+$/, 'Use apenas letras, números, _ e -'), }
  ```
- **alertRuleSchema** (`src/lib/validations/agentSchema.ts`, z.object):
  ```ts
  { name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100), metric: z.string().min(1), operator: z.enum(['>', '<', '>=', '<=', '==']), threshold: z.number().min(0), severity: z.enum(['critical', 'warning', 'info']), }
  ```
- **deletionRequestSchema** (`src/lib/validations/agentSchema.ts`, z.object):
  ```ts
  { reason: z.string().min(5, 'Motivo deve ter pelo menos 5 caracteres').max(1000), }
  ```
- **emailSchema** (`src/lib/validations/authSchemas.ts`, z.string):
  ```ts
  
  ```
- **loginPasswordSchema** (`src/lib/validations/authSchemas.ts`, z.string):
  ```ts
  
  ```
- **loginSchema** (`src/lib/validations/authSchemas.ts`, z.object):
  ```ts
  { email: emailSchema, password: loginPasswordSchema, }
  ```
- **signUpSchema** (`src/lib/validations/authSchemas.ts`, z.object):
  ```ts
  { email: emailSchema, password: signUpPasswordSchema, }
  ```
- **resetPasswordRequestSchema** (`src/lib/validations/authSchemas.ts`, z.object):
  ```ts
  { email: emailSchema, }
  ```
- **resetPasswordSchema** (`src/lib/validations/authSchemas.ts`, z.object, encadeia refine):
  ```ts
  { password: signUpPasswordSchema, confirmPassword: z.string().min(1, 'Confirme a nova senha'), }
  ```
  - Regras cruzadas (refine): “As senhas não coincidem”
- **cpfSchema** (`src/lib/validations/brazilianDocuments.ts`, z.string, encadeia refine, transform):
  ```ts
  
  ```
  - Regras cruzadas (refine): “CPF inválido”
- **cnpjSchema** (`src/lib/validations/brazilianDocuments.ts`, z.string, encadeia refine, transform):
  ```ts
  
  ```
  - Regras cruzadas (refine): “CNPJ inválido”
- **phoneBRSchema** (`src/lib/validations/brazilianDocuments.ts`, z.string, encadeia refine, transform):
  ```ts
  
  ```
  - Regras cruzadas (refine): “Telefone inválido (use DDD + número)”
- **cepSchema** (`src/lib/validations/brazilianDocuments.ts`, z.string, encadeia refine, transform):
  ```ts
  
  ```
  - Regras cruzadas (refine): “CEP inválido”
- **inviteMemberSchema** (`src/lib/validations/dialogSchemas.ts`, z.object):
  ```ts
  { email: z.string().trim().min(1, 'Email é obrigatório').email('Email inválido').max(255, 'Email muito longo'), name: z.string().trim().max(100, 'Nome muito longo').optional(), role: z.enum(['admin', 'editor', 'viewer', 'operator'], { required_error: 'Selecione um papel' }), }
  ```
- **createKnowledgeBaseSchema** (`src/lib/validations/dialogSchemas.ts`, z.object):
  ```ts
  { name: z.string().trim().min(1, 'Nome é obrigatório').max(200, 'Nome muito longo'), description: z.string().trim().max(1000, 'Descrição muito longa').optional(), vectorDb: z.enum(['pgvector', 'pinecone']), embeddingModel: z.enum(['text-embedding-3-large', 'text-embedding-3-small']), }
  ```
- **editKnowledgeBaseSchema** (`src/lib/validations/dialogSchemas.ts`, z.object):
  ```ts
  { name: z.string().trim().min(1, 'Nome é obrigatório').max(200, 'Nome muito longo'), description: z.string().trim().max(1000, 'Descrição muito longa').optional(), embeddingModel: z.enum(['text-embedding-3-large', 'text-embedding-3-small']), status: z.enum(['active', 'inactive', 'indexing']), }
  ```
- **createEvaluationSchema** (`src/lib/validations/dialogSchemas.ts`, z.object):
  ```ts
  { name: z.string().trim().min(1, 'Nome é obrigatório').max(200, 'Nome muito longo'), agentId: z.string().uuid('Selecione um agente'), datasetId: z.string().optional(), testCases: z.coerce.number().int().min(1, 'Mínimo 1').max(100, 'Máximo 100'), useJudge: z.boolean(), judgeMode: z.enum(['pointwise', 'faithfulness']), }
  ```
- **createPromptSchema** (`src/lib/validations/dialogSchemas.ts`, z.object):
  ```ts
  { agentId: z.string().uuid('Selecione um agente'), content: z.string().trim().min(1, 'Conteúdo é obrigatório').max(50000, 'Prompt muito longo'), summary: z.string().trim().max(500, 'Descrição muito longa').optional(), }
  ```
- **guardrailRuleSchema** (`src/lib/validations/guardrailPolicy.ts`, z.object):
  ```ts
  { rail: z.enum(RAIL_IDS), layer: z.enum(RAIL_LAYERS), enabled: z.boolean(), threshold: z.number().min(0).max(1), action: z.enum(RAIL_ACTIONS), }
  ```
- **guardrailPolicyConfigSchema** (`src/lib/validations/guardrailPolicy.ts`, z.object):
  ```ts
  { agent_id: z.string().uuid(), rules: z.array(guardrailRuleSchema).min(1), }
  ```
- **quickIdentitySchema** (`src/lib/validations/quickAgentSchema.ts`, z.object):
  ```ts
  { name: z .string() .trim() .min(2, 'Use 2 a 60 caracteres') .max(60, 'Use 2 a 60 caracteres') .regex(/^[\p{L}\p{N}\s\-_.]+$/u, 'Apenas letras, números, espaços, _ e -'), emoji: z .string() .trim() .min(1, 'Escolha um emoji') .max(4, 'Máximo 4 caracteres'), mission: z .string() .trim() .min(10, 'Mínimo 10 caracteres') .max(500, 'Máximo 500 caracteres'), description: z.string().trim().max(300, 'Máximo 300 caracteres').default(''), }
  ```
- **quickTypeSchema** (`src/lib/validations/quickAgentSchema.ts`, z.object):
  ```ts
  { type: z.enum( ['chatbot', 'copilot', 'analyst', 'sdr', 'support', 'researcher', 'orchestrator'], { errorMap: () => ({ message: 'Selecione um tipo' }) }, ), }
  ```
- **quickModelSchema** (`src/lib/validations/quickAgentSchema.ts`, z.object):
  ```ts
  { model: z .string() .min(1, 'Selecione um modelo') .refine( (m) => [ 'google/gemini-2.5-flash', 'google/gemini-2.5-flash-lite', 'google/gemini-2.5-pro', 'google/gemini-3-flash-preview', 'google/gemini-3.1-pro-preview', 'openai/gpt-5', 'openai/gpt-5-mini', 'openai/gpt-5-nano', 'openai/gpt-5.2', ].includes(m), 'Modelo inválido', ), }
  ```
  - Regras cruzadas (refine): “google/gemini-2.5-flash-lite”
- **quickPromptSchema** (`src/lib/validations/quickAgentSchema.ts`, z.object):
  ```ts
  { prompt: z .string() .trim() .min(50, 'Mínimo 50 caracteres') .max(8000, 'Máximo 8.000 caracteres') .superRefine((value, ctx) => { const missing = getMissingSections(value); if (missing.length > 0) { const labels = missing .map((k) => REQUIRED_PROMPT_SECTIONS.find((s) => s.key === k)?.label ?? k) .join(', '); ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Faltam seções obrigatórias: ${labels}. Use headings markdown (## Persona, ## Escopo, ## Formato, ## Regras).`, }); } const thin = getThinSections(value); if (thin.length > 0) { const details = thin.map((t) => `${t.label} (${t.thinReason})`).join('; '); ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Conteúdo insuficiente em ${thin.length === 1 ? 'uma seção' : `${thin.length} seções`}: ${details}. Mínimo: ${SECTION_CONTENT_LI …
  ```
  - Regras cruzadas (refine): “);
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: ”
- **researchConfigSchema** (`src/lib/validations/researchConfig.ts`, z.object):
  ```ts
  { defaultDepth: z.enum(['quick', 'standard', 'deep']), maxIterations: z.coerce.number().int({ message: 'Deve ser inteiro' }) .min(1, { message: 'Mínimo 1 iteração' }) .max(10, { message: 'Máximo 10 iterações' }), queriesPerIteration: z.coerce.number().int({ message: 'Deve ser inteiro' }) .min(1, { message: 'Mínimo 1 query' }) .max(5, { message: 'Máximo 5 queries' }), strategy: z.enum(['broad', 'balanced', 'focused']), synthesisModel: z.enum(['claude-sonnet-4-6', 'claude-opus-4-8', 'gpt-5-large', 'gemini-2-5-pro']), language: z.enum(['pt', 'en', 'es']), includeInternal: z.boolean(), stopOnNoGaps: z.boolean(), maxTokens: z.coerce.number().int() .min(1000, { message: 'Mínimo 1.000 tokens' }) .max(500_000, { message: 'Máximo 500.000 tokens' }), maxSources: z.coerce.number().int() .min(5, { mes …
  ```
- **skillImportSchema** (`src/lib/validations/skillImport.ts`, z.object):
  ```ts
  { name: z.string().trim().min(2, 'Nome muito curto').max(120, 'Nome muito longo'), slug: z .string() .trim() .min(2) .max(120) .regex(slugRegex, 'Slug deve conter apenas letras minúsculas, números e hífens'), description: z.string().trim().max(2000).default(''), version: z.string().trim().regex(semverRegex, 'Versão deve seguir semver').default('1.0.0'), author: z.string().trim().max(120).default(''), category: z.enum(SKILL_CATEGORY_VALUES), department: z.enum(SKILL_DEPARTMENTS).nullable().default(null), tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]), skill_config: z.record(z.unknown()).default({}), mcp_server_url: z .string() .url('URL de MCP inválida') .startsWith('https://', 'MCP deve usar HTTPS') .nullable() .default(null), source_repo: z.string().trim().min(3).max( …
  ```
- **harvestRequestSchema** (`src/lib/validations/skillImport.ts`, z.object):
  ```ts
  { departments: z.array(z.enum(SKILL_DEPARTMENTS)).max(10).default([]), topics: z.array(z.string().trim().min(2).max(60)).max(20).default([]), extraQueries: z.array(z.string().trim().min(2).max(120)).max(20).default([]), repos: z .array(z.string().trim().regex(repoSlugRegex, 'Use o formato owner/repo')) .max(10) .default([]), filesPerRepo: z.number().int().min(1).max(1000).default(8), /** Deslocamento na lista ordenada de SKILL.md — habilita varredura em lotes. */ fileOffset: z.number().int().min(0).max(100000).default(0), maxRepos: z.number().int().min(1).max(200).default(40), maxCandidates: z.number().int().min(1).max(1000).default(120), minStars: z.number().int().min(0).max(100000).default(3), dryRun: z.boolean().default(false), }
  ```
- **candidateReviewSchema** (`src/lib/validations/skillImport.ts`, z.object):
  ```ts
  { ids: z.array(z.string().uuid()).min(1).max(100), action: z.enum(['approve', 'reject', 'reclassify']), department: z.enum(SKILL_DEPARTMENTS).optional(), tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(), }
  ```
- **registerSecretInputSchema** (`src/services/secretsRotationService.ts`, z.object):
  ```ts
  { name: z.string().trim().min(1, 'Nome é obrigatório').max(200, 'Nome muito longo'), category: z.enum([ 'api_key', 'oauth_client', 'db_password', 'jwt_signing', 'webhook_secret', 'encryption_key', 'ssh_key', 'certificate', ]), provider: z.string().max(100, 'Provedor muito longo').optional(), environment: z.enum(['prod', 'staging', 'dev']).optional(), rotation_interval_days: z .number() .int() .min(1, 'Mínimo 1 dia') .max(3650, 'Máximo 10 anos') .optional(), notes: z.string().max(2000, 'Notas muito longas').optional(), }
  ```
- **ErrorResponseContract** (`supabase/functions/_shared/contracts.ts`, z.object):
  ```ts
  { error: z.string(), code: z.string().optional(), message: z.string().optional(), fields: z .array( z.object({ field: z.string(), message: z.string(), code: z.string().optional(), }), ) .optional(), }
  ```
- **BitrixWebhookErrorResponseContract** (`supabase/functions/_shared/contracts.ts`, z.object):
  ```ts
  { error: z.string(), code: z.string().optional(), message: z.string().optional(), fields: z .array( z.object({ field: z.string(), message: z.string(), code: z.string().optional(), }), ) .optional(), }
  ```
- **A2ATaskSchema** (`supabase/functions/a2a-server/index.ts`, z.object):
  ```ts
  { message: z.object({ role: z.enum(['user', 'agent']).optional(), parts: z.array(z.object({ type: z.enum(['text', 'data']), text: z.string().max(50_000).optional(), data: z.record(z.unknown()).optional(), })).min(1).max(50), }), id: z.string().max(200).optional(), agentId: z.string().uuid().optional(), }
  ```
- **BuilderBodySchema** (`supabase/functions/agent-conversational-builder/index.ts`, z.object):
  ```ts
  { messages: z .array( z .object({ role: z.enum(['system', 'user', 'assistant', 'tool']), content: z.union([z.string(), z.array(z.record(z.unknown())), z.null()]).optional(), }) .passthrough(), ) .min(1) .max(100), currentAgent: z.record(z.unknown()).nullable().optional(), }
  ```
- **EvalRunnerBodySchema** (`supabase/functions/agent-eval-runner/index.ts`, z.object):
  ```ts
  { agent_id: z.string().uuid().optional(), workspace_id: z.string().uuid().optional(), eval_set_id: z.string().uuid().optional(), test_cases: z.array(z.record(z.unknown())).max(200).optional(), }
  ```
- **WorkflowRunSchema** (`supabase/functions/agent-workflow-runner/index.ts`, z.object):
  ```ts
  { workflow_id: z.string().uuid(), input: z .union([ z.record(z.unknown()), z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown()), ]) .optional(), }
  ```
- **TranscribeInput** (`supabase/functions/audio-transcribe/index.ts`, z.object, encadeia refine):
  ```ts
  { action: z.enum(['transcribe', 'translate']).default('transcribe'), audio_base64: z.string().min(100).optional(), audio_url: z.string().url().optional(), language: z.string().min(2).max(5).default('pt'), format: z.enum(['text', 'srt', 'vtt', 'json']).default('text'), }
  ```
  - Regras cruzadas (refine): “Either audio_base64 or audio_url is required”
- **BodySchema** (`supabase/functions/automation-pipeline/index.ts`, z.object):
  ```ts
  { rule_id: z.string().uuid(), payload: z.record(z.unknown()).optional(), }
  ```
- **BitrixAPIInput** (`supabase/functions/bitrix24-api/index.ts`, z.object):
  ```ts
  { method: z.string().min(1).max(200), params: z.record(z.unknown()).optional().default({}), }
  ```
- **OAuthActionSchema** (`supabase/functions/bitrix24-oauth/index.ts`, z.enum):
  ```ts
  ['authorize', 'callback']
  ```
- **OAuthQuerySchema** (`supabase/functions/bitrix24-oauth/index.ts`, z.object):
  ```ts
  { action: OAuthActionSchema.optional(), code: z.string().min(1).max(2048).optional(), state: z.string().max(2048).optional(), }
  ```
- **Bitrix24PayloadSchema** (`supabase/functions/bitrix24-webhook/index.ts`, z.object):
  ```ts
  { event: z.string().max(120).optional(), auth: z.record(z.unknown()).optional(), data: z.record(z.unknown()).optional(), ts: z.union([z.string(), z.number()]).optional(), }
  ```
- **BodySchema** (`supabase/functions/browser-agent-run/index.ts`, z.object):
  ```ts
  { goal: z.string().min(3).max(2000), start_url: z.string().url(), agent_id: z.string().uuid().optional(), workspace_id: z.string().uuid().optional(), max_steps: z.number().int().min(1).max(25).default(10), }
  ```
- **Schema** (`supabase/functions/browser-session-cancel/index.ts`, z.object):
  ```ts
  { session_id: z.string().uuid() }
  ```
- **AutoExtractSchema** (`supabase/functions/cerebro-brain/index.ts`, z.object):
  ```ts
  { action: z.literal('auto_extract'), text: z.string().min(3).max(50000), extract_type: z.enum(VALID_EXTRACT_TYPES).optional(), }
  ```
- **BrainSandboxSchema** (`supabase/functions/cerebro-brain/index.ts`, z.object):
  ```ts
  { action: z.literal('brain_sandbox'), query: z.string().min(2).max(10000), context_mode: z.enum(VALID_CONTEXT_MODES).optional(), }
  ```
- **GenericActionSchema** (`supabase/functions/cerebro-brain/index.ts`, z.object):
  ```ts
  { action: z.enum( VALID_ACTIONS.filter((a) => a !== 'auto_extract' && a !== 'brain_sandbox') as unknown as [ CerebroAction, ...CerebroAction[], ], ), }
  ```
- **CerebroBodySchema** (`supabase/functions/cerebro-brain/index.ts`, z.union):
  ```ts
  [AutoExtractSchema, BrainSandboxSchema, GenericActionSchema]
  ```
- **CerebroBodySchema** (`supabase/functions/cerebro-query/index.ts`, z.object):
  ```ts
  { query: z.string().trim().min(2).max(10000), stream: z.boolean().optional(), notebook_id: z.string().uuid().nullable().optional(), source_ids: z.array(z.string().uuid()).max(50).optional(), }
  ```
- **CodeInterpBodySchema** (`supabase/functions/code-interpreter-execute/index.ts`, z.object):
  ```ts
  { runtime: z.enum(['python', 'node', 'deno']), code: z.string().min(1).max(200_000), timeout_ms: z.number().int().min(100).max(300_000).optional(), session_id: z.string().max(200).optional(), }
  ```
- **ComputerUseBodySchema** (`supabase/functions/computer-use-execute/index.ts`, z.object):
  ```ts
  { goal: z.string().max(4000).optional(), model: z.string().max(120).optional(), }
  ```
- **CostRequestSchema** (`supabase/functions/cost-calculator/index.ts`, z.object):
  ```ts
  { model: z.string(), inputTokens: z.number().nonnegative(), outputTokens: z.number().nonnegative(), }
  ```
- **SyncInput** (`supabase/functions/crm-bitrix-sync/index.ts`, z.object):
  ```ts
  { workspace_id: z.string().uuid(), entities: z .array(z.enum(['deal', 'contact', 'company', 'lead'])) .min(1) .max(4) .optional() .default(['company', 'contact', 'deal']), /** Teto de páginas por entidade (50 itens/página). */ max_pages: z.number().int().min(1).max(40).optional().default(10), }
  ```
- **RunnerInput** (`supabase/functions/crm-cadence-runner/index.ts`, z.object):
  ```ts
  { /** Teto de inscrições por execução — mantém a função dentro do tempo limite. */ batch_size: z.number().int().min(1).max(200).default(50), /** Presente = execução manual de um workspace; ausente = cron global. */ workspace_id: z.string().uuid().optional(), /** Simula sem enviar nem avançar — usado pela UI para prever o lote. */ dry_run: z.boolean().default(false), }
  ```
- **EnrichInput** (`supabase/functions/crm-enrich/index.ts`, z.object):
  ```ts
  { workspace_id: z.string().uuid(), /** Teto de empresas por execução — protege custo de LLM e tempo de resposta. */ limit: z.number().int().min(1).max(200).default(50), /** Desliga a camada 3 quando o operador quer apenas o gratuito. */ use_llm: z.boolean().default(true), company_ids: z.array(z.string().uuid()).max(200).optional(), }
  ```
- **BodySchema** (`supabase/functions/cron-executor/index.ts`, z.object, encadeia optional):
  ```ts
  {}
  ```
- **JSONRPCRequestSchema** (`supabase/functions/datahub-mcp-server/index.ts`, z.object):
  ```ts
  { jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number(), z.null()]).optional(), method: z.string().min(1).max(200), params: z.record(z.unknown()).optional(), }
  ```
- **DatahubBodySchema** (`supabase/functions/datahub-query/index.ts`, z.object):
  ```ts
  { action: z .enum([ 'test_connections', 'list_entities', 'query', 'list_columns', 'count', 'search', 'fetch', 'fetch_related', 'get_stats', 'custom_query', 'schema', ]) .or(z.string().min(1).max(80)), streaming: z.boolean().optional(), }
  ```
- **OcrInput** (`supabase/functions/doc-ocr/index.ts`, z.object, encadeia refine):
  ```ts
  { action: z.enum(['ocr', 'describe', 'extract_table', 'extract_fields']).default('ocr'), image_base64: z.string().min(100).optional(), image_url: z.string().url().optional(), prompt: z.string().max(2000).optional(), fields: z.array(z.string()).optional(), }
  ```
  - Regras cruzadas (refine): “Either image_base64 or image_url is required”
- **Input** (`supabase/functions/doc-parse/index.ts`, z.object):
  ```ts
  { ingestion_id: z.string().uuid(), collection_id: z.string().uuid(), filename: z.string().min(1).max(255), mime: z.enum([ 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ]), storage_path: z.string().min(3).max(500), ocr_pages: z .array( z.object({ page: z.number().int().min(1), png_base64: z.string().min(50), }), ) .optional(), force_ocr: z.boolean().optional(), chunk_size: z.number().int().min(200).max(4000).optional(), chunk_overlap: z.number().int().min(0).max(3999).optional(), chunk_strategy: z.enum(['fixed', 'paragraph', 'sentence']).optional(), content_hash: z .string() .regex(/^[a-f0-9]{64}$/i, 'must be sha-256 hex') .optional(), }
  ```
- **Input** (`supabase/functions/doc-rechunk/index.ts`, z.object):
  ```ts
  { document_id: z.string().uuid(), chunk_size: z.number().int().min(200).max(4000).optional(), chunk_overlap: z.number().int().min(0).max(3999).optional(), chunk_strategy: z.enum(['fixed', 'paragraph', 'sentence']).optional(), }
  ```
- **OrchestrateRequestSchema** (`supabase/functions/dr-orchestrator/index.ts`, z.object):
  ```ts
  { drill_id: z.string().uuid(), }
  ```
- **TestCase** (`supabase/functions/eval-engine-v2/index.ts`, z.object):
  ```ts
  { query: z.string().min(1).max(2000), answer: z.string().min(1).max(8000), contexts: z.array(z.string().min(1).max(8000)).min(0).max(20), expected_answer: z.string().max(8000).optional(), }
  ```
- **EvalInput** (`supabase/functions/eval-engine-v2/index.ts`, z.object):
  ```ts
  { workspace_id: z.string().uuid().optional(), agent_id: z.string().uuid().optional(), test_cases: z.array(TestCase).min(1).max(50), run_ragas: z.boolean().default(true), }
  ```
- **testCaseSchema** (`supabase/functions/eval-judge/index.ts`, z.object):
  ```ts
  { id: z.string().optional(), input: z.string().min(1), expected_output: z.string().optional().nullable(), }
  ```
- **bodySchema** (`supabase/functions/eval-judge/index.ts`, z.object):
  ```ts
  { evaluation_run_id: z.string().uuid().optional(), agent_id: z.string().uuid(), test_cases: z.array(testCaseSchema).optional(), dataset_id: z.string().uuid().optional(), judge_model: z.string().max(100).optional(), mode: z.enum(['pointwise', 'pairwise', 'faithfulness', 'reward']).optional().default('pointwise'), }
  ```
- **InputSchema** (`supabase/functions/global-search/index.ts`, z.object):
  ```ts
  { query: z.string().max(500).default(''), limit: z.number().int().min(1).max(20).default(8), semantic: z.boolean().optional(), }
  ```
- **InputSchema** (`supabase/functions/graph-execute/index.ts`, z.object):
  ```ts
  { graph_id: z.string().uuid(), input: z.string().min(1).max(20000), }
  ```
- **GuardrailInput** (`supabase/functions/guardrails-engine/index.ts`, z.object):
  ```ts
  { action: z.enum(['check_input', 'check_output', 'check_full', 'get_config']), text: z.string().max(50000).optional(), agent_id: z.string().uuid().optional(), context: z.record(z.unknown()).optional(), }
  ```
- **GuardrailInput** (`supabase/functions/guardrails-ml/index.ts`, z.object):
  ```ts
  { text: z.string().min(1).max(20_000), direction: z.enum(['input', 'output']), }
  ```
- **ActionSchema** (`supabase/functions/hf-autotrain/index.ts`, z.object):
  ```ts
  { action: z.enum(['prepare_dataset', 'start_training', 'check_status', 'list_models', 'export_traces', 'prepare_dpo_dataset', 'generate_trl_config']), agent_id: z.string().uuid().optional(), dataset_config: z.object({ source: z.enum(['traces', 'test_cases', 'custom']).optional(), min_quality_score: z.number().min(0).max(5).optional(), max_samples: z.number().int().min(10).max(10000).optional(), task_type: z.enum(['text-classification', 'text-generation', 'embedding', 'reranking']).optional(), }).optional(), training_config: z.object({ base_model: z.string().max(200).optional(), task: z.enum(['text-classification', 'text-generation', 'embedding']).optional(), epochs: z.number().int().min(1).max(20).optional(), learning_rate: z.number().min(0.000001).max(0.01).optional(), repo_name: z.string …
  ```
- **ImageInput** (`supabase/functions/image-analysis/index.ts`, z.object, encadeia refine):
  ```ts
  { action: z.enum(['analyze', 'classify', 'nsfw_check', 'mockup', 'compare']).default('analyze'), image_base64: z.string().min(100).optional(), image_url: z.string().url().optional(), prompt: z.string().max(2000).optional(), categories: z.array(z.string()).optional(), }
  ```
  - Regras cruzadas (refine): “Either image_base64 or image_url is required”
- **InputSchema** (`supabase/functions/incident-orchestrator/index.ts`, z.object):
  ```ts
  { playbook_id: z.string().uuid(), trigger_event: z.record(z.unknown()).optional(), triggered_by: z.string().max(120).optional(), }
  ```
- **InputSchema** (`supabase/functions/kb-analyze-gaps/index.ts`, z.object):
  ```ts
  { knowledge_base_id: z.string().uuid(), }
  ```
- **InputSchema** (`supabase/functions/kb-translate-article/index.ts`, z.object):
  ```ts
  { article_id: z.string().uuid(), target_language: z.string().min(2).max(10), }
  ```
- **LGPDInput** (`supabase/functions/lgpd-manager/index.ts`, z.object):
  ```ts
  { action: z.enum([ 'export_data', 'delete_data', 'request_deletion', 'list_consents', 'list_deletion_requests', 'consent_grant', 'consent_revoke', 'revoke_consent', 'anonymize', ]), target_user_id: z.string().uuid().optional(), scope: z.enum(['all', 'memories', 'sessions', 'traces', 'evaluations']).default('all'), consent_id: z.string().uuid().optional(), reason: z.string().max(500).optional(), purpose: z.string().optional(), legal_basis: z.string().optional(), }
  ```
- **MemoryAction** (`supabase/functions/memory-manager/index.ts`, z.object):
  ```ts
  { action: z.enum(['add', 'search', 'list', 'forget', 'forget_all', 'promote_to_fact']), content: z.string().max(10000).optional(), query: z.string().max(2000).optional(), memory_id: z.string().uuid().optional(), memory_type: z.enum(['episodic', 'semantic', 'procedural']).default('episodic'), scope: z.enum(['session', 'user', 'agent', 'org']).default('user'), scope_id: z.string().optional(), importance: z.number().min(0).max(1).default(0.5), limit: z.number().int().min(1).max(100).default(10), metadata: z.record(z.unknown()).optional(), }
  ```
- **toolEnum** (`supabase/functions/memory-tools/index.ts`, z.enum):
  ```ts
  [ 'memory_save', 'memory_search', 'memory_update', 'memory_forget', 'memory_compact', ]
  ```
- **memoryTypeEnum** (`supabase/functions/memory-tools/index.ts`, z.enum):
  ```ts
  [ 'short_term', 'episodic', 'semantic', 'user_profile', 'team', 'external', ]
  ```
- **saveParams** (`supabase/functions/memory-tools/index.ts`, z.object):
  ```ts
  { content: z.string().min(1).max(10000), memory_type: memoryTypeEnum.optional().default('episodic'), importance: z.number().min(0).max(1).optional().default(0.5), }
  ```
- **searchParams** (`supabase/functions/memory-tools/index.ts`, z.object):
  ```ts
  { query: z.string().min(1).max(1000), memory_type: memoryTypeEnum.optional(), limit: z.number().int().min(1).max(100).optional().default(10), }
  ```
- **updateParams** (`supabase/functions/memory-tools/index.ts`, z.object):
  ```ts
  { memory_id: z.string().uuid(), new_content: z.string().min(1).max(10000), }
  ```
- **forgetParams** (`supabase/functions/memory-tools/index.ts`, z.object):
  ```ts
  { memory_id: z.string().uuid() }
  ```
- **compactParams** (`supabase/functions/memory-tools/index.ts`, z.object):
  ```ts
  { memory_type: memoryTypeEnum.optional() }
  ```
- **bodySchema** (`supabase/functions/memory-tools/index.ts`, z.object):
  ```ts
  { tool: toolEnum, params: z.record(z.unknown()), agent_id: z.string().uuid().optional(), }
  ```
- **NLPInput** (`supabase/functions/nlp-pipeline/index.ts`, z.object):
  ```ts
  { text: z.string().min(1).max(5000), pipeline: z.array(z.enum(['ner', 'sentiment'])).default(['ner', 'sentiment']), }
  ```
- **BodySchema** (`supabase/functions/notebook-podcast-generate/index.ts`, z.object):
  ```ts
  { notebook_id: z.string().uuid(), voice: z.string().min(1).max(40).default('alloy'), force: z.boolean().default(false), }
  ```
- **InputSchema** (`supabase/functions/notification-sender/index.ts`, z.object, encadeia refine):
  ```ts
  { channel: z.enum(['email', 'whatsapp', 'slack', 'in_app', 'webhook']), recipient: z.string().min(1).max(500), subject: z.string().max(500).optional(), message: z.string().max(20000).optional(), template_id: z.string().uuid().optional(), template_vars: z.record(z.unknown()).optional(), priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(), metadata: z.record(z.unknown()).optional(), }
  ```
  - Regras cruzadas (refine): “message ou template_id é obrigatório”
- **CouncilBodySchema** (`supabase/functions/oracle-council/index.ts`, z.object):
  ```ts
  { query: z.string().trim().min(3).max(10_000), mode: z.enum(['council', 'researcher', 'validator', 'executor', 'advisor']).default('council'), members: z .array(z.object({ model: z.string().min(2), persona: z.string().optional() })) .min(2) .max(10), chairman_model: z.string().optional(), enable_peer_review: z.boolean().default(true), enable_thinking: z.boolean().default(false), preset_id: z.string().optional(), custom_guardrails: z.string().max(20_000).optional(), }
  ```
- **LimitsSchema** (`supabase/functions/oracle-research/index.ts`, z.object, encadeia default):
  ```ts
  { max_tokens: z.number().int().min(1000).max(500_000).default(60_000), max_sources: z.number().int().min(5).max(50).default(20), max_latency_ms: z.number().int().min(30_000).max(600_000).default(180_000), max_cost_usd: z.number().min(0.1).max(20).default(2.0), }
  ```
- **ResearchInput** (`supabase/functions/oracle-research/index.ts`, z.object):
  ```ts
  { query: z.string().min(10).max(5000), max_iterations: z.number().int().min(1).max(10).default(5), queries_per_iteration: z.number().int().min(1).max(5).default(3), strategy: z.enum(['broad', 'balanced', 'focused']).default('balanced'), depth: z.enum(['quick', 'standard', 'deep']).default('standard'), synthesis_model: z.string().default('claude-sonnet-4-6'), include_internal: z.boolean().default(true), stop_on_no_gaps: z.boolean().default(true), language: z.enum(['pt', 'en', 'es']).default('pt'), limits: LimitsSchema, }
  ```
- **BodySchema** (`supabase/functions/pg-net-smoke-test/index.ts`, z.object):
  ```ts
  { url: z.string().url().optional(), timeout_ms: z.number().int().min(500).max(30_000).optional(), }
  ```
- **MockupBodySchema** (`supabase/functions/product-mockup/index.ts`, z.object):
  ```ts
  { action: z.string().min(1).max(80), }
  ```
- **BodySchema** (`supabase/functions/queue-worker/index.ts`, z.object):
  ```ts
  { queue_id: z.string().uuid().optional(), worker_id: z.string().min(1).max(120).optional(), batch_size: z.number().int().min(1).max(20).optional(), }
  ```
- **BodySchema** (`supabase/functions/quick-agent-test/index.ts`, z.object):
  ```ts
  { system_prompt: z.string().min(10).max(20_000), user_message: z.string().min(1).max(4000), model: z.string().min(2).max(120).default('gpt-4o'), /** * Skills instaladas enviadas pelo cliente (já filtradas por RLS na leitura). * São re-sanitizadas no servidor antes de entrar no prompt. */ skills: z .array( z.object({ id: z.string().max(64).optional(), name: z.string().min(1).max(200), description: z.string().max(1000).optional(), category: z.string().max(64).optional(), }), ) .max(100) .optional(), }
  ```
- **EmbedInput** (`supabase/functions/rag-embed-v2/index.ts`, z.object):
  ```ts
  { texts: z.array(z.string().min(1).max(8000)).min(1).max(100), provider: z.string().default('qwen3-embedding-8b'), dimension: z.number().int().positive().max(4096).default(CANONICAL_DIM), task: z .enum(['retrieval.passage', 'retrieval.query', 'classification', 'clustering']) .default('retrieval.passage'), }
  ```
- **IngestBodySchema** (`supabase/functions/rag-ingest/index.ts`, z.object):
  ```ts
  { document_id: z.string().uuid(), content: z.string().min(1).max(2_000_000), chunk_size: z.number().int().min(100).max(8000).optional(), chunk_overlap: z.number().int().min(0).max(2000).optional(), contextual_chunking: z.boolean().optional(), }
  ```
- **RerankInput** (`supabase/functions/rag-rerank/index.ts`, z.object):
  ```ts
  { query: z.string().min(1).max(2000), chunks: z.array(z.record(z.unknown())).min(1).max(200), top_k: z.number().int().min(1).max(50).default(5), knowledge_base_id: z.string().uuid().optional(), }
  ```
- **RerankInput** (`supabase/functions/rag-rerank-v2/index.ts`, z.object):
  ```ts
  { query: z.string().min(1).max(2000), documents: z.array(z.object({ id: z.string(), content: z.string().min(1).max(8000), score: z.number().optional(), })).min(1).max(200), top_k: z.number().int().min(1).max(50).default(5), model: z.string().optional().default('qwen3-reranker-8b'), }
  ```
- **ForkRequestSchema** (`supabase/functions/replay-fork-execute/index.ts`, z.object):
  ```ts
  { fork_id: z.string().uuid(), }
  ```
- **ScanRequestSchema** (`supabase/functions/sbom-scanner/index.ts`, z.object):
  ```ts
  { workspace_id: z.string().uuid(), snapshot_id: z.string().uuid(), }
  ```
- **InputSchema** (`supabase/functions/semantic-search/index.ts`, z.object):
  ```ts
  { query: z.string().min(2).max(2000), knowledge_base_id: z.string().uuid().nullish(), top_k: z.number().int().min(1).max(50).default(10), }
  ```
- **InputSchema** (`supabase/functions/skill-classify-llm/index.ts`, z.object):
  ```ts
  { skill_id: z.string().min(1).max(100), name: z.string().min(1).max(MAX_NAME), description: z.string().max(MAX_DESCRIPTION).optional().default(''), tags: z.array(z.string().max(MAX_TAG)).max(MAX_TAGS).optional().default([]), current_department: z.string().max(40).nullable().optional(), }
  ```
- **InputSchema** (`supabase/functions/skill-describe-llm/index.ts`, z.object):
  ```ts
  { skill_id: z.string().min(1).max(100), name: z.string().min(1).max(MAX_NAME), slug: z.string().max(MAX_NAME).optional().default(''), category: z.string().max(60).optional().default(''), department: z.string().max(40).nullable().optional(), tags: z.array(z.string().max(MAX_TAG)).max(MAX_TAGS).optional().default([]), source_repo: z.string().max(MAX_REPO).optional().default(''), /** Trecho do README/manifesto capturado no harvest, se houver. */ readme_excerpt: z.string().max(MAX_README).optional().default(''), }
  ```
- **RequestSchema** (`supabase/functions/skill-harvester/index.ts`, z.object):
  ```ts
  { departments: z.array(z.enum(SKILL_DEPARTMENTS)).max(10).default([]), topics: z.array(z.string().min(2).max(60)).max(20).default([]), extraQueries: z.array(z.string().min(2).max(120)).max(20).default([]), /** Monorepos alvo (`owner/repo`). Quando presente, a busca por queries é ignorada. */ repos: z .array(z.string().trim().regex(REPO_SLUG_RE, 'Formato esperado: owner/repo')) .max(10) .default([]), /** Teto de SKILL.md lidos por repositório — monorepos como sales-skills/sales têm centenas. */ filesPerRepo: z.number().int().min(1).max(1000).default(8), /** Deslocamento na lista ordenada de SKILL.md — permite varrer um monorepo em lotes. */ fileOffset: z.number().int().min(0).max(100000).default(0), maxRepos: z.number().int().min(1).max(200).default(40), maxCandidates: z.number().int().min( …
  ```
- **PayloadSchema** (`supabase/functions/slack-agent-notify/index.ts`, z.object):
  ```ts
  { agent_id: z.string().uuid(), workspace_id: z.string().uuid(), status: z.enum(['success', 'failure']), duration_ms: z.number().int().nonnegative().optional(), cost_usd: z.number().nonnegative().optional(), trace_id: z.string().optional(), agent_name: z.string().max(300).optional(), error: z.string().max(2000).optional(), }
  ```
- **AlertSchema** (`supabase/functions/slack-alert-dispatcher/index.ts`, z.object):
  ```ts
  { id: z.string().uuid().optional(), workspace_id: z.string().uuid(), category: z.string().min(1).max(128), severity: z.enum(['info', 'warning', 'error', 'critical']), title: z.string().min(1).max(300), description: z.string().max(3000).optional(), action_url: z.string().url().optional(), metadata: z.record(z.unknown()).optional(), }
  ```
- **BodySchema** (`supabase/functions/slack-alert-dispatcher/index.ts`, z.object, encadeia refine):
  ```ts
  { record: AlertSchema.optional(), alert: AlertSchema.optional(), test: z.boolean().optional(), }
  ```
  - Regras cruzadas (refine): “record or alert is required”
- **BodySchema** (`supabase/functions/slack-dlq-discard/index.ts`, z.object):
  ```ts
  { workspace_id: z.string().uuid(), }
  ```
- **BodySchema** (`supabase/functions/slack-rag-sync/index.ts`, z.object, encadeia refine):
  ```ts
  { workspace_id: z.string().uuid().optional(), source_id: z.string().uuid().optional(), }
  ```
  - Regras cruzadas (refine): “workspace_id ou source_id é obrigatório”
- **BodySchema** (`supabase/functions/slack-verify-connection/index.ts`, z.object):
  ```ts
  { workspace_id: z.string().uuid() }
  ```
- **RouteInput** (`supabase/functions/smart-model-router/index.ts`, z.object):
  ```ts
  { query: z.string().min(1).max(20_000), preferred_provider: z.enum(['anthropic', 'openai', 'google', 'openrouter', 'auto']).optional().default('auto'), budget_tier: z.enum(['economy', 'balanced', 'premium']).optional().default('balanced'), task_hint: z.enum(['chat', 'code', 'reasoning', 'extraction', 'creative']).optional(), }
  ```
- **SmolagentBodySchema** (`supabase/functions/smolagent-runtime/index.ts`, z.object):
  ```ts
  { action: z.string().min(1).max(120), stream: z.boolean().optional(), }
  ```
- **SyntheticBodySchema** (`supabase/functions/synthetic-runner/index.ts`, z.object):
  ```ts
  { check_id: z.string().uuid().optional(), }
  ```
- **TestRunInput** (`supabase/functions/test-runner/index.ts`, z.object):
  ```ts
  { agent_id: z.string().uuid(), test_cases: z.array(z.object({ input: z.string().min(1), expected_output: z.string().optional(), tags: z.array(z.string()).optional(), })).min(1).max(50), model: z.string().default('claude-haiku-4-5-20251001'), system_prompt: z.string().optional(), }
  ```
- **TTSInput** (`supabase/functions/text-to-speech/index.ts`, z.object):
  ```ts
  { text: z.string().min(1).max(5000), language: z.enum(['pt', 'en', 'es']).default('pt'), }
  ```
- **ValidateAccessBodySchema** (`supabase/functions/validate-access/index.ts`, z.object):
  ```ts
  { workspace_id: z.string().uuid().nullable().optional(), user_id: z.string().uuid().nullable().optional(), }
  ```
- **VisualSearchBodySchema** (`supabase/functions/visual-search/index.ts`, z.object):
  ```ts
  { image: z.string().min(1).max(20_000_000), hint: z.string().max(2000).optional(), knowledge_base_id: z.string().uuid().nullable().optional(), top_k: z.number().int().min(1).max(50).optional(), }
  ```
- **VoiceSessionBodySchema** (`supabase/functions/voice-session/index.ts`, z.object):
  ```ts
  { action: z.enum(['start', 'end', 'append', 'get']), agent_id: z.string().uuid().nullable().optional(), session_id: z.string().uuid().optional(), }
  ```
- **InputSchema** (`supabase/functions/voice-synthesize/index.ts`, z.object):
  ```ts
  { user_text: z.string().min(1).max(2048), session_id: z.string().uuid().optional(), agent_id: z.string().uuid().optional(), }
  ```
- **InputSchema** (`supabase/functions/voice-transcribe/index.ts`, z.object):
  ```ts
  { audio_base64: z.string().min(1).max(14_000_000, 'audio too large (max ~10MB)'), mime_type: z.string().min(3).max(64).default('audio/webm'), session_id: z.string().uuid().optional(), }
  ```
- **BodySchema** (`supabase/functions/whatsapp-router/index.ts`, z.object):
  ```ts
  { message_id: z.string().uuid() }
  ```
- **ChatInputSchema** (`supabase/functions/widget-proxy/index.ts`, z.object):
  ```ts
  { message: z.string().min(1).max(8000), agent_id: z.string().uuid(), session_id: z.string().min(1).max(100).optional(), }
  ```
- **WorkflowInput** (`supabase/functions/workflow-engine-v2/index.ts`, z.object):
  ```ts
  { workflow_id: z.string().uuid(), input: z.string().default(''), resume_run_id: z.string().uuid().optional(), }
  ```

### F.2 react-hook-form (register/rules)

_nenhum item encontrado_

### F.3 Restrições em inputs HTML (required/min/max/pattern)

| Campo | Restrições | Arquivo |
|---|---|---|
| `deploy-budget` | type=number | `src/components/agent-builder/modules/DeployModule.tsx` |
| `deploy-alert-pct` | type=number | `src/components/agent-builder/modules/DeployModule.tsx` |
| `ab-test-split` | type=number | `src/components/agent-builder/modules/ObservabilityModule.tsx` |
| `rule-threshold` | type=number, step=any | `src/components/agents/alerts/AlertRuleEditor.tsx` |
| `range-vmin` | type=number, min=minVersion, max=maxVersion, min | `src/components/agents/versioning/TimelineRangeFilter.tsx` |
| `range-vmax` | type=number, min=minVersion, max=maxVersion, max | `src/components/agents/versioning/TimelineRangeFilter.tsx` |
| `range-from` | type=datetime-local | `src/components/agents/versioning/TimelineRangeFilter.tsx` |
| `range-to` | type=datetime-local | `src/components/agents/versioning/TimelineRangeFilter.tsx` |
| `qa-prompt` | max | `src/components/agents/wizard/quickSteps/StepQuickPrompt.tsx` |
| `cost-calc-input-tokens` | type=number | `src/components/billing/CostCalculatorPanel.tsx` |
| `cost-calc-output-tokens` | type=number | `src/components/billing/CostCalculatorPanel.tsx` |
| `cadence-delay` | type=number, min=0 | `src/components/crm/CadenceStepsEditor.tsx` |
| `icp-min` | min, type=number, min=0, min | `src/components/crm/IcpProfilePanel.tsx` |
| `icp-max` | max, type=number, min=0, max | `src/components/crm/IcpProfilePanel.tsx` |
| `icp-qualified` | type=number, min=0, max=100 | `src/components/crm/IcpProfilePanel.tsx` |
| `icp-hot` | type=number, min=0, max=100 | `src/components/crm/IcpProfilePanel.tsx` |
| `sim-activity` | type=number, min=0 | `src/components/crm/LeadScoreSimulator.tsx` |
| `audio-file` | accept=audio/* | `src/components/knowledge/AudioUploadDialog.tsx` |
| `ocr-file` | accept=image/* | `src/components/knowledge/DocOcrDialog.tsx` |
| `rerank-topk` | type=number, min=1, max=20 | `src/components/knowledge/RagRerankTestDialog.tsx` |
| `tf-date-from` | type=date | `src/components/monitoring/AdvancedTraceFilters.tsx` |
| `tf-date-to` | type=date | `src/components/monitoring/AdvancedTraceFilters.tsx` |
| `tf-min-latency` | min, type=number, min | `src/components/monitoring/AdvancedTraceFilters.tsx` |
| `tf-max-latency` | max, type=number, max | `src/components/monitoring/AdvancedTraceFilters.tsx` |
| `tf-min-cost` | min, type=number, step=0.001, min | `src/components/monitoring/AdvancedTraceFilters.tsx` |
| `tf-max-cost` | max, type=number, step=0.001, max | `src/components/monitoring/AdvancedTraceFilters.tsx` |
| `maxTokens` | max, type=number, min=1000, max=500_000, step=1000, max | `src/components/oracle/ResearchSettingsDialog.tsx` |
| `maxSources` | max, type=number, min=5, max=50, step=1, max | `src/components/oracle/ResearchSettingsDialog.tsx` |
| `maxLatency` | max, type=number, min=30, max=600, step=10, max | `src/components/oracle/ResearchSettingsDialog.tsx` |
| `maxCost` | max, type=number, min=0.1, max=50, step=0.1, max | `src/components/oracle/ResearchSettingsDialog.tsx` |
| `danger-password` | type=password | `src/components/rbac/DangerousActionDialog.tsx` |
| `manual-copy-textarea` | readOnly | `src/components/shared/ManualCopyDialog.tsx` |
| `progressiveskillloaderpanel-budget-de-tokens-6affb6` | type=number, min=100, step=100 | `src/components/skills/ProgressiveSkillLoaderPanel.tsx` |
| `progressiveskillloaderpanel-m-x-de-skills-02341f` | type=number, min=1, max=50, max | `src/components/skills/ProgressiveSkillLoaderPanel.tsx` |
| `rerank-topk` | type=number, min=1, max=50 | `src/components/super-cerebro/SearchTab.tsx` |
| `e2ee-pass` | type=password | `src/components/super-cerebro/notebook/E2EESyncPanel.tsx` |
| `e2ee-confirm` | type=password | `src/components/super-cerebro/notebook/E2EESyncPanel.tsx` |
| `autosync-interval` | type=number, min=10, max=3600 | `src/components/super-cerebro/notebook/E2EESyncPanel.tsx` |
| `vision-file` | accept=image/* | `src/components/tools/ImageAnalysisDialog.tsx` |
| `id` | accept=image/* | `src/components/tools/mockup/MockupShared.tsx` |
| `arena-prompt` | min | `src/pages/AgentArenaPage.tsx` |
| `auth-email` | type=email | `src/pages/AuthPage.tsx` |
| `browser-agent-maxsteps` | max, type=number, min=1, max=25, max | `src/pages/BrowserAgentPage.tsx` |
| `monthly` | type=number, step=0.01, min=0 | `src/pages/BudgetSettingsPage.tsx` |
| `daily` | type=number, step=0.01, min=0 | `src/pages/BudgetSettingsPage.tsx` |
| `b-limit` | type=number, min=1 | `src/pages/BudgetsPage.tsx` |
| `b-th` | type=number, min=1, max=100 | `src/pages/BudgetsPage.tsx` |
| `in-tokens` | type=number, min=0 | `src/pages/CostSimulatorPage.tsx` |
| `out-tokens` | type=number, min=0 | `src/pages/CostSimulatorPage.tsx` |
| `calls` | type=number, min=0 | `src/pages/CostSimulatorPage.tsx` |
| `count` | type=number, min=1, max=20000 | `src/pages/E2EESimulationPage.tsx` |
| `win` | type=number, min=0 | `src/pages/E2EESimulationPage.tsx` |
| `pi` | type=number, min=0, max=100 | `src/pages/E2EESimulationPage.tsx` |
| `pu` | type=number, min=0, max=100 | `src/pages/E2EESimulationPage.tsx` |
| `pk` | type=number, min=0, max=100 | `src/pages/E2EESimulationPage.tsx` |
| `pc` | type=number, min=0, max=100 | `src/pages/E2EESimulationPage.tsx` |
| `starts` | type=datetime-local, min=nowLocal | `src/pages/FreezeWindowsPage.tsx` |
| `ends` | type=datetime-local, min=startsAt \|\| nowLocal | `src/pages/FreezeWindowsPage.tsx` |
| `fstart` | type=datetime-local | `src/pages/GovernancePage.tsx` |
| `fend` | type=datetime-local | `src/pages/GovernancePage.tsx` |
| `minStars` | min, type=number, min=0, max=100000, min | `src/pages/SkillHarvestPage.tsx` |
| `maxRepos` | max, type=number, min=1, max=200, max | `src/pages/SkillHarvestPage.tsx` |
| `filesPerRepo` | type=number, min=1, max=1000 | `src/pages/SkillHarvestPage.tsx` |

## G. Fórmulas e derivações (como valores são calculados)

### G.1 Colunas calculadas no banco

| Tabela | Coluna | Expressão |
|---|---|---|
| `risk_register` | `inherent_score` | `likelihood * impact` |
| `vendor_assessments` | `risk_score` | `(6 - security_score) * (6 - compliance_score)` |

### G.2 Views (consultas derivadas)

| View | SELECT |
|---|---|
| `audit_log_safe` | `SELECT id, workspace_id, user_id, event_type as action, resource_type as resource, resource_id, ip_address, created_at FROM public.audit_events WHERE workspace_id IS NULL OR workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )` |
| `workspace_members_safe` | `SELECT wm.id, wm.workspace_id, wm.user_id, wm.role, wm.name, wm.invited_at, wm.accepted_at, wme.email FROM public.workspace_members wm LEFT JOIN public.workspace_member_emails wme ON wme.member_id = wm.id AND (wme.user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), wm.workspace_id)) WHERE …` |
| `skill_registry_safe` | `SELECT sr.id, sr.name, sr.slug, sr.description, sr.category, sr.author, sr.version, sr.tags, sr.install_count, sr.rating, sr.skill_config, sr.is_verified, sr.is_public, sr.created_by, sr.created_at, sr.updated_at, CASE WHEN sr.created_by = auth.uid() THEN sr.mcp_server_url ELSE NULL END AS mcp_serve …` |
| `workspace_members_directory` | `SELECT wm.id, wm.workspace_id, wm.user_id, wm.role, wm.name, wme.email, wm.accepted_at FROM public.workspace_members wm LEFT JOIN public.workspace_member_emails wme ON wme.member_id = wm.id AND (wme.user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), wm.workspace_id)) WHERE wm.workspace_id …` |
| `forum_threads_public` | `SELECT id, help_center_id, title, body, category, author_name, is_pinned, is_locked, is_resolved, view_count, reply_count, upvotes, last_activity_at, created_at FROM public.forum_threads` |
| `forum_posts_public` | `SELECT id, thread_id, parent_post_id, body, author_name, is_answer, upvotes, created_at, updated_at FROM public.forum_posts` |
| `slo_metrics_hourly` | `SELECT date_trunc('hour', created_at) AS bucket_hour, user_id, agent_id, COUNT(*) AS total_traces, COUNT(*) FILTER (WHERE level = 'error') AS error_count, CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE level <> 'error'))::numeric / COUNT(*) * 100, 2) ELSE 100 END AS success_rate, COALESCE …` |
| `forum_threads_safe` | `SELECT id, help_center_id, author_id, CASE WHEN author_name ~* '@' THEN 'Membro' ELSE author_name END AS author_name, title, body, category, is_pinned, is_locked, is_resolved, view_count, reply_count, upvotes, last_activity_at, created_at FROM public.forum_threads` |
| `forum_posts_safe` | `SELECT id, thread_id, author_id, CASE WHEN author_name ~* '@' THEN 'Membro' ELSE author_name END AS author_name, body, is_answer, upvotes, parent_post_id, created_at, updated_at FROM public.forum_posts` |
| `oncall_schedule_safe` | `SELECT os.id, os.workspace_id, os.user_id, os.user_name, os.starts_at, os.ends_at, os.escalation_order, os.notes, os.created_by, os.created_at, oce.user_email FROM public.oncall_schedule os LEFT JOIN public.oncall_schedule_emails oce ON oce.schedule_id = os.id AND (oce.user_id = auth.uid() OR public …` |
| `workspace_members_public` | `SELECT id, workspace_id, user_id, role, name FROM public.workspace_members` |
| `usage_records_cost_safe` | `SELECT ur.id, ur.workspace_id, ur.agent_id, ur.record_type, ur.tokens, ur.created_at, CASE WHEN public.is_workspace_admin(auth.uid(), ur.workspace_id) THEN ur.cost_usd ELSE NULL END AS cost_usd, CASE WHEN public.is_workspace_admin(auth.uid(), ur.workspace_id) THEN ur.metadata ELSE '{}'::jsonb END AS …` |
| `agent_daily_metrics` | `SELECT m.* FROM internal.agent_daily_metrics m WHERE EXISTS ( SELECT 1 FROM public.agents a WHERE a.id = m.agent_id )` |
| `internal.agent_daily_metrics` | `SELECT agent_id, date_trunc('day', created_at) AS day, count(*)::bigint AS executions, count(*) FILTER (WHERE level = 'error')::bigint AS errors, avg(latency_ms)::numeric(12,2) AS avg_latency_ms, percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric(12,2) AS p95_latency_ms, sum(tokens_us …` |
| `internal.index_audit_report` | `WITH latest AS ( SELECT DISTINCT ON (schemaname, relname, indexrelname) * FROM internal.index_usage_snapshots ORDER BY schemaname, relname, indexrelname, captured_at DESC ), first_seen AS ( SELECT schemaname, relname, indexrelname, min(captured_at) AS first_captured FROM internal.index_usage_snapsho …` |
| `internal.write_amplification_report` | `WITH latest_tbl AS ( SELECT DISTINCT ON (schemaname, relname) * FROM internal.table_activity_snapshots ORDER BY schemaname, relname, captured_at DESC ), prev_tbl AS ( SELECT DISTINCT ON (schemaname, relname) * FROM internal.table_activity_snapshots WHERE captured_at < now() - interval '20 hours' ORD …` |
| `llm_cost_by_caller` | `SELECT ur.workspace_id, COALESCE(NULLIF(ur.metadata->>'caller',''), 'external') AS caller, COALESCE(ur.metadata->>'provider', 'unknown') AS provider, COALESCE(ur.metadata->>'model', 'unknown') AS model, date_trunc('day', ur.created_at) AS day, COUNT(*) AS calls, SUM(ur.tokens)::bigint AS tokens, SUM …` |
| `knowledge_graph_health` | `WITH ent AS ( SELECT workspace_id, id, entity_type, updated_at, properties FROM public.knowledge_entities WHERE workspace_id IS NOT NULL ), rel AS ( SELECT ke.workspace_id, kr.source_id, kr.target_id FROM public.knowledge_relations kr JOIN public.knowledge_entities ke ON ke.id = kr.source_id WHERE k …` |
| `knowledge_graph_health_v` | `SELECT h.* FROM public.knowledge_graph_health h WHERE EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = h.workspace_id AND wm.user_id = auth.uid() )` |
| `slack_dispatch_health` | `SELECT workspace_id, COALESCE(SUM((metadata->>'successes')::int), 0)::bigint AS successes, COALESCE(SUM((metadata->>'failures')::int), 0)::bigint AS failures, COUNT(*)::bigint AS total_dispatches, MAX(created_at) AS last_dispatch_at FROM public.audit_events WHERE event_type = 'slack_integration' AND …` |
| `slack_dlq_stats` | `SELECT workspace_id, COUNT(*) FILTER (WHERE resolved_at IS NULL AND attempts < 5) AS pending, COUNT(*) FILTER (WHERE resolved_at IS NULL AND attempts >= 5) AS dead, COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved, MAX(created_at) FILTER (WHERE resolved_at IS NULL) AS oldest_pending_at, M …` |
| `_audit_security_definer` | `SELECT p.proname AS function_name, n.nspname AS schema, pg_get_functiondef(p.oid) LIKE '%SET search_path%' AS has_search_path, NOT (pg_get_functiondef(p.oid) LIKE '%SET search_path%') AND p.prokind = 'f' AS needs_review, obj_description(p.oid, 'pg_proc') AS comment, array_to_string( NULLIF(current_s …` |
| `_audit_rls_automation` | `SELECT schemaname, tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename IN ( 'cron_schedules','cron_schedule_executions','webhook_endpoints','webhook_events', 'dead_letter_queue','notifications','notification_templates','automation_templates', 'installed_templates',' …` |

### G.3 Funções de cálculo/decisão no código

- **computeReadiness(agent: AgentConfig)** — `src/components/agent-builder/modules/ReadinessModule.tsx`
  ```
  const categories: ReadinessScore['categories'] = {}; const blockers: string[] = []; const recommendations: { label: string; tabId: string }[] = []; // Identity (max 10) const identityItems: ReadinessItem[] = [ { label: 'Nome definido', passed: !!agent.name, weight: 3, is_blocker: false }, { label: 'Missão definida', passed: !!agent.mission, weight: 3, is_blocker: false }, { label: 'Persona selecionada', passed: !!agent.persona, weight: 2, is_blocker: false }, { label: 'Escopo definido (>50 chars …
  ```
- **applyBatch(idsToAdd: string[], idsToRemove: string[])** — `src/components/agent-builder/modules/SkillsModule.tsx`
  ```
  if (idsToAdd.length === 0 && idsToRemove.length === 0) return; if (!agentId) return; for (const id of [...idsToAdd, ...idsToRemove]) setBusy(id, true); try { let installedCount = 0; let skippedCount = 0; if (idsToAdd.length > 0) { const res = await bulkInstallSkills(agentId, idsToAdd); installedCount = res.installed.length; skippedCount = res.skipped.length; } if (idsToRemove.length > 0) await bulkUninstallSkills(agentId, idsToRemove); await refresh(); const parts: string[] = []; if (installedCo …
  ```
- **applyTemplate(t: AgentTemplate)** — `src/components/agents/CreateAgentWizard.tsx`
  ```
  // Map template model to wizard allowed models const modelMap: Record<string, string> = { 'claude-sonnet-4-6': 'claude-3.5-sonnet', 'claude-haiku-4-5-20251001': 'claude-3.5-sonnet', 'claude-opus-4.6': 'claude-3-opus', }; const mappedModel = modelMap[t.model] || 'gpt-4o'; setMode('quick'); setMagicPreview({ name: t.name, emoji: t.emoji, mission: t.description, type: t.type, model: mappedModel, system_prompt: t.prompt.includes('## Persona') ? t.prompt : `## Persona\n${t.prompt}\n\n## Escopo\nAtuar …
  ```
- **aplicarNovidades()** — `src/components/agents/RecentCurationsPanel.tsx`
  ```
  const t = Date.now(); setDestaques(beginHighlight(pendentesDoFiltro, t)); setAgora(t); // Zera só a aba atualizada: as outras guardam novidades ainda não vistas. setPendentes((atual) => clearPendingForFilter(atual, filtro)); queryClient.invalidateQueries({ queryKey: ['recent_curations'] }); queryClient.invalidateQueries({ queryKey: ['template_skill_links'] });
  ```
- **invalidate()** — `src/components/agents/TemplateLinkedSkillsPanel.tsx`
  ```
  
  ```
- **computeDeltas(a: Version, b: Version)** — `src/components/agents/VersionDiffDialog.tsx`
  ```
  const ca = getCfg(a) as CfgShape; const cb = getCfg(b) as CfgShape; const out: Delta[] = []; if (a.model !== b.model) out.push({ label: 'Modelo', from: a.model || '—', to: b.model || '—' }); const num = (v: unknown): string | number => (typeof v === 'number' ? v : '—'); const ta = ca.temperature, tb = cb.temperature; if (ta !== tb && (ta !== undefined || tb !== undefined)) out.push({ label: 'Temperature', from: num(ta), to: num(tb) }); const ma = ca.max_tokens, mb = cb.max_tokens; if (ma !== mb …
  ```
- **applyPreset(preset: Exclude<RiskPreset, 'custom'>)** — `src/components/agents/detail/RestoreDiffPreview.tsx`
  ```
  setActiveRisks(new Set(PRESET_SETS[preset]));
  ```
- **invalidate()** — `src/components/agents/detail/RestorePresetMenu.tsx`
  ```
  qc.invalidateQueries({ queryKey: ['restore-field-presets'] });
  ```
- **computeSLO(traces: AgentTrace[])** — `src/components/agents/detail/agentMetricsHelpers.ts`
  ```
  const lat = traces.map((t) => Number(t.latency_ms ?? 0)).filter((n) => n > 0); const total = traces.length; const errors = traces.filter((t) => t.level === 'error' || t.level === 'critical').length; const warnings = traces.filter((t) => t.level === 'warning' || t.level === 'warn').length; const success = total - errors; const totalCost = traces.reduce((s, t) => s + Number(t.cost_usd ?? 0), 0); const totalTokens = traces.reduce((s, t) => s + Number(t.tokens_used ?? 0), 0); return { totalTraces: t …
  ```
- **computeBudgetBurn(slo: SLOMetrics, errorBudgetPct: number,)** — `src/components/agents/detail/agentMetricsHelpers.ts`
  ```
  consumedPct: number; daysToExhaustion: number | null; status: 'healthy' | 'warning' | 'critical'
  ```
- **scorePrompt(beforeLen: number, afterLen: number)** — `src/components/agents/detail/restoreDiffHelpers.ts`
  ```
  impact: number; reason: string; criteria: RiskCriterion[]
  ```
- **computeRestoreDiff(current: AgentVersion | null | undefined, source: AgentVersion, options: { copyPrompt: boolean; copyTools: boolean; copy)** — `src/components/agents/detail/restoreDiffHelpers.ts`
  ```
  const cur = current ?? source; const cfgCur = cfg(cur); const cfgSrc = cfg(source); const changes: FieldChange[] = []; const unchangedGroups: Array<'prompt' | 'tools' | 'model'> = []; // criteria é opcional na entrada — preenchido com [] se ausente, para // manter compat com call-sites simples (mission/persona/params). const push = (c: Omit<FieldChange, 'risk' | 'criteria'> & { risk?: RiskLevel; criteria?: RiskCriterion[] }) => { changes.push({ ...c, criteria: c.criteria ?? [{ label: c.reason, p …
  ```
- **validateRestore(current: AgentVersion | null | undefined, source: AgentVersion | null | undefined, options: { copyPrompt: boolean; copyT)** — `src/components/agents/detail/restoreValidation.ts`
  ```
  const issues: ValidationIssue[] = []; if (!source) { issues.push({ id: 'no-source', severity: 'error', group: 'general', title: 'Versão de origem ausente', detail: 'Não há uma versão anterior para restaurar.', }); return finalize(issues); } const anySelected = options.copyPrompt || options.copyTools || options.copyModel; if (!anySelected) { issues.push({ id: 'no-fields', severity: 'error', group: 'general', title: 'Nenhum campo selecionado', detail: 'Marque ao menos um grupo (Prompt, Ferramentas …
  ```
- **generateSLOReportPdf(input: SLOReportInput)** — `src/components/agents/detail/sloReportPdf.ts`
  ```
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }); const pageW = doc.internal.pageSize.getWidth(); const pageH = doc.internal.pageSize.getHeight(); const M = 40; let y = M; const setColor = (rgb: [number, number, number]) => doc.setTextColor(rgb[0], rgb[1], rgb[2]); const setFill = (rgb: [number, number, number]) => doc.setFillColor(rgb[0], rgb[1], rgb[2]); const setDraw = (rgb: [number, number, number]) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]); const ensureSpace = (needed: number) => { if …
  ```
- **shouldSkipClearConfirm()** — `src/components/agents/traces/ClearFiltersConfirm.tsx`
  ```
  try { return sessionStorage.getItem(BYPASS_KEY) === '1'; } catch { return false; }
  ```
- **computeLineDiff(before: string, after: string)** — `src/components/agents/versioning/RestoreVersionDialog.tsx`
  ```
  const a = before.split('\n'); const b = after.split('\n'); const m = a.length; const n = b.length; // Build LCS length matrix const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0)); for (let i = m - 1; i >= 0; i--) { for (let j = n - 1; j >= 0; j--) { dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]); } } const out: DiffLine[] = []; let i = 0, j = 0; while (i < m && j < n) { if (a[i] === b[j]) { out.push({ kind: 'context', text: …
  ```
- **validateDraftName(value: string)** — `src/components/agents/wizard/DraftRecoveryBanner.tsx`
  ```
  const r = quickIdentitySchema.shape.name.safeParse(value.trim()); return r.success ? null : (r.error.errors[0]?.message ?? 'Nome inválido');
  ```
- **applyTemplate(type: QuickAgentType)** — `src/components/agents/wizard/QuickCreateWizard.tsx`
  ```
  const t = QUICK_AGENT_TEMPLATES[type]; setForm((prev) => ({ ...prev, type, name: prev.name || t.suggestedName, emoji: t.emoji, mission: prev.mission || t.mission, description: prev.description || t.description, model: t.recommendedModel, prompt: t.systemPrompt, })); if (promptCustomLocked) { pushLockEvent('unlocked-template', `template "${t.suggestedName}"`); } setPromptCustomLocked(false); setSelectedVariant(null); toast.success(`Template "${t.suggestedName}" aplicado`, { description: 'Nome, mi …
  ```
- **validateStep(idx: number)** — `src/components/agents/wizard/QuickCreateWizard.tsx`
  ```
  const def = STEPS[idx]; const result = def.schema.safeParse(form); if (result.success) { setErrors((prev) => { const next = { ...prev }; def.fields.forEach((f) => { delete next[f as keyof QuickAgentForm]; }); return next; }); return true; } const newErrors: Partial<Record<keyof QuickAgentForm, string>> = {}; result.error.errors.forEach((e) => { const path = e.path[0] as keyof QuickAgentForm | undefined; if (path) newErrors[path] = e.message; }); setErrors((prev) => ({ ...prev, ...newErrors })); …
  ```
- **computeResumeTarget(form: QuickAgentForm, steps: ReadonlyArray<ResumeStepDef>,)** — `src/components/agents/wizard/draftStore.ts`
  ```
  for (let i = 0; i < steps.length; i++) { const s = steps[i]; const r = s.schema.safeParse(form); if (r.success) continue; const issue = r.error?.errors?.[0]; const path = issue?.path?.[0]; let field = typeof path === 'string' ? (path as keyof QuickAgentForm) : undefined; if (!field) { const empty = s.fields.find((fname) => { const v = form[fname as keyof QuickAgentForm]; if (typeof v === 'string') return v.trim().length === 0; return v == null; }); field = (empty ?? s.fields[0]) as keyof QuickAg …
  ```
- **applyFromPreview()** — `src/components/agents/wizard/quickSteps/PromptAutoFixPanel.tsx`
  ```
  if (preview.result) { onApply(preview.result.fixed, preview.result.summary); } setPreview({ open: false, title: '', result: null });
  ```
- **applyAndRecord(fixedPrompt: string, summary: string)** — `src/components/agents/wizard/quickSteps/PromptContradictionAutoFixPanel.tsx`
  ```
  setLastApplied({ previousPrompt: prompt, appliedPrompt: fixedPrompt, summary, appliedAt: Date.now(), }); onApply(fixedPrompt, summary);
  ```
- **applyFromPreview()** — `src/components/agents/wizard/quickSteps/PromptContradictionAutoFixPanel.tsx`
  ```
  applyAndRecord(preview.fixedPrompt, preview.summary); closePreview();
  ```
- **computeUsage(prompt: string)** — `src/components/agents/wizard/quickSteps/PromptSectionUsage.tsx`
  ```
  { const locations = locateSections(prompt); const totalChars = prompt.length; const limit = PROMPT_LIMITS.MAX_TOTAL; let sectionsSum = 0; let topKey: PromptSectionKey | null = null; let topChars = 0; const allSuggestions: ReductionSuggestion[] = []; const sectionRows: SectionUsage[] = locations.map((loc) => { if (loc.status === 'missing') { return { key: loc.key, label: loc.label, status: loc.s
  ```
- **generateComparisonData(data: Record<string, unknown>[], dataKeys: string[], offset?: number,)** — `src/components/charts/ComparisonToggle.tsx`
  ```
  const shift = offset ?? Math.floor(data.length / 2); return data.map((d, i) => { const prev = data[i - shift]; const entry = { ...d }; for (const key of dataKeys) { entry[`prev_${key}`] = prev ? Number(prev[key]) || 0 : null; } return entry; });
  ```
- **invalidate()** — `src/components/crm/CadenceStepsEditor.tsx`
  ```
  
  ```
- **generateJSON()** — `src/components/evaluations/AuditReportDialog.tsx`
  ```
  const data = { run_metadata: run, results: results.map((r) => ({ input: r.input, expected: r.expected, actual: r.actual, score: r.score, passed: r.passed, latency: r.latency_ms, reasoning: r.judge_reasoning, })), }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `audit-report-${run.id.slice(0, 8)}.json`; a.click(); URL.revokeObjectURL(url); toast.success …
  ```
- **generatePDF()** — `src/components/evaluations/AuditReportDialog.tsx`
  ```
  setExporting(true); // Em um sistema real, usaríamos jspdf ou similar. // Aqui simularemos a geração de um relatório formatado para impressão. setTimeout(() => { window.print(); setExporting(false); toast.success('Relatório gerado para impressão'); }, 1000);
  ```
- **scoreTone(total: number)** — `src/components/metrics/KnowledgeGraphHealthCard.tsx`
  ```
  if (total >= 80) return "text-success"; if (total >= 60) return "text-warning"; return "text-destructive";
  ```
- **applyBatch(refs: readonly NamedSkillRef[], acknowledged: boolean)** — `src/components/skills/SkillAutoRecommendationsPanel.tsx`
  ```
  if (!agentId || refs.length === 0) return; setInstallingAll(true); try { const ids = refs.map((r) => r.id); const { installed: ok, skipped } = await bulkInstallSkills(agentId, ids); await queryClient.invalidateQueries({ queryKey: ['installed_skills', agentId] }); const record = buildInstallCapRecord({ agentId, agentName: activeAgent?.name ?? '', installed: installedRefs, selected: refs, guard: evaluateInstallImpact({ installed: installedRefs, selected: refs }), acknowledged, }); if (shouldAuditI …
  ```
- **invalidate()** — `src/components/skills/SkillLibraryInstallPanel.tsx`
  ```
  void queryClient.invalidateQueries({ queryKey: ['skill_library_installed', agentId] }); void queryClient.invalidateQueries({ queryKey: ['skill_library_overview'] });
  ```
- **updateValidation(id: string, patch: Partial<SkillInput['validation']>)** — `src/components/skills/composer/InputsBuilder.tsx`
  ```
  onChange( inputs.map((i) => i.id === id ? { ...i, validation: { ...i.validation, ...patch } } : i, ), );
  ```
- **applyAll(resolution: Resolution)** — `src/components/super-cerebro/notebook/ConflictResolver.tsx`
  ```
  const next = new Map<string, ResolvedConflict>(); for (const c of conflicts) { const loc = localMap.get(c.id); const inc = incomingMap.get(c.id); next.set(c.id, { id: c.id, resolution, mergedBody: resolution === "merge" && loc && inc ? mergeBodies(loc.body_md, inc.body_md) : undefined, }); } setResolutions(next); onChange(next);
  ```
- **apply()** — `src/components/super-cerebro/notebook/E2EESyncPanel.tsx`
  ```
  if (!incoming || !plan) return; setBusy(true); try { // Aplica resoluções de conflito: "incoming" e "merge" viram overwrite. // Para "merge", substituímos o body_md da nota incoming pelo body mesclado. const overwriteIds = new Set<string>(); const patched: BundlePayload = { ...incoming, notes: incoming.notes.map((n) => { const r = resolutions.get(n.id); if (!r || r.resolution === "local") return n; overwriteIds.add(n.id); if (r.resolution === "merge" && r.mergedBody !== undefined) { return { ... …
  ```
- **convert(hit: Hit)** — `src/components/super-cerebro/notebook/UnlinkedMentions.tsx`
  ```
  const src = notes.find((n) => n.id === hit.sourceId); if (!src || !note) return; setConverting(`${hit.sourceId}:${hit.matchStart}`); try { const before = src.body_md.slice(0, hit.matchStart); const after = src.body_md.slice(hit.matchEnd); const replacement = `[[${note.title}]]`; const nextBody = before + replacement + after; await update.mutateAsync({ id: src.id, patch: { body_md: nextBody }, syncLinks: true, }); toast.success(`Convertido em wikilink na nota "${src.title}"`); } catch (e) { toast …
  ```
- **validateEnv()** — `src/config/env.ts`
  ```
  try { return { SUPABASE_URL: getEnvVar('VITE_SUPABASE_URL'), SUPABASE_ANON_KEY: getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY'), SUPABASE_PROJECT_ID: getEnvVar('VITE_SUPABASE_PROJECT_ID', 'qdlnzopxrlsoljcrcmzv'), }; } catch (error) { if (import.meta.env.DEV) { logger.error('🔴 Environment validation failed:', (error as Error).message); logger.error(' Check your .env file or Lovable environment settings.'); } throw error; }
  ```
- **computeVariantStats(runs: ExperimentRun[], variant: ExperimentVariant)** — `src/hooks/useAgentExperiments.ts`
  ```
  const filtered = runs.filter((r) => r.variant === variant); if (filtered.length === 0) { return { runs: 0, avgLatency: 0, avgCost: 0, avgScore: 0, totalTokens: 0 }; } const latencies = filtered.filter((r) => r.latency_ms != null).map((r) => r.latency_ms ?? 0); const costs = filtered.map((r) => Number(r.cost_usd) || 0); const scores = filtered.filter((r) => r.score != null).map((r) => Number(r.score)); const tokens = filtered.reduce((s, r) => s + (r.tokens_input || 0) + (r.tokens_output || 0), 0) …
  ```
- **calculate()** — `src/hooks/useCostEstimate.ts`
  ```
  const sysTokens = estimateTokens(input.systemPrompt ?? ''); const userTokens = estimateTokens(input.userInput ?? ''); const toolsOverhead = (input.toolsCount ?? 0) * 50; const inputTokens = sysTokens + userTokens + toolsOverhead; const outputTokens = Math.max(100, Math.floor((input.maxTokens ?? 1000) * 0.6)); const model = input.model || 'google/gemini-2.5-flash'; setResult(prev => ({ ...prev, loading: true })); try { const { data, error } = await supabase.functions.invoke('cost-calculator', { b …
  ```
- **shouldRefreshCurationFeed(evento: CurationRealtimeEvent, filtro: CurationFeedFilter,)** — `src/hooks/useCurationRealtime.ts`
  ```
  const lados = [evento.new, evento.old].filter((lado): lado is CurationRealtimeRow => Boolean(lado), ); if (lados.length === 0) return false; // DELETE físico só traz `old`; INSERT só traz `new`. Ambos são válidos. const manual = lados.some((lado) => lado.origin === 'manual'); if (!manual) return false; const identificavel = lados.some((lado) => Boolean(lado.template_id && lado.skill_id)); if (!identificavel) return false; if (filtro === 'unlinked') return lados.some((lado) => Boolean(lado.delete …
  ```
- **applyCurationPendingEvent(pendentes: ReadonlySet<string>, evento: CurationRealtimeEvent, filtro: CurationFeedFilter,)** — `src/hooks/useCurationRealtime.ts`
  ```
  if (!shouldRefreshCurationFeed(evento, filtro)) return pendentes; const chave = chaveDoEvento(evento); if (!chave) return pendentes; if (pendentes.has(chave)) return pendentes; // Saturado: o rótulo já mostra "99+", contar mais não muda a tela. if (pendentes.size >= CURATION_PENDING_CAP) return pendentes; const proximo = new Set(pendentes); proximo.add(chave); return proximo;
  ```
- **applyCurationPendingEventByFilter(estado: CurationPendingByFilter, evento: CurationRealtimeEvent,)** — `src/hooks/useCurationRealtime.ts`
  ```
  let mudou = false; const proximo: Record<CurationFeedFilter, ReadonlySet<string>> = { ...estado }; for (const filtro of CURATION_FILTERS) { const atualizado = applyCurationPendingEvent(estado[filtro], evento, filtro); if (atualizado !== estado[filtro]) { proximo[filtro] = atualizado; mudou = true; } } return mudou ? proximo : estado;
  ```
- **generateChangelog(prev: VersionLike, next: VersionLike)** — `src/lib/agentChangelog.ts`
  ```
  const out: ChangelogEntry[] = []; const cprev = getCfg(prev); const cnext = getCfg(next); // Top-level scalars if ((prev.model ?? null) !== (next.model ?? null)) { out.push({ kind: 'modified', label: 'Modelo', from: prev.model ?? '—', to: next.model ?? '—' }); } if ((prev.persona ?? null) !== (next.persona ?? null)) { out.push({ kind: 'modified', label: 'Persona', from: prev.persona ?? '—', to: next.persona ?? '—' }); } if ((prev.mission ?? null) !== (next.mission ?? null)) { out.push({ kind: 'm …
  ```
- **validateImportedAgent(data: DbRow)** — `src/lib/agentExportImport.ts`
  ```
  if (!data || typeof data !== 'object') return null; const d = data as Record<string, unknown>; if (d._format !== 'nexus-agent-v1') return null; if (typeof d.name !== 'string' || !d.name.trim()) return null; return d as unknown as ExportedAgent;
  ```
- **computeReadinessScore(agent: AgentConfig)** — `src/lib/agentReadiness.ts`
  ```
  const checks: ReadinessCheck[] = [ { id: 'name', label: 'Nome do agente definido', passed: !!agent.name?.trim(), tabId: 'identity', }, { id: 'mission', label: 'Missão descrita', passed: !!agent.mission && agent.mission.length >= 20, tabId: 'identity', }, { id: 'persona', label: 'Persona configurada', passed: !!agent.persona, tabId: 'identity' }, { id: 'model', label: 'Modelo selecionado', passed: !!agent.model, tabId: 'brain' }, { id: 'system_prompt', label: 'System prompt ≥ 200 caracteres', pas …
  ```
- **computeMetric(metric: AlertMetric, agg: AlertAggregation, traces: AgentTraceRow[],)** — `src/lib/alertMetrics.ts`
  ```
  if (traces.length === 0) return 0; switch (metric) { case 'latency_ms': { const vals = traces.map((t) => t.latency_ms ?? 0).filter((v) => v > 0); if (vals.length === 0) return 0; if (agg === 'avg') return vals.reduce((s, v) => s + v, 0) / vals.length; if (agg === 'max') return Math.max(...vals); if (agg === 'p99') return percentile(vals, 99); return percentile(vals, 95); } case 'cost_per_exec': { const bySession = new Map<string, number>(); for (const t of traces) { const key = t.session_id ?? t …
  ```
- **validateCitations(text: string, citations: CerebroCitation[], opts: { max?: number } = {},)** — `src/lib/citationValidation.ts`
  ```
  const max = opts.max ?? MAX_CITATIONS; const issues: CitationIssue[] = []; const referenced = extractMarkerNumbers(text); const referencedSet = new Set(referenced); if (citations.length > max) { issues.push({ code: 'too_many', message: `Citations excedem o máximo permitido (${citations.length}/${max}).`, }); } const byN = new Map<number, CerebroCitation>(); const chunkSeen = new Map<string, number>(); for (const c of citations) { if (!c || typeof c.n !== 'number') { issues.push({ code: 'missing_ …
  ```
- **computeLineDiff(a: string[], b: string[])** — `src/lib/lineDiff.ts`
  ```
  const n = a.length; const m = b.length; const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0)); for (let i = n - 1; i >= 0; i--) { for (let j = m - 1; j >= 0; j--) { dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]); } } const out: DiffLine[] = []; let i = 0; let j = 0; while (i < n && j < m) { if (a[i] === b[j]) { out.push({ kind: "same", text: a[i], aLine: i + 1, bLine: j + 1 }); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1 …
  ```
- **calculateCostOnBackend(model: string, inputTokens: number, outputTokens: number)** — `src/lib/llmPricing.ts`
  ```
  const { data, error } = await supabase.functions.invoke('cost-calculator', { body: { model, inputTokens, outputTokens } }); if (error) throw error; return data;
  ```
- **shouldLog(level: LogLevel)** — `src/lib/logger.ts`
  ```
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
  ```
- **computeMaturity(rows: AgentDailyMetricWithName[])** — `src/lib/maturityScore.ts`
  ```
  const executions = rows.reduce((s, r) => s + r.executions, 0); const errors = rows.reduce((s, r) => s + r.errors, 0); const totalCost = rows.reduce((s, r) => s + r.total_cost_usd, 0); const p95Latency = rows.length ? Math.max(...rows.map((r) => r.p95_latency_ms || 0)) : 0; const errorRate = executions > 0 ? errors / executions : 0; const costPerExec = executions > 0 ? totalCost / executions : 0; const daysActive = new Set(rows.filter((r) => r.executions > 0).map((r) => r.day.slice(0, 10))).size; …
  ```
- **applyAllFixes(prompt: string)** — `src/lib/promptAutoFixers.ts`
  ```
  const original = prompt; let current = prompt; const allAffected = new Set<number>(); const parts: string[] = []; for (const fixer of [fixInvisibleChars, fixEmptyBlocks, fixLongLines, fixExceedsCharLimit]) { const r = fixer(current); if (r.fixed !== current) { current = r.fixed; r.affectedLines.forEach((l) => allAffected.add(l)); parts.push(r.summary); } } if (current === original) { return emptyResult('invisible', prompt); } const removedChars = original.length - current.length; const removedLi …
  ```
- **invalidateSignedUrl(bucket: string, path: string)** — `src/lib/signedUrlCache.ts`
  ```
  cache.delete(makeKey(bucket, path));
  ```
- **invalidateSignedUrlForDocument(documentId: string)** — `src/lib/signedUrlCache.ts`
  ```
  try { const { data, error } = await supabaseExternal .from('documents') .select('metadata') .eq('id', documentId) .maybeSingle(); if (error || !data) return; const md = (data.metadata ?? {}) as { storage_path?: string; bucket?: string }; if (!md.storage_path) return; invalidateSignedUrl(md.bucket ?? 'knowledge-uploads', md.storage_path); docMetaCache.delete(documentId); } catch (e) { logger.error('signed_url_cache.invalidate_by_doc_failed', { documentId, error: e }); }
  ```
- **applyTemplate(input: string, ctx: TemplateContext = {})** — `src/lib/templateEngine.ts`
  ```
  const now = ctx.now ?? new Date(); const map: Record<string, string> = { date: formatDate(now), datetime: `${formatDate(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`, time: `${pad(now.getHours())}:${pad(now.getMinutes())}`, year: String(now.getFullYear()), month: pad(now.getMonth() + 1), day: pad(now.getDate()), weekday: WEEKDAYS_PT[now.getDay()] ?? "", title: ctx.title ?? "", user: ctx.user ?? "", }; return input.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) => { const k = key …
  ```
- **computeTier(relevance: number, pinned = false)** — `src/lib/memory/tiers.ts`
  ```
  if (pinned) return "core"; if (!Number.isFinite(relevance) || relevance < 0) return "archive"; if (relevance >= 3.0) return "core"; if (relevance >= 1.5) return "active"; if (relevance >= 0.5) return "warm"; if (relevance >= 0.1) return "cold"; return "archive";
  ```
- **eligibilityReason(candidate: EnrichCandidate)** — `src/lib/skills/descriptionEnrichment.ts`
  ```
  // Só automatizamos o que foi importado. Skills criadas na plataforma têm dono // humano — gerar texto por cima seria a automação opinando sobre autoria. if (!candidate.sourceRepo && !candidate.sourceUrl) return 'nao_importada'; if (candidate.descriptionSource === 'humano') return 'descricao_humana'; if (!isDescriptionEmpty(candidate.description)) return 'ja_descrita'; return null;
  ```
- **isEligible(candidate: EnrichCandidate)** — `src/lib/skills/descriptionEnrichment.ts`
  ```
  return eligibilityReason(candidate) === null;
  ```
- **selectEligible(candidates: readonly EnrichCandidate[])** — `src/lib/skills/descriptionEnrichment.ts`
  ```
  return candidates.filter(isEligible);
  ```
- **shouldAuditInstall(record: InstallCapAuditRecord)** — `src/lib/skills/installCapAudit.ts`
  ```
  return record.additionalDropped > 0 || record.crossesCap || record.totalDroppedAfter > 0;
  ```
- **computeBackoff(attempt: number, baseMs: number, capMs: number, random: ()** — `src/lib/skills/llmClassificationQueue.ts`
  ```
  number,
  ```
- **validateAgentVersion(agent: AgentConfig, meta: { label: string; note?: string },)** — `src/lib/validations/agentVersionValidator.ts`
  ```
  const errors: VersionValidationIssue[] = []; const warnings: VersionValidationIssue[] = []; // ─── Label ─────────────────────────────────────────────── const labelTrim = (meta.label ?? '').trim(); if (labelTrim.length > 0 && labelTrim.length < VERSION_LIMITS.LABEL_MIN) { errors.push({ level: 'error', code: 'label.too_short', field: 'label', message: `Título do rascunho precisa de ao menos ${VERSION_LIMITS.LABEL_MIN} caracteres (atual: ${labelTrim.length}).`, }); } if (labelTrim.length > VERSION …
  ```
- **applyAllContradictionFixes(prompt: string)** — `src/lib/validations/contradictionSuggestions.ts`
  ```
  fixedPrompt: string; resolved: number;
  ```
- **validateResearchConfig(draft: unknown,)** — `src/lib/validations/researchConfig.ts`
  ```
  success: true; data: ResearchConfigParsed
  ```
- **ComputerUsePage()** — `src/pages/ComputerUsePage.tsx`
  ```
  const [task, setTask] = useState(""); const [running, setRunning] = useState(false); const [actions, setActions] = useState<Action[]>([]); const [model] = useState("claude-3-5-sonnet"); const [currentThought, setCurrentThought] = useState(""); const [cursorPos, setCursorPos] = useState({ x: 50, y: 50 }); const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null); const scrollRef = useRef<HTMLDivElement>(null); useEffect(() => { if (scrollRef.current) { scrollRef.current.scrollTop = …
  ```
- **applyTemplate(tplId: string)** — `src/pages/DRDrillsPage.tsx`
  ```
  const tpl = DR_TEMPLATES.find((t) => t.id === tplId); if (!tpl) return; setForm({ name: tpl.name, description: tpl.description, scope: tpl.scope, target_tables: tpl.target_tables.join(","), rto_target_seconds: tpl.rto_target_seconds, rpo_target_seconds: tpl.rpo_target_seconds, });
  ```
- **scoreColor(score: number)** — `src/pages/RiskRegisterPage.tsx`
  ```
  if (score >= 20) return 'bg-nexus-danger/80 text-white'; if (score >= 12) return 'bg-nexus-danger/50 text-white'; if (score >= 6) return 'bg-nexus-warning/60 text-foreground'; return 'bg-nexus-success/40 text-foreground';
  ```
- **applyTemplate(tpl: typeof SECRET_TEMPLATES[number])** — `src/pages/SecretsRotationPage.tsx`
  ```
  setRegName(tpl.name); setRegCategory(tpl.category); setRegInterval(tpl.rotation_interval_days); if (tpl.provider) setRegProvider(tpl.provider);
  ```
- **generate()** — `src/pages/SyntheticDataPage.tsx`
  ```
  setRunning(true); setProgress(0); setGenerated([]); const samples = [ { prompt: "Como cancelo minha assinatura?", completion: "Para cancelar, acesse Configurações > Plano e clique em Cancelar." }, { prompt: "Qual o prazo de entrega?", completion: "O prazo padrão é de 5-7 dias úteis para todo Brasil." }, { prompt: "Como solicito reembolso?", completion: "Você pode solicitar em até 30 dias via central de ajuda." }, ]; for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 400)); setP …
  ```
- **ScoreInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number)** — `src/pages/VendorsPage.tsx`
  ```
  void }) {
  ```
- **applyPreset(p: typeof PRESETS[number])** — `src/pages/WidgetBuilderPage.tsx`
  ```
  setFromColor(p.from); setToColor(p.to); toast.success(`Tema "${p.label}" aplicado`);
  ```
- **validateAccess(workspaceId: string)** — `src/services/accessControlService.ts`
  ```
  const { data, error } = await supabase.functions.invoke("validate-access", { body: { workspace_id: workspaceId }, }); if (error) throw error; return data as { allowed: boolean; reason?: string; ip?: string; country?: string };
  ```
- **generateAgentCard(agent: AgentConfig, options?: { baseUrl?: string; provider?: AgentProvider; extraSkills?: AgentSkill[]; extraTags?: stri)** — `src/services/agentCardService.ts`
  ```
  const baseUrl = options?.baseUrl ?? NEXUS_BASE_URL; const provider = options?.provider ?? DEFAULT_PROVIDER; // Derive skills from agent tools const toolSkills: AgentSkill[] = (agent.tools ?? []).map((tool) => ({ id: `tool-${tool.name.toLowerCase().replace(/\s+/g, '-')}`, name: tool.name, description: tool.description ?? `Skill: ${tool.name}`, inputModes: ['text'], outputModes: ['text'], tags: ['tool'], })); // Add knowledge-based skills if RAG is configured const ragSkills: AgentSkill[] = (agent …
  ```
- **generateAgentCardJSON(agent: AgentConfig, options?: Parameters<typeof generateAgentCard>[1],)** — `src/services/agentCardService.ts`
  ```
  const card = generateAgentCard(agent, options); return JSON.stringify(card, null, 2);
  ```
- **generateAndSaveAgentCard(agentId: string, options?: Parameters<typeof generateAgentCard>[1],)** — `src/services/agentCardService.ts`
  ```
  const { data, error } = await fromTable('agent_configs') .select('*') .eq('id' as never, agentId) .single(); if (error) throw new Error(`Agent not found: ${error.message}`); const agent = data as unknown as AgentConfig; const card = generateAgentCard(agent, options); await saveAgentCard(agentId, card); return card;
  ```
- **validateAgentCard(card: Partial<AgentCard>)** — `src/services/agentCardService.ts`
  ```
  valid: boolean; errors: string[];
  ```
- **emptyTotals()** — `src/services/agentDayDetailsService.ts`
  ```
  return { traceCount: 0, totalCost: 0, totalTokens: 0, avgLatency: 0, errorCount: 0 };
  ```
- **applyView(rows: BaseRow[], view: BaseView)** — `src/services/basesService.ts`
  ```
  const filtered = rows.filter( (r) => !r.is_archived && view.filters.every((rule) => evalRule(r, rule)), ); if (!view.sortBy) return filtered; const dir = view.sortDir === "asc" ? 1 : -1; return [...filtered].sort((a, b) => cmp(getCell(a, view.sortBy!), String(getCell(b, view.sortBy!) ?? "")) * dir);
  ```
- **cancelSession(session_id: string)** — `src/services/browserAgentService.ts`
  ```
  const { data, error } = await supabase.functions.invoke("browser-session-cancel", { body: { session_id } }); if (error) throw error; return data;
  ```
- **generateReport(params: { workspaceId: string; frameworkCode: string; name: string; periodStart: string; periodEnd: string; })** — `src/services/complianceService.ts`
  ```
  const { data, error } = await supabase.rpc('generate_compliance_report', { _workspace_id: params.workspaceId, _framework_code: params.frameworkCode, _name: params.name, _period_start: params.periodStart, _period_end: params.periodEnd, }); if (error) throw error; return data as string;
  ```
- **generateTiers(content: string)** — `src/services/contextTiersService.ts`
  ```
  l0: string; l1: string
  ```
- **recomputeBaselines()** — `src/services/costAnomalyService.ts`
  ```
  const { error } = await supabase.rpc("compute_cost_baselines"); if (error) throw error;
  ```
- **calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number,)** — `src/services/costCalculatorService.ts`
  ```
  if (inputTokens < 0 || outputTokens < 0) { throw new Error('Token counts must be non-negative'); } const fullModel = model.includes('/') ? model : `${provider}/${model}`; try { const { data, error } = await supabase.functions.invoke('cost-calculator', { body: { model: fullModel, inputTokens, outputTokens, }, }); if (error) throw error; return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, inputCostUsd: data.breakdown.inputCost, outputCostUsd: data.breakdown.outputCost, tot …
  ```
- **calculateBudgetStatus(dailySpentUsd: number, monthlySpentUsd: number,)** — `src/services/costCalculatorService.ts`
  ```
  const dailyPercent = (dailySpentUsd / currentBudget.maxCostPerDayUsd) * 100; const monthlyPercent = (monthlySpentUsd / currentBudget.maxCostPerMonthUsd) * 100; return { dailySpentUsd, monthlySpentUsd, dailyBudgetUsd: currentBudget.maxCostPerDayUsd, monthlyBudgetUsd: currentBudget.maxCostPerMonthUsd, dailyPercent, monthlyPercent, isOverDailyBudget: dailySpentUsd > currentBudget.maxCostPerDayUsd, isOverMonthlyBudget: monthlySpentUsd > currentBudget.maxCostPerMonthUsd, shouldAlert: dailyPercent >= …
  ```
- **formatCurrency(value: number, currency = 'BRL')** — `src/services/crmService.ts`
  ```
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0, }).format(value);
  ```
- **computeTzOffset(tz: string, instant: Date)** — `src/services/cronSchedulerService.ts`
  ```
  if (tz === 'America/Sao_Paulo') { // BRT (standard): UTC-3 → offset = +3h; BRST (DST): UTC-2 → offset = +2h return getSaoPauloOffset(instant); } // Generic via Intl (works in browsers and Node — uses OS/ICU timezone database) try { const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, }); const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p. …
  ```
- **computeFileSha256(file: File)** — `src/services/documentIngestionService.ts`
  ```
  const buf = await file.arrayBuffer(); const digest = await crypto.subtle.digest('SHA-256', buf); return Array.from(new Uint8Array(digest)) .map((b) => b.toString(16).padStart(2, '0')) .join('');
  ```
- **applyReconciliation(incoming: BundlePayload, plan: ReconciliationPlan, workspaceId: string, opts: ApplyOptions = {},)** — `src/services/e2eeService.ts`
  ```
  inserted: number; updated: number; skipped: number
  ```
- **generateScenarios(opts: GenerateOptions)** — `src/services/e2eeSimulationService.ts`
  ```
  const { count, conflictWindowMs } = opts; const totalPct = opts.pctInsert + opts.pctUpdate + opts.pctKeep + opts.pctConflict; if (totalPct <= 0) return []; const nInsert = Math.round((opts.pctInsert / totalPct) * count); const nUpdate = Math.round((opts.pctUpdate / totalPct) * count); const nKeep = Math.round((opts.pctKeep / totalPct) * count); const nConflict = Math.max(0, count - nInsert - nUpdate - nKeep); const base = Date.now(); const out: ScenarioSpec[] = []; const bigOffset = conflictWind …
  ```
- **scoreDeterministic(expected: string, actual: string)** — `src/services/evaluationsService.ts`
  ```
  if (!expected || !actual) return 0; const weights: Array<{ score: number; weight: number }> = []; // 1. Case-insensitive containment (weak) const containsExpected = actual.toLowerCase().includes(expected.toLowerCase().substring(0, 200)); weights.push({ score: containsExpected ? 1 : 0, weight: 0.15 }); // 2. Normalized exact match (strong — strip whitespace, lowercase) const normExpected = expected.trim().toLowerCase().replace(/\s+/g, ' '); const normActual = actual.trim().toLowerCase().replace(/ …
  ```
- **scoreStatistical(expected: string, actual: string)** — `src/services/evaluationsService.ts`
  ```
  if (!expected || !actual) return 0; const expTokens = expected .toLowerCase() .split(/\s+/) .filter((w) => w.length > 1); const actTokens = actual .toLowerCase() .split(/\s+/) .filter((w) => w.length > 1); if (expTokens.length === 0 || actTokens.length === 0) return 0; // Compute LCS length (ROUGE-L) const lcsLen = lcsLength(expTokens, actTokens); const precision = lcsLen / actTokens.length; const recall = lcsLen / expTokens.length; // F1 of ROUGE-L const rougeL = precision + recall > 0 ? (2 * p …
  ```
- **computeDecayScore(ageDays: number, importance: number | null)** — `src/services/knowledgeDecayService.ts`
  ```
  score: number; level: DecayLevel;
  ```
- **rerankChunks(query: string, chunks: Record<string, unknown>[], options?: { topK?: number; knowledgeBaseId?: string },)** — `src/services/knowledgeService.ts`
  ```
  const { data: { session }, } = await supabase.auth.getSession(); if (!session) throw new Error('Not authenticated'); const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rag-rerank`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, }, body: JSON.stringify({ query, chunks, top_k: options?.topK || 5, knowledge_base_id: options?.knowledgeBaseId, }), }); if ( …
  ```
- **formatPrice(cents: number)** — `src/services/marketplaceService.ts`
  ```
  if (cents === 0) return 'Grátis'; return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  ```
- **computeLineDiff(a: string[], b: string[])** — `src/services/noteVersionsService.ts`
  ```
  const n = a.length; const m = b.length; const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0)); for (let i = n - 1; i >= 0; i--) { for (let j = m - 1; j >= 0; j--) { dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]); } } const out: DiffLine[] = []; let i = 0; let j = 0; while (i < n && j < m) { if (a[i] === b[j]) { out.push({ kind: "same", text: a[i] }); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: "remov …
  ```
- **generateFromIncident(incidentRunId: string)** — `src/services/postmortemService.ts`
  ```
  const { data, error } = await supabase.rpc("generate_postmortem_from_incident", { p_incident_run_id: incidentRunId, }); if (error) throw error; return data as string;
  ```
- **generateFromGameday(gameDayId: string)** — `src/services/postmortemService.ts`
  ```
  const { data, error } = await supabase.rpc("generate_postmortem_from_gameday", { p_game_day_id: gameDayId, }); if (error) throw error; return data as string;
  ```
- **generateMockup(opts: GenerateMockupOptions)** — `src/services/productMockupService.ts`
  ```
  const { data, error } = await supabase.functions.invoke('product-mockup', { body: { action: 'generate_mockup', product_image_base64: opts.productImageBase64, logo_base64: opts.logoBase64, background_prompt: opts.backgroundPrompt, product_name: opts.productName, }, }); if (error) { logger.error('product-mockup generate_mockup failed', { error: error.message }); throw new Error(error.message); } return data as GenerateMockupResult;
  ```
- **generateSkillPrompt(loadResult: SkillLoadResult)** — `src/services/progressiveSkillLoader.ts`
  ```
  if (loadResult.loaded.length === 0) return ''; const sections = loadResult.loaded.map((skill) => `## Skill: ${skill.name}\n${skill.content}`); return [ '# Active Skills', `_${loadResult.loaded.length} skills loaded (${loadResult.totalTokens} tokens)_`, '', ...sections, ].join('\n\n');
  ```
- **rerankDocuments(query: string, documents: Array<{ id: string; content: string; score?: number }>, topK = 5,)** — `src/services/ragPipelineService.ts`
  ```
  const { data, error } = await supabase.functions.invoke('rag-rerank-v2', { body: { query, documents, top_k: topK, model: 'qwen3-reranker-8b' }, }); if (error) { logger.error('RAG rerank failed', { error: error.message }); throw new Error(`Rerank error: ${error.message}`); } return data;
  ```
- **calculateDelay(attempt: number, policy: RetryPolicy)** — `src/services/retryEngineService.ts`
  ```
  let delay: number; switch (policy.backoff_strategy) { case 'fixed': delay = policy.initial_delay_ms; break; case 'linear': delay = policy.initial_delay_ms * attempt; break; case 'exponential': delay = policy.initial_delay_ms * Math.pow(policy.backoff_multiplier, attempt - 1); break; case 'exponential_jitter': default: { const base = policy.initial_delay_ms * Math.pow(policy.backoff_multiplier, attempt - 1); delay = base + Math.random() * base * 0.3; break; } } return Math.min(delay, policy.max_d …
  ```
- **canExecute(serviceName: string)** — `src/services/retryEngineService.ts`
  ```
  const cb = circuitBreakers.get(serviceName); if (!cb) return true; if (cb.state === 'closed') return true; if (cb.state === 'open') { if (Date.now() - new Date(cb.last_state_change_at).getTime() >= cb.config.timeout_ms) { cb.state = 'half_open'; cb.success_count = 0; cb.failure_count = 0; cb.last_state_change_at = new Date().toISOString(); return true; } return false; } return cb.total_requests < cb.config.half_open_max_calls;
  ```
- **scanSnapshot(workspaceId: string, snapshotId: string)** — `src/services/sbomService.ts`
  ```
  const { data, error } = await supabase.functions.invoke("sbom-scanner", { body: { workspace_id: workspaceId, snapshot_id: snapshotId }, }); if (error) throw error; return data as { scanned: number; found_critical: number; found_high: number; found_medium: number; found_low: number };
  ```
- **rankin(g)** — `src/services/skillDepartmentClassifier.ts`
  ```
  department: SkillDepartment; score: number
  ```
- **computeQualityScore(s: QualitySignals)** — `src/services/skillDepartmentClassifier.ts`
  ```
  // Popularidade: log-escalada, satura em ~1000 estrelas (30 pts) const stars = Math.min(1, Math.log10(Math.max(1, s.stars)) / 3) * 30; // Recência: 25 pts, decai linearmente até 24 meses let recency = 0; if (s.lastCommitAt) { const months = (Date.now() - new Date(s.lastCommitAt).getTime()) / (1000 * 60 * 60 * 24 * 30); recency = Math.max(0, 1 - months / 24) * 25; } const docs = s.hasDocs ? 10 : 0; const tests = s.hasTests ? 10 : 0; const license = s.licenseAllowed ? 15 : 0; const frontmatter = M …
  ```
- **classifyApplyError(error: unknown)** — `src/services/skillEnrichmentService.ts`
  ```
  const raw = error instanceof Error ? error.message : String(error ?? ''); const msg = raw.toLowerCase(); if (msg.includes('row-level security') || msg.includes('permission') || msg.includes('42501')) { return 'permission'; } // A RPC recusa explicitamente quando a confiança não alcança o piso. if (msg.includes('confian') || msg.includes('confidence')) return 'confidence'; // Descrição já preenchida por outra pessoa entre o plano e o clique. if (msg.includes('já possui') || msg.includes('humana') …
  ```
- **applyDescriptions(proposals: readonly DescriptionProposal[], minConfidence = MIN_ENRICH_CONFIDENCE,)** — `src/services/skillEnrichmentService.ts`
  ```
  const applied: DescriptionProposal[] = []; const failures: ApplyDescriptionFailure[] = []; for (const proposal of proposals) { if (proposal.confidence < minConfidence) { failures.push({ skillId: proposal.skillId, slug: proposal.slug, kind: 'confidence', message: `Confiança ${proposal.confidence.toFixed(2)} abaixo do mínimo ${minConfidence.toFixed(2)}.`, }); continue; } try { const { data, error } = await supabaseExternal.rpc('apply_skill_description', { _skill_id: proposal.skillId, _description: …
  ```
- **applyReclassification(proposals: readonly ReclassifyProposal[],)** — `src/services/skillReclassificationService.ts`
  ```
  const applied: ReclassifyProposal[] = []; const failures: ReclassifyFailure[] = []; for (const proposal of proposals) { try { let query = supabaseExternal .from('skill_registry') .update({ department: proposal.to }) .eq('id', proposal.skillId); // Guarda de estado: só troca se o departamento continua o que o plano viu. query = proposal.from === null ? query.is('department', null) : query.eq('department', proposal.from); const { data, error } = await query.select('id'); if (error) { failures.push …
  ```
- **computePendingSkillIds(recommendations: ReadonlyArray<{ skill: { id: string } }>, installedIds: ReadonlySet<string>,)** — `src/services/skillRecommenderService.ts`
  ```
  const seen = new Set<string>(); const pending: string[] = []; for (const rec of recommendations ?? []) { const id = typeof rec?.skill?.id === 'string' ? rec.skill.id.trim() : ''; if (!id || seen.has(id) || installedIds.has(id)) continue; seen.add(id); pending.push(id); } return pending;
  ```
- **computeSkillSelectionDiff(installedIds: readonly string[], nextIds: readonly string[],)** — `src/services/skillsRegistryService.ts`
  ```
  toAdd: string[]; toRemove: string[]
  ```
- **validDraft(overrides: Partial<SkillDraft> = {})** — `src/services/skillsSimulationService.ts`
  ```
  return { ...DEFAULT_DRAFT, name: 'Resumo de Reunião', slug: 'resumo-de-reuniao', description: 'Gera um resumo estruturado a partir da transcrição de uma reunião.', category: 'prompts', version: '1.0.0', tags: ['resumo'], inputs: [ { id: 'i1', name: 'transcricao', type: 'string', required: true, description: 'Transcrição bruta', defaultValue: '', validation: { pattern: '', enumValues: [] }, }, ], outputs: [{ id: 'o1', name: 'resumo', type: 'string', description: 'Resumo final' }], prompt: { syste …
  ```
- **shouldConfirmBulkRestore(count: number, threshold: number = BULK_RESTORE_CONFIRM_THRESHOLD,)** — `src/services/templateSkillLinkService.ts`
  ```
  if (!Number.isFinite(count) || count <= 0) return false; return count >= threshold;
  ```
- **generateWebhookPath()** — `src/services/webhookTriggerService.ts`
  ```
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'; const segments = [8, 4, 4].map((len) => Array.from({ length: len }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join( '', ), ); return `/webhooks/${segments.join('-')}`;
  ```
- **generateWebhookSecret()** — `src/services/webhookTriggerService.ts`
  ```
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; return ( 'whsec_' + Array.from({ length: 32 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join( '', ) );
  ```
- **applyTransform(payload: Record<string, unknown>, script: string,)** — `src/services/webhookTriggerService.ts`
  ```
  const result: Record<string, unknown> = {}; const lines = script.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')); for (const line of lines) { const match = line.match(/^\s*(\w+)\s*=\s*(.+)\s*$/); if (!match) continue; const [, targetField, sourcePath] = match; const pathParts = sourcePath.trim().split('.'); let value: unknown = payload; for (const part of pathParts) { if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) { value = (value as Record …
  ```
- **regenerateSecret(id: string)** — `src/services/webhookTriggerService.ts`
  ```
  const { data, error } = await fromTable('webhook_endpoints') .update({ secret: generateWebhookSecret(), updated_at: new Date().toISOString(), }) .eq('id', id) .select() .single(); if (error) throw error; return data as WebhookEndpoint;
  ```
- **generateChangeSummary(oldAgent: AgentConfig, newAgent: AgentConfig)** — `src/stores/agentBuilderHelpers.ts`
  ```
  const changes: string[] = []; if (oldAgent.name !== newAgent.name) changes.push(`Nome alterado para "${newAgent.name}"`); if (oldAgent.mission !== newAgent.mission) changes.push('Missão atualizada'); if (oldAgent.model !== newAgent.model) changes.push(`Modelo trocado para ${newAgent.model}`); if (oldAgent.system_prompt !== newAgent.system_prompt) changes.push('Prompt do sistema alterado'); const oldTools = oldAgent.tools.filter(t => t.enabled).length; const newTools = newAgent.tools.filter(t => …
  ```
- **validateApiKey(req: Request)** — `supabase/functions/_shared/auth.ts`
  ```
  valid: boolean; workspaceId: string | null; agentId: string | null
  ```
- **validateWorkspaceMembership(supabaseAdmin: SupabaseClient, userId: string, workspaceId: string)** — `supabase/functions/_shared/auth.ts`
  ```
  const { data } = await supabaseAdmin .from('workspace_members') .select('id') .eq('user_id', userId) .eq('workspace_id', workspaceId) .maybeSingle(); return !!data;
  ```
- **applyFault(fault: ChaosFault)** — `supabase/functions/_shared/chaos.ts`
  ```
  switch (fault.fault_type) { case 'latency': await new Promise((r) => setTimeout(r, fault.latency_ms || 500)); return; case 'error_500': { const e = new Error('chaos: injected 500'); // deno-lint-ignore no-explicit-any // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança. (e as any).status = 500; throw e; } case 'error_429': { const e = new Error('chaos: injected 429 rate lim …
  ```
- **canRequest()** — `supabase/functions/_shared/circuitBreaker.ts`
  ```
  if (this.state === 'closed') return true; if (this.state === 'open') { if (this.openedAt !== null && Date.now() - this.openedAt >= this.opts.openMs) { this._transitionedTo = 'half-open'; this.state = 'half-open'; this.halfOpenInFlight = 0; } else return false; } // half-open if (this.halfOpenInFlight >= this.opts.halfOpenMax) return false; this.halfOpenInFlight++; return true;
  ```
- **assertValidCors(headers: Headers, ctx: string)** — `supabase/functions/_shared/edge-contract_test.ts`
  ```
  const allow = headers.get('access-control-allow-origin'); assert(allow, `${ctx}: Access-Control-Allow-Origin ausente`); assert(allow === ORIGIN || allow === '*', `${ctx}: Allow-Origin inesperado (${allow})`);
  ```
- **computeTier(relevance: number, pinned = false)** — `supabase/functions/_shared/memory-tiers.ts`
  ```
  if (pinned) return "core"; if (relevance >= 3.0) return "core"; if (relevance >= 1.5) return "active"; if (relevance >= 0.5) return "warm"; if (relevance >= 0.1) return "cold"; return "archive";
  ```
- **generateId()** — `supabase/functions/_shared/otel-edge.ts`
  ```
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80; return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  ```
- **validateRequiredEnv(keys: string[])** — `supabase/functions/_shared/requireEnv.ts`
  ```
  const missing: string[] = []; for (const key of keys) { if (!getEnv(key)) missing.push(key); } if (missing.length > 0) { throw new Error( `${MISSING_ENV_PREFIX} Edge Function startup failed. Missing env vars: ${missing.join(', ')}`, ); }
  ```
- **computeDelay(attempt: number, baseMs: number, capMs: number)** — `supabase/functions/_shared/retry.ts`
  ```
  const exp = Math.min(capMs, baseMs * Math.pow(2, attempt)); return Math.floor(Math.random() * exp);
  ```
- **validateWebhookRequest(req: Request, secretEnvVar: string, signatureHeader = 'x-hub-signature-256')** — `supabase/functions/_shared/webhookSignature.ts`
  ```
  isValid: boolean; body?: string
  ```
- **validateSignature(parsed: Record<string, unknown>, _rawBody: string,)** — `supabase/functions/bitrix24-webhook/index.ts`
  ```
  const expectedToken = requireEnv('BITRIX24_APP_TOKEN'); const auth = parsed.auth as Record<string, unknown> | undefined; const received = auth?.application_token; if (typeof received !== 'string') return false; // Bitrix24 sends the application_token directly in the payload. // Use constant-time comparison to prevent timing attacks. return constantTimeEqual(expectedToken, received);
  ```
- **generateTraceId()** — `supabase/functions/bitrix24-webhook/index.ts`
  ```
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') { return crypto.randomUUID(); } return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  ```
- **computeNextCronUtc(expr: string)** — `supabase/functions/cron-executor/index.ts`
  ```
  const parts = expr.trim().split(/\s+/); if (parts.length !== 5) return new Date(Date.now() + 60000).toISOString(); const parseField = (field: string, min: number, max: number): number[] => { const values: number[] = []; for (const p of field.split(',')) { if (p === '*') { for (let i = min; i <= max; i++) values.push(i); } else if (p.includes('/')) { const [r, s] = p.split('/'); const step = parseInt(s); const start = r === '*' ? min : parseInt(r); for (let i = start; i <= max; i += step) values. …
  ```
- **applyStaticFilter(query: any, filterStr: string)** — `supabase/functions/datahub-query/index.ts`
  ```
  const parts = filterStr.split(' AND ').map((f: string) => f.trim()); for (const f of parts) { const eqMatch = f.match(/^(\w+)\s*=\s*(.+)$/); if (eqMatch) { const [, col, val] = eqMatch; const cleanVal = val.replace(/^'|'$/g, ''); if (cleanVal === 'true') query = query.eq(col, true); else if (cleanVal === 'false') query = query.eq(col, false); else query = query.eq(col, cleanVal); } const neqMatch = f.match(/^(\w+)\s*(IS NOT NULL|!= '')$/i); if (neqMatch) { const [, col, op] = neqMatch; if (op.to …
  ```
- **applyDynamicFilters(query: any, filters: Array<Record<string, unknown>>)** — `supabase/functions/datahub-query/index.ts`
  ```
  for (const f of filters) { if (!f.column || !f.operator) continue; const col = String(f.column).replace(/[^a-zA-Z0-9_]/g, ''); const val = f.value; switch (f.operator) { case 'eq': if (val === 'true') query = query.eq(col, true); else if (val === 'false') query = query.eq(col, false); else query = query.eq(col, val); break; case 'neq': query = query.neq(col, val); break; case 'ilike': query = query.ilike(col, val); break; case 'gt': query = query.gt(col, val); break; case 'lt': query = query.lt( …
  ```
- **lexicalScore(text: string | null | undefined)** — `supabase/functions/global-search/index.ts`
  ```
  if (!text) return 0; const t = text.toLowerCase(); if (t === ql) return 1; if (t.startsWith(ql)) return 0.85; const words = ql.split(/\s+/).filter((w) => w.length > 1); const matches = words.filter((w) => t.includes(w)).length; if (matches === words.length && words.length > 0) return 0.7; if (matches > 0) return 0.4 + (matches / words.length) * 0.25; if (t.includes(ql)) return 0.6; return 0.3;
  ```
- **score(s)** — `supabase/functions/global-search/index.ts`
  ```
  index: number; score: number
  ```
- **calculateCost(supabase: SupabaseClient, model: string, promptTokens: number, completionTokens: number,)** — `supabase/functions/llm-gateway/index.ts`
  ```
  const deepseekCost = aiCostUsd(model, promptTokens, completionTokens); if (deepseekCost !== null) return deepseekCost; try { const { data: pricing } = await supabase .from('model_pricing') .select('model_pattern, input_cost_per_1k, output_cost_per_1k'); if (pricing) { // Sort by pattern length DESC so "gpt-4o-mini" matches before "gpt-4o" const sorted = [...pricing].sort( (a: Record<string, unknown>, b: Record<string, unknown>) => (b.model_pattern as string).length - (a.model_pattern as string). …
  ```
- **rerankWithCohere(query: string, documents: Array<{ id: string; content: string }>, topK: number, cohereKey: string,)** — `supabase/functions/rag-rerank-v2/index.ts`
  ```
  id: string; content: string; relevance_score: number
  ```
- **rerankWithHF(query: string, documents: Array<{ id: string; content: string }>, topK: number, modelId: string, hfKey: string,)** — `supabase/functions/rag-rerank-v2/index.ts`
  ```
  id: string; content: string; relevance_score: number
  ```
- **rerankBM25(query: string, documents: Array<{ id: string; content: string; score?: number }>, topK: number,)** — `supabase/functions/rag-rerank-v2/index.ts`
  ```
  id: string; content: string; relevance_score: number
  ```
- **scanContentRisks(content: string)** — `supabase/functions/skill-harvester/lib.ts`
  ```
  const reasons = new Set<string>(); for (const p of INJECTION_PATTERNS) if (p.re.test(content)) reasons.add(p.label); for (const p of SECRET_PATTERNS) if (p.re.test(content)) reasons.add(p.label); const matches = content.match(HIGH_ENTROPY_CANDIDATE) ?? []; for (const m of matches.slice(0, 200)) { if (shannonEntropy(m) > 4.6) { reasons.add('secret:high_entropy_string'); break; } } return Array.from(reasons);
  ```
- **scoreDe(dep: SkillDepartment)** — `supabase/functions/skill-harvester/lib.ts`
  ```
  const lex = LEX_SETS[dep]; return 0.55 * hitRate(primary, lex) + 0.3 * hitRate(tagT, lex) + 0.15 * hitRate(contentT, lex);
  ```
- **computeQualityScore(s: QualitySignals)** — `supabase/functions/skill-harvester/lib.ts`
  ```
  const stars = Math.min(1, Math.log10(Math.max(1, s.stars)) / 3) * 12; let recency = 0; if (s.lastCommitAt) { const months = (Date.now() - new Date(s.lastCommitAt).getTime()) / (1000 * 60 * 60 * 24 * 30); recency = Math.max(0, 1 - months / 24) * 18; } const frontmatter = Math.max(0, Math.min(1, s.frontmatterCompleteness)) * 25; const department = Math.max(0, Math.min(1, (s.departmentConfidence ?? 0) / 0.5)) * 12; const total = stars + recency + frontmatter + department + (s.hasDocs ? 8 : 0) + (s. …
  ```
- **generateTraceId()** — `supabase/functions/whatsapp-webhook/index.ts`
  ```
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') { return crypto.randomUUID(); } return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  ```
- **validateSignature(provider: Provider, rawBody: string, headers: Headers, requestUrl: string,)** — `supabase/functions/whatsapp-webhook/index.ts`
  ```
  switch (provider) { case 'twilio': { // Real Twilio HMAC-SHA1: sign (URL + sorted form params) with auth token const authToken = Deno.env.get('WHATSAPP_TWILIO_AUTH_TOKEN') ?? ''; if (!authToken) return false; const provided = headers.get('x-twilio-signature'); if (!provided) return false; // Build canonical string: URL + form-params sorted alphabetically (key+value) const params: Record<string, string> = {}; try { const urlEncoded = new URLSearchParams(rawBody); for (const [k, v] of urlEncoded.e …
  ```

### G.4 Percentuais e multiplicadores no código

| Trecho | Arquivo |
|---|---|
| `Tabelas com bloat (&gt; 20% dead tuples)` | `src/components/admin/DbHealthCard.tsx` |
| `const outputTokens = Math.max(100, Math.floor(simMaxTokens * 0.6));` | `src/components/agent-builder/modules/BillingModule.tsx` |
| `const scoreA = metricsA.quality * 0.5 + metricsA.adherence * 0.3 + (1000 - metricsA.speed) * 0.2;` | `src/components/agent-builder/modules/PromptABTestDialog.tsx` |
| `const scoreB = metricsB.quality * 0.5 + metricsB.adherence * 0.3 + (1000 - metricsB.speed) * 0.2;` | `src/components/agent-builder/modules/PromptABTestDialog.tsx` |
| `if (value >= target * 0.99) return 'warning';` | `src/components/agents/detail/InteractiveSLOPanel.tsx` |
| `// 3. Mudanças grandes no prompt (ratio ≥ 25% → impact ≥ 65)` | `src/components/agents/detail/RestoreDiffPreview.tsx` |
| `const threshold = isSuccessRate ? 0.1 : Math.max(0.01, Math.abs(r.baseVal) * 0.005);` | `src/components/agents/detail/SavedTestRunsPanel.tsx` |
| `if (t.value >= t.target * 0.95) return 'warning';` | `src/components/agents/detail/agentMetricsHelpers.ts` |
| `+ (changes.reduce((s, c) => s + c.impact, 0) / changes.length) * 0.3,` | `src/components/agents/detail/restoreDiffHelpers.ts` |
| `Math.max(...changes.map((c) => c.impact)) * 0.7` | `src/components/agents/detail/restoreDiffHelpers.ts` |
| `} else if (mx > caps.maxTokensCap * 0.8) {` | `src/components/agents/detail/restoreValidation.ts` |
| `: input.slo.successRate >= input.targets.availability * 0.99 ? 'warning' : 'critical' },` | `src/components/agents/detail/sloReportPdf.ts` |
| `// 4 etapas iguais — cada uma vale 25%. Mantém o cálculo previsível e` | `src/components/agents/wizard/DraftRecoveryBanner.tsx` |
| `// Cor sinaliza maturidade do rascunho: vermelho < 50%, âmbar < 100%, verde = 100%.` | `src/components/agents/wizard/DraftRecoveryBanner.tsx` |
| `const charWarn = charCount > PROMPT_LIMITS.MAX_TOTAL * 0.9;` | `src/components/agents/wizard/quickSteps/AgentLivePreviewCard.tsx` |
| `const tail = bulletMatches.slice(Math.floor(bulletMatches.length * 0.7));` | `src/components/agents/wizard/quickSteps/PromptSectionUsage.tsx` |
| `const charWarn = stats.charCount > PROMPT_LIMITS.MAX_TOTAL * 0.9;` | `src/components/agents/wizard/quickSteps/PromptValidationFeedback.tsx` |
| `const lineWarn = stats.lineCount > PROMPT_LIMITS.MAX_LINES * 0.9;` | `src/components/agents/wizard/quickSteps/PromptValidationFeedback.tsx` |
| `"Reduzimos 60% do tempo de atendimento ao cliente com agentes criados no Fator X. A` | `src/components/auth/AuthBrandingPanel.tsx` |
| `return { yMax: ym, ticks: [0, ym * 0.25, ym * 0.5, ym * 0.75, ym] };` | `src/components/charts/LightAreaChart.tsx` |
| `const barPad = Math.max(barGroupWidth * 0.2, 2);` | `src/components/charts/LightBarChart.tsx` |
| `return { yMax: ym, ticks: [0, ym * 0.25, ym * 0.5, ym * 0.75, ym], isStacked: false };` | `src/components/charts/LightBarChart.tsx` |
| `return { yMax: ym, ticks: [0, ym * 0.25, ym * 0.5, ym * 0.75, ym], isStacked: true };` | `src/components/charts/LightBarChart.tsx` |
| `return { yMax: ym, ticks: [0, ym * 0.25, ym * 0.5, ym * 0.75, ym] };` | `src/components/charts/LightLineChart.tsx` |
| `const maxR = size * 0.35;` | `src/components/charts/LightRadarChart.tsx` |
| `Sorteia com ~5% de chance uma memória do tier `archive` para` | `src/components/memory/RandomRecallToggleCard.tsx` |
| `const iso = Math.min(100, Math.round(postureScore * 0.7) + (hasLogs ? 10 : 0));` | `src/components/security/ComplianceFrameworks.tsx` |
| `const soc2 = Math.min(100, Math.round(postureScore * 0.8) + (hasLogs ? 15 : 0));` | `src/components/security/ComplianceFrameworks.tsx` |
| `* Threshold saudável < 1% acumulado e < 10/min. Refresh a cada 60s.` | `src/components/security/RollbackRateCard.tsx` |
| `L0 (100 tokens) filtra relevância · L1 (2K) planeja · L2 detalha somente o essencial. Economia média: ~80% de tokens.` | `src/components/super-cerebro/ContextTiersTab.tsx` |
| `issues: Math.round((docCount \|\| 0) * 0.03),` | `src/components/super-cerebro/tabs/HealthTab.tsx` |
| `issues: Math.round((docCount \|\| 0) * 0.15),` | `src/components/super-cerebro/tabs/HealthTab.tsx` |
| `const barHeight = Math.max(2, v * h * 0.9);` | `src/components/voice/VoiceWaveform.tsx` |
| `// Dados inúteis (RFM 100% Hibernating)` | `src/config/datahub-blacklist.ts` |
| `* - Contatos via company_phones, NÃO contacts (97% não tem contacts)` | `src/config/datahub-entities.ts` |
| `const outputTokens = Math.max(100, Math.floor((input.maxTokens ?? 1000) * 0.6));` | `src/hooks/useCostEstimate.ts` |
| `const breakAt = lastSpace > max * 0.6 ? lastSpace : max;` | `src/lib/promptAutoFixers.ts` |
| `const confidence = Math.min(1, (highCount * 0.4 + medCount * 0.15 + lowCount * 0.05));` | `src/lib/securityGuards.ts` |
| `* 0.084 — o léxico tem colisões PT/EN legítimas ("stock" = ação/estoque,` | `src/lib/skills/departmentReclassification.ts` |
| `if (actualMs <= targetMs * 0.8) return 'healthy';` | `src/lib/slo/sloTargets.ts` |
| `p95LatencyMs: SLO_TARGETS.p95LatencyMs * 0.8, // 1600ms` | `src/lib/slo/sloTargets.ts` |
| `p99LatencyMs: SLO_TARGETS.p99LatencyMs * 0.8, // 4000ms` | `src/lib/slo/sloTargets.ts` |
| `* before creating the agent. 100% offline, no LLM calls — pattern-based and` | `src/lib/validations/contradictionSuggestions.ts` |
| `* Heurísticas (sem LLM, 100% offline):` | `src/lib/validations/promptContradictions.ts` |
| `+45%{' '}` | `src/pages/AgentTemplatesPage.tsx` |
| `-60%{' '}` | `src/pages/AgentTemplatesPage.tsx` |
| `Criadores recebem <strong>70%</strong> de cada venda, plataforma fica com <strong>30%</strong>. Pagamento mock nesta versão — Stripe Connect na próxima iteração …` | `src/pages/MarketplaceMonetizedPage.tsx` |
| `-- Esperado: rowsecurity = true em 100%.` | `src/pages/PartitioningDocsPage.tsx` |
| `Nossa IA analisou seu prompt e sugere 3 otimizações para reduzir latência em 15%.` | `src/pages/PromptEditorPage.tsx` |
| `(0.4 + Math.random() * 0.3 + (variant === 'b' ? 0.1 : 0)).toFixed(4),` | `src/pages/PromptExperimentsPage.tsx` |
| `(0.6 + Math.random() * 0.3 + (variant === 'b' ? 0.08 : 0)).toFixed(3),` | `src/pages/PromptExperimentsPage.tsx` |
| `// 60% input, 40% output (aprox)` | `src/services/agentTestSimulationService.ts` |
| `// Se latência muito alta, força timeout em ~60% dos casos` | `src/services/agentTestSimulationService.ts` |
| `const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);` | `src/services/agentTestSimulationService.ts` |
| `const inputTokens = Math.round(tokens * 0.6);` | `src/services/agentTestSimulationService.ts` |
| `* A execução é 100% client-side sobre o array já retornado por listNotes,` | `src/services/basesService.ts` |
| `// Tiered search: L0 filter → L1 plan → L2 detail (saves ~80% tokens)` | `src/services/contextTiersService.ts` |
| `const match = Number((volume * 0.6 + recency * 0.4).toFixed(4));` | `src/services/crmScoringService.ts` |
| `* Usado como fallback quando o server detecta que o PDF é 100% escaneado.` | `src/services/documentIngestionService.ts` |
| `const combined = deterministic * 0.2 + statistical * 0.4 + llmJudge * 0.4;` | `src/services/evaluationsService.ts` |
| `const p95Latency = sortedLatencies[Math.floor(n * 0.95)] \|\| 0;` | `src/services/evaluationsService.ts` |
| `return rougeL * 0.6 + rouge1 * 0.4;` | `src/services/evaluationsService.ts` |
| `* - Final: weighted avg (60% age + 40% low-importance)` | `src/services/knowledgeDecayService.ts` |
| `keywordScore * 0.5 + nameScore * 0.2 + descScore * 0.15 + recencyBoost + priorityBoost,` | `src/services/progressiveSkillLoader.ts` |
| `const boost = sharedTags.length * 0.08 + sharedLinks.length * 0.05;` | `src/services/relatedNotesService.ts` |
| `delay = base + Math.random() * base * 0.3;` | `src/services/retryEngineService.ts` |
| `* 0.4 × categoria-fit (baseado em heurísticas do texto da missão)` | `src/services/skillRecommenderService.ts` |
| `* 0.6 × keyword-match (Jaccard sobre tokens de nome+descrição+tags)` | `src/services/skillRecommenderService.ts` |
| `const toolMultiplier = 1 + (a.tools.filter(t => t.enabled).length * 0.05);` | `src/stores/agentBuilderHelpers.ts` |
| `const toolMultiplier = 1 + a.tools.filter((t) => t.enabled).length * 0.05;` | `src/stores/agentBuilderStore.ts` |
| `const costCents = Math.ceil(steps.length * 0.5); // ~0.5¢ per step` | `supabase/functions/browser-agent-run/index.ts` |
| `// 100% scanned OR forced → require client-provided PNGs` | `supabase/functions/doc-parse/index.ts` |
| `if (drift > Number(snap.row_count) * 0.1) {` | `supabase/functions/dr-orchestrator/index.ts` |
| `if (matches > 0) return 0.4 + (matches / words.length) * 0.25;` | `supabase/functions/global-search/index.ts` |
| `return { text, latency: Date.now() - start, cost_cents: Math.ceil(tokens * 0.0002) };` | `supabase/functions/graph-execute/index.ts` |
| `const score = Math.min(1, hits * 0.2);` | `supabase/functions/guardrails-ml/index.ts` |
| `const score = Math.min(1, hits * 0.35);` | `supabase/functions/guardrails-ml/index.ts` |
| `score: Math.min(1, found.length * 0.25),` | `supabase/functions/guardrails-ml/index.ts` |
| `// #46 — PII Detection ML (Piiranha, 98.27% recall, 17 PII types)` | `supabase/functions/llm-gateway/index.ts` |
| `if (negScore >= 2) return { label: 'negative', score: Math.min(0.95, 0.6 + negScore * 0.1), emoji: '😡' };` | `supabase/functions/nlp-pipeline/index.ts` |
| `if (posScore >= 2) return { label: 'positive', score: Math.min(0.95, 0.6 + posScore * 0.1), emoji: '😍' };` | `supabase/functions/nlp-pipeline/index.ts` |
| `(reviewData.consensus_degree \|\| 85) * 0.9 +` | `supabase/functions/oracle-council/index.ts` |
| `if (overlap >= chunkSize) overlap = Math.floor(chunkSize * 0.2);` | `supabase/functions/rag-ingest/index.ts` |
| `relevance_score: 1 - (i * 0.05),` | `supabase/functions/rag-rerank/index.ts` |
| `cost_usd: Math.round(remainingCount * 0.0023 * 1e6) / 1e6,` | `supabase/functions/replay-fork-execute/index.ts` |
| `const costCents = Math.ceil(tokens * 0.0003); // ~$0.30/1M tokens flash` | `supabase/functions/voice-synthesize/index.ts` |

## H. Parâmetros de negócio (constantes, prazos, limites)

### H.1 Constantes

| Constante | Valor | Arquivo |
|---|---|---|
| `CACHE_VERSION` | `'fator-x-v2'` | `public/sw.js` |
| `POLICY_TYPE` | `'agent_rails'` | `src/components/agent-builder/GuardrailsPolicyEditor.tsx` |
| `DISPLAY_LIMIT` | `5` | `src/components/agents/TemplateLinkedSkillsPanel.tsx` |
| `ALL_DEPARTMENTS` | `'all'` | `src/components/agents/TemplateRecommenderCard.tsx` |
| `SEGMENTS` | `14` | `src/components/agents/detail/InteractiveSLOPanel.tsx` |
| `UNDO_WINDOW_MS` | `5` | `src/components/agents/detail/RestoreHistorySection.tsx` |
| `SEGMENTS` | `14` | `src/components/agents/detail/SLOViolationTimeline.tsx` |
| `MAX_PROMPT_LEN` | `1000` | `src/components/agents/detail/SimulationResultDialog.tsx` |
| `DEFAULT_SPEED` | `1` | `src/components/agents/traces/ReplayDialog.tsx` |
| `TOP_LIMIT` | `5` | `src/components/agents/versioning/RunFilter.tsx` |
| `SCHEMA_VERSION` | `1` | `src/components/agents/versioning/timelinePrefs.ts` |
| `DEFAULT_PROMPT_DEPTH` | `8` | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| `MAX_DRAFT_SKILL_IDS` | `100` | `src/components/agents/wizard/draftStore.ts` |
| `DRAFT_TTL_MS` | `7` | `src/components/agents/wizard/draftStore.ts` |
| `MAX_DRAFTS` | `5` | `src/components/agents/wizard/draftStore.ts` |
| `PROMPT_HISTORY_MAX` | `20` | `src/components/agents/wizard/promptHistoryStore.ts` |
| `PROMPT_HISTORY_MIN_LEN` | `20` | `src/components/agents/wizard/promptHistoryStore.ts` |
| `PROMPT_HISTORY_MIN_DELTA` | `15` | `src/components/agents/wizard/promptHistoryStore.ts` |
| `PROMPT_HISTORY_TTL_MS` | `14` | `src/components/agents/wizard/promptHistoryStore.ts` |
| `COLLAPSED_LINES` | `12` | `src/components/agents/wizard/quickSteps/AgentLivePreviewCard.tsx` |
| `EXPANDED_LINES` | `40` | `src/components/agents/wizard/quickSteps/AgentLivePreviewCard.tsx` |
| `AUTOSAVE_DELAY_MS` | `2500` | `src/components/agents/wizard/quickSteps/PromptHistoryPanel.tsx` |
| `MEMO_LIMIT` | `24` | `src/components/agents/wizard/quickSteps/PromptSectionUsage.tsx` |
| `EDITOR_PADDING_LEFT` | `36` | `src/components/agents/wizard/quickSteps/StepQuickPrompt.tsx` |
| `MAX_EVENTS` | `50` | `src/components/billing/RealTimeCostStream.tsx` |
| `DOODLE_SVG` | `"url(\"` | `src/components/chat/ChatBackground.tsx` |
| `MAX_LEN` | `4000` | `src/components/chat/ChatComposer.tsx` |
| `WARN_AT` | `3600` | `src/components/chat/ChatComposer.tsx` |
| `MAX_ATTACHMENTS` | `5` | `src/components/chat/ChatComposer.tsx` |
| `MAX_ATTACHMENT_SIZE` | `25` | `src/components/chat/ChatComposer.tsx` |
| `PAGE_SIZE` | `25` | `src/components/datahub/DataHubExplorerTab.tsx` |
| `HISTORY_MAX` | `10` | `src/components/datahub/DataHubQueryBuilderTab.tsx` |
| `MAX_BYTES` | `25` | `src/components/knowledge/AudioUploadDialog.tsx` |
| `PENDING_INTERVAL_MS` | `2000` | `src/components/openclaw/OpenclawWhatsappSetup.tsx` |
| `CONNECTED_INTERVAL_MS` | `30` | `src/components/openclaw/OpenclawWhatsappSetup.tsx` |
| `PAIRING_TIMEOUT_MS` | `90` | `src/components/openclaw/OpenclawWhatsappSetup.tsx` |
| `MAX_RECENT` | `5` | `src/components/shared/CommandPalette.tsx` |
| `MAX_RETRIES` | `3` | `src/components/shared/ErrorBoundary.tsx` |
| `POLL_INTERVAL_MS` | `30` | `src/components/shared/SystemHealthBanner.tsx` |
| `MAX_LISTED` | `6` | `src/components/skills/SkillInstallCapLedgerCard.tsx` |
| `MAX_LISTED` | `8` | `src/components/skills/SkillPromptEvidenceLedgerCard.tsx` |
| `ZOOM_MIN` | `0.5` | `src/components/super-cerebro/DocumentViewerDialog.tsx` |
| `ZOOM_MAX` | `2.5` | `src/components/super-cerebro/DocumentViewerDialog.tsx` |
| `ZOOM_STEP` | `0.1` | `src/components/super-cerebro/DocumentViewerDialog.tsx` |
| `HISTORY_MAX` | `10` | `src/components/super-cerebro/SearchTab.tsx` |
| `AUTOSAVE_MS` | `900` | `src/components/super-cerebro/notebook/CanvasEditor.tsx` |
| `JUMP_EVENT` | `"cerebro:jump-to-line"` | `src/components/super-cerebro/notebook/NoteEditor.tsx` |
| `RUNWAY_WARN` | `3` | `src/components/system/PartitionHealthCard.tsx` |
| `RUNWAY_CRIT` | `1` | `src/components/system/PartitionHealthCard.tsx` |
| `SIDEBAR_COOKIE_MAX_AGE` | `60` | `src/components/ui/sidebar.tsx` |
| `SIDEBAR_WIDTH` | `'16rem'` | `src/components/ui/sidebar.tsx` |
| `SIDEBAR_WIDTH_MOBILE` | `'18rem'` | `src/components/ui/sidebar.tsx` |
| `MINIMAP_W` | `160` | `src/components/workflows/CanvasMinimap.tsx` |
| `MINIMAP_H` | `100` | `src/components/workflows/CanvasMinimap.tsx` |
| `PAD` | `40` | `src/components/workflows/CanvasMinimap.tsx` |
| `NODE_W` | `160` | `src/components/workflows/CanvasMinimap.tsx` |
| `NODE_H` | `72` | `src/components/workflows/CanvasMinimap.tsx` |
| `NODE_W` | `70` | `src/components/workflows/TemplateCanvasPreview.tsx` |
| `NODE_H` | `26` | `src/components/workflows/TemplateCanvasPreview.tsx` |
| `PADDING` | `12` | `src/components/workflows/TemplateCanvasPreview.tsx` |
| `FALLBACK_DEPARTMENT` | `'transversal'` | `src/config/skill-departments.ts` |
| `MOBILE_BREAKPOINT` | `768` | `src/hooks/use-mobile.tsx` |
| `OFFLINE_TITLE` | `'Sem conexão com a internet'` | `src/hooks/use-network-status.ts` |
| `TOAST_LIMIT` | `1` | `src/hooks/use-toast.ts` |
| `TOAST_REMOVE_DELAY` | `1000000` | `src/hooks/use-toast.ts` |
| `ISSUER` | `"Fator X"` | `src/hooks/use2FA.ts` |
| `CURATION_PENDING_CAP` | `99` | `src/hooks/useCurationRealtime.ts` |
| `POLL_MS` | `5` | `src/hooks/useSLOAlerts.ts` |
| `MAX_RETRIES` | `2` | `src/hooks/useStreamingResponse.ts` |
| `DEFAULT_LOCALE` | `'pt-BR'` | `src/i18n/translations.ts` |
| `MAX_CITATIONS` | `8` | `src/lib/citationValidation.ts` |
| `CURATION_HIGHLIGHT_TTL_MS` | `8` | `src/lib/curationHighlight.ts` |
| `CURATION_HIGHLIGHT_CAP` | `99` | `src/lib/curationHighlight.ts` |
| `USD_TO_BRL` | `5.75` | `src/lib/llmPricing.ts` |
| `MAX_PROMPT_SKILLS` | `25` | `src/lib/promptCompiler.ts` |
| `MAX_ENTRIES` | `50` | `src/lib/replayState.ts` |
| `CHANGE_EVENT` | `'oracle-research-config-changed'` | `src/lib/researchConfig.ts` |
| `CACHE_TTL_MS` | `540` | `src/lib/signedUrlCache.ts` |
| `MAX_ENTRIES` | `200` | `src/lib/signedUrlCache.ts` |
| `DOC_META_TTL_MS` | `300` | `src/lib/signedUrlCache.ts` |
| `MAX_SOURCES` | `50` | `src/lib/sourceIdsSync.ts` |
| `MAX_SESSIONS` | `50` | `src/lib/traceBookmarks.ts` |
| `MAX_BOOKMARKS` | `100` | `src/lib/traceBookmarks.ts` |
| `DELIMITER` | `';'` | `src/lib/skills/calibrationCsv.ts` |
| `BOM` | `'\uFEFF'` | `src/lib/skills/calibrationCsv.ts` |
| `DAY_MS` | `24` | `src/lib/skills/calibrationGovernance.ts` |
| `MIN_SUGGESTION_SAMPLE` | `3` | `src/lib/skills/classificationEfficacy.ts` |
| `MIN_ENRICH_CONFIDENCE` | `0.75` | `src/lib/skills/descriptionEnrichment.ts` |
| `MIN_SUGGEST_CONFIDENCE` | `0.4` | `src/lib/skills/descriptionEnrichment.ts` |
| `MIN_DESCRIPTION_LENGTH` | `40` | `src/lib/skills/descriptionEnrichment.ts` |
| `MAX_DESCRIPTION_LENGTH` | `600` | `src/lib/skills/descriptionEnrichment.ts` |
| `MIN_NOVEL_WORDS` | `5` | `src/lib/skills/descriptionEnrichment.ts` |
| `DEFAULT_CONCURRENCY` | `2` | `src/lib/skills/llmClassificationQueue.ts` |
| `DEFAULT_MIN_INTERVAL_MS` | `400` | `src/lib/skills/llmClassificationQueue.ts` |
| `DEFAULT_MAX_ATTEMPTS` | `3` | `src/lib/skills/llmClassificationQueue.ts` |
| `DEFAULT_BASE_BACKOFF_MS` | `800` | `src/lib/skills/llmClassificationQueue.ts` |
| `DEFAULT_CAP_BACKOFF_MS` | `15` | `src/lib/skills/llmClassificationQueue.ts` |
| `DIA_MS` | `24` | `src/lib/skills/observability.ts` |
| `QUEUE_STALE_DAYS` | `7` | `src/lib/skills/observability.ts` |
| `TREND_MIN_HALF_SAMPLE` | `5` | `src/lib/skills/observability.ts` |
| `TREND_MIN_DELTA` | `0.05` | `src/lib/skills/observability.ts` |
| `INGESTION_FAILURE_ALERT` | `0.25` | `src/lib/skills/observability.ts` |
| `HUMAN_CORRECTION_ALERT` | `0.4` | `src/lib/skills/observability.ts` |
| `HUMAN_CORRECTION_MIN_SAMPLE` | `10` | `src/lib/skills/observability.ts` |
| `CALIBRATION_STALE_DAYS` | `45` | `src/lib/skills/observability.ts` |
| `NEAR_CAP_MARGIN` | `3` | `src/lib/skills/promptOverflowAlert.ts` |
| `DESCRIPTION_MAX_LEN` | `160` | `src/lib/skills/promptSimulation.ts` |
| `CATEGORY_MAX_LEN` | `32` | `src/lib/skills/promptSimulation.ts` |
| `DEPARTMENT_REVIEW_THRESHOLD` | `0.5` | `src/lib/skills/skillDemand.ts` |
| `PLATFORM_REVIEW_THRESHOLD` | `0.18` | `src/lib/skills/skillDemand.ts` |
| `DEMAND_SEARCH_MAX` | `120` | `src/lib/skills/skillDemand.ts` |
| `DEMAND_THRESHOLD_FLOOR_FALLBACK` | `0.25` | `src/lib/skills/skillDemand.ts` |
| `DEMAND_THRESHOLD_MAX` | `0.95` | `src/lib/skills/skillDemand.ts` |
| `THRESHOLD_CALIBRATION_ACTION` | `'skill.threshold_calibrate'` | `src/lib/skills/thresholdCalibration.ts` |
| `OVERRIDE_REASON_MIN` | `12` | `src/lib/skills/thresholdCalibration.ts` |
| `OVERRIDE_REASON_MAX` | `280` | `src/lib/skills/thresholdCalibration.ts` |
| `INSTABILITY_WINDOW_DAYS` | `7` | `src/lib/skills/thresholdCalibration.ts` |
| `INSTABILITY_MIN_EVENTS` | `3` | `src/lib/skills/thresholdCalibration.ts` |
| `OVERRIDE_REVIEW_DEADLINE_DAYS` | `30` | `src/lib/skills/thresholdCalibration.ts` |
| `MAX_ENTRIES` | `200` | `src/lib/slo/useDrilldownAuditLog.ts` |
| `ALL` | `'all'` | `src/pages/AgentTemplatesPage.tsx` |
| `MAX_ATTEMPTS` | `5` | `src/pages/AuthPage.tsx` |
| `LOCKOUT_DURATION_MS` | `60` | `src/pages/AuthPage.tsx` |
| `TYPING_DELAY_MS` | `400` | `src/pages/ChatWithAgentPage.tsx` |
| `EMAIL_TRIGGER` | `"email_received"` | `src/pages/EmailCalendarTriggersPage.tsx` |
| `CALENDAR_TRIGGER` | `"calendar_event"` | `src/pages/EmailCalendarTriggersPage.tsx` |
| `DEFAULT_AUTO_REFRESH_MS` | `60` | `src/pages/SLODashboard.tsx` |
| `DEFAULT_WINDOW_HOURS` | `24` | `src/pages/SLODashboard.tsx` |
| `FILTER_PERSIST_DEBOUNCE_MS` | `350` | `src/pages/SLODashboard.tsx` |
| `QP_WINDOW` | `'w'` | `src/pages/SLODashboard.tsx` |
| `QP_AUTO` | `'auto'` | `src/pages/SLODashboard.tsx` |
| `QP_COMPARE` | `'cmp'` | `src/pages/SLODashboard.tsx` |
| `QP_FAILURE_MODES` | `'fm'` | `src/pages/SLODashboard.tsx` |
| `QP_SELECTED` | `'sel'` | `src/pages/SLODashboard.tsx` |
| `QP_INCLUDE_TOOLS` | `'tools'` | `src/pages/SLODashboard.tsx` |
| `QP_COMPARE_TOOLS` | `'cmp_tools'` | `src/pages/SLODashboard.tsx` |
| `FILTER_DEBOUNCE_MS` | `350` | `src/pages/SLODashboard.tsx` |
| `COVERAGE_TARGET` | `5` | `src/pages/SkillHarvestPage.tsx` |
| `MAX_HARVEST_BATCHES` | `12` | `src/pages/SkillHarvestPage.tsx` |
| `MAX_DRAFTS_PER_AGENT` | `20` | `src/services/agentDraftVersionsService.ts` |
| `INSTALLED_LIMIT` | `100` | `src/services/agentPromptSimulationService.ts` |
| `ROW_LIMIT` | `5000` | `src/services/agentSkillLoadService.ts` |
| `EVT` | `"cerebro:bookmarks-changed"` | `src/services/bookmarksService.ts` |
| `MAX_PROBABILITY` | `0.5` | `src/services/chaosService.ts` |
| `MAX_DURATION_SEC` | `3600` | `src/services/chaosService.ts` |
| `LEGACY_MIGRATED_FLAG` | `'nexus:chat:migrated:v2'` | `src/services/chatThreadService.ts` |
| `MESSAGE_PAGE_SIZE` | `200` | `src/services/chatThreadService.ts` |
| `ENGAGEMENT_WINDOW_DAYS` | `30` | `src/services/crmScoringService.ts` |
| `RESCORE_CHUNK` | `100` | `src/services/crmScoringService.ts` |
| `MAX_UPLOAD_BYTES` | `20` | `src/services/documentIngestionService.ts` |
| `BASE_BACKOFF_MS` | `5` | `src/services/e2eeAutoSync.ts` |
| `MAX_BACKOFF_MS` | `5` | `src/services/e2eeAutoSync.ts` |
| `DEFAULT_INTERVAL_MS` | `60` | `src/services/e2eeAutoSync.ts` |
| `E2EE_BUNDLE_VERSION` | `1` | `src/services/e2eeService.ts` |
| `PBKDF2_ITERS` | `250` | `src/services/e2eeService.ts` |
| `ROW_LIMIT` | `300` | `src/services/installCapLedgerService.ts` |
| `UNSTATUSED` | `"__none__"` | `src/services/kanbanService.ts` |
| `MAX_IMAGE_BYTES` | `10` | `src/services/productMockupService.ts` |
| `ROW_LIMIT` | `500` | `src/services/promptEvidenceLedgerService.ts` |
| `EMBEDDING_DIM` | `1536` | `src/services/ragPipelineService.ts` |
| `MAX_PER_AGENT` | `25` | `src/services/savedTestRunsStore.ts` |
| `MAX_BODY_CHARS` | `200` | `src/services/shareService.ts` |
| `SKETCH_EVENT` | `"cerebro:sketch-changed"` | `src/services/sketchService.ts` |
| `LOW_CONFIDENCE_THRESHOLD` | `0.18` | `src/services/skillDepartmentClassifier.ts` |
| `MIN_TRANSVERSAL_SCORE` | `0.2` | `src/services/skillDepartmentClassifier.ts` |
| `MIN_PLATFORM_DENSITY` | `0.08` | `src/services/skillDepartmentClassifier.ts` |
| `PLATFORM_TIER_DEPARTMENT` | `'ti'` | `src/services/skillDepartmentClassifier.ts` |
| `PLATFORM_TIER_CONFIDENCE` | `0.15` | `src/services/skillDepartmentClassifier.ts` |
| `PLATFORM_EVIDENCE_STEP` | `0.03` | `src/services/skillDepartmentClassifier.ts` |
| `PLATFORM_TIER_MAX_CONFIDENCE` | `0.4` | `src/services/skillDepartmentClassifier.ts` |
| `PLATFORM_SINGLE_FIELD_CAP` | `0.17` | `src/services/skillDepartmentClassifier.ts` |
| `MIN_QUALITY_SCORE` | `35` | `src/services/skillDepartmentClassifier.ts` |
| `CHECKPOINT_TTL_MS` | `24` | `src/services/skillHarvestService.ts` |
| `REVIEW_CONFIDENCE_THRESHOLD` | `0.5` | `src/services/skillLibraryService.ts` |
| `OBSERVABILITY_WINDOW_DAYS` | `14` | `src/services/skillObservabilityService.ts` |
| `ROW_LIMIT` | `200` | `src/services/skillObservabilityService.ts` |
| `MAX_DECISION_REASON` | `1000` | `src/services/skillReclassificationReviewService.ts` |
| `CHUNK` | `50` | `src/services/skillsRegistryService.ts` |
| `MAX_BULK_INSTALL` | `100` | `src/services/skillsRegistryService.ts` |
| `REPS` | `8` | `src/services/skillsSimulationService.ts` |
| `MAX_LINKS_PER_TEMPLATE` | `6` | `src/services/templateSkillLinkService.ts` |
| `BULK_RESTORE_CONFIRM_THRESHOLD` | `5` | `src/services/templateSkillLinkService.ts` |
| `RESTORE_MAX_ATTEMPTS` | `3` | `src/services/templateSkillLinkService.ts` |
| `RESTORE_BACKOFF_BASE_MS` | `200` | `src/services/templateSkillLinkService.ts` |
| `RESTORE_FAILURES_TTL_MS` | `24` | `src/services/templateSkillLinkService.ts` |
| `CHUNK` | `200` | `src/services/templateSkillLinkService.ts` |
| `AFFINITY_WEIGHT` | `0.15` | `src/services/templateSkillRegistry.ts` |
| `DEPARTMENT_MATCH_WEIGHT` | `0.35` | `src/services/templateSkillRegistry.ts` |
| `GENERIC_PENALTY` | `0.25` | `src/services/templateSkillRegistry.ts` |
| `LINK_THRESHOLD` | `0.02` | `src/services/templateSkillRegistry.ts` |
| `THRESHOLD_CALIBRATION_LIMIT` | `20` | `src/services/thresholdCalibrationService.ts` |
| `MAX_FILE_BYTES` | `2` | `src/services/vaultSyncService.ts` |
| `PROJECT_REF` | `'qdlnzopxrlsoljcrcmzv'` | `src/services/widgetService.ts` |
| `CITATIONS_SENTINEL` | `"\n\u241E"` | `src/types/cerebroCitations.ts` |
| `FAULT_CACHE_TTL_MS` | `5` | `supabase/functions/_shared/chaos.ts` |
| `ALLOWED_METHODS` | `'GET, POST, PUT, PATCH, DELETE, OPTIONS'` | `supabase/functions/_shared/cors.ts` |
| `MAX_AGE` | `'86400'` | `supabase/functions/_shared/cors.ts` |
| `ORIGIN` | `'https://app.promobrindes.com.br'` | `supabase/functions/_shared/edge-contract_test.ts` |
| `USD_TO_BRL` | `5.8` | `supabase/functions/_shared/otel-edge.ts` |
| `CLEANUP_INTERVAL` | `60` | `supabase/functions/_shared/rate-limiter.ts` |
| `MAX_PROMPT_SKILLS` | `25` | `supabase/functions/_shared/skills.ts` |
| `SLACK_API_BASE` | `"https://slack.com/api"` | `supabase/functions/_shared/slack.ts` |
| `SIGNATURE_VERSION` | `"v0"` | `supabase/functions/_shared/slack.ts` |
| `REPLAY_WINDOW_SEC` | `60` | `supabase/functions/_shared/slack.ts` |
| `MAX_BODY_SIZE` | `10` | `supabase/functions/_shared/validation.ts` |
| `MAX_SHORT_STRING` | `500` | `supabase/functions/_shared/validation.ts` |
| `MAX_MEDIUM_STRING` | `5000` | `supabase/functions/_shared/validation.ts` |
| `MAX_LONG_STRING` | `50000` | `supabase/functions/_shared/validation.ts` |
| `MAX_MESSAGE_CONTENT` | `100000` | `supabase/functions/_shared/validation.ts` |
| `WHISPER_MODEL` | `'openai/whisper-large-v3-turbo'` | `supabase/functions/audio-transcribe/index.ts` |
| `WHISPER_TIMEOUT_MS` | `30000` | `supabase/functions/audio-transcribe/index.ts` |
| `MAX_CITATIONS` | `8` | `supabase/functions/cerebro-query/index.ts` |
| `CITATIONS_SENTINEL` | `'\n\u241E'` | `supabase/functions/cerebro-query/index.ts` |
| `MAX_PROMPT_CHARS` | `32000` | `supabase/functions/cerebro-query/index.ts` |
| `MAX_CODE_BYTES` | `50` | `supabase/functions/code-interpreter-execute/index.ts` |
| `TIMEOUT_MS` | `30` | `supabase/functions/code-interpreter-execute/index.ts` |
| `USD_TO_BRL` | `5.75` | `supabase/functions/cost-calculator/index.ts` |
| `MAX_ATTEMPTS` | `5` | `supabase/functions/crm-cadence-runner/index.ts` |
| `OCR_MODEL` | `'ibm-granite/granite-vision-3.3-2b'` | `supabase/functions/doc-ocr/index.ts` |
| `OCR_TIMEOUT_MS` | `30000` | `supabase/functions/doc-ocr/index.ts` |
| `MAX_BYTES` | `20` | `supabase/functions/doc-parse/index.ts` |
| `OCR_MIN_TEXT_PER_PAGE` | `40` | `supabase/functions/doc-parse/index.ts` |
| `OCR_CONCURRENCY` | `3` | `supabase/functions/doc-parse/index.ts` |
| `MAX_NODES` | `15` | `supabase/functions/graph-execute/index.ts` |
| `RATE_LIMIT_MAX` | `30` | `supabase/functions/llm-gateway/index.ts` |
| `RATE_LIMIT_WINDOW_MS` | `60` | `supabase/functions/llm-gateway/index.ts` |
| `HF_INJECTION_MODEL` | `'protectai/deberta-v3-base-prompt-injection-v2'` | `supabase/functions/llm-gateway/index.ts` |
| `HF_INJECTION_TIMEOUT_MS` | `3000` | `supabase/functions/llm-gateway/index.ts` |
| `MAX_BODY` | `1024` | `supabase/functions/openclaw-webhook/index.ts` |
| `REPLAY_WINDOW_MS` | `5` | `supabase/functions/openclaw-webhook/index.ts` |
| `ORACLE_RATE_LIMIT_MAX` | `10` | `supabase/functions/oracle-council/index.ts` |
| `ORACLE_RATE_LIMIT_WINDOW_MS` | `60` | `supabase/functions/oracle-council/index.ts` |
| `SPACE_TIMEOUT` | `60000` | `supabase/functions/product-mockup/index.ts` |
| `BATCH_SIZE` | `20` | `supabase/functions/rag-embed-backfill/index.ts` |
| `MAX_ROWS` | `200` | `supabase/functions/rag-embed-backfill/index.ts` |
| `EMBED_DIM` | `1536` | `supabase/functions/rag-embed-backfill/index.ts` |
| `CANONICAL_DIM` | `1536` | `supabase/functions/rag-embed-v2/embedder.ts` |
| `CACHE_TTL_MS` | `5` | `supabase/functions/semantic-search/index.ts` |
| `MAX_DESCRIPTION` | `1200` | `supabase/functions/skill-classify-llm/index.ts` |
| `MAX_TAGS` | `20` | `supabase/functions/skill-classify-llm/index.ts` |
| `MAX_TAG` | `40` | `supabase/functions/skill-classify-llm/index.ts` |
| `MODEL` | `'google/gemini-2.5-flash-lite'` | `supabase/functions/skill-describe-llm/index.ts` |
| `MAX_TAGS` | `20` | `supabase/functions/skill-describe-llm/index.ts` |
| `MAX_TAG` | `40` | `supabase/functions/skill-describe-llm/index.ts` |
| `MAX_REPO` | `200` | `supabase/functions/skill-describe-llm/index.ts` |
| `MAX_README` | `4000` | `supabase/functions/skill-describe-llm/index.ts` |
| `MIN_DESCRIPTION` | `40` | `supabase/functions/skill-describe-llm/index.ts` |
| `MAX_DESCRIPTION` | `600` | `supabase/functions/skill-describe-llm/index.ts` |
| `TIME_BUDGET_MS` | `105` | `supabase/functions/skill-harvester/index.ts` |
| `RAW_CONCURRENCY` | `6` | `supabase/functions/skill-harvester/index.ts` |
| `UPSERT_CHUNK` | `50` | `supabase/functions/skill-harvester/index.ts` |
| `FALLBACK_DEPARTMENT` | `'transversal'` | `supabase/functions/skill-harvester/lib.ts` |
| `LOW_CONFIDENCE_THRESHOLD` | `0.18` | `supabase/functions/skill-harvester/lib.ts` |
| `MIN_TRANSVERSAL_SCORE` | `0.2` | `supabase/functions/skill-harvester/lib.ts` |
| `MIN_PLATFORM_DENSITY` | `0.08` | `supabase/functions/skill-harvester/lib.ts` |
| `PLATFORM_TIER_DEPARTMENT` | `'ti'` | `supabase/functions/skill-harvester/lib.ts` |
| `PLATFORM_TIER_CONFIDENCE` | `0.15` | `supabase/functions/skill-harvester/lib.ts` |
| `PLATFORM_EVIDENCE_STEP` | `0.03` | `supabase/functions/skill-harvester/lib.ts` |
| `PLATFORM_TIER_MAX_CONFIDENCE` | `0.4` | `supabase/functions/skill-harvester/lib.ts` |
| `PLATFORM_SINGLE_FIELD_CAP` | `0.17` | `supabase/functions/skill-harvester/lib.ts` |
| `META_PENALTY` | `-45` | `supabase/functions/skill-harvester/lib.ts` |
| `MIN_QUALITY_SCORE` | `35` | `supabase/functions/skill-harvester/lib.ts` |
| `DEFAULT_TEMPLATE` | `'*{{agent_name}}* finalizou com status *{{status}}*.\n'` | `supabase/functions/slack-agent-notify/index.ts` |
| `MAX_ATTEMPTS` | `5` | `supabase/functions/slack-dlq-discard/index.ts` |
| `MAX_ATTEMPTS` | `5` | `supabase/functions/slack-dlq-retry/index.ts` |
| `BATCH_SIZE` | `20` | `supabase/functions/slack-dlq-retry/index.ts` |
| `MAX_MESSAGES_PER_RUN` | `500` | `supabase/functions/slack-rag-sync/index.ts` |
| `PAGE_SIZE` | `200` | `supabase/functions/slack-rag-sync/index.ts` |
| `MAX_STEPS` | `10` | `supabase/functions/smolagent-runtime/index.ts` |
| `STEP_TIMEOUT` | `30000` | `supabase/functions/smolagent-runtime/index.ts` |
| `MAX_CONTEXT_MESSAGES` | `8` | `supabase/functions/smolagent-runtime/index.ts` |
| `TTS_TIMEOUT_MS` | `15000` | `supabase/functions/text-to-speech/index.ts` |
| `CONTEXT_TURNS` | `10` | `supabase/functions/whatsapp-router/index.ts` |
| `MAX_INBOUND_AGE_MS` | `5` | `supabase/functions/whatsapp-router/index.ts` |
| `REPLAY_WINDOW_MS` | `5` | `supabase/functions/whatsapp-webhook/index.ts` |
| `MAX_ITERATIONS` | `50` | `supabase/functions/workflow-engine-v2/index.ts` |
| `STEP_TIMEOUT_MS` | `30000` | `supabase/functions/workflow-engine-v2/index.ts` |

### H.2 Prazos, expirações e janelas de tempo

| Trecho | Arquivo |
|---|---|
| `timeout: 120_000,` | `playwright.config.ts` |
| `gcTime: 10 * 60 * 1000,` | `src/App.tsx` |
| `staleTime: 5 * 60 * 1000,` | `src/App.tsx` |
| `}, 60 * 60 * 1000);` | `src/main.tsx` |
| `toast.promise(new Promise((resolve) => setTimeout(resolve, 2000)), {` | `src/components/agent-builder/modules/DeployModule.tsx` |
| `await new Promise((resolve) => setTimeout(resolve, 2000));` | `src/components/agent-builder/modules/OrchestratorModule.tsx` |
| `await new Promise((resolve) => setTimeout(resolve, 1500));` | `src/components/agent-builder/modules/PromptModule.tsx` |
| `await new Promise((resolve) => setTimeout(resolve, 1500));` | `src/components/agent-builder/modules/RAGModule.tsx` |
| `setTimeout(() => setCopied(false), 2000);` | `src/components/agent-builder/ui/CodeBlock.tsx` |
| `setTimeout(() => setCopied(false), 2000);` | `src/components/agents/AgentCardViewer.tsx` |
| `await new Promise((r) => setTimeout(r, 2000));` | `src/components/agents/CreateAgentWizard.tsx` |
| `{ key: '14d', label: '14d', ms: 14 * 24 * 60 * 60 * 1000, buckets: 14 },` | `src/components/agents/detail/InteractiveSLOPanel.tsx` |
| `{ key: '1h', label: '1h', ms: 60 * 60 * 1000, buckets: 12 },` | `src/components/agents/detail/InteractiveSLOPanel.tsx` |
| `{ key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000, buckets: 12 },` | `src/components/agents/detail/InteractiveSLOPanel.tsx` |
| `{ key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000, buckets: 15 },` | `src/components/agents/detail/InteractiveSLOPanel.tsx` |
| `{ key: '6h', label: '6h', ms: 6 * 60 * 60 * 1000, buckets: 12 },` | `src/components/agents/detail/InteractiveSLOPanel.tsx` |
| `{ key: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000, buckets: 14 },` | `src/components/agents/detail/InteractiveSLOPanel.tsx` |
| `window.setTimeout(() => setActiveMarker((curr) => (curr === id ? null : curr)), 1600);` | `src/components/agents/detail/RestoreDiffPreview.tsx` |
| `const UNDO_WINDOW_MS = 5 * 60 * 1000;` | `src/components/agents/detail/RestoreHistorySection.tsx` |
| `window.setTimeout(() => setCopied(false), 1800);` | `src/components/agents/detail/RestoreSummaryShare.tsx` |
| `const useTime = bucketMs <= 24 * 60 * 60 * 1000;` | `src/components/agents/detail/ViolationDrillDownDialog.tsx` |
| `const useTime = windowMs <= 24 * 60 * 60 * 1000;` | `src/components/agents/detail/ViolationDrillDownDialog.tsx` |
| `const useTimeLabel = windowMs <= 24 * 60 * 60 * 1000;` | `src/components/agents/detail/agentMetricsHelpers.ts` |
| `setTimeout(() => URL.revokeObjectURL(url), 1000);` | `src/components/agents/detail/exportKPIInsights.ts` |
| `window.setTimeout(() => setCopiedLink(false), 1600);` | `src/components/agents/versioning/ShareTimelineState.tsx` |
| `window.setTimeout(() => setCopiedMd(false), 1600);` | `src/components/agents/versioning/ShareTimelineState.tsx` |
| `window.setTimeout(() => { setCopiedId((cur) => (cur === versionId ? null : cur)); }, 1500);` | `src/components/agents/versioning/VersionTimeline.tsx` |
| `const t = window.setTimeout(() => setHighlightField(null), 4000);` | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| `window.setTimeout(() => setA11yFocusAnnounce(''), 2000);` | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| `window.setTimeout(() => setCopied(false), 1800);` | `src/components/agents/wizard/RestoreFeedbackBanner.tsx` |
| `export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias` | `src/components/agents/wizard/draftStore.ts` |
| `export const PROMPT_HISTORY_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 dias` | `src/components/agents/wizard/promptHistoryStore.ts` |
| `const t2 = window.setTimeout(() => setTokenDelta(null), 2400);` | `src/components/agents/wizard/quickSteps/CompiledPromptPreview.tsx` |
| `setTimeout(() => setCopied(false), 2000);` | `src/components/agents/wizard/quickSteps/CompiledPromptPreview.tsx` |
| `window.setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1800);` | `src/components/agents/wizard/quickSteps/PreflightReviewSummary.tsx` |
| `setTimeout(() => setCopied(null), 1500);` | `src/components/agents/wizard/quickSteps/RealExamplePreview.tsx` |
| `pulseTimerRef.current = window.setTimeout(() => setPulsingField(null), 3000);` | `src/components/agents/wizard/quickSteps/StepQuickIdentity.tsx` |
| `sectionPulseRef.current = window.setTimeout(() => { setPulsedSection(null); setPulsedLine(null); }, 1800);` | `src/components/agents/wizard/quickSteps/StepQuickPrompt.tsx` |
| `const start = subDays(today, 29);` | `src/components/dashboard/UsageCharts.tsx` |
| `await new Promise((r) => setTimeout(r, 2000));` | `src/components/datahub/HibernatedDatabasesPanel.tsx` |
| `await new Promise(r => setTimeout(r, 2000));` | `src/components/deployments/DeploymentWizard.tsx` |
| `setTimeout(() => { setSent(false); setPhone(''); setText(''); setOpen(false); }, 1500);` | `src/components/deployments/WhatsAppSendDialog.tsx` |
| `setTimeout(() => { window.print(); setExporting(false); toast.success('Relatório gerado para impressão'); }, 1000);` | `src/components/evaluations/AuditReportDialog.tsx` |
| `<span className="text-meta text-muted-foreground">Log retention: 30 days</span>` | `src/components/integrations/WhatsAppLiveConsole.tsx` |
| `const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();` | `src/components/security/OpenclawEventsPanel.tsx` |
| `window.setTimeout(() => setRetryStatus('idle'), 2000);` | `src/components/shared/ManualCopyDialog.tsx` |
| `const t = setTimeout(() => setVisible(true), 1200);` | `src/components/shared/OnboardingTour.tsx` |
| `window.setTimeout(() => setCopiedId(null), 1500);` | `src/components/slo/DrilldownAuditPanel.tsx` |
| `const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));` | `src/components/super-cerebro/KnowledgeAreasTab.tsx` |
| `staleTime: 5 * 60 * 1000,` | `src/components/super-cerebro/KnowledgeAreasTab.tsx` |
| `clip: { id: 'openai/clip-vit-base-patch32', timeout: 5000 },` | `src/config/huggingface.ts` |
| `embeddings: { id: 'BAAI/bge-m3', dim: 1024, timeout: 5000 },` | `src/config/huggingface.ts` |
| `image: { id: 'google/vit-base-patch16-224', timeout: 5000 },` | `src/config/huggingface.ts` |
| `image: { id: 'stabilityai/stable-diffusion-xl-base-1.0', timeout: 60000 },` | `src/config/huggingface.ts` |
| `language: { id: 'papluca/xlm-roberta-base-language-detection', timeout: 2000 },` | `src/config/huggingface.ts` |
| `ner: { id: 'dslim/bert-base-NER', timeout: 3000 },` | `src/config/huggingface.ts` |
| `nsfw_image: { id: 'Falconsai/nsfw_image_detection', timeout: 5000, threshold: 0.5 },` | `src/config/huggingface.ts` |
| `ocr: { id: 'ibm-granite/granite-vision-3.3-2b', timeout: 30000 },` | `src/config/huggingface.ts` |
| `qa_extractive: { id: 'deepset/roberta-base-squad2', timeout: 5000 },` | `src/config/huggingface.ts` |
| `reranker: { id: 'BAAI/bge-reranker-v2-m3', timeout: 5000 },` | `src/config/huggingface.ts` |
| `sentiment: { id: 'cardiffnlp/twitter-roberta-base-sentiment-latest', timeout: 3000 },` | `src/config/huggingface.ts` |
| `stt: { id: 'openai/whisper-large-v3-turbo', timeout: 30000 },` | `src/config/huggingface.ts` |
| `summarization: { id: 'facebook/bart-large-cnn', timeout: 10000 },` | `src/config/huggingface.ts` |
| `timeout: 3000,` | `src/config/huggingface.ts` |
| `toxicity: { id: 'unitary/toxic-bert', timeout: 3000, threshold: 0.85 },` | `src/config/huggingface.ts` |
| `translation: { id: 'facebook/nllb-200-distilled-600M', timeout: 10000 },` | `src/config/huggingface.ts` |
| `tts_en: { id: 'facebook/mms-tts-eng', timeout: 15000 },` | `src/config/huggingface.ts` |
| `tts_es: { id: 'facebook/mms-tts-spa', timeout: 15000 },` | `src/config/huggingface.ts` |
| `tts_pt: { id: 'facebook/mms-tts-por', timeout: 15000 },` | `src/config/huggingface.ts` |
| `vdu: { id: 'ibm-granite/granite-vision-3.3-2b', timeout: 30000 },` | `src/config/huggingface.ts` |
| `const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);` | `src/hooks/useBillingData.ts` |
| `const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);` | `src/hooks/useBillingData.ts` |
| `const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);` | `src/hooks/useBillingData.ts` |
| `const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);` | `src/hooks/useBillingData.ts` |
| `const weekStart = new Date(monthAgo.getTime() + w * 7 * 24 * 60 * 60 * 1000);` | `src/hooks/useBillingData.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/useOpenclawTemplates.ts` |
| `((cb: () => void) => window.setTimeout(cb, 1500));` | `src/lib/routePrefetch.ts` |
| `{ timeout: 4000 },` | `src/lib/routePrefetch.ts` |
| `const DAY_MS = 24 * 60 * 60 * 1000;` | `src/lib/skills/calibrationGovernance.ts` |
| `const DIA_MS = 24 * 60 * 60 * 1000;` | `src/lib/skills/observability.ts` |
| `duracoesHoras.push((revisado - criado) / (60 * 60 * 1000));` | `src/lib/skills/observability.ts` |
| `Math.max(...stale.map((i) => agora - Date.parse(i.at as string))) / (24 * 60 * 60 * 1000),` | `src/lib/skills/thresholdCalibration.ts` |
| `const corte = agora - janelaDias * 24 * 60 * 60 * 1000;` | `src/lib/skills/thresholdCalibration.ts` |
| `const limiteMs = prazo * 24 * 60 * 60 * 1000;` | `src/lib/skills/thresholdCalibration.ts` |
| `const copyText = (text: string) => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };` | `src/pages/AIStudioPage.tsx` |
| `undoTimer.current = setTimeout(() => { undoSnapshot.current = null; toast.dismiss(toastId); }, 7000);` | `src/pages/AgentTracesPage.tsx` |
| `const t = setTimeout(() => setHighlightId(null), 2800);` | `src/pages/AgentVersioningPage.tsx` |
| `setTimeout(() => setHighlightId(null), 2800);` | `src/pages/AgentVersioningPage.tsx` |
| `window.setTimeout(() => setCopied(false), 1800);` | `src/pages/AgentVersioningPage.tsx` |
| `periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),` | `src/pages/ComplianceReportsPage.tsx` |
| `setTimeout(() => setCopied(null), 2000);` | `src/pages/DeploymentsPage.tsx` |
| `scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),` | `src/pages/GameDaysPage.tsx` |
| `(b) => Date.now() - new Date(b.created_at).getTime() < 24 * 60 * 60 * 1000,` | `src/pages/GovernancePage.tsx` |
| `setTimeout(() => navigate('/'), 2000);` | `src/pages/ResetPasswordPage.tsx` |
| `const to = new Date(from.getTime() + 60 * 60 * 1000);` | `src/pages/SLODashboard.tsx` |
| `await new Promise((r) => setTimeout(r, 1400));` | `src/pages/VisionAgentsPage.tsx` |
| `return sum + d / (1000 * 60 * 60);` | `src/pages/VulnerabilitiesPage.tsx` |
| `const horizon = now - 24 * 60 * 60_000;` | `src/services/alertRulesService.ts` |
| `const diff = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);` | `src/services/assetInventoryService.ts` |
| `const diff = (warranty.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);` | `src/services/assetInventoryService.ts` |
| `const ageDays = createdAt ? (now - createdAt.getTime()) / (24 * 60 * 60 * 1000) : 0;` | `src/services/knowledgeDecayService.ts` |
| `const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);` | `src/services/monitoringService.ts` |
| `return Math.floor(ms / (1000 * 60 * 60 * 24));` | `src/services/secretsRotationService.ts` |
| `const months = (Date.now() - new Date(s.lastCommitAt).getTime()) / (1000 * 60 * 60 * 24 * 30);` | `src/services/skillDepartmentClassifier.ts` |
| `const CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000;` | `src/services/skillHarvestService.ts` |
| `const desde = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();` | `src/services/skillObservabilityService.ts` |
| `export const RESTORE_FAILURES_TTL_MS = 24 * 60 * 60 * 1000;` | `src/services/templateSkillLinkService.ts` |
| `: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();` | `src/services/temporalKnowledgeService.ts` |
| `const effectiveDays = Math.max(0.0001, days === 9999 && oldestAt ? (Date.now() - new Date(oldestAt).getTime()) / (24 * 60 * 60 * 1000) : days);` | `src/services/temporalKnowledgeService.ts` |
| `return { sizeMs: 24 * 60 * 60 * 1000, label: '1d' };` | `src/services/temporalKnowledgeService.ts` |
| `return { sizeMs: 3 * 24 * 60 * 60 * 1000, label: '3d' };` | `src/services/temporalKnowledgeService.ts` |
| `return { sizeMs: 5 * 60 * 1000, label: '5min' };` | `src/services/temporalKnowledgeService.ts` |
| `return { sizeMs: 6 * 60 * 60 * 1000, label: '6h' };` | `src/services/temporalKnowledgeService.ts` |
| `return { sizeMs: 60 * 60 * 1000, label: '1h' };` | `src/services/temporalKnowledgeService.ts` |
| `return { sizeMs: 7 * 24 * 60 * 60 * 1000, label: '7d' };` | `src/services/temporalKnowledgeService.ts` |
| `setTimeout(() => URL.revokeObjectURL(url), 1000);` | `src/services/vaultSyncService.ts` |
| `autoSaveTimer = window.setTimeout(() => { const state = get(); if (state.isDirty && state.agent.id) { state.saveAgent(); } }, 5000);` | `src/stores/agentBuilderStore.ts` |
| `await new Promise((r) => setTimeout(r, 1000));` | `src/stores/oracleStore.ts` |
| `await new Promise((r) => setTimeout(r, 1500));` | `src/stores/oracleStore.ts` |
| `setTimeout(() => get().submitQuery(), 3000);` | `src/stores/oracleStore.ts` |
| `expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),` | `supabase/functions/_shared/idempotency.ts` |
| `await new Promise((r) => setTimeout(r, 1000));` | `supabase/functions/computer-use-execute/index.ts` |
| `await new Promise((r) => setTimeout(r, 1200));` | `supabase/functions/computer-use-execute/index.ts` |
| `await new Promise((r) => setTimeout(r, 1500));` | `supabase/functions/computer-use-execute/index.ts` |
| `const REPLAY_WINDOW_MS = 5 * 60 * 1000;` | `supabase/functions/openclaw-webhook/index.ts` |
| `const SPACE_TIMEOUT = 60000; // 60s for GPU-heavy operations` | `supabase/functions/product-mockup/index.ts` |
| `const timeout = setTimeout(() => controller.abort(), 5000);` | `supabase/functions/rag-rerank/index.ts` |
| `const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes` | `supabase/functions/semantic-search/index.ts` |
| `const months = (Date.now() - new Date(s.lastCommitAt).getTime()) / (1000 * 60 * 60 * 24 * 30);` | `supabase/functions/skill-harvester/lib.ts` |
| `const STEP_TIMEOUT = 30000;` | `supabase/functions/smolagent-runtime/index.ts` |
| `const REPLAY_WINDOW_MS = 5 * 60 * 1000;` | `supabase/functions/whatsapp-webhook/index.ts` |
| `const _SPACE_TIMEOUT = 120000;` | `supabase/functions/workflow-engine-v2/index.ts` |
| `AND created_at > now() - interval '1 hour';` | `supabase/migrations/20260401200000_implement_all_features.sql` |
| `CHECK (expires_at > created_at AND expires_at <= created_at + interval '1 hour')` | `supabase/migrations/20260417233026_dc3dfc7c-1b5d-4880-b111-d3000c55ff7f.sql` |
| `AND triggered_at >= now() - interval '1 hour'` | `supabase/migrations/20260418011629_10215e66-8af6-43ef-8878-dfad3008e2ef.sql` |
| `WHERE t.created_at >= now() - interval '1 hour'` | `supabase/migrations/20260418011629_10215e66-8af6-43ef-8878-dfad3008e2ef.sql` |
| `WHERE t.created_at >= now() - interval '14 days'` | `supabase/migrations/20260418011629_10215e66-8af6-43ef-8878-dfad3008e2ef.sql` |
| `WHERE tt.created_at >= now() - interval '14 days'` | `supabase/migrations/20260418011629_10215e66-8af6-43ef-8878-dfad3008e2ef.sql` |
| `IF NOT EXISTS (SELECT 1 FROM public.budget_events WHERE workspace_id=r.workspace_id AND event_type='soft_warning' AND period='daily' AND triggered_at >= now() - …` | `supabase/migrations/20260418102513_4d1ac25f-4111-4ff9-921c-33a1b4a8e0e2.sql` |
| `IF NOT EXISTS (SELECT 1 FROM public.budget_events WHERE workspace_id=r.workspace_id AND event_type='soft_warning' AND period='monthly' AND triggered_at >= now() …` | `supabase/migrations/20260418102513_4d1ac25f-4111-4ff9-921c-33a1b4a8e0e2.sql` |
| `VALUES (gd.workspace_id, 'Game Day: ' \|\| gd.title, v_target, v_fault, 0.5, 2000, now() + interval '2 hours', true, auth.uid())` | `supabase/migrations/20260418104142_d63430cb-68ff-4115-aa71-60dd8fc6df48.sql` |
| `AND next_rotation_due BETWEEN now() AND now() + interval '7 days';` | `supabase/migrations/20260418130622_50bc8bdd-4752-4321-b754-607b67617c40.sql` |
| `COUNT(*) FILTER (WHERE status != 'retired' AND next_rotation_due BETWEEN now() AND now() + interval '7 days'),` | `supabase/migrations/20260418130622_50bc8bdd-4752-4321-b754-607b67617c40.sql` |
| `COUNT(*) FILTER (WHERE status = 'active' AND (next_rotation_due IS NULL OR next_rotation_due > now() + interval '7 days')),` | `supabase/migrations/20260418130622_50bc8bdd-4752-4321-b754-607b67617c40.sql` |
| `WHEN v_next < now() + interval '7 days' THEN 'pending_rotation'` | `supabase/migrations/20260418130622_50bc8bdd-4752-4321-b754-607b67617c40.sql` |
| `ELSE interval '365 days'` | `supabase/migrations/20260418132552_7ea64f19-f06f-4331-ae2b-3bcfdda427e8.sql` |
| `WHEN 'critical' THEN interval '7 days'` | `supabase/migrations/20260418132552_7ea64f19-f06f-4331-ae2b-3bcfdda427e8.sql` |
| `WHEN 'high' THEN interval '30 days'` | `supabase/migrations/20260418132552_7ea64f19-f06f-4331-ae2b-3bcfdda427e8.sql` |
| `WHEN 'low' THEN interval '180 days'` | `supabase/migrations/20260418132552_7ea64f19-f06f-4331-ae2b-3bcfdda427e8.sql` |
| `WHEN 'medium' THEN interval '90 days'` | `supabase/migrations/20260418132552_7ea64f19-f06f-4331-ae2b-3bcfdda427e8.sql` |
| `next_review_due TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),` | `supabase/migrations/20260418134141_767d2a2b-4edb-4e37-9a3e-59845e843de2.sql` |
| `v_interval := CASE WHEN NEW.new_residual_score >= 15 THEN interval '30 days' ELSE interval '90 days' END;` | `supabase/migrations/20260418134141_767d2a2b-4edb-4e37-9a3e-59845e843de2.sql` |
| `COUNT(*) FILTER (WHERE status != 'offboarded' AND dpa_signed AND dpa_expires_at BETWEEN now() AND now() + interval '30 days'),` | `supabase/migrations/20260418140149_8c99b7b5-9e49-4a90-ac85-77c1f5136dbb.sql` |
| `ELSE interval '365 days'` | `supabase/migrations/20260418140149_8c99b7b5-9e49-4a90-ac85-77c1f5136dbb.sql` |
| `WHEN 'critical' THEN interval '90 days'` | `supabase/migrations/20260418140149_8c99b7b5-9e49-4a90-ac85-77c1f5136dbb.sql` |
| `WHEN 'high' THEN interval '180 days'` | `supabase/migrations/20260418140149_8c99b7b5-9e49-4a90-ac85-77c1f5136dbb.sql` |
| `AND completed_at >= now() - interval '30 days'` | `supabase/migrations/20260418143754_22af56b9-e9e9-44ee-89c3-792d14d4af75.sql` |
| `AND scheduled_for BETWEEN now() AND now() + interval '7 days';` | `supabase/migrations/20260418143754_22af56b9-e9e9-44ee-89c3-792d14d4af75.sql` |
| `AND executed_at >= now() - interval '180 days';` | `supabase/migrations/20260418144313_34245c62-9cfd-42b3-ad13-f8a1aa177335.sql` |
| `AND executed_at >= now() - interval '90 days';` | `supabase/migrations/20260418144313_34245c62-9cfd-42b3-ad13-f8a1aa177335.sql` |
| `COUNT(*) FILTER (WHERE status != 'decommissioned' AND (last_seen_at IS NULL OR last_seen_at < now() - interval '90 days')),` | `supabase/migrations/20260418151333_f71cf0bb-06c1-4f23-820c-398fdd4b6ffc.sql` |
| `COUNT(*) FILTER (WHERE status = 'active' AND warranty_until IS NOT NULL AND warranty_until <= (now() + interval '30 days')::date AND warranty_until >= now()::da …` | `supabase/migrations/20260418151333_f71cf0bb-06c1-4f23-820c-398fdd4b6ffc.sql` |
| `CASE WHEN random() > 0.4 THEN now() - (random() * interval '3 days') END,` | `supabase/migrations/20260421183536_947275a3-1cd6-4aa8-8dc1-47725d8738cc.sql` |
| `now() - (interval '1 day' * (a.version - v.version) * 7) - (random() * interval '6 hours')` | `supabase/migrations/20260421183536_947275a3-1cd6-4aa8-8dc1-47725d8738cc.sql` |
| `now() - (random() * interval '14 days')` | `supabase/migrations/20260421183536_947275a3-1cd6-4aa8-8dc1-47725d8738cc.sql` |
| `now() - (random() * interval '48 hours')` | `supabase/migrations/20260421183536_947275a3-1cd6-4aa8-8dc1-47725d8738cc.sql` |
| `end_date := start_date + interval '1 month';` | `supabase/migrations/20260513143630_cc1271a4-4da5-41f3-8c30-6527ccb75e84.sql` |
| `AND created_at > (now() - interval '15 minutes');` | `supabase/migrations/20260513164014_8d090b02-bd48-4bc8-91ec-3cbc52254c3a.sql` |
| `AND created_at > (now() - interval '1 minute');` | `supabase/migrations/20260513175210_4dba7ebe-924a-4906-af1c-31e94145799f.sql` |
| `DELETE FROM public.auth_attempts WHERE created_at < (now() - interval '24 hours');` | `supabase/migrations/20260513175210_4dba7ebe-924a-4906-af1c-31e94145799f.sql` |
| `AND created_at > now() - interval '10 minutes';` | `supabase/migrations/20260522143348_ea6a74b7-03fb-4799-ad67-7b15ce6de8b6.sql` |
| `AND created_at > now() - interval '1 hour'` | `supabase/migrations/20260711145341_79d9091c-8cdd-400d-9a95-7be037c213ef.sql` |
| `IF last_success IS NULL OR last_success < now() - interval '26 hours' THEN` | `supabase/migrations/20260711145341_79d9091c-8cdd-400d-9a95-7be037c213ef.sql` |
| `DELETE FROM public.pg_net_smoke_runs WHERE run_at < now() - interval '30 days';` | `supabase/migrations/20260711150423_bba9de7c-1db3-4f2d-b5b6-0d350a14cd37.sql` |
| `WHERE created_at > (now() - interval '90 days')` | `supabase/migrations/20260711164855_cc5be0d0-5efc-49e7-af14-ebd6028eb3fc.sql` |
| `WHERE created_at > (now() - interval '90 days')` | `supabase/migrations/20260711184857_ce70aa1d-6251-4af5-875c-aab67f442443.sql` |
| `WHERE created_at > (now() - interval '90 days')` | `supabase/migrations/20260711184926_992578aa-e1ad-4639-9a11-c5569d30fdf3.sql` |
| `v_month_end := v_month_start + interval '1 month';` | `supabase/migrations/20260711192438_0faffc45-e93e-4815-aa19-74e1ca834c37.sql` |
| `v_month_end := v_month_start + interval '1 month';` | `supabase/migrations/20260711192512_df9581f3-1f61-47a0-bafc-96d3d92ecce7.sql` |
| `AND created_at > now() - interval '24 hours'` | `supabase/migrations/20260712110111_d29cf27d-e265-45e4-9c07-ea47c7556b1d.sql` |
| `DELETE FROM internal.index_usage_snapshots WHERE captured_at < now() - interval '90 days';` | `supabase/migrations/20260712110111_d29cf27d-e265-45e4-9c07-ea47c7556b1d.sql` |
| `DELETE FROM internal.query_stats_snapshots WHERE captured_at < now() - interval '90 days';` | `supabase/migrations/20260712110111_d29cf27d-e265-45e4-9c07-ea47c7556b1d.sql` |
| `DELETE FROM internal.table_activity_snapshots WHERE captured_at < now() - interval '90 days';` | `supabase/migrations/20260712110111_d29cf27d-e265-45e4-9c07-ea47c7556b1d.sql` |
| `WHERE captured_at < now() - interval '20 hours'` | `supabase/migrations/20260712110111_d29cf27d-e265-45e4-9c07-ea47c7556b1d.sql` |
| `v_month_end := v_month_start + interval '1 month';` | `supabase/migrations/20260712215454_215504ed-3c90-49f7-b332-c9a488eea328.sql` |
| `v_next_month := date_trunc('month', now() + interval '1 month');` | `supabase/migrations/20260712215454_215504ed-3c90-49f7-b332-c9a488eea328.sql` |
| `AND COALESCE(ended_at, started_at, created_at) < now() - interval '90 days'` | `supabase/migrations/20260712221325_43a8ea08-bda6-4ab8-a468-36bd9d01b3d3.sql` |
| `AND started_at < now() - interval '30 minutes'` | `supabase/migrations/20260712221325_43a8ea08-bda6-4ab8-a468-36bd9d01b3d3.sql` |
| `WHERE d.start_time > now() - interval '7 days'` | `supabase/migrations/20260712221437_31901b0b-0cd4-4771-9ced-9ee2e38ce51e.sql` |
| `v_next_month := date_trunc('month', now() + interval '1 month');` | `supabase/migrations/20260715191943_0597223c-3835-4889-962d-57b2000ba799.sql` |
| `$cron$DELETE FROM public.openclaw_events WHERE created_at < now() - interval '30 days';$cron$` | `supabase/migrations/20260721155600_72a5ec4e-2f3f-4e6c-920c-6ca21ac9fa07.sql` |
| `$cron$DELETE FROM public.openclaw_whatsapp_messages WHERE created_at < now() - interval '90 days';$cron$` | `supabase/migrations/20260721155600_72a5ec4e-2f3f-4e6c-920c-6ca21ac9fa07.sql` |
| `(COUNT(*) FILTER (WHERE updated_at >= now() - interval '90 days'))::numeric` | `supabase/migrations/20260721213027_70f2f2d9-a70d-4da3-afd3-98ec46e6ff42.sql` |
| `v_month_end := v_month_start + interval '1 month';` | `supabase/migrations/20260722104539_1475b2eb-9d87-4cac-9e26-b2349cdf27bb.sql` |
| `v_month_end := v_month_start + interval '1 month';` | `supabase/migrations/20260722104652_8ed83857-9861-4cb5-a3cd-8cba9d7bf225.sql` |
| `v_test_month := date_trunc('month', now() + interval '12 months')::date;` | `supabase/migrations/20260722104800_d33ba9a5-6ed0-4f25-9920-08b29897a9b6.sql` |
| `AND now() - query_start > interval '5 minutes'` | `supabase/migrations/20260722124026_35cf7125-c9a6-4b50-8ee6-e8d689fa9f27.sql` |
| `AND query_start < now() - interval '5 minutes'` | `supabase/migrations/20260722124331_86dd7534-fd10-49af-bb86-10c95991a27f.sql` |
| `AND query_start < now() - interval '5 minutes'` | `supabase/migrations/20260722125118_5ca7daa2-9a79-43cf-90e6-2fa8734fad1e.sql` |
| `AND created_at > now() - interval '24 hours'` | `supabase/migrations/20260722131714_a629dcc0-0085-420c-b3e8-cd4aa9ba2a44.sql` |
| `AND now() - query_start > interval '5 minutes';` | `supabase/migrations/20260722145902_bffbbc2f-7da7-4f0e-b6a8-be6145c81fd8.sql` |
| `WHERE captured_at < now() - interval '30 days';` | `supabase/migrations/20260722145902_bffbbc2f-7da7-4f0e-b6a8-be6145c81fd8.sql` |
| `AND captured_at >= now() - interval '75 minutes'` | `supabase/migrations/20260722150725_4521cb94-3976-49fb-bb41-77e85d84133d.sql` |
| `AND created_at > now() - interval '60 minutes'` | `supabase/migrations/20260722150725_4521cb94-3976-49fb-bb41-77e85d84133d.sql` |
| `WHERE captured_at <= now() - interval '55 minutes'` | `supabase/migrations/20260722150725_4521cb94-3976-49fb-bb41-77e85d84133d.sql` |
| `(now() - interval '10 seconds', 0, 0, 100, 0, 0, 9999, v_marker),` | `supabase/migrations/20260722151353_92ffa439-904b-4b2a-bffd-f4f2d215c5c6.sql` |
| `AND created_at > v_started - interval '2 seconds'` | `supabase/migrations/20260722151353_92ffa439-904b-4b2a-bffd-f4f2d215c5c6.sql` |
| `(v_now - interval '10 minutes', 50 * 1024 * 1024, 85, 0, v_marker),` | `supabase/migrations/20260722154138_2ef2284f-1a62-42ab-86d6-2a9568b047aa.sql` |
| `(v_now - interval '5 minutes', 50 * 1024 * 1024, 87, 0, v_marker),` | `supabase/migrations/20260722154138_2ef2284f-1a62-42ab-86d6-2a9568b047aa.sql` |
| `(v_now - interval '62 minutes', 100 * 1024 * 1024, 10, 0, v_marker),` | `supabase/migrations/20260722154138_2ef2284f-1a62-42ab-86d6-2a9568b047aa.sql` |
| `AND created_at >= v_now - interval '1 minute'` | `supabase/migrations/20260722154138_2ef2284f-1a62-42ab-86d6-2a9568b047aa.sql` |
| `v_month_end := v_month_start + interval '1 month';` | `supabase/migrations/20260723141945_e08ee79f-579b-41be-97fc-484b2566f265.sql` |
| `(max(start_at) + interval '1 month')::timestamptz AS latest_partition_end,` | `supabase/migrations/20260723152443_d19bbd30-ca0d-47d0-be15-b91d873dcb3a.sql` |
| `'ip_blocked_until', (now() + interval '15 minutes')` | `supabase/migrations/20260724000011_auth_attempts_hardening.sql` |
| `AND created_at > (now() - interval '15 minutes');` | `supabase/migrations/20260724000011_auth_attempts_hardening.sql` |
| `AND expires_at < (now() - interval '1 day');` | `supabase/migrations/20260724000011_auth_attempts_hardening.sql` |
| `AND last_attempt_at > (now() - interval '15 minutes');` | `supabase/migrations/20260724000011_auth_attempts_hardening.sql` |
| `SET is_blocked = true, blocked_until = (now() + interval '15 minutes')` | `supabase/migrations/20260724000011_auth_attempts_hardening.sql` |
| `WHERE created_at < (now() - interval '90 days');` | `supabase/migrations/20260724000011_auth_attempts_hardening.sql` |
| `WHERE last_attempt_at < (now() - interval '24 hours');` | `supabase/migrations/20260724000011_auth_attempts_hardening.sql` |
| `AND dpr.next_review_due <= (now() + interval '7 days')` | `supabase/migrations/20260724000013_lgpd_cron_jobs.sql` |
| `AND dsr.deadline_at <= (now() + interval '2 days')` | `supabase/migrations/20260724000013_lgpd_cron_jobs.sql` |
| `(max(start_at) + interval '1 month')::timestamptz AS latest_partition_end,` | `supabase/migrations/20260726204355_90a04af6-4543-45c9-91ec-0b63a63cb84b.sql` |
| `WHERE d.start_time > now() - interval '7 days'` | `supabase/migrations/20260726205416_3215b858-4366-4e15-9634-11031376ad5c.sql` |
| `AND created_at < now() - interval '7 days';` | `supabase/migrations/20260726211808_7cffd6d1-d513-43b5-b67b-cdd1b243ba3b.sql` |
| `DELETE FROM public.cron_schedule_executions WHERE created_at < now() - interval '30 days';` | `supabase/migrations/20260726211808_7cffd6d1-d513-43b5-b67b-cdd1b243ba3b.sql` |
| `DELETE FROM public.security_events WHERE created_at < now() - interval '180 days';` | `supabase/migrations/20260726211808_7cffd6d1-d513-43b5-b67b-cdd1b243ba3b.sql` |
| `DELETE FROM public.webhook_delivery_logs WHERE created_at < now() - interval '30 days';` | `supabase/migrations/20260726211808_7cffd6d1-d513-43b5-b67b-cdd1b243ba3b.sql` |
| `v_month_end := v_month_start + interval '1 month';` | `supabase/migrations/20260726211808_7cffd6d1-d513-43b5-b67b-cdd1b243ba3b.sql` |
| `v_next_month := date_trunc('month', now() + interval '1 month');` | `supabase/migrations/20260726211808_7cffd6d1-d513-43b5-b67b-cdd1b243ba3b.sql` |
| `DELETE FROM public.cron_schedule_executions WHERE created_at < now() - interval '30 days';` | `supabase/migrations/20260726212357_0b2dc8f3-7ffe-4631-8c73-623fd379bdde.sql` |
| `DELETE FROM public.security_events WHERE created_at < now() - interval '180 days';` | `supabase/migrations/20260726212357_0b2dc8f3-7ffe-4631-8c73-623fd379bdde.sql` |
| `DELETE FROM public.webhook_delivery_logs WHERE created_at < now() - interval '30 days';` | `supabase/migrations/20260726212357_0b2dc8f3-7ffe-4631-8c73-623fd379bdde.sql` |
| `OR (status = 'dead_letter' AND created_at < now() - interval '90 days');` | `supabase/migrations/20260726212357_0b2dc8f3-7ffe-4631-8c73-623fd379bdde.sql` |
| `OR (status = 'failed' AND created_at < now() - interval '30 days')` | `supabase/migrations/20260726212357_0b2dc8f3-7ffe-4631-8c73-623fd379bdde.sql` |
| `WHERE (status = 'completed' AND created_at < now() - interval '7 days')` | `supabase/migrations/20260726212357_0b2dc8f3-7ffe-4631-8c73-623fd379bdde.sql` |
| `CREATE OR REPLACE FUNCTION public.purge_stale_harvest_checkpoints(_max_age interval DEFAULT interval '24 hours')` | `supabase/migrations/20260728173157_f38e019d-7b41-4e45-b713-45fdd1057cbc.sql` |
| `'ip_blocked_until', (now() + interval '15 minutes')` | `supabase/migrations/20260805000001_security_bug_corrections.sql` |
| `AND created_at > (now() - interval '15 minutes');` | `supabase/migrations/20260805000001_security_bug_corrections.sql` |
| `AND last_attempt_at > (now() - interval '15 minutes');` | `supabase/migrations/20260805000001_security_bug_corrections.sql` |
| `SET is_blocked = true, blocked_until = (now() + interval '15 minutes')` | `supabase/migrations/20260805000001_security_bug_corrections.sql` |
| `COUNT(*) FILTER (WHERE status != 'offboarded' AND dpa_signed AND dpa_expires_at BETWEEN now() AND now() + interval '30 days'),` | `supabase/migrations/20260905140000_security_hotfix_validation.sql` |
| `VALUES (gd.workspace_id, 'Game Day: ' \|\| gd.title, v_target, v_fault, 0.5, 2000, now() + interval '2 hours', true, auth.uid())` | `supabase/migrations/20261121120000_finish_partial_work_entidades.sql` |

### H.3 Limites de paginação

| Limite | Arquivo |
|---|---|
| 1 | `src/components/agents/detail/RestoreHistorySection.tsx` |
| 300 | `src/components/agents/versioning/RunFilter.tsx` |
| 100 | `src/components/deployments/WhatsAppInboxPanel.tsx` |
| 5000 | `src/components/metrics/RandomRecallMetricsCard.tsx` |
| 100 | `src/components/prompts/CreateExperimentDialog.tsx` |
| 100 | `src/components/security/OpenclawEventsPanel.tsx` |
| 10 | `src/components/shared/CommandPalette.tsx` |
| 8 | `src/components/shared/CommandPalette.tsx` |
| 20 | `src/components/shared/NotificationsDrawer.tsx` |
| 2000 | `src/components/super-cerebro/notebook/AdvancedSearchPanel.tsx` |
| 200 | `src/components/super-cerebro/notebook/SourcesPanel.tsx` |
| 1 | `src/components/super-cerebro/notebook/WikilinkHoverCard.tsx` |
| 1 | `src/hooks/use-workflow-persistence.ts` |
| 50 | `src/hooks/useAgentEvals.ts` |
| 500 | `src/hooks/useAgentExperiments.ts` |
| 50 | `src/hooks/useAgentVersions.ts` |
| 50 | `src/hooks/useAgentWorkflows.ts` |
| 50 | `src/hooks/useAutomationRules.ts` |
| 1 | `src/hooks/useCurrentWorkspace.ts` |
| 1 | `src/hooks/useRBAC.ts` |
| 1 | `src/lib/agentExportImport.ts` |
| 1 | `src/lib/agentService.ts` |
| 50 | `src/lib/oracleHistory.ts` |
| 50 | `src/pages/A2APanelPage.tsx` |
| 200 | `src/pages/AgentSessionsPage.tsx` |
| 300 | `src/pages/AgentSessionsPage.tsx` |
| 200 | `src/pages/AgentWorkflowsPage.tsx` |
| 50 | `src/pages/BudgetsPage.tsx` |
| 200 | `src/pages/EntityResolutionLogsPage.tsx` |
| 200 | `src/pages/ForensicSnapshotsPage.tsx` |
| 200 | `src/pages/GraphExecutionsPage.tsx` |
| 1000 | `src/pages/LlmCostByCallerPage.tsx` |
| 500 | `src/pages/ReplayForkPage.tsx` |
| 50 | `src/pages/SystemJobsPage.tsx` |
| 200 | `src/pages/TracesTimelinePage.tsx` |
| 100 | `src/pages/WebhookEventsPage.tsx` |
| 50 | `src/pages/WebhookEventsPage.tsx` |
| 1000 | `src/services/agentBehaviorImpactService.ts` |
| 500 | `src/services/agentDayDetailsService.ts` |
| 50 | `src/services/agentGraphService.ts` |
| 200 | `src/services/agentPromptSimulationService.ts` |
| 10000 | `src/services/agentSkillLoadService.ts` |
| 500 | `src/services/agentSkillLoadService.ts` |
| 1000 | `src/services/agentTracesService.ts` |
| 1 | `src/services/agentsService.ts` |
| 20 | `src/services/approvalService.ts` |
| 1 | `src/services/auditLogService.ts` |
| 1 | `src/services/cerebroService.ts` |
| 100 | `src/services/chaosService.ts` |
| 1 | `src/services/chatThreadService.ts` |
| 50 | `src/services/chatThreadService.ts` |
| 500 | `src/services/chatThreadService.ts` |
| 200 | `src/services/crmCadenceService.ts` |
| 2000 | `src/services/crmCadenceService.ts` |
| 5000 | `src/services/crmCadenceService.ts` |
| 10000 | `src/services/crmScoringService.ts` |
| 2000 | `src/services/crmScoringService.ts` |
| 5000 | `src/services/crmScoringService.ts` |
| 1000 | `src/services/cronSchedulerService.ts` |
| 200 | `src/services/documentIngestionService.ts` |
| 50 | `src/services/documentIngestionService.ts` |
| 50 | `src/services/drDrillService.ts` |
| 1 | `src/services/knowledgeService.ts` |
| 50 | `src/services/marketplaceService.ts` |
| 1 | `src/services/monitoringService.ts` |
| 50 | `src/services/noteVersionsService.ts` |
| 1 | `src/services/notebooksService.ts` |
| 1 | `src/services/notesService.ts` |
| 100 | `src/services/notificationEngineService.ts` |
| 100 | `src/services/replayForkService.ts` |
| 1 | `src/services/securityService.ts` |
| 100 | `src/services/securityService.ts` |
| 20 | `src/services/skillHarvestService.ts` |
| 1000 | `src/services/skillLibraryService.ts` |
| 5000 | `src/services/vaultSyncService.ts` |
| 1 | `src/services/workflowCheckpointService.ts` |
| 1 | `src/services/workspaceContextService.ts` |
| 1 | `supabase/functions/_shared/auth.ts` |
| 50 | `supabase/functions/_shared/memory-tiers.ts` |
| 100 | `supabase/functions/_shared/skills.ts` |
| 20 | `supabase/functions/a2a-server/index.ts` |
| 1 | `supabase/functions/cerebro-brain/index.ts` |
| 10 | `supabase/functions/cerebro-brain/index.ts` |
| 100 | `supabase/functions/cerebro-brain/index.ts` |
| 20 | `supabase/functions/cerebro-brain/index.ts` |
| 200 | `supabase/functions/cerebro-brain/index.ts` |
| 1 | `supabase/functions/cerebro-query/index.ts` |
| 15 | `supabase/functions/cerebro-query/index.ts` |
| 1 | `supabase/functions/crm-cadence-runner/index.ts` |
| 5000 | `supabase/functions/crm-enrich/index.ts` |
| 50 | `supabase/functions/cron-executor/index.ts` |
| 20 | `supabase/functions/datahub-query/index.ts` |
| 5 | `supabase/functions/datahub-query/index.ts` |
| 50 | `supabase/functions/datahub-query/index.ts` |
| 1 | `supabase/functions/eval-judge/index.ts` |
| 1 | `supabase/functions/health-check/index.ts` |
| 1 | `supabase/functions/hf-autotrain/index.ts` |
| 10 | `supabase/functions/kb-analyze-gaps/index.ts` |
| 100 | `supabase/functions/kb-analyze-gaps/index.ts` |
| 1000 | `supabase/functions/lgpd-manager/index.ts` |
| 1 | `supabase/functions/llm-gateway/index.ts` |
| 1 | `supabase/functions/memory-tools/index.ts` |
| 20 | `supabase/functions/memory-tools/index.ts` |
| 10 | `supabase/functions/notebook-podcast-generate/index.ts` |
| 30 | `supabase/functions/notebook-podcast-generate/index.ts` |
| 1 | `supabase/functions/rag-embed-v2/index.ts` |
| 1 | `supabase/functions/rag-ingest/index.ts` |
| 1 | `supabase/functions/rag-rerank/index.ts` |
| 1 | `supabase/functions/rag-rerank-v2/index.ts` |
| 1 | `supabase/functions/smolagent-runtime/index.ts` |
| 50 | `supabase/functions/synthetic-runner/index.ts` |
| 1 | `supabase/functions/voice-session/index.ts` |
| 1 | `supabase/functions/whatsapp-webhook/index.ts` |

## I. Regras implícitas em mensagens de erro/validação

| Mensagem | Arquivo |
|---|---|
| Service client requested but Auth E2E tests are not enabled. | `e2e/helpers/auth-fixtures.ts` |
| createE2EUser failed: ${error?.message ??  | `e2e/helpers/auth-fixtures.ts` |
| falha fixture | `scripts/automation.unit.mjs` |
| MCP HTTP ${res.status}: ${await res.text().catch(() =>  | `scripts/db-drift-check.mjs` |
| MCP error: ${JSON.stringify(payload.error)} | `scripts/db-drift-check.mjs` |
| Resposta MCP inesperada: ${JSON.stringify(result).slice(0, 400)} | `scripts/db-drift-check.mjs` |
| ${msg}: esperado ${JSON.stringify(b)} obtido ${JSON.stringify(a)} | `scripts/ai-context/cenarios.mjs` |
| Argumento desconhecido: ${arg} | `scripts/ci/a11y-button-name-ratchet.mjs` |
| Valor ausente para ${arg}. | `scripts/ci/a11y-button-name-ratchet.mjs` |
| Argumento desconhecido: ${argv[i]} | `scripts/ci/check-bundle-secrets.mjs` |
| ), { recursive: true });   mkdirSync(path.join(raiz,  | `scripts/ci/check-edge-error-exposure.unit.mjs` |
| TypeScript local nao encontrado em ${tscEntry}.  | `scripts/ci/implicit-any-ratchet.mjs` |
| tsc saiu com exit ${status} (falha de CLI, nao lista de diagnosticos): ${snippet(output)} | `scripts/ci/implicit-any-ratchet.mjs` |
| tsc saiu com exit ${status} com diagnostico GLOBAL (config/CLI quebrada), que nao e uma  | `scripts/ci/implicit-any-ratchet.mjs` |
| tsc saiu com exit ${status} sem nenhum diagnostico TypeScript reconhecivel  | `scripts/ci/implicit-any-ratchet.mjs` |
| ${label} falhou com exit ${result.status}: ${normalizeWhitespace(result.stderr)} | `scripts/ci/lint-ratchet.mjs` |
| --base nao combina com --staged. | `scripts/ci/lint-ratchet.mjs` |
| --base nao combina com --update-baseline. | `scripts/ci/lint-ratchet.mjs` |
| --staged nao combina com --update-baseline. | `scripts/ci/lint-ratchet.mjs` |
| Argumento desconhecido: ${argument} | `scripts/ci/lint-ratchet.mjs` |
| Baseline ESLint invalido ou com schema diferente de ${SCHEMA_VERSION}. | `scripts/ci/lint-ratchet.mjs` |
| ESLint falhou com exit ${result.status}: ${normalizeWhitespace(result.stderr)} | `scripts/ci/lint-ratchet.mjs` |
| ESLint local nao encontrado. Execute a instalacao das dependencias primeiro. | `scripts/ci/lint-ratchet.mjs` |
| ESLint nao produziu JSON valido: ${error.message} | `scripts/ci/lint-ratchet.mjs` |
| Entrada invalida no relatorio JSON do ESLint. | `scripts/ci/lint-ratchet.mjs` |
| Nao foi possivel ler ${description} em ${filePath}: ${error.message} | `scripts/ci/lint-ratchet.mjs` |
| O ESLint ou eslint.config.js mudou desde a geracao do baseline. Revise a mudanca e regenere o baseline. | `scripts/ci/lint-ratchet.mjs` |
| O relatorio do ESLint deve ser um array JSON. | `scripts/ci/lint-ratchet.mjs` |
| Valor ausente para ${argument}. | `scripts/ci/lint-ratchet.mjs` |
| Argumento desconhecido: ${argument} | `scripts/ci/typecheck-ratchet.mjs` |
| Baseline de typecheck invalido ou com schema diferente de ${SCHEMA_VERSION}. | `scripts/ci/typecheck-ratchet.mjs` |
| Nao foi possivel ler ${description} em ${filePath}: ${error.message} | `scripts/ci/typecheck-ratchet.mjs` |
| TypeScript local nao encontrado. Execute a instalacao das dependencias primeiro. | `scripts/ci/typecheck-ratchet.mjs` |
| Valor ausente para ${argument}. | `scripts/ci/typecheck-ratchet.mjs` |
| tsc -b falhou com exit ${status}: ${normalizeWhitespace(output)} | `scripts/ci/typecheck-ratchet.mjs` |
| tsc -b saiu com exit ${status} sem nenhum diagnostico TypeScript parseavel  | `scripts/ci/typecheck-ratchet.mjs` |
| Deployment manifest is stale: ${output}. Run: node scripts/edge-deploy/generate-manifest.mjs && git add ${output} && git commit -m  | `scripts/edge-deploy/generate-manifest.mjs` |
| Unknown argument: ${argv[index]} | `scripts/edge-deploy/generate-manifest.mjs` |
| legacy-functions.json must be a JSON array of strings | `scripts/edge-deploy/generate-manifest.mjs` |
| ${expected.name}: remote function must be ACTIVE with a positive version | `scripts/edge-deploy/manifest-lib.mjs` |
| ${label} escapes ${parent}: ${candidate} | `scripts/edge-deploy/manifest-lib.mjs` |
| Duplicate function config: ${currentFunction} | `scripts/edge-deploy/manifest-lib.mjs` |
| Duplicate remote function: ${name} | `scripts/edge-deploy/manifest-lib.mjs` |
| Function configured but missing entrypoint: ${configuredName} | `scripts/edge-deploy/manifest-lib.mjs` |
| Function directory missing index.ts: ${entry.name} | `scripts/edge-deploy/manifest-lib.mjs` |
| Manifest digest mismatch: expected ${expected}, received ${actual} | `scripts/edge-deploy/manifest-lib.mjs` |
| No Edge Functions found | `scripts/edge-deploy/manifest-lib.mjs` |
| Remote function without slug | `scripts/edge-deploy/manifest-lib.mjs` |
| Supabase Management API response is not an array | `scripts/edge-deploy/manifest-lib.mjs` |
| Symlinks are forbidden in Edge sources: ${candidate} | `scripts/edge-deploy/manifest-lib.mjs` |
| Unresolved local import ${specifier} from ${sourceFile} | `scripts/edge-deploy/manifest-lib.mjs` |
| supabase/config.toml has no valid project_id | `scripts/edge-deploy/manifest-lib.mjs` |
| --entrada exige o caminho do arquivo com a resposta do banco.sql | `scripts/inventario/gerar-banco.mjs` |
| Management API ${caminho} respondeu HTTP ${res.status} | `scripts/inventario/gerar-banco.mjs` |
| SUPABASE_PROJECT_REF=${ref} nao e o banco oficial (${PROJETO_OFICIAL}). | `scripts/inventario/gerar-banco.mjs` |
| a resposta nao parece ser do banco oficial: ${comuns} tabelas em comum com o manifesto  | `scripts/inventario/gerar-banco.mjs` |
| a resposta nao parece ser do banco oficial: ledger com ${registros} registros e maior versao ${max};  | `scripts/inventario/gerar-banco.mjs` |
| a resposta nao traz resumo.ledger_versao_max/ledger_registros; rode o banco.sql atual. | `scripts/inventario/gerar-banco.mjs` |
| a saida tem algo com cara de credencial; nada foi gravado. Revise banco.sql. | `scripts/inventario/gerar-banco.mjs` |
| entrada sem as chaves: ${faltando.join( | `scripts/inventario/gerar-banco.mjs` |
| entrada sem tabelas | `scripts/inventario/gerar-banco.mjs` |
| format_version ${dado.format_version} desconhecido (esperado 1) | `scripts/inventario/gerar-banco.mjs` |
| sem --entrada e sem SUPABASE_ACCESS_TOKEN: nada para ler (veja o cabecalho do script). | `scripts/inventario/gerar-banco.mjs` |
| ripgrep (rg) falhou com exit ${status}; o inventário não foi gerado. | `scripts/inventario/gerar-repo.mjs` |
| ripgrep (rg) não encontrado; o inventário não pode ser gerado com segurança. | `scripts/inventario/gerar-repo.mjs` |
| caminho de  | `scripts/lib/seguranca-processo.mjs` |
| comando nao encontrado no PATH:  | `scripts/lib/seguranca-processo.mjs` |
| failed | `scripts/maintenance/lib.mjs` |
| missing_dependencies | `scripts/maintenance/lib.mjs` |
| skipped_busy | `scripts/maintenance/lib.mjs` |
| formatter fixture failed | `scripts/maintenance/maintenance.unit.mjs` |
| blocked_network_sandbox | `scripts/maintenance/run.mjs` |
| pending_patch | `scripts/maintenance/run.mjs` |
| O teste offline não permite consultas ao banco | `scripts/supabase_snapshot/test_snapshot.py` |
| banco indisponível na fixture | `scripts/supabase_snapshot/test_snapshot.py` |
| catálogo indisponível na fixture | `scripts/supabase_snapshot/test_snapshot.py` |
| permission denied for schema auth | `scripts/supabase_snapshot/test_snapshot.py` |
| relation  | `scripts/supabase_snapshot/test_snapshot.py` |
| statement timeout simulado | `scripts/supabase_snapshot/test_snapshot.py` |
| view removida depois da consulta ao catálogo | `scripts/supabase_snapshot/test_snapshot.py` |
| view sem permissão na fixture | `scripts/supabase_snapshot/test_snapshot.py` |
| Operação falhou | `src/App.tsx` |
| Nada para exportar | `src/components/admin/AuditTrailPanel.tsx` |
| ${draft.label} — ${validation.errors.length} validação(ões) ignorada(s). | `src/components/agent-builder/DraftVersionsDialog.tsx` |
| Configuração inválida:  | `src/components/agent-builder/GuardrailsPolicyEditor.tsx` |
| Falha ao carregar policy de guardrails | `src/components/agent-builder/GuardrailsPolicyEditor.tsx` |
| Falha no teste de guardrails | `src/components/agent-builder/GuardrailsPolicyEditor.tsx` |
| Salve o agente antes de configurar guardrails | `src/components/agent-builder/GuardrailsPolicyEditor.tsx` |
| Erro ao processar handoff | `src/components/agent-builder/HandoffPanel.tsx` |
| Erro: ${e instanceof Error ? e.message :  | `src/components/agent-builder/HandoffPanel.tsx` |
| Auto-Route indisponível, selecione manualmente | `src/components/agent-builder/modules/BrainModule.tsx` |
| Salve o agente antes de publicar no OpenClaw. | `src/components/agent-builder/modules/DeployModule.tsx` |
| Adicione ao menos um item válido | `src/components/agent-builder/modules/EvalsModule.tsx` |
| Agente não selecionado | `src/components/agent-builder/modules/EvalsModule.tsx` |
| Informe o nome | `src/components/agent-builder/modules/EvalsModule.tsx` |
| Workspace não encontrado | `src/components/agent-builder/modules/EvalsModule.tsx` |
| Defina um valor para a Variante B | `src/components/agent-builder/modules/ExperimentsModule.tsx` |
| Nome é obrigatório | `src/components/agent-builder/modules/ExperimentsModule.tsx` |
| Workspace não encontrado | `src/components/agent-builder/modules/ExperimentsModule.tsx` |
| Guardrails ML indisponível | `src/components/agent-builder/modules/GuardrailsModule.tsx` |
| Nome é obrigatório | `src/components/agent-builder/modules/ObservabilityModule.tsx` |
| Precisa de pelo menos 2 versões de prompt | `src/components/agent-builder/modules/ObservabilityModule.tsx` |
| Erro ao gerar documentação | `src/components/agent-builder/modules/OrchestratorModule.tsx` |
| Sem workspace ativo | `src/components/agent-builder/modules/OrchestratorModule.tsx` |
| Erro ao gerar resumo | `src/components/agent-builder/modules/PromptModule.tsx` |
| System prompt está vazio | `src/components/agent-builder/modules/PromptModule.tsx` |
| Erro na simulação | `src/components/agent-builder/modules/RAGModule.tsx` |
| Não foi possível adicionar a skill | `src/components/agent-builder/modules/SkillsModule.tsx` |
| Não foi possível atualizar as skills | `src/components/agent-builder/modules/SkillsModule.tsx` |
| Não foi possível remover a skill | `src/components/agent-builder/modules/SkillsModule.tsx` |
| Adicione test cases primeiro | `src/components/agent-builder/modules/TestExecutionPanel.tsx` |
| Salve o agente antes de testar | `src/components/agent-builder/modules/TestExecutionPanel.tsx` |
| Defina a missão do agente primeiro para receber sugestões. | `src/components/agent-builder/modules/ToolSuggestions.tsx` |
| Erro ao gerar Agent Card | `src/components/agents/AgentCardViewer.tsx` |
| Falha ao exportar | `src/components/agents/RecentCurationsPanel.tsx` |
| Não foi possível restaurar | `src/components/agents/RecentCurationsPanel.tsx` |
| Não foi possível restaurar em massa | `src/components/agents/RecentCurationsPanel.tsx` |
| Não foi possível remover | `src/components/agents/TemplateLinkedSkillsPanel.tsx` |
| Não foi possível vincular | `src/components/agents/TemplateLinkedSkillsPanel.tsx` |
| >{nameError}</p>           )}            <div className= | `src/components/agents/alerts/AlertRuleEditor.tsx` |
|  ? (           failure.is_resolved             ? <span className= | `src/components/agents/detail/AgentFailuresTable.tsx` |
|  \|\| !f.is_resolved)) return false;       if (q && ! | `src/components/agents/detail/AgentFailuresTable.tsx` |
|  \|\| f.is_resolved)) return false;       if (statusFilter ===  | `src/components/agents/detail/AgentFailuresTable.tsx` |
| >Alerts</SelectItem>             <SelectItem value= | `src/components/agents/detail/AgentFailuresTable.tsx` |
| Falha ao gerar o CSV | `src/components/agents/detail/InteractiveSLOPanel.tsx` |
| Falha ao gerar o relatório PDF | `src/components/agents/detail/InteractiveSLOPanel.tsx` |
| Nada a exportar | `src/components/agents/detail/InteractiveSLOPanel.tsx` |
| Falha ao gerar CSV | `src/components/agents/detail/KPIDeepInsightsPanel.tsx` |
| Falha ao gerar PDF | `src/components/agents/detail/KPIDeepInsightsPanel.tsx` |
| Falha ao recarregar a versão de referência (v${entry.meta.restored_from_version}) do servidor: ${               err instanceof Error ? err.message :  | `src/components/agents/detail/RestoreHistorySection.tsx` |
| Não foi possível verificar a versão mais recente: ${latestErr.message} | `src/components/agents/detail/RestoreHistorySection.tsx` |
| Uma versão mais nova (v${currentVersion.version}) foi detectada. Recarregue para revisar antes de desfazer. | `src/components/agents/detail/RestoreHistorySection.tsx` |
| Versão de referência (v${entry.meta.restored_from_version}) não encontrada — pode ter sido apagada. | `src/components/agents/detail/RestoreHistorySection.tsx` |
|        aria-live= | `src/components/agents/detail/RestoreValidationPanel.tsx` |
| Falha ao exportar | `src/components/agents/traces/ReplayDialog.tsx` |
| Não foi possível copiar — tente selecionar e copiar manualmente | `src/components/agents/versioning/ShareTimelineState.tsx` |
| Não foi possível copiar — selecione e copie manualmente | `src/components/agents/versioning/VersionTimeline.tsx` |
| Corrija os campos destacados | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| Corrija os campos destacados antes de avançar | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| Erro ao salvar agente | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| Faça login para criar agentes | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| Nada para compartilhar | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| Não consegui copiar | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| Prompt muito curto | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| Seleção acima do teto de skills | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| Seções obrigatórias incompletas | `src/components/agents/wizard/QuickCreateWizard.tsx` |
|        aria-live= | `src/components/agents/wizard/RestoreFeedbackBanner.tsx` |
|        aria-live= | `src/components/agents/wizard/quickSteps/FieldValidationHint.tsx` |
| Não foi possível copiar — selecione e copie manualmente. | `src/components/agents/wizard/quickSteps/PreflightReviewSummary.tsx` |
|            aria-live= | `src/components/agents/wizard/quickSteps/PromptValidationFeedback.tsx` |
|            className= | `src/components/agents/wizard/quickSteps/QuickAgentTestPanel.tsx` |
| Falha ao executar teste | `src/components/agents/wizard/quickSteps/QuickAgentTestPanel.tsx` |
| Não foi possível copiar | `src/components/agents/wizard/quickSteps/QuickAgentTestPanel.tsx` |
| Resposta inválida do gateway | `src/components/agents/wizard/quickSteps/QuickAgentTestPanel.tsx` |
|            className= | `src/components/agents/wizard/quickSteps/RealExamplePreview.tsx` |
| Falha na simulação | `src/components/agents/wizard/quickSteps/RealExamplePreview.tsx` |
| Não foi possível copiar | `src/components/agents/wizard/quickSteps/RealExamplePreview.tsx` |
| Resposta inválida do gateway | `src/components/agents/wizard/quickSteps/RealExamplePreview.tsx` |
| >             {errors.prompt}           </div>         )}         <div id= | `src/components/agents/wizard/quickSteps/StepQuickPrompt.tsx` |
| Conteúdo removido por segurança | `src/components/agents/wizard/quickSteps/StepQuickPrompt.tsx` |
| Texto colado ajustado | `src/components/agents/wizard/quickSteps/StepQuickPrompt.tsx` |
| Erro ao carregar agendamentos | `src/components/automation/CronSchedulerPanel.tsx` |
| Erro ao criar | `src/components/automation/CronSchedulerPanel.tsx` |
| Falha ao executar pendentes | `src/components/automation/CronSchedulerPanel.tsx` |
| Preencha todos os campos | `src/components/automation/CronSchedulerPanel.tsx` |
| Erro ao carregar execução | `src/components/automation/ExecutionTimelineDialog.tsx` |
| Erro ao replicar | `src/components/automation/ExecutionTimelineDialog.tsx` |
| Selecione ao menos um canal | `src/components/automation/MultiChannelComposer.tsx` |
| Destinatário e mensagem são obrigatórios | `src/components/automation/NotificationCenterPanel.tsx` |
| Erro ao carregar notificações | `src/components/automation/NotificationCenterPanel.tsx` |
| Falha no envio de teste | `src/components/automation/NotificationCenterPanel.tsx` |
| Erro ao carregar filas | `src/components/automation/QueueMonitorPanel.tsx` |
| Falha ao executar worker | `src/components/automation/QueueMonitorPanel.tsx` |
| Erro ao carregar webhooks | `src/components/automation/WebhookManagerPanel.tsx` |
| Falha ao carregar histórico | `src/components/automation/WebhookManagerPanel.tsx` |
| Falha no replay | `src/components/automation/WebhookManagerPanel.tsx` |
| Falha no teste | `src/components/automation/WebhookManagerPanel.tsx` |
| JSON inválido | `src/components/automation/WebhookManagerPanel.tsx` |
| Anexo acima de 25 MB: ${oversized.map((f) => f.name).join( | `src/components/chat/ChatComposer.tsx` |
| Máximo de ${MAX_ATTACHMENTS} anexos por mensagem. | `src/components/chat/ChatComposer.tsx` |
| Não foi possível abrir o anexo. | `src/components/chat/MessageBubble.tsx` |
| Não foi possível copiar. | `src/components/chat/MessageBubble.tsx` |
| Falha ao adicionar passo | `src/components/crm/CadenceStepsEditor.tsx` |
| Falha ao salvar ICP | `src/components/crm/IcpProfilePanel.tsx` |
| O limiar  | `src/components/crm/IcpProfilePanel.tsx` |
| : { label:  | `src/components/dashboard/ActivityFeed.tsx` |
|              onClick={() => navigate( | `src/components/dashboard/DashboardAlerts.tsx` |
| Erro: ${e instanceof Error ? e.message : String(e)} | `src/components/datahub/BulkEditDialog.tsx` |
| Erro ao criar: ${e instanceof Error ? e.message : String(e)} | `src/components/datahub/CreateRecordDialog.tsx` |
| Erro ao buscar dados: ${e instanceof Error ? e.message : String(e)} | `src/components/datahub/DataBrowser.tsx` |
| Erro ao excluir: ${e instanceof Error ? e.message : String(e)} | `src/components/datahub/DataBrowser.tsx` |
| Erro: ${e instanceof Error ? e.message : String(e)} | `src/components/datahub/DataBrowser.tsx` |
| Falha ao carregar detalhe: ${e instanceof Error ? e.message :  | `src/components/datahub/DataHubExplorerTab.tsx` |
| Nada para exportar | `src/components/datahub/DataHubExplorerTab.tsx` |
| Digite um valor para buscar | `src/components/datahub/DataHubIdentityResolutionTab.tsx` |
| Digite uma query SQL | `src/components/datahub/DataHubQueryBuilderTab.tsx` |
| Query falhou: ${msg} | `src/components/datahub/DataHubQueryBuilderTab.tsx` |
| ${db.name} ainda hibernado — tente novamente em alguns minutos | `src/components/datahub/HibernatedDatabasesPanel.tsx` |
| Erro: ${e instanceof Error ? e.message : String(e)} | `src/components/datahub/InlineEditCell.tsx` |
| Erro ao salvar: ${e instanceof Error ? e.message : String(e)} | `src/components/datahub/RecordFieldRenderers.tsx` |
| Erro ao salvar: ${e instanceof Error ? e.message : String(e)} | `src/components/datahub/RecordSubComponents.tsx` |
| Erro:  | `src/components/deployments/ApprovalQueuePanel.tsx` |
| Falha ao copiar | `src/components/deployments/WebWidgetPanel.tsx` |
| Informe o agent_id | `src/components/deployments/WebWidgetPanel.tsx` |
| agent_id e mensagem são obrigatórios | `src/components/deployments/WebWidgetPanel.tsx` |
| Erro: ${e instanceof Error ? e.message :  | `src/components/deployments/WhatsAppSendDialog.tsx` |
| Avaliação criada mas execução falhou: ${runErr instanceof Error ? runErr.message :  | `src/components/dialogs/CreateEvaluationDialog.tsx` |
| Avaliação criada mas judge falhou: ${judgeErr instanceof Error ? judgeErr.message :  | `src/components/dialogs/CreateEvaluationDialog.tsx` |
| Não autenticado | `src/components/dialogs/CreatePromptDialog.tsx` |
| Input é obrigatório | `src/components/evaluations/EvaluationDatasetsPanel.tsx` |
| Nome é obrigatório | `src/components/evaluations/EvaluationDatasetsPanel.tsx` |
| Erro ao executar RAGAS. Verifique o edge function eval-engine-v2. | `src/components/evaluations/RAGASMetricsPanel.tsx` |
| Selecione um agente e insira ao menos uma pergunta | `src/components/evaluations/RAGASMetricsPanel.tsx` |
| Workspace não encontrado | `src/components/evaluations/RAGASMetricsPanel.tsx` |
| Erro ao iniciar autorização | `src/components/integrations/Bitrix24Connect.tsx` |
| Falha no teste:  | `src/components/integrations/Bitrix24Connect.tsx` |
| Resposta inválida da API | `src/components/integrations/Bitrix24Connect.tsx` |
| Escolha um evento e um agente | `src/components/integrations/Bitrix24WebhookPanel.tsx` |
| Escolha um evento e um agente | `src/components/integrations/WhatsAppWebhookPanel.tsx` |
| Arquivo excede 25MB. Whisper aceita até 25MB por chamada. | `src/components/knowledge/AudioUploadDialog.tsx` |
| Selecione um arquivo de áudio | `src/components/knowledge/AudioUploadDialog.tsx` |
| Adicione pelo menos 1 campo a extrair | `src/components/knowledge/DocOcrDialog.tsx` |
| Campo já adicionado | `src/components/knowledge/DocOcrDialog.tsx` |
| Selecione uma imagem do documento | `src/components/knowledge/DocOcrDialog.tsx` |
| Falha no pipeline de ingestão | `src/components/knowledge/KnowledgeBaseDetail.tsx` |
| Nome é obrigatório | `src/components/knowledge/KnowledgeBaseDetail.tsx` |
| Título é obrigatório | `src/components/knowledge/KnowledgeBaseDetail.tsx` |
| Preencha query e chunks | `src/components/knowledge/RagRerankTestDialog.tsx` |
| Falha ao atualizar: ${msg} | `src/components/memory/RandomRecallToggleCard.tsx` |
| Falha ${res.status} ${res.statusText} | `src/components/monitoring/LangfuseExporterDialog.tsx` |
| Preencha URL e Public Key antes de testar | `src/components/monitoring/LangfuseExporterDialog.tsx` |
| Selecione um agent para testar | `src/components/openclaw/OpenclawTestConsole.tsx` |
|  className= | `src/components/openclaw/OpenclawWhatsappSetup.tsx` |
| Informe um nome de instância. | `src/components/openclaw/OpenclawWhatsappSetup.tsx` |
| Digite uma query primeiro | `src/components/oracle/OracleComparisonPanel.tsx` |
| Nada para exportar | `src/components/oracle/OracleComparisonPanel.tsx` |
| Selecione pelo menos 2 modos | `src/components/oracle/OracleComparisonPanel.tsx` |
| Falha ao remover execução | `src/components/oracle/ResearchHistoryPanel.tsx` |
| Não foi possível salvar no servidor. Tente novamente. | `src/components/oracle/ResearchSettingsDialog.tsx` |
| Acesso Negado | `src/components/rbac/AccessControl.tsx` |
| Não foi possível validar usuário | `src/components/rbac/DangerousActionDialog.tsx` |
| Preencha todos os campos obrigatórios | `src/components/rbac/DangerousActionDialog.tsx` |
| Senha incorreta | `src/components/rbac/DangerousActionDialog.tsx` |
| Falha na busca visual | `src/components/search/VisualSearchButton.tsx` |
| Imagem muito grande | `src/components/search/VisualSearchButton.tsx` |
| Selecione um arquivo de imagem | `src/components/search/VisualSearchButton.tsx` |
| Código ISO inválido | `src/components/security/AccessControlPanel.tsx` |
| Falha ao adicionar | `src/components/security/AccessControlPanel.tsx` |
| Falha ao atualizar | `src/components/security/AccessControlPanel.tsx` |
| Falha ao remover | `src/components/security/AccessControlPanel.tsx` |
| Falha no diagnóstico | `src/components/security/AccessControlPanel.tsx` |
| Formato inválido | `src/components/security/AccessControlPanel.tsx` |
| Digite um texto para testar | `src/components/security/GuardrailPolicies.tsx` |
| Nome é obrigatório | `src/components/security/GuardrailPolicies.tsx` |
| Violação detectada no simulador | `src/components/security/GuardrailsSimulator.tsx` |
| , {         alert_id: id,         error: err instanceof Error ? err.message : String(err),       });       toast.error( | `src/components/security/SecurityMonitoringPanel.tsx` |
| Alerta de Segurança: ${payload.new.message} | `src/components/security/SecurityMonitoringPanel.tsx` |
| Nome e valor são obrigatórios | `src/components/settings/ApiKeysTab.tsx` |
| Erro ao carregar MCP servers | `src/components/settings/MCPServersPanel.tsx` |
| Erro ao remover server | `src/components/settings/MCPServersPanel.tsx` |
| Erro: ${e instanceof Error ? e.message :  | `src/components/settings/MCPServersPanel.tsx` |
| Agentes pausados automaticamente | `src/components/shared/BudgetEventsMounter.tsx` |
| Aviso de orçamento | `src/components/shared/BudgetEventsMounter.tsx` |
| Orçamento esgotado — chamadas bloqueadas | `src/components/shared/BudgetEventsMounter.tsx` |
| Anomalia crítica de custo — ${label} | `src/components/shared/CostAnomalyAlertsMounter.tsx` |
| Anomalia de custo — ${label} | `src/components/shared/CostAnomalyAlertsMounter.tsx` |
|  aria-live= | `src/components/shared/ErrorBoundary.tsx` |
| : return <AlertWidget key={i} widget={w} />;           case  | `src/components/shared/GenerativeUI.tsx` |
| ⚠️ Falha no agente: ${row.event} | `src/components/shared/NotificationsDrawer.tsx` |
| Synthetic check falhou | `src/components/shared/SyntheticAlertsMounter.tsx` |
| Não foi possível descartar | `src/components/skills/HarvestCheckpointsCard.tsx` |
| Não foi possível limpar as expiradas | `src/components/skills/HarvestCheckpointsCard.tsx` |
| Descreva a tarefa antes de simular | `src/components/skills/ProgressiveSkillLoaderPanel.tsx` |
| Falha ao hidratar: ${(e as Error).message} | `src/components/skills/ProgressiveSkillLoaderPanel.tsx` |
| Nenhuma skill registrada — hidrate do banco primeiro | `src/components/skills/ProgressiveSkillLoaderPanel.tsx` |
| ; import { Sparkles, Bot, Loader2, AlertTriangle, Scissors } from  | `src/components/skills/SkillAutoRecommendationsPanel.tsx` |
| Erro ao adicionar skill | `src/components/skills/SkillAutoRecommendationsPanel.tsx` |
| Erro ao adicionar skills | `src/components/skills/SkillAutoRecommendationsPanel.tsx` |
| Falha ao gerar o CSV. | `src/components/skills/SkillClassificationEfficacyCard.tsx` |
| Nada para exportar com o filtro atual. | `src/components/skills/SkillClassificationEfficacyCard.tsx` |
| Não foi possível carregar o histórico de classificação. | `src/components/skills/SkillClassificationEfficacyCard.tsx` |
| Não foi possível carregar a demanda das skills. | `src/components/skills/SkillDemandPanel.tsx` |
| ${failures.length} não puderam ser gravadas: ${failures[0].message} | `src/components/skills/SkillDescriptionEnrichPanel.tsx` |
| Falha ao gerar descrições. | `src/components/skills/SkillDescriptionEnrichPanel.tsx` |
| Lote bloqueado: ${formatFailureSummary(resumo)}. | `src/components/skills/SkillDescriptionEnrichPanel.tsx` |
| Não foi possível carregar as skills sem descrição. | `src/components/skills/SkillDescriptionEnrichPanel.tsx` |
| ; import { fetchInstallCapLedger } from  | `src/components/skills/SkillInstallCapLedgerCard.tsx` |
| ; import { fetchAgentSkillLoads } from  | `src/components/skills/SkillOverflowAlertCard.tsx` |
| ; import { fetchPromptEvidenceLedger } from  | `src/components/skills/SkillPromptEvidenceLedgerCard.tsx` |
| Não foi possível copiar o prompt | `src/components/skills/SkillPromptSimulator.tsx` |
| Não foi possível gerar o artefato | `src/components/skills/SkillPromptSimulator.tsx` |
| Descreva o motivo da rejeição — é o que fica na auditoria. | `src/components/skills/SkillReclassificationReviewPanel.tsx` |
| Não foi possível carregar a fila de revisão. | `src/components/skills/SkillReclassificationReviewPanel.tsx` |
| ${failures.length} não puderam ser enfileiradas. | `src/components/skills/SkillReclassifyDialog.tsx` |
| ${resultado.failures.length} não puderam ser aplicadas — veja o detalhe. | `src/components/skills/SkillReclassifyDialog.tsx` |
| Créditos de IA esgotados — o lote foi interrompido. | `src/components/skills/SkillReclassifyDialog.tsx` |
| Não foi possível aplicar a reclassificação. | `src/components/skills/SkillReclassifyDialog.tsx` |
| Não foi possível concluir a classificação por IA. | `src/components/skills/SkillReclassifyDialog.tsx` |
| ; import { Badge } from  | `src/components/slack/SlackOnboardingWizard.tsx` |
| Workspace não identificado | `src/components/slack/SlackTestBroadcastButton.tsx` |
| … +516 linhas — lista completa em `context.json` | |

## J. Controle de acesso no código (checagens de perfil/permissão)

| Valor comparado | Arquivo |
|---|---|
| `assistant` | `src/components/agent-builder/AgentPlayground.tsx` |
| `user` | `src/components/agent-builder/AgentPlayground.tsx` |
| `user` | `src/components/agent-builder/ConversationalBuilder.tsx` |
| `combobox` | `src/components/agents/traces/ReplayDialog.tsx` |
| `listbox` | `src/components/agents/traces/ReplayDialog.tsx` |
| `menuitem` | `src/components/agents/traces/ReplayDialog.tsx` |
| `option` | `src/components/agents/traces/ReplayDialog.tsx` |
| `searchbox` | `src/components/agents/traces/ReplayDialog.tsx` |
| `textbox` | `src/components/agents/traces/ReplayDialog.tsx` |
| `user` | `src/components/chat/MessageBubble.tsx` |
| `user` | `src/components/openclaw/OpenclawTestConsole.tsx` |
| `user` | `src/components/shared/StreamingChat.tsx` |
| `workspace_admin` | `src/hooks/useRBAC.ts` |
| `user` | `src/pages/ChatWithAgentPage.tsx` |
| `user` | `src/pages/VoiceAgentStudioPage.tsx` |
| `user` | `src/pages/VoiceAgentsPage.tsx` |
| `system` | `src/services/agentHandoffService.ts` |
| `user` | `src/services/chatThreadService.ts` |
| `assistant` | `supabase/functions/_shared/alternation.ts` |
| `system` | `supabase/functions/_shared/alternation.ts` |
| `turn` | `supabase/functions/_shared/alternation.ts` |
| `user` | `supabase/functions/_shared/alternation.ts` |
| `system` | `supabase/functions/llm-gateway/index.ts` |
| `user` | `supabase/functions/llm-gateway/index.ts` |
| `system` | `supabase/functions/llm-gateway/providers/anthropic.ts` |
| `user` | `supabase/functions/smolagent-runtime/index.ts` |
| `user` | `supabase/functions/voice-synthesize/index.ts` |
| `workspace_admin` | `supabase/migrations/20260513164014_8d090b02-bd48-4bc8-91ec-3cbc52254c3a.sql` |

## K. Testes como especificação (3015 testes em 212 arquivos — nomes completos em `context.json`)

| Arquivo | Testes | Exemplos do que o sistema DEVE fazer |
|---|---|---|
| `src/test/design-improvements.test.tsx` | 80 | Round 1: Foundational Design Polish · #2 WCAG Contrast · CSS defines muted-foreground with adequate contrast values · #4 Typography Hierarchy … |
| `src/test/llm-gateway-providers.test.ts` | 80 | normalizeOpenAIResponse · normaliza resposta completa OpenAI · resposta vazia sem choices · extrai mensagem de erro … |
| `src/tests/automation-services.test.ts` | 80 | CronSchedulerService · parseCronExpression · deve parsear expressão a cada minuto · deve parsear expressão a cada 5 minutos … |
| `src/tests/nexus-complete-test-suite.test.ts` | 75 | A. Exports Validation · cronSchedulerService: 10 presets + core functions · webhookTriggerService: 6 templates + HMAC + transform · retryEngineService: 6 presets + retry + circuit breaker … |
| `src/test/template-skill-links-restore-all.test.ts` | 56 | groupRemovalsByTemplate · ignora vínculos ativos e agrupa apenas remoções · deduplica a mesma skill repetida em dias diferentes · descarta ids vazios ou só com espaços … |
| `src/test/validations.test.ts` | 49 | agentIdentitySchema · validates a correct identity · rejects short name · rejects short mission … |
| `src/test/crm-scoring-service.test.ts` | 48 | normalizeTerm · remove acentos e caixa · apara espaços nas bordas · parseSizeBand … |
| `src/test/progressive-skill-loader.test.ts` | 44 | progressiveSkillLoader — registry CRUD · registerSkill + getSkill round trip · registerSkills registers multiple at once · getAllSkills returns all registered skills … |
| `src/test/agent-handoff.test.ts` | 38 | agentHandoffService — evaluateHandoffRules · filters out disabled rules · sorts matching rules by priority descending · returns empty when no rules match … |
| `src/test/notification-and-middleware.test.ts` | 38 | notificationEngineService — acesso a dados · markAllRead escopa por canal in_app, destinatário e status pendentes · markAllRead devolve 0 quando não há nada pendente · markAllRead propaga erro em vez de fingir que zerou o badge … |
| `src/test/skill-reclassification-review.test.ts` | 35 | mapReviewRow — fronteira com o banco · normaliza numéricos que o PostgREST devolve como string · descarta a linha quando o departamento proposto saiu da taxonomia · trata departamento de origem desconhecido como  … |
| `src/test/curation-feed.test.ts` | 34 | buildCurationFeed — cenários determinísticos · rotula o dia atual como  · rotula o dia anterior como  · usa data absoluta para dias mais antigos … |
| `src/test/middleware-pipeline.test.ts` | 34 | MiddlewarePipeline — basic operations · list() returns empty for new pipeline · use() adds middleware and sorts by priority · remove() deletes middleware by name … |
| `src/test/cost-calculator.test.ts` | 32 | costCalculatorService — pricing lookup · getAllPricing returns a promise that resolves to an array · getModelPricing returns null for unknown provider · getModelPricing finds a model … |
| `src/test/retry-engine.test.ts` | 32 | retryEngineService — defaults and presets · DEFAULT_RETRY_POLICY has sensible defaults · RETRY_PRESETS contains named configurations · DEFAULT_CIRCUIT_CONFIG has thresholds … |
| `src/test/skill-description-enrichment.test.ts` | 32 | fold · remove acentos, pontuação e caixa · é idempotente para qualquer entrada gerada · isDescriptionEmpty … |
| `src/test/skill-demand-department-filter.test.ts` | 30 | normalizeDepartmentFilter · aceita a taxonomia canônica e os dois sentinelas · normaliza caixa e espaços sem perder o alvo · degrada entradas hostis para all em vez de lançar … |
| `src/test/whatsapp-webhook.test.ts` | 30 | whatsappWebhookService — catálogo · exposes documented event types · exposes 4 supported providers · every provider has tokenEnv … |
| `src/test/extended-services.test.ts` | 29 | Extended Service Layer Tests · llmGatewayService · exports invokeLLMGateway · exports invokeGuardrailsEngine … |
| `src/test/security-service.test.ts` | 28 | securityService · listApiKeys · nunca seleciona a coluna key_hash (vazamento de credencial) · propaga erro em vez de mascarar como lista vazia … |
| `src/test/skill-classification-efficacy.test.ts` | 28 | deriveVerdict · aprovar sobre departamento existente = erro do classificador · aprovar sobre vazio = preenchimento, não erro · rejeitar com departamento vigente = confirmação do rótulo automático … |
| `src/test/normalize.test.ts` | 27 | normalizeCnpj · strips formatting from formatted CNPJ · returns digits-only CNPJ as-is · returns null for invalid length … |
| `src/test/curation-highlight.test.ts` | 26 | highlightKey · casa exatamente com a chave usada pelo acumulador de pendentes · distingue duplas diferentes · beginHighlight … |
| `src/test/services.test.ts` | 26 | Service Layer · knowledgeService · exports listKnowledgeBases · exports deleteKnowledgeBase … |
| `src/test/skill-prompt-evidence-ledger.test.ts` | 26 | isValidChecksum · aceita apenas 8 dígitos hex minúsculos · parseEvidenceRows — robustez · descarta linhas sem checksum válido … |
| `src/lib/validations/__tests__/promptContradictions.test.ts` | 25 | polarity contradictions · detects nunca vs sempre on the same topic (PT) · detects proibido vs obrigatório on the same topic · detects  … |
| `src/test/bitrix24-webhook.test.ts` | 25 | bitrix24WebhookService — catálogo · exposes the documented event types · every event type has a label and description · não há ids duplicados (chave do upsert onConflict) … |
| `src/test/crm-service.test.ts` | 25 | isolamento multi-tenant · listDeals filtra por workspace_id e ignora soft-deletados · listContacts, listCompanies e listStages também escopam por workspace · logActivity carimba o workspace mesmo se o chamador tentar sobrescrever … |
| `src/test/observability-governance-alerts.test.ts` | 25 | silêncio em instalação nova · não emite nenhum alerta quando não há calibração alguma · expõe o digest mesmo sem histórico, com as duas réguas em sem-dados · calibração envelhecida … |
| `src/test/regression-ui-invariants.test.tsx` | 25 | Design Tokens: nexus-* declaradas em src/index.css · deve declarar --nexus-${token} · Design Tokens: variáveis semânticas shadcn · deve declarar --${token} … |
| `src/test/skill-llm-classification-queue.test.ts` | 25 | runBatchQueue — resultados e invariantes básicas · processa todos os itens e resolve com um snapshot completo · deduplica ids repetidos em vez de sobrescrever estado · ignora entradas malformadas sem derrubar o lote … |
| `src/test/dialog-validations.test.ts` | 24 | inviteMemberSchema · accepts valid input · rejects empty email · rejects invalid email … |
| `src/test/security-guards.test.ts` | 24 | detectAndRedactPII · detects and redacts CPF with dots · detects CPF without formatting · detects email addresses … |
| `src/test/skill-demand-source-filter.test.ts` | 24 | procedências reconhecidas · preserva todas as procedências gravadas pelo banco · inclui platform_heuristic e lexical na lista canônica · rotula toda procedência em pt-BR, sem chave órfã … |
| `src/test/curation-csv.test.ts` | 23 | escapeCsvField — estrutura RFC 4180 · não cita valores simples · cita e dobra aspas internas · cita quando contém %j … |
| `src/test/agent-routing.test.ts` | 22 | summarizeRoutes (pure function) · returns empty array for empty input · produces correct counts for a single source · groups by source and sorts alphabetically … |
| `src/test/queue-failure-summary.test.ts` | 22 | toFailureCategory — normalização · aceita todas as categorias conhecidas · é insensível a caixa e espaços · kind desconhecido nunca vira categoria fantasma … |
| `src/test/tracing.test.ts` | 21 | tracing — TraceContext basics · startTrace returns a context with unique id · startSpan returns a Span with auto-generated id · Span.end auto-computes duration_ms … |
| `src/test/evaluations-scoring.test.ts` | 20 | scoreDeterministic · returns 0 for empty inputs · returns high score for exact match (normalized) · rewards JSON key overlap … |
| `src/test/skill-attribution.test.ts` | 20 | normalizeLicense — invariantes sobre todas as entradas · é idempotente e saneada para ${JSON.stringify(input)} · reconhece todos os SPDX do catálogo em qualquer caixa · trata sentinelas de ausência como nulo … |
| `src/test/skill-efficacy-scales.test.ts` | 20 | escalas de confiança — mapeamento de procedência · apenas platform_heuristic cai na régua de plataforma · a régua concorda com o limiar de revisão aplicado na fila · o parser deriva a régua da procedência registrada na auditoria … |
| `src/test/curation-realtime-pending.test.ts` | 19 | applyCurationPendingEvent — identidade preservada · devolve o MESMO Set quando o evento é irrelevante (origin auto) · devolve o MESMO Set quando a linha não tem identidade · devolve o MESMO Set quando a dupla já está pendente (dedup) … |
| `src/test/deployments-service.test.ts` | 19 | deploymentsService · listDeployments · filtra pelo agente e ordena do mais recente para o mais antigo · propaga erro em vez de devolver lista vazia … |
| `src/test/skill-install-cap-ledger.test.ts` | 19 | parseInstallCapRows — robustez · descarta linhas sem id · não quebra com metadata nulo, array ou string · normaliza números negativos e NaN para zero … |
| `src/test/skill-meta-collection.test.ts` | 19 | coletâneas fora da fila de revisão · coletânea com rótulo de baixa confiança não pede revisão · skill comum com o mesmo rótulo continua pedindo revisão · regressão do caso real: 20 coletâneas somem da fila, 37 skills permanecem … |
| `src/test/skill-observability.test.ts` | 19 | summarizeIngestion · ignora execuções fora da janela · calcula taxas com denominador seguro · produz série diária do tamanho da janela … |
| `src/test/skill-prompt-simulation.test.ts` | 19 | simulatePrompt — casos básicos · sem skills não gera seção nem overflow · conta injetadas e mantém ordem alfabética · overflow no teto de 25 … |
| `src/test/agents-service.test.ts` | 18 | agentsService · getAgentById · retorna null quando o agente não existe · propaga o erro do banco em vez de engolir … |
| `src/test/calibration-csv-export.test.ts` | 18 | buildCalibrationCsv · emite BOM, cabeçalho e CRLF · exporta apenas cabeçalho quando a lista está vazia · escapa ponto e vírgula, aspas e quebras de linha na justificativa … |
| `src/test/cron-scheduler.test.ts` | 18 | cronSchedulerService — parseCronExpression · throws on invalid expression (wrong field count) · parses  · parses single literal values … |
| `src/test/curation-pending-by-filter.test.ts` | 18 | applyCurationPendingEventByFilter — identidade preservada · devolve o MESMO objeto quando o evento é irrelevante · devolve o MESMO objeto em evento repetido (dedup por dupla) · preserva o Set dos recortes que não mudaram … |
| `src/test/notification-engine.test.ts` | 18 | notificationEngineService — renderTemplate · replaces simple variables · replaces multiple variables · handles nested dot-notation paths … |
| `src/test/queue-manager.test.ts` | 18 | queueManagerService — QUEUE_PRESETS · exposes 4 named presets · high_priority uses priority strategy with high concurrency · standard uses fifo with conservative defaults … |
| `src/test/skill-install-cap-audit.test.ts` | 18 | installCapAudit — matriz combinatória · mantém invariantes em ~1.000 combinações · classifyInstallCap · dentro do teto quando há folga confortável … |
| `src/test/skill-prompt-diff.test.ts` | 18 | diffPromptSimulations — simulação combinatória · cobre ${SIZES.length * SIZES.length} pares de tamanhos sem inconsistência de totais · é reflexivo: comparar uma simulação consigo mesma não gera mudanças · detecta a skill que continua instalada mas caiu no overflow … |
| `src/test/template-skill-links-merge.test.ts` | 18 | mergeDisplayLinks — cenários determinísticos · usa o fallback apenas quando não há persistência · coloca curadoria manual no topo · nunca descarta vínculos manuais mesmo acima do limite … |
| `src/test/agent-templates-merge.test.ts` | 17 | agent templates: norm() · normaliza case e espaços múltiplos · trata strings já normalizadas · agent templates: parseTools() … |
| `src/test/billing-service.test.ts` | 17 | billingService — agregação de consumo · soma custo e tokens ignorando nulos, e agrupa por tipo · trata numeric do Postgres devolvido como string sem concatenar · classifica registros sem record_type como llm … |
| `src/test/calibration-governance.test.ts` | 17 | summarizeCalibrationGovernance — estados base · marca sem-dados quando não há calibração alguma · sem-dados quando só existem linhas sem data · saudavel com histórico datado e sem override nem instabilidade … |
| `src/test/skill-composer.test.ts` | 17 | SkillComposer visual - schema · aceita rascunho mínimo válido · rejeita nome curto · rejeita slug com maiúsculas … |
| `src/test/threshold-calibration-scale.test.ts` | 17 | coerceCalibrationScale · reconhece apenas o literal de plataforma · trata legado e lixo como domínio · é idempotente sobre a própria saída … |
| `src/test/memory-service.test.ts` | 16 | memoryService — envelope memory-tools · addMemory envia tool + params no formato aceito pela edge function · addMemory aplica defaults semantic/Manual quando omitidos · searchMemory devolve lista vazia — nunca undefined — quando não há memórias … |
| `src/test/skill-install-guard.test.ts` | 16 | normalizeSkillName · remove acentos, caixa e espaços redundantes · trata entradas não string como vazio · evaluateInstallImpact — matriz combinatória … |
| `src/test/skill-platform-tier.test.ts` | 16 | tier de plataforma · resolve tooling de agentes sem sinal de domínio como TI marcado para revisão · não sobrescreve um veredito de domínio com confiança alta · não sobrescreve o balde transversal (agregadores) … |
| `src/test/whatsapp-outbound.test.ts` | 16 | whatsappOutboundService — sendWhatsAppMessage (Meta provider) · sends a plain text message via Meta · sends an image message with caption · sends a document message … |
| `src/test/curation-feed-pagination.test.ts` | 15 | resolveNextCursor · devolve null quando a página veio incompleta (fim do dataset) · devolve null para página vazia · devolve o updated_at da última linha quando a página veio cheia … |
| `src/test/edge-shared-skills.test.ts` | 15 | _shared/skills · retorna vazio sem skills · ordena alfabeticamente e é determinístico · deduplica por id e ignora skills sem nome … |
| `src/test/freeze-window-service.test.ts` | 15 | freezeWindowService · listFreezeWindows · filtra por workspace e ordena por starts_at desc · retorna array vazio quando não há dados … |
| `src/test/multi-agent-e2e.test.ts` | 15 | Multi-Agent E2E — Triage routing · routes billing questions to the billing specialist · routes technical issues to tech support · routes pricing questions to sales … |
| `src/test/skill-enrichment-service.test.ts` | 15 | toEnrichQueueError — decisão de retry por status · 402 (créditos) NUNCA é retentável · 401 e 403 não são retentáveis: permissão não muda sozinha · 429 é retentável e respeita Retry-After em segundos … |
| `src/test/workspace-context-service.test.ts` | 15 | workspaceContextService · getWorkspaceIdForUser · devolve o id do workspace quando encontrado · devolve null quando o usuário não possui workspace … |
| `src/lib/__tests__/citationValidation.test.ts` | 14 | extractMarkerNumbers · extrai números únicos em ordem · ignora string vazia · ignora [0] e valores fora do padrão … |
| `src/test/calibration-scale-partition.test.ts` | 14 | instabilidade segmentada por régua · não acusa domínio instável por volume de calibrações de plataforma · rotula a régua no veredito e devolve null para lista heterogênea · mantém a régua rotulada mesmo quando a fatia está vazia … |
| `src/test/prompt-compiler-skills.test.ts` | 14 | buildSkillsSection · retorna vazio sem skills · ignora skills sem nome utilizável · ordena alfabeticamente e formata categoria e descrição … |
| `src/test/skill-department-provenance-chain.test.ts` | 14 | trigger de procedência — invariantes · nenhuma combinação produz departamento com origem  · sem departamento zera origem e confiança — vai para  · decisão humana recebe confiança plena mesmo se o cliente enviar zero … |
| `src/test/skill-department-reclassification.test.ts` | 14 | buildReclassificationPlan — 300 catálogos simulados · mantém todos os invariantes · é determinístico entre execuções · degrada entradas hostis sem lançar … |
| `src/test/skill-recommender.test.ts` | 14 | skillRecommenderService · tokeniza texto removendo acentos e stopwords · retorna vazio quando missão está vazia · retorna vazio quando registry está vazio … |
| `src/test/template-skill-links-restore.test.ts` | 14 | sanitizeSkillIds · remove vazios, espaços e duplicatas preservando a ordem · tolera valores não-string sem quebrar · devolve lista vazia para entrada vazia … |
| `src/test/threshold-calibration-override.test.ts` | 14 | normalizeOverrideReason · descarta valores não textuais e vazios · colapsa espaços e remove caracteres de controle · trunca no teto sem deixar espaço final … |
| `src/test/webhook-trigger.test.ts` | 14 | webhookTriggerService — applyTransform · maps simple top-level field · maps nested dotted path · handles multiple lines … |
| `e2e/critical-flows.spec.ts` | 13 | Deployments Page · deployment page redirects unauthenticated users · deployment page has correct title structure · Workflows Page … |
| `src/test/automation-template.test.ts` | 13 | automationTemplateService — BUILTIN_TEMPLATES · has 6 built-in templates · all templates have required fields · templates have unique slugs … |
| `src/test/chat-thread-service.test.ts` | 13 | chatThreadService — ordenação do histórico · mapeia attachments JSONB para a UI quando existem · deixa attachments undefined quando a coluna vem nula · devolve as mensagens em ordem cronológica ainda que o banco responda DESC … |
| `src/test/datahub-service.test.ts` | 13 | datahubService — guard de sessão e envelope · queryEntity aborta sem sessão e NÃO dispara requisição alguma · getEntityDetail também aborta sem sessão · queryEntity envia Bearer da sessão e o envelope de ação esperado … |
| `src/test/rag-pipeline-service.test.ts` | 13 | ragPipelineService — invokers · embedTexts envia provider, dimensão e task de retrieval · rerankDocuments envia top_k e modelo · erros de embed e rerank viram exceção rotulada … |
| `src/test/skill-demand-department-provenance.test.ts` | 13 | normalizeDepartmentConfidence · aceita numeric vindo como string do PostgREST · degrada valores inválidos para 0 em vez de propagar NaN · satura fora da faixa [0,1] … |
| `src/test/skill-demand.test.ts` | 13 | classifyDemand · particiona o eixo numérico sem sobreposição · degrada entradas inválidas para zero · buildSkillDemandRows — 400 cenários simulados … |
| `src/test/skill-prompt-overflow-alert.test.ts` | 13 | classifyAgentLoad — varredura de 0 a 120 · mantém invariantes em toda a faixa · não trata o teto exato como crítico · neutraliza entradas degeneradas … |
| `src/test/skills-registry-install-single.test.ts` | 13 | installSkill · retorna true quando a linha é inserida · retorna false quando a skill já estava instalada · propaga erro real do banco … |
| `src/test/threshold-calibration-instability.test.ts` | 13 | detectCalibrationInstability · lista vazia é estável · duas calibrações na janela ainda são estáveis · três calibrações na janela disparam alerta por volume … |
| `src/test/threshold-calibration.test.ts` | 13 | parseThresholdCalibrations · converte uma linha completa · ignora ações de outros domínios · descarta linha sem id estável … |
| `src/components/agents/wizard/__tests__/RestoreFeedbackBanner.keyboard.test.tsx` | 12 | RestoreFeedbackBanner — navegação por teclado · Banner completo (3 ações + dispensar) · Tab percorre na ordem: Copiar link → Corrigir agora → Ir ao campo → Dispensar · Shift+Tab volta na ordem inversa do banner … |
| `src/components/agents/wizard/__tests__/promptVariantState.test.ts` | 12 | wizard / prompt variant state · 1) Apply variant + reload · restores the explicitly picked variant — not the auto-detected fallback · still restores the user pick when text happens to match a different variant … |
| `src/test/credential-vault.test.ts` | 12 | credentialVaultService — encryption round-trip · encrypts and decrypts simple credentials · encrypts and decrypts complex nested data · encrypted output is base64 … |
| `src/test/execution-history.test.ts` | 12 | executionHistoryService — compareExecutions · calculates duration diff correctly · calculates duration diff percentage · handles zero duration_ms in percentage calc … |
| `src/test/oracle-comparison-aggregate.test.ts` | 12 | Oracle Comparison — pickWinner · returns null when no runs are successful · picks the run with highest confidence_score · ignores failed runs even if they would have higher confidence … |
| `src/test/quick-type-template-map.test.ts` | 12 | QUICK_TYPE_TEMPLATE_MAP — contrato · cobre todos os tipos do wizard rápido · referencia apenas templates existentes na galeria · não repete o mesmo template dentro de um tipo … |
| `src/test/skill-prompt-evidence.test.ts` | 12 | artifactChecksum · é determinístico e cabe em 8 hex · muda com alteração de um único caractere · não colide em 2.000 artefatos sintéticos distintos … |
| `src/test/status-badge.test.tsx` | 12 | StatusBadge · renders known status with correct label · renders unknown status with raw value as label · applies success class for production status … |
| `supabase/functions/_shared/retry.test.ts` | 12 | sucesso imediato — 1 call · erro network transitório — recupera antes de esgotar · exaustão — sempre erro transitório · não-retriable — 4xx não repete … |
| `src/test/accessibility.test.tsx` | 11 | Accessibility · EmptyState · has role=status and aria-label · hides icon from assistive tech … |
| `src/test/curation-realtime.test.ts` | 11 | shouldRefreshCurationFeed — casos determinísticos · INSERT manual ativo dispara em  · soft delete dispara nos dois filtros (sai de um, entra no outro) · escrita automática é ignorada em todos os filtros … |
| `src/test/skill-demand-needs-review-filter.test.ts` | 11 | filterByNeedsReview · desligado devolve o conjunto intacto (e uma cópia, não a referência) · ligado mantém só os rótulos automáticos de baixa confiança · compõe por interseção com o filtro de departamento … |
| `src/test/skill-license-filter.test.ts` | 11 | isLicenseFilter · aceita apenas os modos declarados · cada modo tem rótulo e dica em PT-BR · matchesLicenseFilter — partição do catálogo … |
| `src/lib/validations/__tests__/contradictionAutoFix.test.ts` | 10 | contradiction detector + auto-fix integration · detects a polarity contradiction in the sample prompt · builds an auto-fix whose fixedPrompt removes the contradiction · preserves unrelated lines when splicing the unified rule … |
| `src/test/batch-processor.test.ts` | 10 | batchProcessorService — processBatch · processes a small array with default settings · processor receives the correct index for each item · captures errors in result.error without stopping (continue_all) … |
| `src/test/connector-registry.test.ts` | 10 | connectorRegistryService — BUILTIN_CONNECTORS · has at least 5 built-in connectors · all connectors have required fields · connectors have unique slugs … |
| `src/test/e2ee-service.test.ts` | 10 | e2eeService — encrypt/decrypt round-trip · cifra e decifra preservando o payload · cada cifragem produz IV/salt distintos · rejeita passphrase curta … |
| `src/test/skill-departments-parity.test.ts` | 10 | paridade taxonomia frontend x espelho Deno · o espelho declara exatamente os mesmos departamentos · o espelho do classificador LLM lista os mesmos departamentos, na mesma ordem · todo departamento tem uma dica semântica no prompt do classificador … |
| `supabase/functions/rag-embed-v2/index.test.ts` | 10 | dimensão canônica espelha as colunas vector(1536) · hashEmbed devolve exatamente a dimensão pedida · hashEmbed é determinístico e normalizado em L2 · hashEmbed nunca produz NaN/Infinity … |
| `e2e/agent-builder.spec.ts` | 9 | Agent Builder (unauthenticated) · redirects to auth when not logged in · Landing Page · renders the landing page … |
| `e2e/auth.spec.ts` | 9 | Auth Page · has no critical/serious a11y violations on initial render · renders login form with all required elements · shows validation errors for empty fields … |
| `src/test/basesService.test.ts` | 9 | basesService · extrai frontmatter, tags e wikilinks · filtra por eq no frontmatter · filtra por contains no title (case-insensitive) … |
| `src/test/document-title.test.ts` | 9 | useDocumentTitle · sets title for dashboard · sets title for agents page · sets title for oracle page … |
| `src/test/harvest-checkpoint-list.test.ts` | 9 | listHarvestCheckpoints · calcula a idade em horas e mapeia os campos do banco · mantém como válido o checkpoint exatamente no limite do TTL (24h) · marca como stale o checkpoint que ultrapassou o TTL … |
| `src/test/harvest-checkpoint-purge.test.ts` | 9 | purgeStaleLocalCheckpoints · mantém checkpoints dentro do TTL de 24h · remove checkpoints vencidos · trata a fronteira exata de 24h como ainda válida … |
| `src/test/research-config-schema.test.ts` | 9 | researchConfigSchema — happy path · aceita um draft válido · coage strings numéricas via z.coerce · researchConfigSchema — ranges e mensagens PT-BR … |
| `src/test/span-tree-view.test.tsx` | 9 | SpanTreeView · shows empty fallback when no spans · renders header row when spans are present · renders flat spans as multiple roots … |
| `src/test/supabase-mock-simulation.test.ts` | 9 | createSupabaseMock — simulação combinatória · resolve todas as ${VERBS.length * FILTERS.length * MODIFIERS.length * TERMINATORS.length} combinações de cadeia sem TypeError · propaga erro em todas as combinações verbo × terminador · isola resultados por tabela, com fallback para o padrão … |
| `src/test/template-canvas-preview.test.tsx` | 9 | TemplateCanvasPreview · renders an SVG with the right viewBox dimensions · renders one rect per node · renders one path per valid edge … |
| `src/test/template-skill-registry.test.ts` | 9 | templateSkillRegistry · converte todos os templates para o formato do registry · resolve o id original do template a partir do id virtual · mapeia cada template para um departamento conhecido … |
| `e2e/navigation.spec.ts` | 8 | Navigation & Routing · auth page renders login form · protected routes redirect unauthenticated users · 404 page renders for unknown routes … |
| `src/test/browser-sessions-service.test.ts` | 8 | browserAgentService · runAgent invokes browser-agent-run with full input · runAgent throws on edge function error · cancelSession passes session_id … |
| `src/test/curated-skills.test.ts` | 8 | curatedSkills · não possui slugs duplicados · usa slugs kebab-case prefixados com nexus- · referencia apenas departamentos da taxonomia canônica … |
| `src/test/deep-link-sources.test.ts` | 8 | sourceIdsSync · parse vazio/nulo · filtra IDs inválidos · deduplica … |
| `src/test/i18n.test.ts` | 8 | i18n translations · has pt-BR and en-US locales · default locale is pt-BR · both locales have same keys … |
| `src/test/metric-card.test.tsx` | 8 | MetricCard · renders title and value · renders string value · renders subtitle when provided … |
| `src/test/nexus-design-eslint.test.ts` | 8 | nexus-design/no-hardcoded-colors · mapeia cores diretas em className · cobre template literals usados em cn() · não confunde tokens nexus-* nem palavras contendo cores … |
| `src/test/rbac-service.test.ts` | 8 | RBAC hasPermission · returns true for single permission the user has · returns false for single permission the user does NOT have · returns true when user has ANY of multiple permissions … |
| `src/test/searchDsl.test.ts` | 8 | searchDsl · faz match por termo livre insensível a acento · filtra por tag · nega filtros com prefixo - … |
| `src/test/skill-license-filter-persistence.test.ts` | 8 | normalizeLicenseFilter — totalidade sob payload persistido · preserva todos os modos válidos em suas variações textuais · degrada qualquer payload hostil para  · é idempotente: normalizar duas vezes não muda o resultado … |
| `src/test/skills-registry-bulk-install.test.ts` | 8 | normalizeSkillIdList · remove duplicatas, vazios e não-strings · aplica limite máximo · lista vazia é no-op … |
| `src/test/voice-agents-service.test.ts` | 8 | voiceAgentService · startSession invokes voice-session with action=start · endSession throws when error returned · transcribeAudio base64-encodes blob and forwards … |
| `src/test/wikilink.test.ts` | 8 | wikilink parser · extrai wikilinks simples · suporta alias e seção · identifica documentos e entidades … |
| `src/test/workflow-tracer.test.ts` | 8 | executeWorkflow — tracer instrumentation · wraps execution in a trace named workflow.<name> · engine path creates exactly one engine_invoke span · engine path returns the steps_executed and cost from the engine … |
| `tests/rls/personas.test.ts` | 8 | agents — Bob cannot SELECT Alice agents · agents — Bob cannot UPDATE Alice agent · agents — Bob cannot DELETE Alice agent · workspace_secrets — direct SELECT is blocked for everyone … |
| `src/test/draft-store-skills.test.ts` | 7 | draftStore — selectedSkillIds · persiste e recarrega os IDs selecionados · preserva a seleção existente quando o campo é omitido no upsert · sobrescreve com lista vazia quando explicitamente informado … |
| `src/test/embedding-dimension-contract.test.ts` | 7 | contrato de dimensão de embeddings · o embedder declara 1536 como dimensão canônica · nenhum consumidor usa o nome de campo errado ( · os consumidores pedem exatamente a dimensão canônica … |
| `src/test/frontmatter.test.ts` | 7 | frontmatter · returns empty state when no fence · parses scalars, booleans, numbers, null and inline lists · parses block lists … |
| `src/test/harvest-checkpoint-bulk-purge.test.ts` | 7 | deleteStaleHarvestCheckpoints · corta exatamente no TTL de 24h usando updated_at < cutoff · devolve a quantidade removida · limpa o espelho local apenas das chaves efetivamente removidas … |
| `src/test/hooks.test.ts` | 7 | useDebounce · returns initial value immediately · debounces value updates · cancels previous timer on rapid changes … |
| `src/test/i18n-interpolation.test.tsx` | 7 | I18nProvider interpolation · substitutes a single {n} placeholder · substitutes multiple placeholders · returns key when no translation exists … |
| `src/test/llm-gateway-service.test.ts` | 7 | llmGatewayService · invokeLLMGateway calls llm-gateway · invokeGuardrailsEngine calls guardrails-engine · invokeTestRunner calls test-runner … |
| `src/test/network-status.test.ts` | 7 | useNetworkStatus · registers offline and online event listeners · cleans up event listeners on unmount · shows error toast when initially offline … |
| `src/test/normalize-fold.test.ts` | 7 | stripDiacritics · remove acentos comuns PT-BR · preserva caracteres sem diacríticos · lida com null/undefined … |
| `src/test/openclaw-compiler.test.ts` | 7 | compileAgentForOpenclaw · gera SOUL.md com system prompt e tom · lista guardrails ativos e ferramentas em AGENTS.md · cria um SKILL.md por ferramenta com filename normalizado … |
| `src/test/skill-department-classifier-invariants.test.ts` | 7 | classificador de departamento — invariantes · monotonicidade: somar um termo do léxico nunca reduz o score daquele departamento · não acumula termos transversais: boilerplate puro nunca vira departamento de negócio · transversal jamais compete com um departamento de negócio com sinal … |
| `src/test/skill-description-parity.test.ts` | 7 | paridade de placeholders frontend ↔ Edge Function · a Edge Function declara exatamente os mesmos marcadores · todo marcador da Edge é reconhecido como vazio pelo módulo canônico · marcadores dobrados não colidem em uma forma vazia inesperada … |
| `src/test/skill-recommender-pending.test.ts` | 7 | computePendingSkillIds · filtra as já instaladas · preserva a ordem de ranking · remove duplicatas … |
| `src/test/skills-selection-diff.test.ts` | 7 | computeSkillSelectionDiff · detecta adições e remoções · seleção idêntica é no-op · limpar a seleção remove tudo … |
| `src/test/template-skill-links-rebuild.test.ts` | 7 | rebuildTemplateSkillLinks · remove apenas vínculos automáticos ativos, preservando curadoria manual · ressuscita vínculos soft-deletados zerando deleted_at/deleted_by · grava somente vínculos com origem automática … |
| `src/test/workflow-checkpoint.test.ts` | 7 | workflowCheckpointService — types · WorkflowExecution interface has expected shape · WorkflowCheckpoint interface has expected shape · CheckpointCreateInput allows optional fields … |
| `e2e/auth-flows.spec.ts` | 6 | Auth Flows (synthetic user) · login válido redireciona para área autenticada · login inválido mantém usuário em /auth com mensagem de erro · rota protegida sem auth redireciona para /auth … |
| `e2e/security.spec.ts` | 6 | Security Headers · CSP meta tag is present · X-Frame-Options meta tag is present · Referrer policy meta tag is present … |
| `src/components/agents/wizard/quickSteps/__tests__/PromptContradictionAutoFixPanel.test.tsx` | 6 | PromptContradictionAutoFixPanel · renders nothing when the prompt has no contradictions · shows a fix row for each detected contradiction · applies a fix, clears the contradiction, and surfaces the undo banner … |
| `src/test/animated-counter.test.tsx` | 6 | AnimatedCounter · renders initial value · renders with prefix and suffix · renders with decimals … |
| `src/test/app-sidebar.test.tsx` | 6 | AppSidebar · renders all section labels · renders navigation items · renders the brand name … |
| `src/test/cerebro-service.test.ts` | 6 | cerebroService exports · module exports the documented public surface · cerebroService types · exports at least 6 functions … |
| `src/test/edge-runtime-contract.test.ts` | 6 | Edge Functions — contrato de runtime · encontra os entrypoints das Edge Functions · nunca lê  · nunca passa o Request cru como headers de CORS para createRateLimitResponse … |
| `src/test/evaluations-service.test.ts` | 6 | evaluationsService exports · module exports the documented public surface · evaluationsService types · exports at least 10 functions … |
| `src/test/kanbanService.test.ts` | 6 | kanbanService · getGroupValue returns UNSTATUSED when property missing · getGroupValue normalizes case and trims · buildColumns preserves order and appends  … |
| `src/test/knowledge-service.test.ts` | 6 | knowledgeService exports · module exports the documented public surface · knowledgeService types · exports at least 15 functions … |
| `src/test/local-graph-view.test.tsx` | 6 | LocalGraphView · mostra empty state quando não há links · renderiza nó central e periféricos in/out · clique em nó backlink chama setActiveNote com source_id … |
| `src/test/model-router-service.test.ts` | 6 | modelRouterService · routeQuery falls back to local heuristic · routes simple queries to fast tier · routes complex queries to higher tier … |
| `src/test/monitoring-service.test.ts` | 6 | monitoringService exports · module exports the documented public surface · monitoringService types · exports at least 9 functions … |
| `src/test/openclaw-runtime.test.tsx` | 6 | OpenclawDeployPage (Runtime OpenClaw) · renderiza o título Runtime OpenClaw · mostra saúde do runtime após carregar · lista agents retornados pelo service … |
| `src/test/oracle-service.test.ts` | 6 | oracleService exports · module exports the documented public surface · oracleService types · exports exactly 3 functions … |
| `src/test/real-time-cost-stream.test.tsx` | 6 | RealTimeCostStream · renders header, totals and waiting state on mount · starts with CONECTANDO badge before subscribe callback fires · pause button toggles label between Pausar and Retomar … |
| `src/test/skill-classifier-parity.test.ts` | 6 | paridade classificador app ↔ harvester (Deno) · os léxicos das duas implementações são idênticos, departamento a departamento · as stopwords de plataforma são idênticas · a procedência gravada no staging reflete o tier que produziu o rótulo … |
| `src/test/template-link-coverage.test.ts` | 6 | cobertura de vínculos template ↔ skill · gera ao menos um vínculo para todo template · nunca ultrapassa o teto de vínculos nem repete skills · é determinístico entre execuções … |
| `src/test/template-skill-links.test.ts` | 6 | template ↔ skill links · vincula todos os templates a pelo menos uma skill · produz apenas vínculos fortes com o catálogo curado · nunca marca coletâneas como vínculo forte … |
| `src/test/templateEngine.test.ts` | 6 | templateEngine · substitui placeholders conhecidos · preserva placeholders desconhecidos sem quebrar · é insensível a caixa e espaços em placeholders … |
| `supabase/functions/_shared/alternation.test.ts` | 6 | colapsa runs consecutivos de user · mantém alternation válida intacta · remove leading assistant e trailing assistant · descarta vazios e system fica no topo … |
| `e2e/visual.spec.ts` | 5 | Visual regression — public screens · auth page — desktop 1280x720 · auth page — mobile 375x667 · auth page — signup variant … |
| `src/test/architecture-dual-client.test.ts` | 5 | arquitetura dual-client · fromTable() resolve para o banco EXTERNO, não para o de auth · rpcCall() resolve para o banco EXTERNO · isUserLockedOut permanece no client LOCAL (é auth, não dado) … |
| `src/test/auth-context-signin.test.tsx` | 5 | signIn preserva o resultado de autenticação ao registrar auditoria · aguarda builder thenable sem exigir método catch · falha do registro não bloqueia login válido · falha de autenticação é preservada mesmo se o registro rejeitar … |
| `src/test/chat-message-bubble.test.tsx` | 5 | MessageBubble — sanitization · não executa <script> em payload malicioso · bloqueia <iframe> · renderiza anexos como links clicáveis com nome e tamanho … |
| `src/test/guardrails-ml-service.test.ts` | 5 | guardrailsMLService · checkInput returns guardrail response · checkOutput returns guardrail response · isTextSafe returns boolean … |
| `src/test/health-alerts-service.test.ts` | 5 | healthAlertsService · checkOnce runs without error · getCurrentState returns state shape · start and stop manage polling … |
| `src/test/memory-tiers.test.ts` | 5 | computeTier (Autograph) · pinned sempre retorna core · mapeia relevância aos 5 tiers · valores inválidos caem em archive … |
| `src/test/notifications-drawer.test.tsx` | 5 | NotificationsDrawer · renders bell button · opens drawer and shows empty state · does not show mark-all-read when empty … |
| `src/test/relatedNotes.test.ts` | 5 | findRelatedNotes · excludes the active note itself · skips archived notes · boosts shared tags and wikilinks … |
| `src/test/schema-contract.test.ts` | 5 | contrato de schema entre código e banco · encontra arquivos para analisar · todo .rpc() referencia uma função existente no schema · todo .from() referencia uma tabela ou view existente no schema … |
| `src/test/template-skill-link.test.ts` | 5 | linkSkillsToTemplate · gera sinais normalizados do template · marca match forte quando há tag em comum · ignora skills virtuais de template … |
| `src/test/templates.test.ts` | 5 | Agent Templates · has at least 37 templates · all templates have required fields · all template IDs are unique … |
| `src/test/use-unsaved-changes.test.tsx` | 5 | useUnsavedChanges · defaults to no unsaved changes · can set unsaved changes · confirmNavigation calls callback immediately when no unsaved changes … |
| `src/test/vaultSync.test.ts` | 5 | vaultSync sanitizeFilename · remove caracteres inválidos de filesystem · usa fallback quando título vazio · preserva acentos e emojis … |
| `src/test/workflow-nodes.test.ts` | 5 | Workflow Node Types · has 18 node types (12 original + 6 automation) · all node types have defaults · categories cover all nodes … |
| `tests/e2e/security-audits.spec.ts` | 5 | Security & Stability Audit · should load the dashboard for an authenticated user · should protect administrative pages from unauthorized access · should verify security monitoring panel presence on security page … |
| `src/components/slack/__tests__/SlackOnboardingWizard.test.tsx` | 4 | SlackOnboardingWizard · renderiza passo 1 por padrão · avança e volta entre passos · dispara verifyConnection no passo 3 |
| `src/test/agent-evolution.test.ts` | 4 | Agent Self-Evolution · builds skillbook prompt from skills · returns empty for no skills · reflects on traces |
| `src/test/error-boundary.test.tsx` | 4 | ErrorBoundary · renders children when there is no error · renders error UI when a child throws · renders custom fallback when provided |
| `src/test/nlp-pipeline-service.test.ts` | 4 | nlpPipelineService · analyzeText returns NLP result · analyzeText throws on error · analyzeWhatsAppMessage returns structured result |
| `src/test/openclaw-whatsapp-setup.test.tsx` | 4 | OpenclawWhatsappSetup · renderiza o formulário inicial com badge de estado idle · exibe o QR Code retornado pelo serviço após pareamento · exibe erro quando o pareamento falha |
| `src/test/partitioning-docs-route.test.tsx` | 4 | Partitioning docs route · registra a rota /docs/partitioning no App.tsx · expõe o playbook de particionamento no sidebar · página de docs existe e tem conteúdo esperado |
| `src/test/rate-limiter.test.ts` | 4 | Rate Limiter Logic · allows requests within limit · blocks requests exceeding limit · cleans expired timestamps |
| `src/test/sidebar-persistence.test.ts` | 4 | Sidebar persistence (getDefaultOpen logic) · returns true when no stored value · returns false when stored as  · returns true when stored as  |
| `src/test/silent-error-guard.test.ts` | 4 | edge functions não engolem erros em silêncio · encontra arquivos para inspecionar · não usa handler de rejeição vazio em .then() · não usa bloco catch vazio |
| `src/test/streaming.test.ts` | 4 | AG-UI Protocol · exports event types · createSSEEmitter produces readable stream · getSSEHeaders returns correct content-type |
| `src/test/template-department-coverage.test.ts` | 4 | Cobertura departamental dos templates · toda categoria usada por um template existe no filtro da galeria · toda categoria do filtro possui ao menos um template · cobre os departamentos antes ausentes |
| `src/security.test.ts` | 3 | Security Service · fetches security alerts correctly · resolves security alerts correctly |
| `src/components/security/SecurityMonitoringPanel.test.tsx` | 3 | SecurityMonitoringPanel · should render the monitoring central header · should show the loading state initially |
| `src/test/edge-symbol-guard.test.ts` | 3 | Edge Functions — símbolos compartilhados · varre um conjunto representativo de arquivos · não usa helper compartilhado sem import nem definição local |
| `src/test/mcp-client.test.ts` | 3 | MCP Client · can import NexusMCPClient · creates client instance |
| `src/test/otel-genai.test.ts` | 3 | OTel GenAI Semantic Conventions · creates attributes with correct keys · estimates cost for known models |
| `src/test/rich-editor.test.tsx` | 3 | contrato do editor com as extensões TipTap instaladas · renderiza JSON existente e acompanha atualização controlada · preserva comandos de formatação, listas e histórico no mesmo núcleo |
| `src/test/use-mobile.test.ts` | 3 | useIsMobile · returns false for desktop width (default matchMedia mock) · returns true for mobile width |
| `src/test/context-tiers.test.ts` | 2 | Context Tiers Service · generates L0/L1 from content |
| `src/test/example.test.ts` | 2 | example · should pass |
| `src/test/page-loading.test.tsx` | 2 | PageLoading · renders loading indicator with accessible role |
| `src/test/skills-registry.test.ts` | 2 | Skills Registry · exports skill categories |
| `src/test/workflows-service.test.ts` | 2 | workflowsService · can import the service |

## L. Eventos de webhook tratados (contratos com sistemas externos)

| Evento | Arquivo |
|---|---|
| `SKIP_WAITING` | `public/sw.js` |
| `config.expensive_for_simple` | `src/components/agent-builder/DraftVersionsDialog.tsx` |
| `config.long_term_without_short` | `src/components/agent-builder/DraftVersionsDialog.tsx` |
| `config.production_no_guardrails` | `src/components/agent-builder/DraftVersionsDialog.tsx` |
| `config.rag_no_sources` | `src/components/agent-builder/DraftVersionsDialog.tsx` |
| `config.react_without_tools` | `src/components/agent-builder/DraftVersionsDialog.tsx` |
| `prompt.empty_blocks` | `src/components/agent-builder/DraftVersionsDialog.tsx` |
| `prompt.no_identity` | `src/components/agent-builder/DraftVersionsDialog.tsx` |
| `progress` | `src/components/knowledge/KnowledgeBaseDetail.tsx` |
| `status` | `src/components/knowledge/KnowledgeBaseDetail.tsx` |
| `condition` | `src/components/workflows/WorkflowCanvas.tsx` |
| `error` | `src/pages/WorkflowsPage.tsx` |
| `node_start` | `src/pages/WorkflowsPage.tsx` |
| `run_completed` | `src/pages/WorkflowsPage.tsx` |
| `string` | `supabase/functions/skill-harvester/index.ts` |

## M. Efeitos colaterais (e-mail, SMS, cobrança, fila — não são idempotentes por padrão)

| Chamada | Arquivo |
|---|---|
| `invoke(` | `src/components/agent-builder/modules/TestExecutionPanel.tsx` |
| `.add('failure'` | `src/components/agents/versioning/timelineFilters.ts` |
| `.add('guardrails'` | `src/components/agents/versioning/timelineFilters.ts` |
| `.add('model'` | `src/components/agents/versioning/timelineFilters.ts` |
| `.add('prompt'` | `src/components/agents/versioning/timelineFilters.ts` |
| `.add('rag'` | `src/components/agents/versioning/timelineFilters.ts` |
| `.add('rollback'` | `src/components/agents/versioning/timelineFilters.ts` |
| `.add('tools'` | `src/components/agents/versioning/timelineFilters.ts` |
| `invoke(` | `src/components/agents/wizard/quickSteps/QuickAgentTestPanel.tsx` |
| `invoke(` | `src/components/agents/wizard/quickSteps/RealExamplePreview.tsx` |
| `sendNotification` | `src/components/automation/MultiChannelComposer.tsx` |
| `sendNotification` | `src/components/automation/NotificationCenterPanel.tsx` |
| `notifyError` | `src/components/crm/CadencesPanel.tsx` |
| `invoke(` | `src/components/datahub/BulkEditDialog.tsx` |
| `invoke(` | `src/components/datahub/CreateRecordDialog.tsx` |
| `invoke(` | `src/components/datahub/DataBrowser.tsx` |
| `invoke(` | `src/components/datahub/DataHubIdentityResolutionTab.tsx` |
| `invoke(` | `src/components/datahub/DataHubQueryBuilderTab.tsx` |
| `invoke(` | `src/components/datahub/DataHubSyncTab.tsx` |
| `invoke(` | `src/components/datahub/HibernatedDatabasesPanel.tsx` |
| `invoke(` | `src/components/datahub/InlineEditCell.tsx` |
| `invoke(` | `src/components/datahub/RecordDetail.tsx` |
| `invoke(` | `src/components/datahub/RecordFieldRenderers.tsx` |
| `invoke(` | `src/components/datahub/RecordSubComponents.tsx` |
| `sendWhatsAppMessage` | `src/components/deployments/WhatsAppSendDialog.tsx` |
| `notify` | `src/components/skills/composer/ExecutionBuilder.tsx` |
| `notify_on` | `src/components/slack/SlackAgentNotificationsPanel.tsx` |
| `invoke(` | `src/components/slack/SlackDlqPanel.tsx` |
| `slack.com` | `src/components/slack/SlackOnboardingWizard.tsx` |
| `slack.onboarding` | `src/components/slack/SlackOnboardingWizard.tsx` |
| `invoke(` | `src/components/slack/SlackTestBroadcastButton.tsx` |
| `invoke(` | `src/components/super-cerebro/DocumentChunkingDialog.tsx` |
| `invoke(` | `src/components/super-cerebro/notebook/AiStudio.tsx` |
| `notify_seller` | `src/data/agentTemplates.ts` |
| `invoke(` | `src/hooks/useAgentEvals.ts` |
| `invoke(` | `src/hooks/useAgentWorkflows.ts` |
| `invoke(` | `src/hooks/useAutomationRules.ts` |
| `notify` | `src/hooks/useAutomationRules.ts` |
| `invoke(` | `src/hooks/useCostEstimate.ts` |
| `invoke(` | `src/hooks/useGlobalSearch.ts` |
| `invoke(` | `src/hooks/useSlackConfig.ts` |
| `notify_on` | `src/hooks/useSlackConfig.ts` |
| `notify_emails` | `src/integrations/supabase/types.ts` |
| `notify_on` | `src/integrations/supabase/types.ts` |
| `invoke(` | `src/lib/llmPricing.ts` |
| `notify` | `src/lib/signedUrlCache.ts` |
| `enqueue(` | `src/lib/ag-ui/protocol.ts` |
| `sendNotification` | `src/lib/mcp/mcpClient.ts` |
| `notify` | `src/lib/skillComposer/skillDraft.ts` |
| `invoke(` | `src/pages/AIStudioPage.tsx` |
| `sendWhatsappMessage` | `src/pages/AgentSessionsPage.tsx` |
| `notify` | `src/pages/AutomationsPage.tsx` |
| `notify_emails` | `src/pages/BudgetSettingsPage.tsx` |
| `notify_emails` | `src/pages/BudgetsPage.tsx` |
| `notify` | `src/pages/IncidentPlaybooksPage.tsx` |
| `publish(` | `src/pages/PostmortemsPage.tsx` |
| `invoke(` | `src/pages/SmolagentPage.tsx` |
| `invoke(` | `src/services/accessControlService.ts` |
| `invoke(` | `src/services/agentGraphService.ts` |
| `invoke(` | `src/services/approvalService.ts` |
| `invoke(` | `src/services/audioService.ts` |
| `invoke(` | `src/services/browserAgentService.ts` |
| `notify_emails` | `src/services/budgetService.ts` |
| `invoke(` | `src/services/cerebroService.ts` |
| `invoke(` | `src/services/codeInterpreterService.ts` |
| `invoke(` | `src/services/costCalculatorService.ts` |
| `invoke(` | `src/services/crmCadenceService.ts` |
| `invoke(` | `src/services/crmService.ts` |
| `invoke(` | `src/services/cronSchedulerService.ts` |
| `invoke(` | `src/services/datahubService.ts` |
| `invoke(` | `src/services/documentIngestionService.ts` |
| `invoke(` | `src/services/drDrillService.ts` |
| `invoke(` | `src/services/evalEngineService.ts` |
| `invoke(` | `src/services/evaluationsService.ts` |
| `invoke(` | `src/services/fineTuningService.ts` |
| `invoke(` | `src/services/guardrailsMLService.ts` |
| `notify` | `src/services/healthAlertsService.ts` |
| `invoke(` | `src/services/healthService.ts` |
| `invoke(` | `src/services/incidentService.ts` |
| `notify` | `src/services/incidentService.ts` |
| `invoke(` | `src/services/knowledgeManagementService.ts` |
| `invoke(` | `src/services/lgpdService.ts` |
| `invoke(` | `src/services/llmGatewayService.ts` |
| `invoke(` | `src/services/memoryService.ts` |
| `invoke(` | `src/services/modelRouterService.ts` |
| `invoke(` | `src/services/nlpPipelineService.ts` |
| `invoke(` | `src/services/notebookPodcastsService.ts` |
| `invoke(` | `src/services/notificationEngineService.ts` |
| `sendNotification` | `src/services/notificationEngineService.ts` |
| `invoke(` | `src/services/openclawDeployService.ts` |
| `sendWhatsappMessage` | `src/services/openclawDeployService.ts` |
| `invoke(` | `src/services/productMockupService.ts` |
| `enqueue(` | `src/services/queueManagerService.ts` |
| `invoke(` | `src/services/queueManagerService.ts` |
| `invoke(` | `src/services/ragPipelineService.ts` |
| `invoke(` | `src/services/replayForkService.ts` |
| `notify` | `src/services/retryEngineService.ts` |
| `invoke(` | `src/services/sbomService.ts` |
| `invoke(` | `src/services/searchService.ts` |
| `invoke(` | `src/services/skillEnrichmentService.ts` |
| `invoke(` | `src/services/skillHarvestService.ts` |
| `invoke(` | `src/services/skillReclassificationService.ts` |
| `invoke(` | `src/services/syntheticService.ts` |
| `invoke(` | `src/services/visionService.ts` |
| `invoke(` | `src/services/voiceAgentService.ts` |
| `invoke(` | `src/services/webhookTriggerService.ts` |
| `sendWhatsAppDocument` | `src/services/whatsappOutboundService.ts` |
| `sendWhatsAppImage` | `src/services/whatsappOutboundService.ts` |
| `sendWhatsAppMessage` | `src/services/whatsappOutboundService.ts` |
| `sendWhatsAppTemplate` | `src/services/whatsappOutboundService.ts` |
| `sendWhatsAppText` | `src/services/whatsappOutboundService.ts` |
| `invoke(` | `src/services/workflowsService.ts` |
| `slack.com` | `src/services/presets/connectorPresets.ts` |
| `notify` | `src/services/types/retryEngineTypes.ts` |
| `slack.com` | `supabase/functions/_shared/slack.ts` |
| `notify` | `supabase/functions/automation-pipeline/index.ts` |
| `enqueue(` | `supabase/functions/cerebro-query/index.ts` |
| `slack.ts` | `supabase/functions/crm-cadence-runner/index.ts` |
| `enqueue(` | `supabase/functions/datahub-query/index.ts` |
| `invoke(` | `supabase/functions/doc-parse/index.ts` |
| `invoke(` | `supabase/functions/doc-rechunk/index.ts` |
| `notify` | `supabase/functions/incident-orchestrator/index.ts` |
| `enqueue(` | `supabase/functions/llm-gateway/index.ts` |
| `sendEmail` | `supabase/functions/notification-sender/index.ts` |
| `sendWhatsApp` | `supabase/functions/notification-sender/index.ts` |
| `slack.com` | `supabase/functions/notification-sender/index.ts` |
| `notify` | `supabase/functions/slack-agent-notify/index.ts` |
| `notify_on` | `supabase/functions/slack-agent-notify/index.ts` |
| `slack.ts` | `supabase/functions/slack-agent-notify/index.ts` |
| `slack.ts` | `supabase/functions/slack-alert-dispatcher/index.ts` |
| `slack.com` | `supabase/functions/slack-dlq-retry/index.ts` |
| `slack.ts` | `supabase/functions/slack-dlq-retry/index.ts` |
| `slack.ts` | `supabase/functions/slack-events-webhook/index.ts` |
| `slack.ts` | `supabase/functions/slack-rag-sync/index.ts` |
| `slack.ts` | `supabase/functions/slack-verify-connection/index.ts` |
| `enqueue(` | `supabase/functions/smolagent-runtime/index.ts` |
| `enqueue(` | `supabase/functions/workflow-engine-v2/index.ts` |
| `slack.mcp` | `supabase/migrations/20260405000003_mcp_servers.sql` |
| `notify` | `supabase/migrations/20260416214516_17522030-a1d7-496e-af4c-b193a3b3280c.sql` |
| `notify_emails` | `supabase/migrations/20260418102513_4d1ac25f-4111-4ff9-921c-33a1b4a8e0e2.sql` |
| `notify_on` | `supabase/migrations/20260722112903_e4950969-c93b-49eb-bec1-8637aa5b7e08.sql` |
| `notify_anpd_on_breach` | `supabase/migrations/20260724000010_lgpd_required_tables.sql` |

## N. Regras citadas em comentários do código

| Comentário | Arquivo |
|---|---|
| Sourcemaps só em dev (produção mantém apenas via Sentry upload no CI). | `vite.config.ts` |
| Aumenta o limite pois hoje separamos bundles grandes intencionalmente (ex: reactflow, tiptap). | `vite.config.ts` |
| "supabaseUrl is required" at module load time in the test environment. | `vitest.config.ts` |
| * @type {import('eslint').Rule.RuleModule} */ | `eslint-plugins/nexus-design.js` |
| * @type {import('eslint').Rule.RuleModule} */ | `eslint-plugins/nexus-design.js` |
| * @type {import('eslint').Rule.RuleModule} */ | `eslint-plugins/nexus-design.js` |
| SW registration is best-effort; app must work without it | `src/main.tsx` |
| Input Validation | `src/components/agent-builder/modules/GuardrailsModule.tsx` |
| Use useGuardrails hook for validation | `src/components/agent-builder/modules/GuardrailsModule.tsx` |
| Seção D — Escopo & Validação */} | `src/components/agent-builder/modules/IdentityModule.tsx` |
| Seção B — Sub-Agentes (visível apenas se multi-agent) */} | `src/components/agent-builder/modules/OrchestrationModule.tsx` |
| Seção D — Validação de Tools */} | `src/components/agent-builder/modules/ToolsModule.tsx` |
| expira sozinho para não passar a mentir sobre o que ainda é "novo". | `src/components/agents/RecentCurationsPanel.tsx` |
| porque `pruneHighlights` preserva identidade enquanto nada expira. | `src/components/agents/RecentCurationsPanel.tsx` |
| Hidrata do sessionStorage: um F5 no meio da curadoria não pode apagar a | `src/components/agents/RecentCurationsPanel.tsx` |
| às falhas transitórias, e as de permissão ficam visíveis para escalar. | `src/components/agents/RecentCurationsPanel.tsx` |
| é O(n) e não deve rodar a cada re-render por hover/estado local. | `src/components/agents/RecentCurationsPanel.tsx` |
| * A RLS da tabela `template_skill_links` é a fonte de verdade da permissão: | `src/components/agents/TemplateLinkedSkillsPanel.tsx` |
| Usado apenas para personalizar a trilha de auditoria ("você" vs. admin X). | `src/components/agents/TemplateLinkedSkillsPanel.tsx` |
| Recalcula apenas quando o template ou os vínculos fortes mudam. | `src/components/agents/TemplateLinkedSkillsPanel.tsx` |
| de impacto operacional (não apenas score numérico): | `src/components/agents/detail/RestoreDiffPreview.tsx` |
| * Janela após a qual o "Desfazer rollback" expira automaticamente. | `src/components/agents/detail/RestoreHistorySection.tsx` |
| mas APENAS enquanto `active` for `true`. Quando todas as entradas já | `src/components/agents/detail/RestoreHistorySection.tsx` |
| Liga o tick somente enquanto pelo menos uma entrada ainda está na janela. | `src/components/agents/detail/RestoreHistorySection.tsx` |
| - score agregado e contagem de erros/avisos de validação (se houver) | `src/components/agents/detail/RestoreSummaryShare.tsx` |
| *⚠️ Validação:**'); | `src/components/agents/detail/RestoreSummaryShare.tsx` |
| * RestoreValidationPanel — exibe issues de pré-validação do rollback. | `src/components/agents/detail/RestoreValidationPanel.tsx` |
| warnings ficam em âmbar e são apenas informativos. | `src/components/agents/detail/RestoreValidationPanel.tsx` |
| Visualizar detalhes — reusa o diálogo de simulação em modo somente leitura */} | `src/components/agents/detail/SavedTestRunsPanel.tsx` |
| Salvar como Test Run — só com summary, agentId e fora do modo somente leitura */} | `src/components/agents/detail/SimulationResultDialog.tsx` |
| source apenas para os grupos marcados) e rodamos checagens estruturais | `src/components/agents/detail/restoreValidation.ts` |
| * Limite máximo prático de `max_tokens` para resposta. */ | `src/components/agents/detail/restoreValidation.ts` |
| Aplica overrides das correções rápidas ANTES da validação — permite que o | `src/components/agents/detail/restoreValidation.ts` |
| 0.5), label: 'Reduzir para 50%', description: 'Define um limite mais seguro.' } | `src/components/agents/detail/restoreValidation.ts` |
| thresholds, matched rules, and per-rule classification flags. | `src/components/agents/detail/sloTimelineCsv.ts` |
| apenas aquele filtro, sem precisar caçar o controle no resto da UI. | `src/components/agents/versioning/FilteredEmptyState.tsx` |
| porque preserva linhas de contexto e destaca apenas o que mudou. | `src/components/agents/versioning/RestoreVersionDialog.tsx` |
| * Guardamos apenas o que é "preferência de visão" e seguro de restaurar entre | `src/components/agents/versioning/timelinePrefs.ts` |
| não deve gerar entradas no back button. | `src/components/agents/wizard/DraftRecoveryBanner.tsx` |
| Persisted user rule: when ON, edits coming from the section checklist | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| Quando o campo destacado é resolvido (ou expira), o banner de feedback | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| Roda apenas uma vez — `initialDeeplink` é estável (useMemo sem deps). | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| Auto-unlock rule active — release the lock if held, do NOT re-lock. | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| (recomendadas + herdadas + manuais) pode nascer já acima do limite do | `src/components/agents/wizard/QuickCreateWizard.tsx` |
| (acessível via Tab/Shift+Tab). Distinto do onJumpToField (que apenas rola/destaca). | `src/components/agents/wizard/RestoreFeedbackBanner.tsx` |
| is the first one failing validation. Falls back to first empty field by heuristic | `src/components/agents/wizard/draftStore.ts` |
| compiler may inject preamble/headers — line numbers must match what | `src/components/agents/wizard/quickSteps/CompiledPromptPreview.tsx` |
| Token-level diff between the joined "before" block and the unified rule. | `src/components/agents/wizard/quickSteps/ContradictionWordDiff.tsx` |
| motivo da validação imediatamente, sem precisar olhar para o topo. | `src/components/agents/wizard/quickSteps/FieldValidationHint.tsx` |
| * One-click auto-fix panel for detected rule contradictions. | `src/components/agents/wizard/quickSteps/PromptContradictionAutoFixPanel.tsx` |
| - Aplicar (splice the unified rule into the prompt and remove the conflicting line) | `src/components/agents/wizard/quickSteps/PromptContradictionAutoFixPanel.tsx` |
| reformular como condicional). A sugestão escolhida é usada como a "regra | `src/components/agents/wizard/quickSteps/PromptContradictionAutoFixPanel.tsx` |
| * User rule: when ON, edits driven by this checklist will auto-release the | `src/components/agents/wizard/quickSteps/PromptSectionChecklist.tsx` |
| Auto-unlock rule — small, opt-in, persisted in localStorage by the wizard. */} | `src/components/agents/wizard/quickSteps/PromptSectionChecklist.tsx` |
| required section. Color-coded by status; clicking jumps the editor to the | `src/components/agents/wizard/quickSteps/PromptSectionGutter.tsx` |
| Detailed diagnostics — explains exactly which rule fired, where, and a sample */} | `src/components/agents/wizard/quickSteps/PromptValidationFeedback.tsx` |
| nunca deve impedir o teste do prompt. | `src/components/agents/wizard/quickSteps/QuickAgentTestPanel.tsx` |
| O servidor é a fonte da verdade (dedupe/sanitização/limite de 25). | `src/components/agents/wizard/quickSteps/QuickAgentTestPanel.tsx` |
| Fallback para o total enviado apenas se o campo não vier na resposta. | `src/components/agents/wizard/quickSteps/QuickAgentTestPanel.tsx` |
| Invalidate validation badge if prompt changed since last successful run | `src/components/agents/wizard/quickSteps/RealExamplePreview.tsx` |
| Validation hints */} | `src/components/agents/wizard/quickSteps/RealExamplePreview.tsx` |
| * Resumo do erro de validação que motivou o highlight (após restaurar). */ | `src/components/agents/wizard/quickSteps/StepQuickIdentity.tsx` |
| Renderiza a hint inline somente para o campo atualmente destacado e | `src/components/agents/wizard/quickSteps/StepQuickIdentity.tsx` |
| apenas enquanto houver `highlightHint` — assim que o usuário corrige, | `src/components/agents/wizard/quickSteps/StepQuickIdentity.tsx` |
| * Persisted user rule: when true, edits coming from the section checklist | `src/components/agents/wizard/quickSteps/StepQuickPrompt.tsx` |
| * Ready-to-use templates for each required prompt section | `src/components/agents/wizard/quickSteps/sectionTemplates.ts` |
| * Budget Widget — Dashboard summary card showing current spend vs limit. | `src/components/dashboard/BudgetWidget.tsx` |
| preserva erros existentes + atualiza apenas para o campo alterado | `src/components/oracle/ResearchSettingsDialog.tsx` |
| <AccessControl permission="agents.create"> | `src/components/rbac/AccessControl.tsx` |
| *   <AccessControl permission={['agents.update', 'agents.delete']} mode="all" fallback={<Badge>Sem acesso</Badge>}> | `src/components/rbac/AccessControl.tsx` |
| * Required permission(s) */ | `src/components/rbac/AccessControl.tsx` |
| * 'any' = at least one permission, 'all' = all permissions required */ | `src/components/rbac/AccessControl.tsx` |
| - Required written reason (minimum N chars) | `src/components/rbac/DangerousActionDialog.tsx` |
| description="Esta ação não pode ser desfeita." | `src/components/rbac/DangerousActionDialog.tsx` |
| * Callback executed after confirmation + validation */ | `src/components/rbac/DangerousActionDialog.tsx` |
| * If set, user must type this exact string to confirm */ | `src/components/rbac/DangerousActionDialog.tsx` |
| <ProtectedRoute permission="settings.read"> | `src/components/rbac/ProtectedRoute.tsx` |
| * Required permission(s) — checked via RBAC */ | `src/components/rbac/ProtectedRoute.tsx` |
| * Required minimum role level */ | `src/components/rbac/ProtectedRoute.tsx` |
| Check permission | `src/components/rbac/ProtectedRoute.tsx` |
| (insecure contexts, permission policy, focus issues, restrictive iframes). | `src/components/shared/ManualCopyDialog.tsx` |
| Falha de auditoria não pode desfazer nem mascarar a instalação | `src/components/skills/SkillAutoRecommendationsPanel.tsx` |
| * O slider governa APENAS a régua de domínio; instabilidade e overrides | `src/components/skills/SkillClassificationEfficacyCard.tsx` |
| Override sem revisão posterior vira pendência de governança após o prazo. | `src/components/skills/SkillClassificationEfficacyCard.tsx` |
| As duas leituras são independentes: uma falhar não pode zerar a outra. | `src/components/skills/SkillClassificationEfficacyCard.tsx` |
| * Abre o diálogo com auto-disparo apenas DEPOIS que o recorte "Sem depto." | `src/components/skills/SkillDemandPanel.tsx` |
| não pode gastar créditos sem o curador pedir. | `src/components/skills/SkillDemandPanel.tsx` |
| SOMENTE o que passou do piso de confiança; o resto fica listado como | `src/components/skills/SkillDescriptionEnrichPanel.tsx` |
| primeira pergunta depois do lote, e a resposta não pode estar só no log. | `src/components/skills/SkillDescriptionEnrichPanel.tsx` |
| Isolamento: um erro de render aqui não pode derrubar a fila. | `src/components/skills/SkillDescriptionEnrichPanel.tsx` |
| * Retenta APENAS o subconjunto cuja causa raiz se beneficia de nova tentativa. | `src/components/skills/SkillDescriptionEnrichPanel.tsx` |
| Um 402 no meio do lote não deve arrastar consigo os 429 que se resolvem | `src/components/skills/SkillDescriptionEnrichPanel.tsx` |
| * Guarda de teto: o runtime compila no máximo MAX_PROMPT_SKILLS skills. Sem | `src/components/skills/SkillLibraryInstallPanel.tsx` |
| * Sparkline em CSS puro — barras proporcionais ao máximo da série. | `src/components/skills/SkillObservabilityMetrics.tsx` |
| - **Nada de checagem de permissão no cliente.** Quem pode aprovar é o banco | `src/components/skills/SkillReclassificationReviewPanel.tsx` |
| Agrupa as falhas por causa. Listar 40 linhas de "limite de | `src/components/skills/SkillReclassifyDialog.tsx` |
| Retorna Promise para gerenciar estado de loading. Deve resolver após persistir. | `src/components/skills/SkillRecommendationsCard.tsx` |
| Guard: exige conteúdo mínimo para evitar chamadas caras em notas vazias. | `src/components/super-cerebro/notebook/AiStudio.tsx` |
| Paridade com Obsidian Bookmarks (subset: notas apenas, sem grupos). | `src/components/super-cerebro/notebook/BookmarksPanel.tsx` |
| 1. Usuário define/confirma uma passphrase (fica somente na sessionStorage). | `src/components/super-cerebro/notebook/E2EESyncPanel.tsx` |
| FAB mobile — visível somente em telas < md, onde ⌘K não existe */} | `src/components/super-cerebro/notebook/NoteQuickOpen.tsx` |
| - Toda categoria de template DEVE aparecer aqui (garantido por teste). | `src/config/department-bridge.ts` |
| - Todo departamento de skill DEVE ser alcançável por ao menos uma categoria. | `src/config/department-bridge.ts` |
| Nexus Agents Studio — Environment Validation | `src/config/env.ts` |
| Validates all required VITE_* env vars at startup. | `src/config/env.ts` |
| * `transversal` NÃO é um domínio de negócio: é o balde de fallback para | `src/config/skill-departments.ts` |
| * Departamentos de negócio reais (exclui o balde de fallback). */ | `src/config/skill-departments.ts` |
| Check if MFA is required for this user (Admin role) | `src/contexts/AuthContext.tsx` |
| *Triangular** com no mínimo 2 fontes independentes (não derivadas uma da outra) | `src/data/quickAgentTemplates.ts` |
| ').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(50), | `src/hooks/useAutomationRules.ts` |
| * Default OFF to preserve the current safer behavior; user must opt in. | `src/hooks/useChecklistAutoUnlock.ts` |
| * Formato mínimo da linha que o predicado precisa enxergar. */ | `src/hooks/useCurationRealtime.ts` |
| * Decide se um evento de mudança deve invalidar o feed do filtro ativo. | `src/hooks/useCurationRealtime.ts` |
| * Zera apenas o recorte que acabou de ser atualizado na tela. | `src/hooks/useCurationRealtime.ts` |
| * Assina as mudanças da tabela e reage apenas aos eventos relevantes. | `src/hooks/useCurationRealtime.ts` |
| `data-scope="super-cerebro"`. O hook cuida apenas de estado + persistência. | `src/hooks/useObsidianMode.ts` |
| usando a API do Have I Been Pwned com k-anonymity (apenas os 5 primeiros | `src/hooks/usePasswordBreachCheck.ts` |
| * Check if user has permission(s). | `src/hooks/useRBAC.ts` |
| @param required - Single permission key or array of keys | `src/hooks/useRBAC.ts` |
| * Check permission(s) */ | `src/hooks/useRBAC.ts` |
| Retry on 429 (rate limit) and 503 (cold start) | `src/hooks/useStreamingResponse.ts` |
| - nav, action, common, errors, validation, dialog, time | `src/i18n/translations.ts` |
| ─── Errors / Validation ─── | `src/i18n/translations.ts` |
| ─── Errors / Validation ─── | `src/i18n/translations.ts` |
| * Grava apenas a impressão digital do artefato e o diagnóstico numérico — | `src/lib/auditService.ts` |
| nunca o prompt em si, que pode conter conteúdo sensível do negócio. Isso | `src/lib/auditService.ts` |
| * Grava apenas nomes e números — nunca conteúdo de skill. Serve para provar | `src/lib/auditService.ts` |
| Preserva query original, substitui apenas o hash. | `src/lib/citationHighlight.ts` |
| Case-insensitive, primeira ocorrência apenas. | `src/lib/citationHighlight.ts` |
| 1. Máximo 8 citações (limite de UX/RAG). | `src/lib/citationValidation.ts` |
| 3. Todo [n] presente no texto deve existir no array (missing). | `src/lib/citationValidation.ts` |
| 4. Toda citation retornada deve ser referenciada no texto (unused). | `src/lib/citationValidation.ts` |
| Sequencialidade: numeração deve começar em 1 e cobrir 1..N sem lacunas. | `src/lib/citationValidation.ts` |
| * Remove toda formatação de CNPJ, retornando apenas dígitos. | `src/lib/normalize.ts` |
| @returns Apenas dígitos ou null | `src/lib/normalize.ts` |
| * Regra: pura, sem I/O. Fácil de testar e versionar. | `src/lib/openclawCompiler.ts` |
| *Permissão:** ${t.permission_level}`, | `src/lib/openclawCompiler.ts` |
| * Limite defensivo: evita estourar contexto com centenas de skills. */ | `src/lib/promptCompiler.ts` |
| * Pure utilities for locating required prompt sections inside a system prompt | `src/lib/promptSectionLocator.ts` |
| * Compute structured locations for all required sections of the given prompt. | `src/lib/promptSectionLocator.ts` |
| um mapa { [sessionId]: ReplayState }. Mantemos no máximo `MAX_ENTRIES` | `src/lib/replayState.ts` |
| LRU: se passou do limite, remove os mais antigos. | `src/lib/replayState.ts` |
| - Aceita apenas UUIDs válidos (v4-ish, mas tolerante). | `src/lib/sourceIdsSync.ts` |
| - `supabase` (client local) ....... APENAS autenticação. | `src/lib/supabaseExtended.ts` |
| de tipagem jamais deve decidir em qual banco a query cai. | `src/lib/supabaseExtended.ts` |
| * Substitui `[[…]]` por HTML/Markdown clicável. `resolve(label,type)` deve | `src/lib/wikilink.ts` |
| $/i, 'Somente letras, dígitos e "_"; comece com letra'), | `src/lib/skillComposer/skillDraft.ts` |
| $/i, 'Somente letras, dígitos e "_"; comece com letra'), | `src/lib/skillComposer/skillDraft.ts` |
| possuem apenas defaults — nunca indicam configuração explícita | `src/lib/skillComposer/skillDraft.ts` |
| sozinho não captura. Cada regra abaixo cobre um gap real detectado pela suíte | `src/lib/skillComposer/skillDraft.ts` |
| Apenas a seção de execução ativa é incluída, evitando ruído. | `src/lib/skillComposer/skillDraft.ts` |
| - somente `https:` (bloqueia `javascript:`, `data:`, `file:`, `http:`); | `src/lib/skills/attribution.ts` |
| - host precisa existir e não pode conter espaços/caracteres de controle. | `src/lib/skills/attribution.ts` |
| que sequer estava em uso. Aqui o veredito é calculado uma vez, com regra | `src/lib/skills/calibrationGovernance.ts` |
| override recente ainda dentro do prazo de revisão. | `src/lib/skills/calibrationGovernance.ts` |
| override não pode depender do relógio da máquina que roda a suíte. | `src/lib/skills/calibrationGovernance.ts` |
| 1. Uma revisão (`review_id`) aparece no máximo uma vez — a decisão mais | `src/lib/skills/classificationEfficacy.ts` |
| * Régua sob a qual a confiança anterior deve ser lida. */ | `src/lib/skills/classificationEfficacy.ts` |
| governa apenas a régua de domínio. | `src/lib/skills/classificationEfficacy.ts` |
| O slider do painel governa APENAS a régua de domínio. Expor aqui uma | `src/lib/skills/classificationEfficacy.ts` |
| 3. Um `skillId` aparece no máximo uma vez (dedupe por primeira ocorrência). | `src/lib/skills/departmentReclassification.ts` |
| * Por quê: a simulação com o catálogo real mostrou margem média de apenas | `src/lib/skills/departmentReclassification.ts` |
| * Antes estas skills eram apenas contadas em `summary.lowConfidence` e | `src/lib/skills/departmentReclassification.ts` |
| apenas não achou nada defensável. | `src/lib/skills/departmentReclassification.ts` |
| real — se não é apenas o nome da skill parafraseado. | `src/lib/skills/descriptionEnrichment.ts` |
| de propósito, e a automação não deve desfazer essa decisão. | `src/lib/skills/descriptionEnrichment.ts` |
| Validação do texto gerado | `src/lib/skills/descriptionEnrichment.ts` |
| * Mínimo de palavras informativas além do nome/slug. */ | `src/lib/skills/descriptionEnrichment.ts` |
| - Só grava NOMES de skills, nunca conteúdo/instruções — a trilha não pode | `src/lib/skills/installCapAudit.ts` |
| deve continuar contando com o teto da época, não com o de hoje. | `src/lib/skills/installCapLedger.ts` |
| * Resume a trilha. Regra central: o descarte "de agora" é lido da entrada | `src/lib/skills/installCapLedger.ts` |
| sempre "dá certo". O que ele NÃO diz é que o runtime compila no máximo | `src/lib/skills/installGuard.ts` |
| apenas faz o agente perder silenciosamente uma competência. A falha só | `src/lib/skills/installGuard.ts` |
| (concorrência) quanto a TAXA SUSTENTADA (espaçamento mínimo entre | `src/lib/skills/llmClassificationQueue.ts` |
| - Uma falha isolada não pode derrubar o lote. Cada item tem seu próprio | `src/lib/skills/llmClassificationQueue.ts` |
| * Máximo de chamadas simultâneas. Controla o PICO. Default 2. */ | `src/lib/skills/llmClassificationQueue.ts` |
| * Intervalo mínimo entre dois disparos. Controla a TAXA. Default 400ms. */ | `src/lib/skills/llmClassificationQueue.ts` |
| Observabilidade é acessório: ela não pode derrubar o trabalho que observa. | `src/lib/skills/llmClassificationQueue.ts` |
| corrente. Não é um limite de segurança: é o ponto em que o léxico já mudou | `src/lib/skills/observability.ts` |
| * Deriva alertas acionáveis. Cada regra tem amostra mínima própria: alertar | `src/lib/skills/observability.ts` |
| prompt inteiro, com dados sensíveis do negócio). O que vai é a impressão | `src/lib/skills/promptAuditArtifact.ts` |
| * Limite defensivo: a trilha não deve virar depósito de listas gigantes. */ | `src/lib/skills/promptAuditArtifact.ts` |
| * Mesma regra de chave do compilador: id quando presente, senão o nome. */ | `src/lib/skills/promptDiff.ts` |
| diff também deve ignorar, senão elas colidiriam todas na chave vazia. | `src/lib/skills/promptDiff.ts` |
| respondendo, apenas ficou burro em algumas competências que ele jura ter | `src/lib/skills/promptOverflowAlert.ts` |
| - `permissao` → pedir acesso ao admin; retentar nunca vai funcionar | `src/lib/skills/queueFailureSummary.ts` |
| * Recorta apenas classificações automáticas de baixa confiança. | `src/lib/skills/skillDemand.ts` |
| Aceita apenas boolean literal. Um `"false"` vindo de storage legado é | `src/lib/skills/skillDemand.ts` |
| * Mínimo de caracteres úteis para uma justificativa ser aceita. */ | `src/lib/skills/thresholdCalibration.ts` |
| `Number('')` é 0 — string vazia não pode virar limiar zero silenciosamente. | `src/lib/skills/thresholdCalibration.ts` |
| resultado não deve ser exibido como diagnóstico de um slider específico. | `src/lib/skills/thresholdCalibration.ts` |
| * Prazo de revisão de um override antes de virar pendência de governança. */ | `src/lib/skills/thresholdCalibration.ts` |
| * Overrides datados que passaram do prazo sem calibração posterior. */ | `src/lib/skills/thresholdCalibration.ts` |
| * Overrides sem data são ignorados — sem timestamp não há prazo a contar, e | `src/lib/skills/thresholdCalibration.ts` |
| ═══ Agent Identity Validation ═══ | `src/lib/validations/agentSchema.ts` |
| ═══ Brain Config Validation ═══ | `src/lib/validations/agentSchema.ts` |
| ═══ Guardrails Validation ═══ | `src/lib/validations/agentSchema.ts` |
| ═══ Budget Validation ═══ | `src/lib/validations/agentSchema.ts` |
| ═══ Knowledge Base Validation ═══ | `src/lib/validations/agentSchema.ts` |
| ═══ Memory Validation ═══ | `src/lib/validations/agentSchema.ts` |
| ═══ Workflow Validation ═══ | `src/lib/validations/agentSchema.ts` |
| ═══ Environment Validation ═══ | `src/lib/validations/agentSchema.ts` |
| ═══ Alert Rule Validation ═══ | `src/lib/validations/agentSchema.ts` |
| ═══ LGPD Deletion Request Validation ═══ | `src/lib/validations/agentSchema.ts` |
| - Tamanho mínimo/máximo de prompt, label e nota. | `src/lib/validations/agentVersionValidator.ts` |
| ─── Prompt: tamanho mínimo / máximo / linhas ──────────── | `src/lib/validations/agentVersionValidator.ts` |
| ─── Inconsistências (apenas warnings) ────────────────── | `src/lib/validations/agentVersionValidator.ts` |
| * Zod validation schemas for authentication routes. | `src/lib/validations/authSchemas.ts` |
| Centralised validation = same rules in AuthPage and ResetPasswordPage. | `src/lib/validations/authSchemas.ts` |
| Cobre validação de dígito verificador + formatação padronizada. | `src/lib/validations/brazilianDocuments.ts` |
| * Suggestion generator for the rule-conflict cards in the preflight review. | `src/lib/validations/contradictionSuggestions.ts` |
| * Single unified rule line that replaces both conflicting lines. */ | `src/lib/validations/contradictionSuggestions.ts` |
| - polarity → keep one rule, drop the other | `src/lib/validations/contradictionSuggestions.ts` |
| * Extract a single "unified rule" line from a multiline suggestion rewrite. | `src/lib/validations/contradictionSuggestions.ts` |
| unified rule line. Inserts the unified rule at the position of the FIRST | `src/lib/validations/contradictionSuggestions.ts` |
| a per-row picker — same splice logic, different unified rule. | `src/lib/validations/contradictionSuggestions.ts` |
| * Zod validation schemas for all dialog forms. | `src/lib/validations/dialogSchemas.ts` |
| Centralised validation = single source of truth. | `src/lib/validations/dialogSchemas.ts` |
| * Linha 1-indexed da primeira regra. */ | `src/lib/validations/promptContradictions.ts` |
| * Linha 1-indexed da segunda regra. */ | `src/lib/validations/promptContradictions.ts` |
| * Limpa caracteres inválidos, tags perigosas e trunca para o limite total. | `src/lib/validations/promptSanitizer.ts` |
| Detailed diagnostics — surfaces which exact rule fired, where, and a sample. | `src/lib/validations/promptSanitizer.ts` |
| * Legible regex source or limit value. */ | `src/lib/validations/promptSanitizer.ts` |
| * Produce structured diagnostics describing every validation rule that fired, | `src/lib/validations/promptSanitizer.ts` |
| 6. Rule Contradictions (Polarity, Numeric, Language) | `src/lib/validations/promptSanitizer.ts` |
| * Splits the prompt by headings and returns a depth report per required section. | `src/lib/validations/quickAgentSchema.ts` |
| para validação e coerção antes de persistir em localStorage. | `src/lib/validations/researchConfig.ts` |
| na validação de payloads vindos da Edge Function `skill-harvester`. | `src/lib/validations/skillImport.ts` |
| ', 'MCP deve usar HTTPS') | `src/lib/validations/skillImport.ts` |
| Garante que o preset padrão é aplicado apenas uma vez por abertura — evita | `src/pages/AgentDetailPage.tsx` |
| Validação pré-restore — sempre revalida quando muda a origem, os campos | `src/pages/AgentDetailPage.tsx` |
| Validação pré-restore — sempre visível quando há origem e ao menos | `src/pages/AgentDetailPage.tsx` |
| idempotente: falha na instalação não deve impedir a criação do agente). | `src/pages/AgentTemplatesPage.tsx` |
| Only ISO strings that parse to a valid Date are honoured; from must be < to. | `src/pages/AgentTracesPage.tsx` |
| Inicialização da URL: roda APENAS na primeira chegada das versões (ou quando | `src/pages/AgentVersioningPage.tsx` |
| Somente leitura: o criador vê seus próprios ciclos de payout, valores acumulados e status. | `src/pages/CreatorPayoutsPage.tsx` |
| Very loose IPv6 fallback — Postgres CIDR type will do the final validation. | `src/pages/IPWhitelistPage.tsx` |
| Regra de ouro FK/CASCADE */} | `src/pages/PartitioningDocsPage.tsx` |
| unmount must not touch state. | `src/pages/SLODashboard.tsx` |
| Permission denied, focus lost, or sandboxed iframe — show | `src/pages/SLODashboard.tsx` |
| invocação (limite de tempo da Edge Function). Encadeamos lotes e | `src/pages/SkillHarvestPage.tsx` |
| skills do registry. Exige permissão de admin (garantida por RLS). | `src/pages/SkillHarvestPage.tsx` |
| Regra ESLint que bloqueia tokens ad-hoc: eslint.config.js | `src/pages/TypographyDocsPage.tsx` |
| 8821) está em rota de entrega e deve chegar até as 18h.", | `src/pages/VoiceAgentStudioPage.tsx` |
| ─── Validation (server-side check) ───────────────────────────── | `src/services/accessControlService.ts` |
| Limite de 1000 traces por padrão para não travar a UI; suficiente para | `src/services/agentBehaviorImpactService.ts` |
| Mantém limite por agente — descarta os mais antigos | `src/services/agentDraftVersionsService.ts` |
| join mínimo (`skill_registry.name`), agregada no cliente. O motivo de não | `src/services/agentSkillLoadService.ts` |
| * NÃO altera a lógica de qual grupo é copiado — apenas patcheia o resultado | `src/services/agentsService.ts` |
| Throws if the file exceeds 25MB (Whisper's hard limit). | `src/services/audioService.ts` |
| * Every destructive action wrapped in <DangerousActionDialog> MUST call | `src/services/auditLogService.ts` |
| * Pre-built automation recipes covering common business scenarios. | `src/services/automationTemplateService.ts` |
| achata 1 nível apenas | `src/services/basesService.ts` |
| * Contexto da mudança: até aqui o histórico vivia apenas em | `src/services/chatThreadService.ts` |
| Hoje escrevemos apenas o caminho linear (cada mensagem aponta | `src/services/chatThreadService.ts` |
| - Todo IO é defensivo: falha de rede nunca derruba a UI, apenas | `src/services/chatThreadService.ts` |
| * Chave legada do localStorage, usada apenas na migração única. */ | `src/services/chatThreadService.ts` |
| * Executa no máximo uma vez por navegador (flag em localStorage) e | `src/services/chatThreadService.ts` |
| * Uma rodada do runner, gravada pela Edge Function (somente leitura no cliente). */ | `src/services/crmCadenceService.ts` |
| 3. Testabilidade — a regra de negócio fica coberta por testes unitários | `src/services/crmScoringService.ts` |
| Perfil sem alvo definido não deve punir ninguém — trata como neutro. | `src/services/crmScoringService.ts` |
| NaN vindo de data inválida não pode contaminar o score. | `src/services/crmScoringService.ts` |
| * Persiste o score de um negócio. Grava também `score_reason` e `scored_at` | `src/services/crmScoringService.ts` |
| atividades da janela) em vez de N+1 por negócio. Com 500 negócios isso é a | `src/services/crmScoringService.ts` |
| * Move um negócio de estágio e registra a mudança na timeline. | `src/services/crmService.ts` |
| A atividade é o registro auditável — a coluna `stage_id` guarda apenas o | `src/services/crmService.ts` |
| * O webhook entrega apenas o ID da entidade, criando registros "casca" | `src/services/crmService.ts` |
| Passphrase mudou vs checkpoint antigo? Não é fatal — apenas re-carimba. | `src/services/e2eeAutoSync.ts` |
| - A passphrase NUNCA é persistida no servidor. Vive apenas na sessão do | `src/services/e2eeService.ts` |
| * Loads up to `limit` recent memories and runs entity resolution | `src/services/entityResolutionService.ts` |
| All read/write operations MUST go through lgpd-manager Edge Function | `src/services/lgpdService.ts` |
| ').eq('is_public', true).limit(limit); | `src/services/marketplaceService.ts` |
| Limit hot-loaded skills | `src/services/progressiveSkillLoader.ts` |
| Elevated 10/10 with diffing, analytics and real-time validation | `src/services/promptVersionService.ts` |
| * Por quê? O wizard rápido recomendava skills apenas por similaridade textual | `src/services/quickTypeTemplateMap.ts` |
| - Todo id listado aqui DEVE existir em `AGENT_TEMPLATES` (há teste guardando); | `src/services/quickTypeTemplateMap.ts` |
| ═══ Permission Check (client-side) ═══ | `src/services/rbacService.ts` |
| Each snapshot's previous_hash must match the prior snapshot's chain_hash. | `src/services/replayForkService.ts` |
| limite defensivo (URLs muito longas quebram em alguns browsers) | `src/services/shareService.ts` |
| apenas contar cliques do curador. | `src/services/skillClassificationTimelineService.ts` |
| permissão recebe conjunto vazio (não erro) do PostgREST, então a UI trata | `src/services/skillClassificationTimelineService.ts` |
| * Leitura apenas: a agregação acontece no cliente porque ambos os conjuntos | `src/services/skillDemandService.ts` |
| - `domain`: um departamento de negócio venceu por léxico próprio; | `src/services/skillDepartmentClassifier.ts` |
| de documento próxima de 1: não discriminam departamento algum, apenas somam | `src/services/skillDepartmentClassifier.ts` |
| puro: o SQL cobre o caso dominante — `description = ''` — e o resto é regra | `src/services/skillEnrichmentService.ts` |
| de negócio que muda mais rápido que schema e merece ser testável sem banco. | `src/services/skillEnrichmentService.ts` |
| * Mesma regra do fallback de classificação, e pelo mesmo motivo: 402 (créditos) | `src/services/skillEnrichmentService.ts` |
| * Onde o próximo lote deve começar. */ | `src/services/skillHarvestService.ts` |
| Falha de rede não pode derrubar a varredura: o local já guardou o avanço. | `src/services/skillHarvestService.ts` |
| corre risco de estourar o limite de tempo da plataforma. | `src/services/skillHarvestService.ts` |
| * Todas as tabelas têm RLS restrita; um usuário sem permissão recebe conjunto | `src/services/skillObservabilityService.ts` |
| * Limite de caracteres do motivo — espelha o `LEFT(..., 1000)` da RPC. */ | `src/services/skillReclassificationReviewService.ts` |
| anterior à coluna) e NÃO pode virar 0: exibir "limiar 0,00" sugeriria que o | `src/services/skillReclassificationReviewService.ts` |
| proposta órfã de departamento renomeado não pode ser aprovada, e mostrá-la | `src/services/skillReclassificationReviewService.ts` |
| apenas informa a intenção e o motivo. | `src/services/skillReclassificationReviewService.ts` |
| * A regra que importa: 402 (créditos esgotados) NÃO é re-tentável. Insistir | `src/services/skillReclassificationService.ts` |
| validação são culpa do payload e não melhoram com repetição. | `src/services/skillReclassificationService.ts` |
| 2 hits = fit máximo | `src/services/skillRecommenderService.ts` |
| quando o ranking semântico devolve menos que `limit`. Desligado por padrão | `src/services/skillRecommenderService.ts` |
| para preservar determinismo em fluxos que exigem apenas matches reais. | `src/services/skillRecommenderService.ts` |
| … +163 linhas — lista completa em `context.json` | |
