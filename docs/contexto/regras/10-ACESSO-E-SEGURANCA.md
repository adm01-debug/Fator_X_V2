# 10 · ACESSO E SEGURANÇA — quem pode o quê

> Gerado automaticamente por AI Context Sync v1.3.2 · commit `4775646737` · branch `main` · 2026-11-19 23:37 UTC
> Não edite à mão — regras humanas vão em `manual/`.

## Perfis / roles identificados

`admin`, `assistant`, `combobox`, `listbox`, `menuitem`, `option`, `owner`, `searchbox`, `system`, `textbox`, `turn`, `user`, `workspace_admin`

- Tabelas de perfil/permissão: `user_roles`, `workspace_members`, `roles`, `permissions`, `role_permissions`, `agent_permissions`, `workspace_member_emails`, `workspace_members_directory`, `workspace_members_public`, `workspace_members_safe`
- Colunas de perfil: `workspace_members.role` (TEXT DEFAULT 'editor'), `workflow_steps.role` (TEXT DEFAULT 'executor'), `chat_messages.role` (TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system'))), `workspace_members_directory.role` (string | null), `workspace_members_public.role` (string | null), `workspace_members_safe.role` (string | null)
- Claims do JWT usados em políticas/funções: `aal`
- Funções usadas dentro de políticas RLS (a regra real está no corpo delas — veja `06`): `get_user_workspace_ids`, `is_workspace_admin`

## Matriz tabela × operação → quem pode (derivada das políticas RLS)

| Tabela | RLS | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| `access_blocked_log` | enabled | authenticated: (workspace_id IS NOT NULL AND public.is_workspace_admin(auth.uid(), workspace_id)) OR (workspace_id IS NULL AND EXISTS ( SELE | — | — | — |
| `account_lockouts` | enabled | public: current_setting('request.jwt.claim.role', true) = 'service_role' OR EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.ui | public: current_setting('request.jwt.claim.role', true) = 'service_role' | — | public: current_setting('request.jwt.claim.role', true) = 'service_role' OR EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.ui |
| `agent_daily_metrics` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_eval_datasets` | enabled | authenticated: workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) AND created_by = auth.uid() | authenticated: created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id) | authenticated: created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id) |
| `agent_eval_results` | enabled | authenticated: run_id IN (SELECT id FROM public.agent_eval_runs WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))) | authenticated: run_id IN (SELECT id FROM public.agent_eval_runs WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))) | — | — |
| `agent_eval_runs` | enabled | authenticated: workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) AND created_by = auth.uid() | authenticated: workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id) |
| `agent_experiment_runs` | enabled | authenticated: experiment_id IN ( SELECT id FROM public.agent_experiments WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))  | authenticated: experiment_id IN ( SELECT id FROM public.agent_experiments WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))  | — | authenticated: experiment_id IN ( SELECT id FROM public.agent_experiments WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))  |
| `agent_experiments` | enabled | authenticated: workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) AND created_by = auth.uid() | authenticated: created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id) | authenticated: is_workspace_admin(auth.uid(), workspace_id) OR created_by = auth.uid() |
| `agent_graphs` | enabled | authenticated: workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) AND created_by = auth.uid() | authenticated: workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id) |
| `agent_installed_skills` | enabled | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR current_setting('request.jwt.cla | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'membe | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'membe | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c |
| `agent_memories` | enabled | authenticated: user_id = auth.uid() OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())<br>authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid())<br>authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: user_id = auth.uid() OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())<br>authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid())<br>authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: user_id = auth.uid() OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())<br>authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid())<br>authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: user_id = auth.uid() OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())<br>authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid())<br>authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) |
| `agent_memories_v2` | enabled | authenticated: true<br>public: EXISTS (SELECT 1 FROM public.agents a JOIN public.workspace_members m ON m.workspace_id = a.workspace_id WHERE a.id = agent_memories<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR workspace_id IS NULL OR current_ | public: (workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) AND workspace_id IS NOT NULL) OR w | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR workspace_id IS NULL OR current_ | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR w |
| `agent_permissions` | enabled | public: user_id = auth.uid()<br>public: auth.role() = 'service_role' | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' |
| `agent_routing_config` | enabled | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>authenticated: public.is_workspace_admin(auth.uid(), workspace_id)<br>service_role: true | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>service_role: true | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>service_role: true | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>service_role: true |
| `agent_skills` | enabled | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR current_setting('request.jwt.cla | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'membe | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'membe | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c |
| `agent_templates` | enabled | authenticated: is_public = true OR created_by = auth.uid() | authenticated: created_by = auth.uid() | — | — |
| `agent_traces` | enabled | public: auth.uid() = user_id | — | — | — |
| `agent_traces_v2_2026_04` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2026_05` | não encontrado | authenticated: EXISTS ( SELECT 1 FROM public.agents a WHERE a.id = agent_traces_v2_2026_05.agent_id AND public.is_workspace_admin((SELECT au | authenticated: EXISTS ( SELECT 1 FROM public.agents a WHERE a.id = agent_traces_v2_2026_05.agent_id AND public.is_workspace_admin((SELECT au | authenticated: EXISTS ( SELECT 1 FROM public.agents a WHERE a.id = agent_traces_v2_2026_05.agent_id AND public.is_workspace_admin((SELECT au | authenticated: EXISTS ( SELECT 1 FROM public.agents a WHERE a.id = agent_traces_v2_2026_05.agent_id AND public.is_workspace_admin((SELECT au |
| `agent_traces_v2_2026_06` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2026_07` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2026_08` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2026_09` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2026_10` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2026_11` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2026_12` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2027_01` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2027_02` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2027_03` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2027_04` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2027_05` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2027_06` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_traces_v2_2027_07` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `agent_usage` | não encontrado | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `agent_versions` | enabled | authenticated: agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())<br>authenticated: agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid()) | authenticated: agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())<br>authenticated: agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid()) | authenticated: agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid()) | authenticated: agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid()) |
| `agent_workflow_runs` | enabled | authenticated: workflow_id IN ( SELECT id FROM public.agent_workflows WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid() | authenticated: created_by = auth.uid() | authenticated: workflow_id IN ( SELECT id FROM public.agent_workflows WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid() | — |
| `agent_workflows` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) AND created_by = auth.uid() | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) |
| `agents` | não encontrado | authenticated: user_id = (SELECT auth.uid()) OR ( is_template = true AND workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid())) | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `alert_rules` | enabled | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) |
| `alerts` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) |
| `api_keys` | enabled | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>authenticated: auth.uid() = user_id<br>public: auth.uid() = user_id | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>authenticated: auth.uid() = user_id | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>authenticated: auth.uid() = user_id | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>authenticated: auth.uid() = user_id |
| `asset_audits` | enabled | public: asset_id IN (SELECT id FROM public.assets WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))) | public: asset_id IN (SELECT id FROM public.assets WHERE public.is_workspace_admin(auth.uid(), workspace_id)) | — | — |
| `assets` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `audit_events` | enabled | public: EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND workspace_id = audit_events.workspace_id AND role_key = 'wor | public: auth.role() = 'authenticated' OR auth.role() = 'service_role' | — | — |
| `audit_log` | enabled | authenticated: auth.uid() = user_id<br>public: EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_key IN ('workspace_admin','platform_admin'))<br>public: ( workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) )  | authenticated: true<br>authenticated: false<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | authenticated: false | authenticated: false |
| `audit_log_safe` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2` | enabled | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) |
| `audit_log_v2_2026_04` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2_2026_05` | não encontrado | authenticated: false | authenticated: false | authenticated: false | authenticated: false |
| `audit_log_v2_2026_06` | não encontrado | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) |
| `audit_log_v2_2026_07` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2_2026_08` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2_2026_09` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2_2026_10` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2_2026_11` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2_2026_12` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2_2027_01` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2_2027_02` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2_2027_03` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2_2027_04` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2_2027_05` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2_2027_06` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `audit_log_v2_2027_07` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `auth_attempts` | enabled | public: EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_key = 'platform_admin') | public: auth.role() = 'authenticated' OR auth.role() = 'service_role' | — | — |
| `automation_logs` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | — | — | — |
| `automation_rules` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) AND created_by = auth.uid() | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) |
| `automation_templates` | enabled | public: workspace_id IS NULL OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())<br>public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' |
| `batch_jobs` | enabled | public: auth.uid() IS NOT NULL | public: auth.uid() IS NOT NULL | public: auth.uid() IS NOT NULL | public: auth.uid() IS NOT NULL |
| `bcp_test_runs` | enabled | public: system_id IN (SELECT id FROM public.business_systems WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))) | public: executed_by = auth.uid() AND system_id IN (SELECT id FROM public.business_systems WHERE public.is_workspace_admin(auth.uid(), worksp | — | — |
| `bitrix24_webhook_events` | enabled | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>authenticated: EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = bitrix24_webhook_events.workspace_id AND wm.user_i<br>service_role: true | public: true<br>service_role: true | service_role: true | service_role: true |
| `browser_sessions` | enabled | public: auth.uid() = user_id OR workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: auth.uid() = user_id | public: auth.uid() = user_id | public: auth.uid() = user_id |
| `budget_events` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | — | — | — |
| `budgets` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) |
| `business_systems` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid() | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `change_approvals` | enabled | public: EXISTS ( SELECT 1 FROM public.change_requests cr WHERE cr.id = change_id AND cr.workspace_id IN (SELECT public.get_user_workspace_id | public: approver_id = auth.uid() AND EXISTS ( SELECT 1 FROM public.change_requests cr WHERE cr.id = change_id AND public.is_workspace_admin( | — | — |
| `change_requests` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: requested_by = auth.uid() AND workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: public.is_workspace_admin(auth.uid(), workspace_id) OR (requested_by = auth.uid() AND workspace_id IN (SELECT public.get_user_worksp | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `chaos_experiments` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid() | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `chat_messages` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.chat_threads t WHERE t.id = chat_messages.thread_id AND t.user_id = (SELECT auth.uid()) ) | authenticated: EXISTS ( SELECT 1 FROM public.chat_threads t WHERE t.id = chat_messages.thread_id AND t.user_id = (SELECT auth.uid()) ) | authenticated: EXISTS ( SELECT 1 FROM public.chat_threads t WHERE t.id = chat_messages.thread_id AND t.user_id = (SELECT auth.uid()) ) | authenticated: EXISTS ( SELECT 1 FROM public.chat_threads t WHERE t.id = chat_messages.thread_id AND t.user_id = (SELECT auth.uid()) ) |
| `chat_threads` | enabled | authenticated: user_id = (SELECT auth.uid()) | authenticated: user_id = (SELECT auth.uid()) | authenticated: user_id = (SELECT auth.uid()) | authenticated: user_id = (SELECT auth.uid()) |
| `chunks` | enabled | authenticated: document_id IN (SELECT doc.id FROM documents doc WHERE doc.collection_id IN (SELECT col.id FROM collections col WHERE col.kno | authenticated: document_id IN (SELECT doc.id FROM documents doc WHERE doc.collection_id IN (SELECT col.id FROM collections col WHERE col.kno | authenticated: document_id IN (SELECT doc.id FROM documents doc WHERE doc.collection_id IN (SELECT col.id FROM collections col WHERE col.kno | authenticated: document_id IN (SELECT doc.id FROM documents doc WHERE doc.collection_id IN (SELECT col.id FROM collections col WHERE col.kno |
| `citation_telemetry` | enabled | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | — |
| `code_executions` | enabled | public: auth.uid() = user_id | public: auth.uid() = user_id | — | public: auth.uid() = user_id |
| `collections` | enabled | authenticated: knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHERE kb.workspace_id IN (SELECT public.get_user_workspace_ids(aut<br>authenticated: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()) | authenticated: knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHERE kb.workspace_id IN (SELECT public.get_user_workspace_ids(aut<br>authenticated: workspace_id IS NULL OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()) | authenticated: knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHERE kb.workspace_id IN (SELECT public.get_user_workspace_ids(aut<br>authenticated: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()) | authenticated: knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHERE kb.workspace_id IN (SELECT public.get_user_workspace_ids(aut<br>authenticated: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()) |
| `compliance_controls` | enabled | authenticated: true | — | — | — |
| `compliance_evidence` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.compliance_reports r JOIN public.workspace_members wm ON wm.workspace_id = r.workspace_id WHERE<br>authenticated: EXISTS ( SELECT 1 FROM public.compliance_reports r WHERE r.id = compliance_evidence.report_id AND public.is_workspace_admin(a | authenticated: EXISTS ( SELECT 1 FROM public.compliance_reports r WHERE r.id = compliance_evidence.report_id AND public.is_workspace_admin(a | authenticated: EXISTS ( SELECT 1 FROM public.compliance_reports r WHERE r.id = compliance_evidence.report_id AND public.is_workspace_admin(a | authenticated: EXISTS ( SELECT 1 FROM public.compliance_reports r WHERE r.id = compliance_evidence.report_id AND public.is_workspace_admin(a |
| `compliance_frameworks` | enabled | authenticated: true | — | — | — |
| `compliance_reports` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = compliance_reports.workspace_id AND wm.user_id = a | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) |
| `connector_instances` | enabled | public: auth.uid() IS NOT NULL | public: auth.uid() IS NOT NULL | public: auth.uid() IS NOT NULL | public: auth.uid() IS NOT NULL |
| `connector_registry` | enabled | public: TRUE<br>public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' |
| `consent_records` | enabled | authenticated: user_id = auth.uid()<br>authenticated: auth.uid() = user_id | authenticated: user_id = auth.uid()<br>authenticated: auth.uid() = user_id | authenticated: user_id = auth.uid()<br>authenticated: auth.uid() = user_id | authenticated: user_id = auth.uid() |
| `cost_alerts` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | — | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | — |
| `cost_baselines` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | — | — | — |
| `creator_payouts` | enabled | authenticated: creator_id = auth.uid() | — | — | — |
| `credential_audit_logs` | enabled | public: workspace_id IN ( SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'ad<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN ( SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'ad<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN ( SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'ad<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN ( SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'ad<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' |
| `credential_vault` | enabled | public: workspace_id IN ( SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'ad<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN ( SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'ad<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN ( SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'ad<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN ( SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'ad<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' |
| `crm_activities` | enabled | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) |
| `crm_cadence_enrollments` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))) |
| `crm_cadence_runs` | enabled | authenticated: (workspace_id IS NOT NULL AND workspace_id IN ( SELECT public.get_user_workspace_ids((SELECT auth.uid())) )) OR (workspace_id | — | — | — |
| `crm_cadence_steps` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))) |
| `crm_cadences` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))) |
| `crm_companies` | enabled | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) |
| `crm_contacts` | enabled | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) |
| `crm_deals` | enabled | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) |
| `crm_icp_profiles` | enabled | authenticated: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = (SELECT auth.uid())) | authenticated: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = (SELECT auth.uid())) | authenticated: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = (SELECT auth.uid())) | authenticated: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = (SELECT auth.uid())) |
| `crm_pipelines` | enabled | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) |
| `crm_stages` | enabled | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) | authenticated: workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))) |
| `cron_schedule_executions` | enabled | public: auth.uid() IS NOT NULL<br>service_role: true | public: auth.uid() IS NOT NULL<br>service_role: true | public: auth.uid() IS NOT NULL<br>service_role: true | public: auth.uid() IS NOT NULL<br>service_role: true |
| `cron_schedules` | enabled | public: auth.uid() IS NOT NULL<br>service_role: true | public: auth.uid() IS NOT NULL<br>service_role: true | public: auth.uid() IS NOT NULL<br>service_role: true | public: auth.uid() IS NOT NULL<br>service_role: true |
| `data_breach_log` | enabled | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | service_role: TRUE | — | — |
| `data_deletion_requests` | enabled | authenticated: user_id = auth.uid()<br>authenticated: auth.uid() = user_id | authenticated: user_id = auth.uid()<br>authenticated: auth.uid() = user_id | authenticated: user_id = auth.uid()<br>authenticated: false | authenticated: user_id = auth.uid()<br>authenticated: false |
| `data_processing_register` | enabled | public: TRUE<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c |
| `data_retention_policies` | enabled | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR current_setting('request.jwt.cla<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c |
| `data_subject_requests` | enabled | public: user_id = auth.uid()<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: user_id = auth.uid()<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c |
| `dead_letter_queue` | enabled | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: current_setting('request.jwt.claim.role', true) = 'service_role' |
| `deploy_connections` | enabled | authenticated: workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT workspaces.id FROM workspaces WHERE workspaces.owner_id = auth.uid()) | authenticated: workspace_id IN (SELECT workspaces.id FROM workspaces WHERE workspaces.owner_id = auth.uid()) | authenticated: workspace_id IN (SELECT workspaces.id FROM workspaces WHERE workspaces.owner_id = auth.uid()) |
| `document_ingestion_events` | enabled | authenticated: user_id = auth.uid() | — | — | — |
| `document_ingestions` | enabled | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `documents` | enabled | authenticated: collection_id IN (SELECT col.id FROM collections col WHERE col.knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHE | authenticated: collection_id IN (SELECT col.id FROM collections col WHERE col.knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHE | authenticated: collection_id IN (SELECT col.id FROM collections col WHERE col.knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHE | authenticated: collection_id IN (SELECT col.id FROM collections col WHERE col.knowledge_base_id IN (SELECT kb.id FROM knowledge_bases kb WHE |
| `dr_drills` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid() | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) |
| `dr_restore_logs` | enabled | authenticated: drill_id IN (SELECT id FROM public.dr_drills WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))) | — | — | — |
| `dr_snapshots` | enabled | authenticated: drill_id IN (SELECT id FROM public.dr_drills WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))) | — | — | — |
| `entity_resolution_logs` | enabled | authenticated: true<br>authenticated: EXISTS ( SELECT 1 FROM public.knowledge_entities ke JOIN public.workspace_members wm ON wm.workspace_id = ke.workspace_id WHE<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR current_setting('request.jwt.cla | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR current_setting('request.jwt.cla | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR current_setting('request.jwt.cla | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR current_setting('request.jwt.cla |
| `environments` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) |
| `eval_runs` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = eval_runs.workspace_id AND wm.user_id = auth.uid()<br>service_role: true | service_role: true | service_role: true | service_role: true |
| `evaluation_datasets` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) |
| `evaluation_runs` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) |
| `execution_history` | enabled | public: auth.uid() IS NOT NULL | public: auth.uid() IS NOT NULL | public: auth.uid() IS NOT NULL | public: auth.uid() IS NOT NULL |
| `finetune_jobs` | enabled | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()) | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()) | public: user_id = auth.uid() | — |
| `forensic_snapshots` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `forum_posts` | enabled | public: ( thread_id IN ( SELECT ft.id FROM public.forum_threads ft JOIN public.help_centers hc ON ft.help_center_id = hc.id WHERE ft.is_publ | public: ( thread_id IN ( SELECT ft.id FROM public.forum_threads ft JOIN public.help_centers hc ON ft.help_center_id = hc.id JOIN public.work | public: author_id = auth.uid() OR current_setting('request.jwt.claim.role', true) = 'service_role' | public: author_id = auth.uid() OR current_setting('request.jwt.claim.role', true) = 'service_role' |
| `forum_posts_public` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `forum_posts_safe` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `forum_threads` | enabled | public: ( is_published = true AND help_center_id IN ( SELECT id FROM public.help_centers WHERE is_published = true ) ) OR ( help_center_id I | public: ( help_center_id IN ( SELECT hc.id FROM public.help_centers hc JOIN public.workspace_members wm ON wm.workspace_id = hc.workspace_id | public: ( author_id = auth.uid() ) OR ( help_center_id IN ( SELECT hc.id FROM public.help_centers hc JOIN public.workspace_members wm ON wm. | public: help_center_id IN ( SELECT hc.id FROM public.help_centers hc JOIN public.workspace_members wm ON wm.workspace_id = hc.workspace_id W |
| `forum_threads_public` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `forum_threads_safe` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `freeze_windows` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))<br>public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `game_day_events` | enabled | authenticated: game_day_id IN ( SELECT id FROM public.game_days WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) ) | authenticated: actor_id = auth.uid() AND game_day_id IN ( SELECT id FROM public.game_days WHERE status = 'running' AND (facilitator_id = aut | — | — |
| `game_day_scorecards` | enabled | authenticated: game_day_id IN ( SELECT id FROM public.game_days WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) ) | authenticated: created_by = auth.uid() AND game_day_id IN ( SELECT id FROM public.game_days WHERE facilitator_id = auth.uid() OR public.is_w | — | — |
| `game_days` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) AND facilitator_id = auth.uid() | authenticated: facilitator_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) |
| `geo_allowed_countries` | enabled | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) |
| `graph_executions` | enabled | authenticated: auth.uid() = user_id OR (workspace_id IS NOT NULL AND workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))) | authenticated: auth.uid() = user_id | authenticated: auth.uid() = user_id | authenticated: auth.uid() = user_id |
| `guardrail_policies` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) |
| `help_centers` | enabled | public: is_published = true<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR is_published = true OR current_s<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c |
| `hf_config` | enabled | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())<br>public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role = 'admin') | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role = 'admin') | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role = 'admin') | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role = 'admin') |
| `idempotency_keys` | enabled | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' |
| `incident_playbooks` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid() | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `incident_runs` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | — | — | — |
| `installed_templates` | enabled | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())<br>public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role' |
| `internal.cron_tokens` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `internal.db_health_samples` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `internal.detector_slo_state` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `internal.index_usage_snapshots` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `internal.partitioned_families` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `internal.query_perf_baseline` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `internal.query_perf_snapshots` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `internal.query_stats_snapshots` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `internal.rollback_snapshots` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `internal.table_activity_snapshots` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `internal.wal_snapshots` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `ip_rate_limits` | enabled | public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: current_setting('request.jwt.claim.role', true) = 'service_role' | public: current_setting('request.jwt.claim.role', true) = 'service_role' |
| `ip_whitelist` | enabled | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) |
| `ir_playbook_steps` | enabled | public: playbook_id IN (SELECT id FROM public.ir_playbooks WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))<br>public: playbook_id IN (SELECT id FROM public.ir_playbooks p WHERE public.is_workspace_admin(auth.uid(), p.workspace_id)) | public: playbook_id IN (SELECT id FROM public.ir_playbooks p WHERE public.is_workspace_admin(auth.uid(), p.workspace_id)) | public: playbook_id IN (SELECT id FROM public.ir_playbooks p WHERE public.is_workspace_admin(auth.uid(), p.workspace_id)) | public: playbook_id IN (SELECT id FROM public.ir_playbooks p WHERE public.is_workspace_admin(auth.uid(), p.workspace_id)) |
| `ir_playbooks` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))<br>public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `ir_tabletop_exercises` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))<br>public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `kb_article_versions` | enabled | authenticated: article_id IN (SELECT id FROM public.kb_articles WHERE knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE work | authenticated: article_id IN (SELECT id FROM public.kb_articles WHERE knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE work | — | — |
| `kb_articles` | enabled | public: status = 'published'<br>authenticated: knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) |
| `kb_query_gaps` | enabled | authenticated: knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) |
| `kb_translations` | enabled | authenticated: article_id IN (SELECT id FROM public.kb_articles WHERE knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE work | authenticated: article_id IN (SELECT id FROM public.kb_articles WHERE knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE work | authenticated: article_id IN (SELECT id FROM public.kb_articles WHERE knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE work | authenticated: article_id IN (SELECT id FROM public.kb_articles WHERE knowledge_base_id IN (SELECT id FROM public.knowledge_bases WHERE work |
| `knowledge_bases` | enabled | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) |
| `knowledge_entities` | enabled | authenticated: true<br>public: workspace_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = knowledge_entities.workspace_id AND<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'membe<br>public: workspace_id IS NULL | public: EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = knowledge_entities.workspace_id AND user_id = auth.uid())<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'membe | public: EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = knowledge_entities.workspace_id AND user_id = auth.uid())<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'membe | public: EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = knowledge_entities.workspace_id AND user_id = auth.uid())<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'membe |
| `knowledge_graph_health` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `knowledge_links` | enabled | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) | — | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) |
| `knowledge_relations` | enabled | authenticated: true<br>public: EXISTS (SELECT 1 FROM public.knowledge_entities e JOIN public.workspace_members m ON m.workspace_id = e.workspace_id WHERE e.id = kn<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR current_setting('request.jwt.cla | public: EXISTS (SELECT 1 FROM public.knowledge_entities e JOIN public.workspace_members m ON m.workspace_id = e.workspace_id WHERE e.id = kn<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR current_setting('request.jwt.cla | public: EXISTS (SELECT 1 FROM public.knowledge_entities e JOIN public.workspace_members m ON m.workspace_id = e.workspace_id WHERE e.id = kn<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR current_setting('request.jwt.cla | public: EXISTS (SELECT 1 FROM public.knowledge_entities e JOIN public.workspace_members m ON m.workspace_id = e.workspace_id WHERE e.id = kn<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR current_setting('request.jwt.cla |
| `lgpd_settings` | enabled | public: TRUE<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c |
| `llm_cost_by_caller` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `managed_secrets` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid() | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `mcp_servers` | enabled | authenticated: workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>public: auth.role() = 'service_role'<br>authenticated: owner_id = (SELECT auth.uid()) | authenticated: workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>public: auth.role() = 'service_role'<br>authenticated: owner_id = (SELECT auth.uid()) | authenticated: workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>public: auth.role() = 'service_role'<br>authenticated: owner_id = (SELECT auth.uid()) | authenticated: workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>public: auth.role() = 'service_role'<br>authenticated: owner_id = (SELECT auth.uid()) |
| `model_pricing` | enabled | authenticated: true<br>authenticated: true | — | — | — |
| `notebook_canvases` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = notebook_canvases.workspace_id AND wm.user_id = au | authenticated: created_by = auth.uid() AND EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = notebook_canvases.work | authenticated: EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = notebook_canvases.workspace_id AND wm.user_id = au | authenticated: created_by = auth.uid() |
| `notebook_note_templates` | enabled | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) AND is_builtin = FALS |
| `notebook_note_versions` | enabled | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) | — | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) |
| `notebook_notes` | enabled | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) | authenticated: workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) |
| `notebook_podcasts` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = notebook_podcasts.workspace_id AND wm.user_id = au | authenticated: created_by = auth.uid() AND EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = notebook_podcasts.work | authenticated: created_by = auth.uid() OR public.is_workspace_admin(auth.uid()) | authenticated: created_by = auth.uid() OR public.is_workspace_admin(auth.uid()) |
| `notification_templates` | enabled | public: workspace_id IS NULL OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())<br>public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true |
| `notifications` | enabled | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())<br>public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true |
| `oncall_schedule` | enabled | public: public.is_workspace_admin(auth.uid(), workspace_id)<br>authenticated: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `oncall_schedule_emails` | enabled | authenticated: user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id)<br>authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) |
| `oncall_schedule_safe` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `openclaw_agent_templates` | enabled | authenticated: true | authenticated: public.is_workspace_admin(auth.uid()) | authenticated: public.is_workspace_admin(auth.uid()) | authenticated: public.is_workspace_admin(auth.uid()) |
| `openclaw_deployments` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_deployments.workspace_id AND wm.user_id = | authenticated: EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_deployments.workspace_id AND wm.user_id = | authenticated: EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_deployments.workspace_id AND wm.user_id = | — |
| `openclaw_events` | enabled | authenticated: workspace_id IS NULL OR EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_events.workspace_ | — | — | — |
| `openclaw_whatsapp_instances` | enabled | authenticated: EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_instances.workspace_id AND wm.use | authenticated: EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_instances.workspace_id AND wm.use | authenticated: EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_instances.workspace_id AND wm.use | authenticated: EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_instances.workspace_id AND wm.use |
| `openclaw_whatsapp_messages` | enabled | authenticated: EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_messages.workspace_id AND wm.user | authenticated: EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_messages.workspace_id AND wm.user | authenticated: EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_messages.workspace_id AND wm.user | — |
| `oracle_history` | enabled | authenticated: auth.uid() = user_id | authenticated: auth.uid() = user_id | — | authenticated: auth.uid() = user_id |
| `pentest_engagements` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `pentest_findings` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `permissions` | enabled | public: auth.role() = 'authenticated'<br>public: auth.role() = 'service_role'<br>authenticated: true | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' |
| `personal_data_inventory` | enabled | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() ) OR current_setting('request.jwt.cla<br>public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c | public: workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) OR c |
| `pg_net_smoke_runs` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_key = 'platform_admin' ) | — | — | — |
| `postmortem_action_items` | enabled | public: postmortem_id IN ( SELECT id FROM public.postmortems WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) )<br>public: EXISTS ( SELECT 1 FROM public.postmortems p WHERE p.id = postmortem_id AND (p.author_id = auth.uid() OR public.is_workspace_admin(au | public: EXISTS ( SELECT 1 FROM public.postmortems p WHERE p.id = postmortem_id AND (p.author_id = auth.uid() OR public.is_workspace_admin(au | public: EXISTS ( SELECT 1 FROM public.postmortems p WHERE p.id = postmortem_id AND (p.author_id = auth.uid() OR public.is_workspace_admin(au | public: EXISTS ( SELECT 1 FROM public.postmortems p WHERE p.id = postmortem_id AND (p.author_id = auth.uid() OR public.is_workspace_admin(au |
| `postmortems` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) AND author_id = auth.uid() | public: author_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id) | public: author_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id) |
| `prompt_ab_tests` | enabled | authenticated: agent_id IN (SELECT a.id FROM public.agents a WHERE a.user_id = auth.uid()) | authenticated: agent_id IN (SELECT a.id FROM public.agents a WHERE a.user_id = auth.uid()) | authenticated: agent_id IN (SELECT a.id FROM public.agents a WHERE a.user_id = auth.uid()) | authenticated: agent_id IN (SELECT a.id FROM public.agents a WHERE a.user_id = auth.uid()) |
| `prompt_experiment_runs` | enabled | authenticated: experiment_id IN ( SELECT id FROM public.prompt_experiments WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: experiment_id IN ( SELECT id FROM public.prompt_experiments WHERE workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | — | — |
| `prompt_experiments` | enabled | authenticated: workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) | authenticated: workspace_id IN (SELECT get_user_workspace_ids(auth.uid())) AND created_by = auth.uid() | authenticated: created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id) | authenticated: created_by = auth.uid() OR is_workspace_admin(auth.uid(), workspace_id) |
| `prompt_versions` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `queue_items` | enabled | public: workspace_id IS NULL OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())<br>public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true |
| `rate_limit_entries` | enabled | public: false | public: false | public: false | public: false |
| `rate_limit_logs` | enabled | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' |
| `replay_forks` | enabled | public: auth.uid() = user_id | public: auth.uid() = user_id | public: auth.uid() = user_id | public: auth.uid() = user_id |
| `restore_field_presets` | enabled | public: auth.uid() = user_id | public: auth.uid() = user_id | public: auth.uid() = user_id | public: auth.uid() = user_id |
| `retention_job_runs` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_key = 'platform_admin' ) | — | — | — |
| `risk_register` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) | — |
| `risk_review_events` | enabled | public: risk_id IN (SELECT id FROM public.risk_register WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))) | public: risk_id IN (SELECT id FROM public.risk_register WHERE public.is_workspace_admin(auth.uid(), workspace_id)) | — | — |
| `role_permissions` | enabled | public: auth.role() = 'authenticated'<br>public: auth.role() = 'service_role'<br>authenticated: true | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' |
| `roles` | enabled | public: auth.role() = 'authenticated'<br>public: auth.role() = 'service_role'<br>authenticated: is_active = true | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' | public: auth.role() = 'service_role' |
| `sbom_components` | enabled | public: snapshot_id IN (SELECT id FROM public.sbom_snapshots WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))) | public: snapshot_id IN (SELECT id FROM public.sbom_snapshots WHERE public.is_workspace_admin(auth.uid(), workspace_id)) | — | — |
| `sbom_snapshots` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: public.is_workspace_admin(auth.uid(), workspace_id) | — | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `secret_rotation_events` | enabled | public: secret_id IN ( SELECT id FROM public.managed_secrets WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) ) | public: rotated_by = auth.uid() AND secret_id IN ( SELECT id FROM public.managed_secrets WHERE public.is_workspace_admin(auth.uid(), workspa | — | — |
| `security_alerts` | enabled | public: workspace_id IN ( SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = (SELECT auth.uid()) ) | — | authenticated: public.is_workspace_admin(auth.uid(), security_alerts.workspace_id) | — |
| `security_events` | enabled | public: user_id = auth.uid() OR workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() )<br>public: auth.role() = 'service_role'<br>authenticated: workspace_id IS NOT NULL AND public.is_workspace_admin(auth.uid(), workspace_id)<br>service_role: true | public: auth.role() = 'service_role'<br>service_role: true | public: auth.role() = 'service_role'<br>service_role: true | public: auth.role() = 'service_role'<br>service_role: true |
| `session_traces` | enabled | authenticated: session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()) | authenticated: session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()) | authenticated: false | authenticated: false |
| `sessions` | enabled | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `skill_harvest_candidates` | enabled | authenticated: public.is_workspace_admin((SELECT auth.uid())) | authenticated: public.is_workspace_admin((SELECT auth.uid())) | authenticated: public.is_workspace_admin((SELECT auth.uid())) | authenticated: public.is_workspace_admin((SELECT auth.uid())) |
| `skill_harvest_checkpoints` | enabled | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() | authenticated: user_id = auth.uid() |
| `skill_harvest_runs` | enabled | authenticated: public.is_workspace_admin((SELECT auth.uid())) | — | — | — |
| `skill_marketplace_meta` | enabled | authenticated: true | authenticated: creator_id = auth.uid() | authenticated: creator_id = auth.uid() | authenticated: creator_id = auth.uid() |
| `skill_purchases` | enabled | authenticated: buyer_id = auth.uid() OR creator_id = auth.uid() | authenticated: buyer_id = auth.uid() | — | — |
| `skill_reclassification_reviews` | enabled | authenticated: true | authenticated: requested_by = (SELECT auth.uid()) AND status = 'pendente' AND reviewed_by IS NULL | authenticated: is_workspace_admin((SELECT auth.uid())) | — |
| `skill_registry` | enabled | public: TRUE | public: (workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) AND | public: (workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') ) AND<br>authenticated: is_public = true AND public.is_workspace_admin((SELECT auth.uid())) | public: (workspace_id IN ( SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role = 'owner' ) AND workspace_i |
| `skill_registry_safe` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `skill_reviews` | enabled | authenticated: true | authenticated: reviewer_id = auth.uid() | authenticated: reviewer_id = auth.uid() | authenticated: reviewer_id = auth.uid() |
| `slack_agent_notifications` | enabled | authenticated: public.is_workspace_admin(workspace_id)<br>service_role: true | authenticated: public.is_workspace_admin(workspace_id)<br>service_role: true | authenticated: public.is_workspace_admin(workspace_id)<br>service_role: true | authenticated: public.is_workspace_admin(workspace_id)<br>service_role: true |
| `slack_bot_bindings` | enabled | authenticated: public.is_workspace_admin(workspace_id)<br>service_role: true | authenticated: public.is_workspace_admin(workspace_id)<br>service_role: true | authenticated: public.is_workspace_admin(workspace_id)<br>service_role: true | authenticated: public.is_workspace_admin(workspace_id)<br>service_role: true |
| `slack_channel_routes` | enabled | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) |
| `slack_dispatch_dlq` | enabled | authenticated: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())<br>service_role: true | service_role: true | service_role: true | service_role: true |
| `slack_dispatch_health` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `slack_dlq_stats` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `slack_event_dedupe` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_key IN ('admin', 'owner') )<br>service_role: true | service_role: true | service_role: true | service_role: true |
| `slack_rag_sources` | enabled | authenticated: public.is_workspace_admin(workspace_id)<br>service_role: true | authenticated: public.is_workspace_admin(workspace_id)<br>service_role: true | authenticated: public.is_workspace_admin(workspace_id)<br>service_role: true | authenticated: public.is_workspace_admin(workspace_id)<br>service_role: true |
| `slack_user_cache` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_key IN ('admin', 'owner') )<br>service_role: true | service_role: true | service_role: true | service_role: true |
| `slack_workspace_config` | enabled | authenticated: public.is_workspace_admin(auth.uid(), workspace_id)<br>authenticated: EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = slack_workspace_config.workspace_id AND wm.user_id | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) | authenticated: public.is_workspace_admin(auth.uid(), workspace_id) |
| `spans` | enabled | service_role: true | service_role: true | service_role: true | service_role: true |
| `spans_2026_04` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2026_05` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2026_06` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2026_07` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2026_08` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2026_09` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2026_10` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2026_11` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2026_12` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2027_01` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2027_02` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2027_03` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2027_04` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2027_05` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2027_06` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `spans_2027_07` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `synthetic_checks` | enabled | public: workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) | public: public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid() | public: public.is_workspace_admin(auth.uid(), workspace_id) | public: public.is_workspace_admin(auth.uid(), workspace_id) |
| `synthetic_results` | enabled | public: check_id IN ( SELECT id FROM public.synthetic_checks WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) ) | — | — | — |
| `task_queues` | enabled | public: workspace_id IS NULL OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())<br>public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true | public: workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))<br>public: current_setting('request.jwt.claim.role', true) = 'service_role'<br>service_role: true |
| `template_skill_links` | enabled | authenticated: true<br>authenticated: public.is_workspace_admin((SELECT auth.uid())) | authenticated: public.is_workspace_admin((SELECT auth.uid())) | authenticated: public.is_workspace_admin((SELECT auth.uid())) | authenticated: public.is_workspace_admin((SELECT auth.uid())) |
| `test_cases` | enabled | authenticated: dataset_id IN (SELECT ed.id FROM evaluation_datasets ed WHERE ed.workspace_id IN (SELECT public.get_user_workspace_ids(auth.u | authenticated: dataset_id IN (SELECT ed.id FROM evaluation_datasets ed WHERE ed.workspace_id IN (SELECT public.get_user_workspace_ids(auth.u | authenticated: dataset_id IN (SELECT ed.id FROM evaluation_datasets ed WHERE ed.workspace_id IN (SELECT public.get_user_workspace_ids(auth.u | authenticated: dataset_id IN (SELECT ed.id FROM evaluation_datasets ed WHERE ed.workspace_id IN (SELECT public.get_user_workspace_ids(auth.u |
| `tool_integrations` | enabled | authenticated: workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid()) | authenticated: workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid()) | authenticated: workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid()) | authenticated: workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid()) |
| `tool_policies` | enabled | authenticated: agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) | authenticated: agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) | authenticated: agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) | authenticated: agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) |
| `trace_events` | enabled | authenticated: session_trace_id IN ( SELECT st.id FROM session_traces st JOIN sessions s ON st.session_id = s.id WHERE s.user_id = auth.uid( | authenticated: session_trace_id IN ( SELECT st.id FROM session_traces st JOIN sessions s ON st.session_id = s.id WHERE s.user_id = auth.uid( | authenticated: false | authenticated: false |
| `trace_events_v2` | enabled | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) |
| `trace_events_v2_2026_04` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `trace_events_v2_2026_05` | não encontrado | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) |
| `trace_events_v2_2026_06` | não encontrado | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) | authenticated: public.is_workspace_admin((SELECT auth.uid()), workspace_id) |
| `trace_events_v2_2026_07` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `trace_events_v2_2026_08` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `trace_events_v2_2026_09` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `trace_events_v2_2026_10` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `trace_events_v2_2026_11` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `trace_events_v2_2026_12` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `trace_events_v2_2027_01` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `trace_events_v2_2027_02` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `trace_events_v2_2027_03` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `trace_events_v2_2027_04` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `trace_events_v2_2027_05` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `trace_events_v2_2027_06` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `trace_events_v2_2027_07` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces` | enabled | service_role: true | service_role: true | service_role: true | service_role: true |
| `traces_2026_04` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2026_05` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2026_06` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2026_07` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2026_08` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2026_09` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2026_10` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2026_11` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2026_12` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2027_01` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2027_02` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2027_03` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2027_04` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2027_05` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2027_06` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `traces_2027_07` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| … +31 linhas — lista completa em `context.json` | | | | | |

> `—` com RLS ligado = ninguém além de service_role. `sem RLS` = qualquer chave anon lê/escreve tudo.

## Onde o RLS é IGNORADO (service_role) — 171 arquivo(s)

- `e2e/auth-flows.spec.ts`
- `e2e/helpers/auth-fixtures.ts`
- `scripts/ai-context/cenarios.mjs`
- `scripts/ai-context/gerar.unit.mjs`
- `scripts/ci/check-bundle-secrets.mjs`
- `scripts/ci/check-bundle-secrets.unit.mjs`
- `scripts/ci/check-pr-workflow-secrets.unit.mjs`
- `scripts/edge-validation/test-exaustivo.cjs`
- `scripts/inventario/gerar-banco.mjs`
- `scripts/regras_negocio/generate.py`
- `scripts/supabase_snapshot/snapshot.py`
- `src/components/crm/CadenceRunsPanel.tsx`
- `src/components/security/RedTeamingPanel.tsx`
- `src/pages/DeploymentsPage.tsx`
- `src/pages/PartitioningDocsPage.tsx`
- `src/services/crmCadenceService.ts`
- `src/services/presets/connectorPresets.ts`
- `src/services/presets/credentialPresets.ts`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/breakerEvents.ts`
- `supabase/functions/_shared/otel.ts`
- `supabase/functions/_shared/requireEnv.ts`
- `supabase/functions/_shared/runtimeAlerts.ts`
- `supabase/functions/a2a-server/index.ts`
- `supabase/functions/agent-eval-runner/index.ts`
- `supabase/functions/agent-workflow-runner/index.ts`
- `supabase/functions/automation-pipeline/index.ts`
- `supabase/functions/bitrix24-oauth/index.ts`
- `supabase/functions/bitrix24-webhook/index.ts`
- `supabase/functions/computer-use-execute/index.ts`
- `supabase/functions/crm-cadence-runner/index.ts`
- `supabase/functions/cron-executor/index.ts`
- `supabase/functions/datahub-mcp-server/index.ts`
- `supabase/functions/doc-parse/index.ts`
- `supabase/functions/doc-rechunk/index.ts`
- `supabase/functions/dr-orchestrator/index.ts`
- `supabase/functions/graph-execute/index.ts`
- `supabase/functions/health-check/index.ts`
- `supabase/functions/incident-orchestrator/index.ts`
- `supabase/functions/kb-analyze-gaps/index.ts`
- `supabase/functions/kb-translate-article/index.ts`
- `supabase/functions/migrate-helper/index.ts`
- `supabase/functions/notebook-podcast-generate/index.ts`
- `supabase/functions/notification-sender/index.ts`
- `supabase/functions/openclaw-proxy/index.ts`
- `supabase/functions/openclaw-webhook/index.ts`
- `supabase/functions/pg-net-smoke-test/index.ts`
- `supabase/functions/queue-worker/index.ts`
- `supabase/functions/rag-embed-backfill/index.ts`
- `supabase/functions/sbom-scanner/index.ts`
- `supabase/functions/semantic-search/index.ts`
- `supabase/functions/slack-agent-notify/index.ts`
- `supabase/functions/slack-alert-dispatcher/index.ts`
- `supabase/functions/slack-dlq-discard/index.ts`
- `supabase/functions/slack-dlq-retry/index.ts`
- `supabase/functions/slack-events-webhook/index.ts`
- `supabase/functions/slack-rag-sync/index.ts`
- `supabase/functions/slack-verify-connection/index.ts`
- `supabase/functions/synthetic-runner/index.ts`
- `supabase/functions/validate-access/index.ts`
- `supabase/functions/visual-search/index.ts`
- `supabase/functions/whatsapp-router/index.ts`
- `supabase/migrations/20260405000001_shared_security_infrastructure.sql`
- `supabase/migrations/20260405000002_rbac_system.sql`
- `supabase/migrations/20260405000003_mcp_servers.sql`
- `supabase/migrations/20260408140000_bitrix24_webhook_routing.sql`
- `supabase/migrations/20260408190000_whatsapp_webhook.sql`
- `supabase/migrations/20260410000001_rate_limiter_distributed.sql`
- `supabase/migrations/20260418164947_0a3769f3-2b54-4782-9f30-2ca4646a5239.sql`
- `supabase/migrations/20260513164034_c690469d-9095-4dbe-b955-e8bcfee5f937.sql`
- `supabase/migrations/20260513165454_9d5a2fb7-f08e-4868-8bac-0b06f3cdabb6.sql`
- `supabase/migrations/20260513175210_4dba7ebe-924a-4906-af1c-31e94145799f.sql`
- `supabase/migrations/20260521103753_556d7413-1276-4089-9e14-0a2f061c5db4.sql`
- `supabase/migrations/20260522143208_f7b4c2a0-e49e-48da-acd8-eb1b5d001644.sql`
- `supabase/migrations/20260522143525_2c446b25-142e-417c-94c2-0e5d6b2d5cde.sql`
- `supabase/migrations/20260522144648_0b86a9ec-1889-46f2-9f5d-2dee96ae4bd1.sql`
- `supabase/migrations/20260711144656_374ce40c-5f54-4b86-8568-64aaaf7153b0.sql`
- `supabase/migrations/20260711144725_90c1a7a9-3211-470b-a67f-0dadeaddb78c.sql`
- `supabase/migrations/20260711145341_79d9091c-8cdd-400d-9a95-7be037c213ef.sql`
- `supabase/migrations/20260711150135_879e4b00-5f30-4969-8123-c7caf4aa1e0c.sql`
- `supabase/migrations/20260711150234_07411bfc-c242-43d2-8ee4-30ffdcfed949.sql`
- `supabase/migrations/20260711150423_bba9de7c-1db3-4f2d-b5b6-0d350a14cd37.sql`
- `supabase/migrations/20260711164855_cc5be0d0-5efc-49e7-af14-ebd6028eb3fc.sql`
- `supabase/migrations/20260711184857_ce70aa1d-6251-4af5-875c-aab67f442443.sql`
- `supabase/migrations/20260711184926_992578aa-e1ad-4639-9a11-c5569d30fdf3.sql`
- `supabase/migrations/20260711192438_0faffc45-e93e-4815-aa19-74e1ca834c37.sql`
- `supabase/migrations/20260711192512_df9581f3-1f61-47a0-bafc-96d3d92ecce7.sql`
- `supabase/migrations/20260711192756_81a71657-35d7-4b95-886e-5418c4366995.sql`
- `supabase/migrations/20260711194332_93dff7c1-e608-4558-a9d6-24098805ab3d.sql`
- `supabase/migrations/20260712141949_f64f8ab6-c2f6-4d98-9414-3c8b9331391b.sql`
- `supabase/migrations/20260712191012_84f3d98a-3d54-4105-b07d-9349dfc5db75.sql`
- `supabase/migrations/20260712193727_3a4791ee-1993-4abe-b679-efc5b53ddeec.sql`
- `supabase/migrations/20260712215454_215504ed-3c90-49f7-b332-c9a488eea328.sql`
- `supabase/migrations/20260712215541_15f87dd8-a016-46ab-99d8-3a3ed0f1366f.sql`
- `supabase/migrations/20260712215757_02b0abab-e352-4913-b01d-2629a12c7830.sql`
- `supabase/migrations/20260712220719_3fc26932-b5a6-4238-964a-fec84c988444.sql`
- `supabase/migrations/20260715170916_05e45a63-91e1-472b-b9b5-ccd2a54bc07d.sql`
- `supabase/migrations/20260715191943_0597223c-3835-4889-962d-57b2000ba799.sql`
- `supabase/migrations/20260715192007_6de65516-3323-41d0-a3cd-94b61eb410df.sql`
- `supabase/migrations/20260721152709_0b330984-4df3-452b-adb7-4d4d0939c4f3.sql`
- `supabase/migrations/20260721153331_c664fb87-ea39-4e7d-8418-c12f589310b1.sql`
- `supabase/migrations/20260721155600_72a5ec4e-2f3f-4e6c-920c-6ca21ac9fa07.sql`
- `supabase/migrations/20260721213027_70f2f2d9-a70d-4da3-afd3-98ec46e6ff42.sql`
- `supabase/migrations/20260721213127_53766854-97f1-496a-942a-6b5bf7b24bb4.sql`
- `supabase/migrations/20260721220135_0c6243be-09d6-47fd-be24-cba4593b01bb.sql`
- `supabase/migrations/20260721222207_805461ec-21b9-4894-a6cc-5ece6840cc86.sql`
- `supabase/migrations/20260721223723_5262716d-cec0-444c-ad4d-7d7145225dcf.sql`
- `supabase/migrations/20260722103351_04ebb899-02c6-4d6a-a36b-7118cf4086b9.sql`
- `supabase/migrations/20260722103425_58aa6fef-995e-462f-976c-f76cd87a66db.sql`
- `supabase/migrations/20260722103557_a4f50e34-0a11-40f2-aa92-cebdda233755.sql`
- `supabase/migrations/20260722104416_e449829d-bc41-4967-bb97-6fdf0dcecaea.sql`
- `supabase/migrations/20260722104539_1475b2eb-9d87-4cac-9e26-b2349cdf27bb.sql`
- `supabase/migrations/20260722104652_8ed83857-9861-4cb5-a3cd-8cba9d7bf225.sql`
- `supabase/migrations/20260722104800_d33ba9a5-6ed0-4f25-9920-08b29897a9b6.sql`
- `supabase/migrations/20260722111023_29402337-9431-4982-b960-8853ae788102.sql`
- `supabase/migrations/20260722112903_e4950969-c93b-49eb-bec1-8637aa5b7e08.sql`
- `supabase/migrations/20260722115006_467c9efd-0632-4b3a-933a-eaf90b2302c2.sql`
- `supabase/migrations/20260722115028_8ea67fdb-403c-4469-a397-e14b5f811936.sql`
- `supabase/migrations/20260722115149_be884e60-7f6c-4a27-ae07-ddf3f70078c6.sql`
- `supabase/migrations/20260722115838_d10e0c3c-df31-41b8-a262-bb067a5a43d7.sql`
- `supabase/migrations/20260722145902_bffbbc2f-7da7-4f0e-b6a8-be6145c81fd8.sql`
- `supabase/migrations/20260722155416_27f52f22-f229-45f3-bb70-630ae935d1d7.sql`
- `supabase/migrations/20260722161523_1aa7a3ec-d763-42fe-958a-65dc737be6a8.sql`
- `supabase/migrations/20260722170122_d38205c2-13c9-4c18-a88c-52b66ef4bfe6.sql`
- `supabase/migrations/20260722171121_e5daea0c-20f0-475f-afaa-394b1e9ee631.sql`
- `supabase/migrations/20260722172758_0f44574f-5ee8-4622-84a0-5c5f7922f6c7.sql`
- `supabase/migrations/20260722190324_17cc00ed-c284-4250-a4bc-e87b33e6200b.sql`
- `supabase/migrations/20260722201721_cf84116e-cd8b-4460-a9c4-36f103a6a88f.sql`
- `supabase/migrations/20260723104301_1b5a5372-2487-4507-a5b6-544025ae034c.sql`
- `supabase/migrations/20260723104817_9ba6b690-fa25-44d3-8f4a-24108745d00c.sql`
- `supabase/migrations/20260723135619_e87e00a6-623a-4424-bc8f-30f5353da58d.sql`
- `supabase/migrations/20260723135724_d78bc28b-1ad8-490e-ae93-98d93a70c8e1.sql`
- `supabase/migrations/20260723135811_8eb4b830-a4a2-4163-9285-445fd0288e1f.sql`
- `supabase/migrations/20260723141945_e08ee79f-579b-41be-97fc-484b2566f265.sql`
- `supabase/migrations/20260723152443_d19bbd30-ca0d-47d0-be15-b91d873dcb3a.sql`
- `supabase/migrations/20260724000001_search_path_security_definer.sql`
- `supabase/migrations/20260724000002_rls_credential_vault.sql`
- `supabase/migrations/20260724000003_rls_automation_workspace_scoped.sql`
- `supabase/migrations/20260724000004_rls_agent_skills.sql`
- `supabase/migrations/20260724000005_rls_knowledge_graph.sql`
- `supabase/migrations/20260724000006_rls_forum_workspace.sql`
- `supabase/migrations/20260724000009_audit_log_append_only.sql`
- `supabase/migrations/20260724000010_lgpd_required_tables.sql`
- `supabase/migrations/20260724000011_auth_attempts_hardening.sql`
- `supabase/migrations/20260726161137_21809199-94e6-4a51-ad42-1a224926b6db.sql`
- `supabase/migrations/20260726195702_c67b4a61-2895-4b1f-a3ab-2b98291792e3.sql`
- `supabase/migrations/20260726200653_b8a5612b-6c59-4e82-b726-a0be5aee81dc.sql`
- `supabase/migrations/20260726201930_d21d3920-77d2-411e-8f05-a64f62ecc59e.sql`
- `supabase/migrations/20260726202014_612509e6-18c1-4b63-9f38-70c79cd5916b.sql`
- `supabase/migrations/20260726203035_dc665ad4-1157-455f-888a-8ef823a15569.sql`
- … +21 (lista completa em `context.json`)

## Funções SQL `SECURITY DEFINER` (rodam com privilégio do dono, ignoram RLS)

- `accept_workspace_invitation`
- `acknowledge_cost_alert`
- `acknowledge_vulnerability`
- `activate_ir_playbook`
- `apply_skill_description`
- `assess_vendor`
- `assign_variant`
- `audit_asset`
- `audit_trigger_fn`
- `auto_assign_admin_role`
- `capture_db_health_sample`
- `capture_perf_snapshot`
- `check_auth_security`
- `check_bloat_and_alert`
- `check_budget`
- `check_budget_alert`
- `check_partition_health`
- `check_rate_limit`
- `check_retention_job_health`
- `claim_due_cadence_enrollments`
- `cleanup_auth_attempts`
- `cleanup_orphan_sessions`
- `cleanup_rate_limit_entries`
- `cleanup_slack_ephemeral`
- `close_risk`
- `collections_fill_workspace`
- `complete_dr_drill`
- `complete_game_day`
- `compute_cost_baselines`
- `compute_experiment_stats`
- `create_api_key_bcrypt`
- `create_incident_run`
- `create_partition_if_not_exists`
- `create_pentest_engagement`
- `create_sbom_snapshot`
- `decide_change`
- `decide_skill_reclassification`
- `decommission_asset`
- `detect_cost_anomalies`
- `detect_health_trend_and_alert`
- `detect_perf_regressions`
- `detect_slo_breach_and_alert`
- `detect_slow_queries_and_alert`
- `disable_all_chaos`
- `dispatch_security_alert_to_slack`
- `drop_old_partitions`
- `encrypt_secret_value`
- `enforce_budget`
- `enforce_freeze_window`
- `ensure_monthly_partitions`
- `execute_change`
- `explain_query_plan`
- `forum_update_thread_stats`
- `generate_compliance_report`
- `generate_postmortem_from_gameday`
- `generate_postmortem_from_incident`
- `get_active_chaos_faults`
- `get_asset_summary`
- `get_bcp_summary`
- `get_change_summary`
- `get_creator_earnings`
- `get_cron_job_health`
- `get_current_oncall`
- `get_current_spend`
- `get_db_health_snapshot`
- `get_db_health_timeseries`
- `get_db_rollback_rate`
- `get_detector_slo_status`
- `get_embedding_coverage`
- `get_ir_summary`
- `get_knowledge_graph_health`
- `get_masked_secrets`
- `get_my_2fa_status`
- `get_oncall_with_contacts`
- `get_partition_health_snapshot`
- `get_pending_invites_for_email`
- `get_pentest_summary`
- `get_risk_summary`
- `get_rollback_rate_per_min`
- `get_secrets_status_summary`
- `get_slo_summary`
- `get_slow_query_alerts_history`
- `get_synthetic_summary`
- `get_user_workspace_ids`
- `get_vendor_summary`
- `get_wal_generation_rate`
- `get_workspace_members_full`
- `handle_asset_audit`
- `handle_bcp_test_run`
- `handle_ir_tabletop`
- `handle_new_user`
- `handle_risk_review_event`
- `handle_secret_rotation_event`
- `handle_vendor_assessment`
- `hash_api_key_bcrypt`
- `hybrid_memory_search`
- `hybrid_memory_search_notebook`
- `increment_skill_installs`
- `increment_webhook_counter`
- `insert_audit_log`
- `invite_workspace_member`
- `is_mfa_valid_for_role`
- `is_user_locked_out`
- `is_workspace_admin`
- `kb_article_create_version`
- `lgpd_apply_retention_policies`
- `lgpd_check_sar_deadlines`
- `lgpd_send_review_reminders`
- `log_audit_entry`
- `log_ingestion_event`
- `make_audit_log_immutable`
- `mark_secret_retired`
- `mark_vulnerability_fixed`
- `memory_relevance`
- `offboard_vendor`
- `pg_net_schema`
- `pg_net_smoke_post`
- `pg_net_smoke_response`
- `promote_experiment_winner`
- `prune_db_health_samples`
- `prune_perf_snapshots`
- `prune_traces_retention`
- `prune_wal_snapshots`
- `publish_compliance_report`
- `publish_postmortem`
- `purchase_skill`
- `purge_crm_cadence_runs`
- `purge_removed_template_skill_links`
- `purge_stale_harvest_checkpoints`
- `purge_telemetry`
- `recalc_skill_rating`
- `recompute_memory_tier`
- `record_auth_attempt`
- `record_bcp_test`
- `record_dr_step`
- `record_game_day_event`
- `record_pentest_finding`
- `record_secret_rotation`
- `record_vulnerability`
- `refresh_agent_daily_metrics`
- `refresh_knowledge_graph_health`
- `refresh_secrets_status`
- `register_asset`
- `register_business_system`
- `register_managed_secret`
- `register_risk`
- `register_vendor`
- `reset_embedding_dead_letter`
- `reset_workspace_budget`
- `review_risk`
- `rollback_change`
- `rotate_cron_token`
- `run_pg_net_smoke_test`
- `run_prune_traces_retention_monitored`
- `run_purge_template_skill_links_monitored`
- `sample_rollback_stats`
- `sample_wal_stats`
- `set_perf_baseline`
- `slack_cleanup_dedupe`
- `smoke_test_connections_saturation`
- `smoke_test_health_alerts`
- `smoke_test_wal_growth`
- `snapshot_note_version`
- `start_dr_drill`
- `start_game_day`
- `submit_change_request`
- `template_skill_links_set_actor`
- `test_partition_automation`
- `touch_memory`
- `trg_openclaw_whatsapp_autoreply`
- `update_budget_on_usage`
- `update_incident_run`
- `update_pentest_finding_status`
- `user_has_permission`
- `validate_oncall_workspace_consistency`
- `validate_table_names_for_drill`
- `verify_api_key`
- `verify_api_key_bcrypt`
- `verify_cron_token`

## Edge functions públicas (sem JWT — qualquer um chama)

- `openclaw-webhook`
- `whatsapp-router`
- `rag-embed-backfill`
- `slack-events-webhook`
- `migrate-helper`
- `widget-proxy`

## Rotas protegidas no front

| Rota | Guard | Roles | Arquivo |
|---|---|---|---|
| /admin | ProtectedRoute |  | `src/App.tsx` |
| /app | ProtectedRoute |  | `scripts/ai-context/gerar.unit.mjs` |
| /approvals | ProtectedRoute |  | `src/App.tsx` |
| /billing | ProtectedRoute |  | `src/App.tsx` |
| /compliance-frameworks | ProtectedRoute |  | `src/App.tsx` |
| /compliance-reports | ProtectedRoute |  | `src/App.tsx` |
| /disaster-recovery | ProtectedRoute |  | `src/App.tsx` |
| /federated-learning | ProtectedRoute |  | `src/App.tsx` |
| /governance/freeze-windows | ProtectedRoute |  | `src/App.tsx` |
| /lgpd | ProtectedRoute |  | `src/App.tsx` |
| /multi-tenancy | ProtectedRoute |  | `src/App.tsx` |
| /observability/chaos | ProtectedRoute |  | `src/App.tsx` |
| /observability/dr-drills | ProtectedRoute |  | `src/App.tsx` |
| /rbac/permissions | ProtectedRoute |  | `src/App.tsx` |
| /rbac/roles | ProtectedRoute |  | `src/App.tsx` |
| /rbac/roles/:roleKey | ProtectedRoute |  | `src/App.tsx` |
| /residency | ProtectedRoute |  | `src/App.tsx` |
| /security | ProtectedRoute |  | `src/App.tsx` |
| /security/assets | ProtectedRoute |  | `src/App.tsx` |
| /security/bcp | ProtectedRoute |  | `src/App.tsx` |
| /security/bcp-tests | ProtectedRoute |  | `src/App.tsx` |
| /security/changes | ProtectedRoute |  | `src/App.tsx` |
| /security/forensic-snapshots | ProtectedRoute |  | `src/App.tsx` |
| /security/ip-whitelist | ProtectedRoute |  | `src/App.tsx` |
| /security/ir | ProtectedRoute |  | `src/App.tsx` |
| /security/pentest-findings | ProtectedRoute |  | `src/App.tsx` |
| /security/pentests | ProtectedRoute |  | `src/App.tsx` |
| /security/performance | ProtectedRoute |  | `src/App.tsx` |
| /security/risks | ProtectedRoute |  | `src/App.tsx` |
| /security/sbom | ProtectedRoute |  | `src/App.tsx` |
| /security/secrets-rotation | ProtectedRoute |  | `src/App.tsx` |
| /security/vendors | ProtectedRoute |  | `src/App.tsx` |
| /security/vulnerabilities | ProtectedRoute |  | `src/App.tsx` |
| /settings | ProtectedRoute |  | `src/App.tsx` |
| /settings | ProtectedRoute |  | `src/components/rbac/ProtectedRoute.tsx` |
| /settings/budget | ProtectedRoute |  | `src/App.tsx` |
| /settings/slack | ProtectedRoute |  | `src/App.tsx` |
| /skills/harvest | ProtectedRoute |  | `src/App.tsx` |
| /sso | ProtectedRoute |  | `src/App.tsx` |
| /team | ProtectedRoute |  | `src/App.tsx` |

Guards usados: Protected, ProtectedRoute

Middleware matcher (Next.js): nenhum

## Grants / Revokes (agrupados por role e privilégio)

| Ação | Para/De | Privilégios | Objetos |
|---|---|---|---|
| grant | anon, authenticated | select | `forum_threads_public`, `forum_posts_public`, `forum_threads_public`, `forum_posts_public` |
| grant | anon, authenticated, service_role | execute | `check_rate_limit`, `is_user_locked_out`, `check_rate_limit` |
| grant | authenticated | execute | `get_user_workspace_ids`, `get_slo_summary`, `get_workspace_members_full`, `get_oncall_with_contacts`, `get_my_2fa_status`, `get_pending_invites_for_email`, `invite_workspace_member`, `get_wal_generation_rate`, `get_cron_job_health`, `get_embedding_coverage`, `get_embedding_coverage`, `reset_embedding_dead_letter`, `get_db_health_snapshot`, `get_db_health_snapshot`, `get_db_health_snapshot` … +8 |
| grant | authenticated | select | `audit_log_safe`, `audit_log_safe`, `workspace_members_safe`, `workspace_members_directory`, `workspace_members_safe`, `workspace_members_safe`, `workspace_members_safe`, `slo_metrics_hourly`, `slo_metrics_hourly`, `workspace_members_safe`, `workspace_members_safe`, `oncall_schedule_safe`, `workspace_members_safe`, `workspace_members_directory`, `oncall_schedule_safe` … +26 |
| grant | authenticated | select, insert, update | `citation_telemetry`, `skill_reclassification_reviews` |
| grant | authenticated | select, insert, update, delete | `user_research_configs`, `mcp_servers`, `openclaw_deployments`, `openclaw_whatsapp_instances`, `openclaw_whatsapp_messages`, `slack_workspace_config`, `slack_channel_routes`, `slack_agent_notifications`, `slack_rag_sources`, `slack_bot_bindings`, `document_ingestions`, `collections`, `notebook_notes`, `knowledge_links`, `notebook_podcasts` … +18 |
| grant | authenticated, anon | select | `forum_threads_safe`, `forum_posts_safe` |
| grant | authenticated, service_role | execute | `is_user_locked_out`, `is_mfa_valid_for_role`, `increment_webhook_counter`, `get_db_rollback_rate`, `get_rollback_rate_per_min`, `get_slo_summary`, `get_slo_summary`, `memory_relevance`, `touch_memory`, `get_knowledge_graph_health`, `hybrid_memory_search`, `hybrid_memory_search`, `is_workspace_admin`, `touch_memory`, `get_slow_query_alerts_history` … +12 |
| grant | authenticated, service_role | select | `agent_daily_metrics`, `agent_daily_metrics` |
| grant | postgres | execute | `_fase8_snapshot_as` |
| grant | postgres, service_role | execute | `handle_new_user` |
| grant | service_role | all | `retention_job_runs`, `pg_net_smoke_runs`, `user_research_configs`, `mcp_servers`, `openclaw_deployments`, `openclaw_whatsapp_instances`, `openclaw_whatsapp_messages`, `openclaw_events`, `openclaw_agent_templates`, `slack_workspace_config`, `slack_channel_routes`, `slack_event_dedupe`, `slack_user_cache`, `slack_agent_notifications`, `slack_rag_sources` … +50 |
| grant | service_role | execute | `cleanup_rate_limit_entries`, `increment_webhook_counter`, `prune_traces_retention`, `prune_traces_retention`, `run_prune_traces_retention_monitored`, `check_retention_job_health`, `pg_net_schema`, `pg_net_smoke_post`, `pg_net_smoke_response`, `pg_net_smoke_post`, `pg_net_smoke_response`, `run_pg_net_smoke_test`, `refresh_agent_daily_metrics`, `refresh_agent_daily_metrics`, `internal.ensure_monthly_partitions` … +52 |
| grant | service_role | select | `agent_daily_metrics`, `internal.agent_daily_metrics`, `llm_cost_by_caller`, `knowledge_graph_health` |
| grant | service_role | update, delete | `audit_log` |
| grant | supabase_admin | execute | `public` |
| revoke | PUBLIC | all | `prune_traces_retention`, `pg_net_schema`, `pg_net_smoke_post`, `pg_net_smoke_response`, `internal.check_partition_health`, `get_db_rollback_rate`, `knowledge_graph_health`, `hybrid_memory_search`, `get_embedding_coverage`, `get_embedding_coverage`, `reset_embedding_dead_letter`, `claim_due_cadence_enrollments`, `internal.cron_tokens`, `decide_skill_reclassification`, `apply_skill_description` … +1 |
| revoke | PUBLIC | execute | `get_user_workspace_ids`, `is_user_locked_out`, `is_mfa_valid_for_role`, `validate_oncall_workspace_consistency`, `memory_relevance`, `touch_memory`, `get_knowledge_graph_health`, `hybrid_memory_search`, `get_user_workspace_ids`, `is_workspace_admin` |
| revoke | PUBLIC, anon | all | `get_slo_summary`, `get_slo_summary`, `get_db_health_snapshot`, `get_db_health_snapshot`, `get_db_health_timeseries`, `get_detector_slo_status`, `get_partition_health_snapshot`, `match_documents`, `get_chunk_embedding_coverage` |
| revoke | PUBLIC, anon | execute | `get_db_health_snapshot`, `get_slow_query_alerts_history`, `get_db_health_snapshot`, `get_vendor_summary`, `get_asset_summary`, `get_bcp_summary`, `get_change_summary`, `get_ir_summary`, `get_secrets_status_summary`, `get_user_workspace_ids`, `is_workspace_admin`, `is_workspace_admin` |
| revoke | PUBLIC, anon, authenticated | all | `run_prune_traces_retention_monitored`, `check_retention_job_health`, `internal.check_partition_health`, `trg_openclaw_whatsapp_autoreply`, `knowledge_graph_health`, `internal.cleanup_slack_ephemeral`, `_fase8_snapshot_as`, `internal.db_health_samples`, `internal.capture_db_health_sample`, `internal.prune_db_health_samples`, `internal.detect_health_trend_and_alert`, `internal.smoke_test_health_alerts`, `internal.smoke_test_wal_growth`, `internal.smoke_test_connections_saturation`, `internal.detector_slo_state` … +6 |
| revoke | PUBLIC, anon, authenticated | execute | `prune_traces_retention`, `pg_net_smoke_post`, `pg_net_smoke_response`, `run_pg_net_smoke_test`, `get_cron_job_health`, `get_db_rollback_rate`, `get_rollback_rate_per_min`, `get_wal_generation_rate`, `internal.test_partition_automation`, `detect_slow_queries_and_alert`, `internal.detect_slo_breach_and_alert`, `collections_fill_workspace`, `explain_query_plan`, `log_ingestion_event`, `snapshot_note_version` … +16 |
| revoke | PUBLIC, authenticated | execute | `recompute_memory_tier`, `refresh_knowledge_graph_health` |
| revoke | PUBLIC, authenticated, anon | execute | `internal.slack_cleanup_dedupe` |
| revoke | anon | all | `get_slow_query_alerts_history`, `explain_query_plan`, `claim_due_cadence_enrollments`, `get_partition_health_snapshot`, `get_cron_job_health`, `get_wal_generation_rate`, `chat_threads`, `chat_messages` |
| revoke | anon | execute | `validate_oncall_workspace_consistency`, `public` |
| revoke | anon | insert, update, delete | `compliance_frameworks` |
| revoke | anon | insert, update, delete, truncate | `rate_limit_entries` |
| revoke | anon, PUBLIC | execute | `get_embedding_coverage`, `get_knowledge_graph_health`, `hybrid_memory_search`, `hybrid_memory_search`, `reset_embedding_dead_letter`, `touch_memory`, `memory_relevance`, `is_workspace_admin`, `touch_memory` |
| revoke | anon, authenticated, PUBLIC | execute | `recompute_memory_tier`, `refresh_knowledge_graph_health` |
| revoke | authenticated | all | `claim_due_cadence_enrollments` |
| revoke | authenticated | execute | `validate_oncall_workspace_consistency` |
| revoke | authenticated | insert, update, delete | `compliance_frameworks` |
| revoke | authenticated | update, delete | `audit_log` |
| revoke | authenticated, anon | all | `traces`, `spans` |
| revoke | public | all | `refresh_agent_daily_metrics`, `internal.capture_perf_snapshot`, `internal.set_perf_baseline`, `internal.detect_perf_regressions` |
| revoke | public, anon | all | `get_cron_job_health` |
| revoke | public, anon, authenticated | all | `refresh_agent_daily_metrics`, `internal.ensure_monthly_partitions`, `internal.ensure_monthly_partitions`, `internal.drop_old_partitions`, `internal.cleanup_orphan_sessions`, `internal.purge_telemetry`, `internal.check_bloat_and_alert`, `internal.dispatch_security_alert_to_slack`, `internal.prune_perf_snapshots`, `internal.prune_wal_snapshots`, `internal.sample_rollback_stats`, `internal.sample_wal_stats`, `internal.purge_telemetry` |
| revoke | public, anon, authenticated | execute | `create_partition_if_not_exists`, `cleanup_old_auth_attempts`, `increment_webhook_counter` |

## Riscos de acesso detectados

| Tabela | Problema | Arquivos |
|---|---|---|
| `agent_daily_metrics` | acessada do front (1 arquivo(s)) sem RLS (não encontrado) | `src/services/agentDailyMetricsService.ts` |
| `agent_usage` | acessada do front (4 arquivo(s)) sem RLS (não encontrado) | `src/services/agentsService.ts`<br>`src/services/billingService.ts`<br>`src/services/dashboardService.ts`<br>`src/services/skillbookAuditService.ts` |
| `agents` | acessada do front (26 arquivo(s)) sem RLS (não encontrado) | `src/components/agent-builder/HandoffPanel.tsx`<br>`src/components/agents/VersionDiffDialog.tsx`<br>`src/components/agents/wizard/QuickCreateWizard.tsx`<br>`src/components/billing/CostOptimizationPanel.tsx`<br>… +22 |
| `compliance_controls` | front faz INSERT mas nenhuma política RLS permite INSERT → vai falhar/retornar vazio para usuários | `src/pages/ComplianceFrameworksPage.tsx` |
| `compliance_controls` | front faz DELETE mas nenhuma política RLS permite DELETE → vai falhar/retornar vazio para usuários | `src/pages/ComplianceFrameworksPage.tsx` |
| `compliance_frameworks` | front faz INSERT mas nenhuma política RLS permite INSERT → vai falhar/retornar vazio para usuários | `src/pages/ComplianceFrameworksPage.tsx` |
| `forensic_snapshots` | acessada do front (2 arquivo(s)) sem RLS (não encontrado) | `src/pages/ForensicSnapshotsPage.tsx`<br>`src/pages/ReplayForkPage.tsx` |
| `oncall_schedule_safe` | acessada do front (1 arquivo(s)) sem RLS (não encontrado) | `src/services/incidentService.ts` |
| `prompt_versions` | acessada do front (3 arquivo(s)) sem RLS (não encontrado) | `src/services/knowledgeService.ts`<br>`src/services/promptVersionService.ts`<br>`src/stores/agentBuilderStore.ts` |
| `workspace_members_safe` | acessada do front (1 arquivo(s)) sem RLS (não encontrado) | `src/services/teamsService.ts` |

## Multi-tenancy

- Chave de tenant: **`workspace_id`** presente em 156 tabela(s): `agents`, `notifications`, `user_roles`, `workspace_members`, `knowledge_bases`, `evaluation_runs`, `workspace_secrets`, `collections`, `tool_integrations`, `workflows`, `evaluation_datasets`, `environments`, `guardrail_policies`, `alerts`, `usage_records`, `budgets`, `agent_memories`, `deploy_connections`, `alert_rules`, `finetune_jobs`, `hf_config`, `api_keys`, `security_events`, `cron_schedules`, `notification_templates`, `task_queues`, `agent_routing_config`, `bitrix24_webhook_events`, `whatsapp_webhook_events`, `ip_whitelist`, `geo_allowed_countries`, `access_blocked_log`, `help_centers`, `automation_rules`, `automation_logs`, `agent_experiments`, `agent_eval_datasets`, `agent_eval_runs`, `agent_workflows`, `replay_forks`, `code_executions`, `prompt_experiments`, `voice_sessions`, `browser_sessions`, `agent_graphs`, `graph_executions`, `chaos_experiments`, `synthetic_checks`, `cost_baselines`, `cost_alerts`, `workspace_budgets`, `budget_events`, `game_days`, `incident_playbooks`, `incident_runs`, `oncall_schedule`, `dr_drills`, `postmortems`, `compliance_reports`, `sbom_snapshots`, `vulnerability_findings`, `managed_secrets`, `pentest_engagements`, `pentest_findings`, `risk_register`, `vendors`, `business_systems`, `change_requests`, `freeze_windows`, `ir_playbooks`, `ir_tabletop_exercises`, `assets`, `workspace_member_emails`, `oncall_schedule_emails`, `knowledge_entities`, `audit_log_v2`, `trace_events_v2`, `audit_events`, `security_alerts`, `openclaw_deployments`, `openclaw_whatsapp_instances`, `openclaw_whatsapp_messages`, `openclaw_events`, `slack_workspace_config`, `slack_channel_routes`, `slack_agent_notifications`, `slack_rag_sources`, `slack_bot_bindings`, `slack_dispatch_dlq`, `citation_telemetry`, `notebook_notes`, `knowledge_links`, `notebook_podcasts`, `notebook_canvases`, `notebook_note_templates`, `notebook_note_versions`, `data_subject_requests`, `data_processing_register`, `personal_data_inventory`, `data_breach_log`, `lgpd_settings`, `data_retention_policies`, `crm_companies`, `crm_contacts`, `crm_pipelines`, `crm_stages`, `crm_deals`, `crm_activities`, `crm_icp_profiles`, `crm_cadences`, `crm_cadence_steps`, `crm_cadence_enrollments`, `crm_cadence_runs`, `eval_runs`, `chat_threads`, `audit_log_v2_2026_04`, `audit_log_v2_2026_06`, `audit_log_v2_2026_07`, `audit_log_v2_2026_08`, `audit_log_v2_2026_09`, `audit_log_v2_2026_10`, `audit_log_v2_2026_11`, `audit_log_v2_2026_12`, `audit_log_v2_2027_01`, `audit_log_v2_2027_02`, `audit_log_v2_2027_03`, `audit_log_v2_2027_04`, `audit_log_v2_2027_05`, `audit_log_v2_2027_06`, `audit_log_v2_2027_07`, `trace_events_v2_2026_04`, `trace_events_v2_2026_05`, `trace_events_v2_2026_06`, `trace_events_v2_2026_07`, `trace_events_v2_2026_08`, `trace_events_v2_2026_09`, `trace_events_v2_2026_10`, `trace_events_v2_2026_11`, `trace_events_v2_2026_12`, `trace_events_v2_2027_01`, `trace_events_v2_2027_02`, `trace_events_v2_2027_03`, `trace_events_v2_2027_04`, `trace_events_v2_2027_05`, `trace_events_v2_2027_06`, `trace_events_v2_2027_07`, `audit_log_safe`, `knowledge_graph_health`, `llm_cost_by_caller`, `oncall_schedule_safe`, `slack_dispatch_health`, `slack_dlq_stats`, `usage_records_cost_safe`, `workspace_members_directory`, `workspace_members_public`, `workspace_members_safe`
- Cobertura: 47% das tabelas. Abaixo de 60% — isolamento provavelmente por usuário (auth.uid()) ou misto; não flagado por tabela.

## Soft delete (registros 'apagados' continuam na tabela — filtre!)

| Tabela | Coluna |
|---|---|
| `prompt_versions` | `is_active` |
| `chunks` | `is_active` |
| `budgets` | `is_active` |
| `api_keys` | `is_active` |
| `roles` | `is_active` |
| `automation_templates` | `is_active` |
| `ip_whitelist` | `is_active` |
| `automation_rules` | `is_active` |
| `slack_workspace_config` | `is_active` |
| `data_retention_policies` | `is_active` |
| `crm_companies` | `deleted_at` |
| `crm_contacts` | `deleted_at` |
| `crm_pipelines` | `deleted_at` |
| `crm_stages` | `deleted_at` |
| `crm_deals` | `deleted_at` |
| `crm_activities` | `deleted_at` |
| `crm_icp_profiles` | `deleted_at` |
| `crm_cadences` | `is_active` |
| `crm_cadences` | `deleted_at` |
| `template_skill_links` | `deleted_at` |

## Auditoria (colunas de rastreio)

| Tabela | Colunas |
|---|---|
| `agents` | `created_at`, `updated_at` |
| `agent_usage` | `created_at` |
| `prompt_versions` | `created_at` |
| `notifications` | `created_at` |
| `user_roles` | `created_at` |
| `auth_attempts` | `created_at` |
| `chunks` | `created_at` |
| `vector_indexes` | `created_at` |
| `workspaces` | `created_at` |
| `knowledge_bases` | `created_at`, `updated_at` |
| `agent_templates` | `created_at`, `created_by` |
| `evaluation_runs` | `created_at` |
| `workspace_secrets` | `created_at`, `updated_at` |
| `oracle_history` | `created_at` |
| `collections` | `created_at`, `updated_at` |
| `documents` | `created_at`, `updated_at` |
| `tool_integrations` | `created_at`, `updated_at` |
| `tool_policies` | `created_at` |
| `workflows` | `created_at`, `updated_at` |
| `workflow_steps` | `created_at` |
| `evaluation_datasets` | `created_at`, `updated_at` |
| `test_cases` | `created_at` |
| `environments` | `created_at` |
| `session_traces` | `created_at` |
| `trace_events` | `created_at` |
| `guardrail_policies` | `created_at`, `updated_at` |
| `alerts` | `created_at` |
| `usage_records` | `created_at` |
| `budgets` | `created_at`, `updated_at` |
| `agent_memories` | `created_at`, `updated_at` |
| `model_pricing` | `created_at` |
| `workflow_runs` | `created_at` |
| `deploy_connections` | `created_at`, `updated_at` |
| `alert_rules` | `created_at` |
| `prompt_ab_tests` | `created_at` |
| `consent_records` | `created_at`, `updated_at` |
| `agent_versions` | `created_at`, `created_by` |
| `finetune_jobs` | `created_at`, `updated_at` |
| `hf_config` | `created_at`, `updated_at` |
| `rate_limit_logs` | `created_at` |
| `api_keys` | `created_at`, `updated_at` |
| `security_events` | `created_at` |
| `roles` | `created_at`, `updated_at` |
| `permissions` | `created_at` |
| `role_permissions` | `created_at` |
| `agent_permissions` | `created_at` |
| `mcp_servers` | `created_at`, `updated_at` |
| `agent_skills` | `created_at`, `updated_at` |
| `skill_registry` | `created_at`, `created_by`, `updated_at` |
| `workflow_executions` | `created_at` |
| `workflow_checkpoints` | `created_at` |
| `workflow_handoffs` | `created_at` |
| `cron_schedules` | `created_at`, `updated_at` |
| `cron_schedule_executions` | `created_at` |
| `webhook_endpoints` | `created_at`, `updated_at` |
| `webhook_events` | `created_at` |
| `dead_letter_queue` | `created_at` |
| `credential_vault` | `created_at`, `created_by`, `updated_at` |
| `credential_audit_logs` | `created_at` |
| `notification_templates` | `created_at`, `updated_at` |
| `automation_templates` | `created_at`, `updated_at` |
| `execution_history` | `created_by` |
| `connector_registry` | `created_at`, `updated_at` |
| `connector_instances` | `created_at`, `created_by`, `updated_at` |
| `task_queues` | `created_at`, `updated_at` |
| `queue_items` | `created_at`, `updated_at` |
| `batch_jobs` | `created_at`, `created_by`, `updated_at` |
| `agent_routing_config` | `created_at`, `updated_at` |
| `bitrix24_webhook_events` | `created_at` |
| `whatsapp_webhook_events` | `created_at` |
| `rate_limit_entries` | `created_at` |
| `user_2fa` | `created_at`, `updated_at` |
| `ip_whitelist` | `created_at`, `created_by`, `updated_at` |
| `geo_allowed_countries` | `created_at`, `created_by` |
| `access_blocked_log` | `created_at` |
| `help_centers` | `created_at`, `updated_at` |
| `kb_articles` | `created_at`, `updated_at` |
| `kb_article_versions` | `created_at` |
| `kb_translations` | `created_at`, `updated_at` |
| `kb_query_gaps` | `created_at` |
| `forum_threads` | `created_at` |
| `forum_posts` | `created_at`, `updated_at` |
| `automation_rules` | `created_at`, `created_by`, `updated_at` |
| `automation_logs` | `created_at` |
| `agent_experiments` | `created_at`, `created_by`, `updated_at` |
| `agent_experiment_runs` | `created_at`, `created_by` |
| `agent_eval_datasets` | `created_at`, `created_by`, `updated_at` |
| `agent_eval_runs` | `created_at`, `created_by` |
| `agent_eval_results` | `created_at` |
| `agent_workflows` | `created_at`, `created_by`, `updated_at` |
| `agent_workflow_runs` | `created_by` |
| `replay_forks` | `created_at` |
| `code_executions` | `created_at` |
| `skill_marketplace_meta` | `created_at`, `updated_at` |
| `skill_purchases` | `created_at` |
| `skill_reviews` | `created_at` |
| `creator_payouts` | `created_at` |
| `prompt_experiments` | `created_at`, `created_by`, `updated_at` |
| `prompt_experiment_runs` | `created_at` |
| `voice_sessions` | `created_at`, `updated_at` |
| `browser_sessions` | `created_at` |
| `agent_graphs` | `created_at`, `created_by`, `updated_at` |
| `chaos_experiments` | `created_at`, `created_by` |
| `synthetic_checks` | `created_at`, `created_by`, `updated_at` |
| `workspace_budgets` | `created_at`, `created_by`, `updated_at` |
| `game_days` | `created_at`, `updated_at` |
| `game_day_scorecards` | `created_at`, `created_by` |
| `incident_playbooks` | `created_at`, `created_by`, `updated_at` |
| `oncall_schedule` | `created_at`, `created_by` |
| `dr_drills` | `created_at`, `created_by`, `updated_at` |
| `postmortems` | `created_at`, `updated_at` |
| `postmortem_action_items` | `created_at`, `updated_at` |
| `compliance_frameworks` | `created_at` |
| `compliance_controls` | `created_at` |
| `compliance_reports` | `created_at`, `updated_at` |
| `sbom_snapshots` | `created_at` |
| `sbom_components` | `created_at` |
| `managed_secrets` | `created_at`, `created_by`, `updated_at` |
| `secret_rotation_events` | `created_at` |
| `pentest_engagements` | `created_at`, `created_by`, `updated_at` |
| `pentest_findings` | `created_at`, `created_by`, `updated_at` |
| `risk_register` | `created_at`, `created_by`, `updated_at` |
| `vendors` | `created_at`, `created_by`, `updated_at` |
| `vendor_assessments` | `created_at` |
| `business_systems` | `created_at`, `created_by`, `updated_at` |
| `bcp_test_runs` | `created_at` |
| `change_requests` | `created_at`, `updated_at` |
| `freeze_windows` | `created_at`, `created_by` |
| `ir_playbooks` | `created_at`, `created_by`, `updated_at` |
| `ir_playbook_steps` | `created_at` |
| `ir_tabletop_exercises` | `created_at`, `created_by` |
| `assets` | `created_at`, `created_by`, `updated_at` |
| `asset_audits` | `created_at` |
| `workspace_member_emails` | `updated_at` |
| `oncall_schedule_emails` | `updated_at` |
| `user_filter_preferences` | `updated_at` |
| `restore_field_presets` | `created_at`, `updated_at` |
| `knowledge_entities` | `created_at`, `updated_at` |
| `knowledge_relations` | `created_at`, `updated_at` |
| `agent_memories_v2` | `created_at` |
| `entity_resolution_logs` | `created_at` |
| `audit_log` | `created_at` |
| `agent_traces` | `created_at` |
| `audit_log_v2` | `created_at` |
| `trace_events_v2` | `created_at` |
| `idempotency_keys` | `created_at` |
| `audit_events` | `created_at` |
| `security_alerts` | `created_at` |
| `retention_job_runs` | `created_at` |
| `user_research_configs` | `created_at`, `updated_at` |
| `openclaw_deployments` | `created_at`, `updated_at` |
| `openclaw_whatsapp_instances` | `created_at`, `updated_at` |
| `openclaw_whatsapp_messages` | `created_at` |
| `openclaw_events` | `created_at` |
| `openclaw_agent_templates` | `created_at`, `updated_at` |
| `slack_workspace_config` | `created_at`, `updated_at` |
| `slack_channel_routes` | `created_at`, `created_by`, `updated_at` |
| `slack_agent_notifications` | `created_at`, `updated_at` |
| `slack_rag_sources` | `created_at`, `updated_at` |
| `slack_bot_bindings` | `created_at`, `updated_at` |
| `slack_dispatch_dlq` | `created_at`, `updated_at` |
| `internal.detector_slo_state` | `updated_at` |
| `document_ingestions` | `created_at`, `updated_at` |
| `citation_telemetry` | `created_at` |
| `document_ingestion_events` | `created_at` |
| `notebook_notes` | `created_at`, `created_by`, `updated_at` |
| `knowledge_links` | `created_at`, `created_by` |
| `notebook_podcasts` | `created_at`, `created_by`, `updated_at` |
| `notebook_canvases` | `created_at`, `created_by`, `updated_at` |
| `notebook_note_templates` | `created_at`, `created_by`, `updated_at` |
| `notebook_note_versions` | `created_at`, `created_by` |
| `data_subject_requests` | `created_at`, `updated_at` |
| `data_processing_register` | `created_at`, `created_by`, `updated_at` |
| `personal_data_inventory` | `created_at`, `created_by`, `updated_at` |
| `data_breach_log` | `created_at`, `updated_at` |
| `lgpd_settings` | `created_at`, `updated_at` |
| `data_retention_policies` | `created_at`, `created_by`, `updated_at` |
| `account_lockouts` | `created_at` |
| `ip_rate_limits` | `created_at` |
| `crm_companies` | `created_at`, `updated_at` |
| `crm_contacts` | `created_at`, `updated_at` |
| `crm_pipelines` | `created_at`, `updated_at` |
| `crm_stages` | `created_at`, `updated_at` |
| `crm_deals` | `created_at`, `updated_at` |
| `crm_activities` | `created_at`, `updated_at` |
| `crm_icp_profiles` | `created_at`, `updated_at` |
| `crm_cadences` | `created_at`, `updated_at` |
| `crm_cadence_steps` | `created_at`, `updated_at` |
| `crm_cadence_enrollments` | `created_at`, `updated_at` |
| `internal.cron_tokens` | `created_at` |
| `crm_cadence_runs` | `created_at` |
| `webhook_delivery_logs` | `created_at` |
| `eval_runs` | `created_at`, `created_by` |
| `internal.partitioned_families` | `created_at` |
| `traces` | `created_at` |
| `spans` | `created_at` |
| `skill_harvest_runs` | `created_at`, `updated_at` |
| `skill_harvest_candidates` | `created_at`, `updated_at` |
| `template_skill_links` | `created_at`, `created_by`, `deleted_by`, `updated_at`, `updated_by` |
| `chat_threads` | `created_at`, `updated_at` |
| `chat_messages` | `created_at` |
| `skill_reclassification_reviews` | `created_at`, `updated_at` |
| `skill_harvest_checkpoints` | `created_at`, `updated_at` |
| `agent_traces_v2_2026_04` | `created_at` |
| `agent_traces_v2_2026_05` | `created_at` |
| `agent_traces_v2_2026_06` | `created_at` |
| `agent_traces_v2_2026_07` | `created_at` |
| `agent_traces_v2_2026_08` | `created_at` |
| `agent_traces_v2_2026_09` | `created_at` |
| `agent_traces_v2_2026_10` | `created_at` |
| `agent_traces_v2_2026_11` | `created_at` |
| `agent_traces_v2_2026_12` | `created_at` |
| `agent_traces_v2_2027_01` | `created_at` |
| `agent_traces_v2_2027_02` | `created_at` |
| `agent_traces_v2_2027_03` | `created_at` |
| `agent_traces_v2_2027_04` | `created_at` |
| `agent_traces_v2_2027_05` | `created_at` |
| `agent_traces_v2_2027_06` | `created_at` |
| `agent_traces_v2_2027_07` | `created_at` |
| `audit_log_v2_2026_04` | `created_at` |
| `audit_log_v2_2026_05` | `created_at` |
| `audit_log_v2_2026_06` | `created_at` |
| `audit_log_v2_2026_07` | `created_at` |
| `audit_log_v2_2026_08` | `created_at` |
| `audit_log_v2_2026_09` | `created_at` |
| `audit_log_v2_2026_10` | `created_at` |
| `audit_log_v2_2026_11` | `created_at` |
| `audit_log_v2_2026_12` | `created_at` |
| `audit_log_v2_2027_01` | `created_at` |
| `audit_log_v2_2027_02` | `created_at` |
| `audit_log_v2_2027_03` | `created_at` |
| `audit_log_v2_2027_04` | `created_at` |
| `audit_log_v2_2027_05` | `created_at` |
| `audit_log_v2_2027_06` | `created_at` |
| `audit_log_v2_2027_07` | `created_at` |
| `forensic_snapshots` | `created_at` |
| `spans_2026_04` | `created_at` |
| `spans_2026_05` | `created_at` |
| `spans_2026_06` | `created_at` |
| `spans_2026_07` | `created_at` |
| `spans_2026_08` | `created_at` |
| `spans_2026_09` | `created_at` |
| `spans_2026_10` | `created_at` |
| `spans_2026_11` | `created_at` |
| `spans_2026_12` | `created_at` |
| `spans_2027_01` | `created_at` |
| `spans_2027_02` | `created_at` |
| `spans_2027_03` | `created_at` |
| `spans_2027_04` | `created_at` |
| `spans_2027_05` | `created_at` |
| `spans_2027_06` | `created_at` |
| `spans_2027_07` | `created_at` |
| `trace_events_v2_2026_04` | `created_at` |
| `trace_events_v2_2026_05` | `created_at` |
| `trace_events_v2_2026_06` | `created_at` |
| `trace_events_v2_2026_07` | `created_at` |
| `trace_events_v2_2026_08` | `created_at` |
| `trace_events_v2_2026_09` | `created_at` |
| `trace_events_v2_2026_10` | `created_at` |
| `trace_events_v2_2026_11` | `created_at` |
| `trace_events_v2_2026_12` | `created_at` |
| `trace_events_v2_2027_01` | `created_at` |
| `trace_events_v2_2027_02` | `created_at` |
| `trace_events_v2_2027_03` | `created_at` |
| `trace_events_v2_2027_04` | `created_at` |
| `trace_events_v2_2027_05` | `created_at` |
| `trace_events_v2_2027_06` | `created_at` |
| `trace_events_v2_2027_07` | `created_at` |
| `traces_2026_04` | `created_at` |
| `traces_2026_05` | `created_at` |
| `traces_2026_06` | `created_at` |
| `traces_2026_07` | `created_at` |
| `traces_2026_08` | `created_at` |
| `traces_2026_09` | `created_at` |
| `traces_2026_10` | `created_at` |
| `traces_2026_11` | `created_at` |
| `traces_2026_12` | `created_at` |
| `traces_2027_01` | `created_at` |
| `traces_2027_02` | `created_at` |
| `traces_2027_03` | `created_at` |
| `traces_2027_04` | `created_at` |
| `traces_2027_05` | `created_at` |
| `traces_2027_06` | `created_at` |
| `traces_2027_07` | `created_at` |
| `audit_log_safe` | `created_at` |
| `forum_posts_public` | `created_at`, `updated_at` |
| `forum_posts_safe` | `created_at`, `updated_at` |
| `forum_threads_public` | `created_at` |
| `forum_threads_safe` | `created_at` |
| `oncall_schedule_safe` | `created_at`, `created_by` |
| `skill_registry_safe` | `created_at`, `created_by`, `updated_at` |
| `usage_records_cost_safe` | `created_at` |

## Dados pessoais / sensíveis (LGPD — cuidado em logs, exports, prompts de IA)

| Tabela | Coluna |
|---|---|
| `auth_attempts` | `email` |
| `auth_attempts` | `ip_address` |
| `consent_records` | `ip_address` |
| `rate_limit_logs` | `ip_address` |
| `credential_audit_logs` | `ip_address` |
| `ip_whitelist` | `ip_address` |
| `access_blocked_log` | `ip_address` |
| `assets` | `ip_address` |
| `workspace_member_emails` | `email` |
| `audit_log` | `ip_address` |
| `audit_log_v2` | `ip_address` |
| `audit_events` | `ip_address` |
| `slack_user_cache` | `email` |
| `data_subject_requests` | `ip_address` |
| `account_lockouts` | `email` |
| `account_lockouts` | `ip_address` |
| `ip_rate_limits` | `ip_address` |
| `crm_contacts` | `email` |
| `crm_contacts` | `phone` |
| `audit_log_v2_2026_04` | `ip_address` |
| `audit_log_v2_2026_05` | `ip_address` |
| `audit_log_v2_2026_06` | `ip_address` |
| `audit_log_v2_2026_07` | `ip_address` |
| `audit_log_v2_2026_08` | `ip_address` |
| `audit_log_v2_2026_09` | `ip_address` |
| `audit_log_v2_2026_10` | `ip_address` |
| `audit_log_v2_2026_11` | `ip_address` |
| `audit_log_v2_2026_12` | `ip_address` |
| `audit_log_v2_2027_01` | `ip_address` |
| `audit_log_v2_2027_02` | `ip_address` |
| `audit_log_v2_2027_03` | `ip_address` |
| `audit_log_v2_2027_04` | `ip_address` |
| `audit_log_v2_2027_05` | `ip_address` |
| `audit_log_v2_2027_06` | `ip_address` |
| `audit_log_v2_2027_07` | `ip_address` |
| `audit_log_safe` | `ip_address` |
| `workspace_members_directory` | `email` |
| `workspace_members_safe` | `email` |

## Colunas de dinheiro (tipo importa: numeric ✅ / float ❌)

| Tabela | Coluna | Tipo |
|---|---|---|
| `agent_usage` | `total_cost_usd` | `number` |
| `oracle_history` | `total_cost_usd` | `NUMERIC` |
| `oracle_history` | `total_latency_ms` | `INTEGER` |
| `oracle_history` | `total_tokens` | `INTEGER` |
| `session_traces` | `cost_usd` | `NUMERIC` |
| `usage_records` | `cost_usd` | `NUMERIC` |
| `workflow_runs` | `total_steps` | `INTEGER` |
| `workflow_step_runs` | `cost_usd` | `NUMERIC` |
| `workflow_executions` | `total_cost_usd` | `NUMERIC(10,` |
| `workflow_executions` | `total_tokens` | `INTEGER` |
| `workflow_executions` | `total_duration_ms` | `INTEGER` |
| `workflow_checkpoints` | `cost_usd` | `NUMERIC(10,` |
| `execution_history` | `cost_brl` | `NUMERIC(10,4)` |
| `batch_jobs` | `total_items` | `INTEGER` |
| `batch_jobs` | `total_batches` | `INTEGER` |
| `help_centers` | `custom_domain` | `text` |
| `agent_experiment_runs` | `cost_usd` | `NUMERIC` |
| `agent_experiment_runs` | `feedback` | `TEXT` |
| `agent_eval_runs` | `total_items` | `INTEGER` |
| `agent_eval_runs` | `total_cost_usd` | `NUMERIC` |
| `agent_eval_results` | `cost_usd` | `NUMERIC` |
| `replay_forks` | `total_steps` | `INTEGER` |
| `replay_forks` | `cost_usd` | `NUMERIC(10,6)` |
| `skill_marketplace_meta` | `price_cents` | `INTEGER` |
| `skill_purchases` | `amount_cents` | `INTEGER` |
| `creator_payouts` | `total_cents` | `INTEGER` |
| `prompt_experiment_runs` | `cost_cents` | `NUMERIC(10,4)` |
| `voice_sessions` | `cost_cents` | `INTEGER` |
| `browser_sessions` | `cost_cents` | `INTEGER` |
| `graph_executions` | `total_cost_cents` | `INTEGER` |
| `compliance_reports` | `total_controls` | `INTEGER` |
| `sbom_snapshots` | `total_components` | `INTEGER` |
| `pentest_engagements` | `total_findings` | `INTEGER` |
| `agent_traces` | `cost_usd` | `NUMERIC` |
| `internal.query_stats_snapshots` | `total_exec_ms` | `NUMERIC` |
| `internal.query_perf_baseline` | `total_exec_ms` | `NUMERIC` |
| `internal.query_perf_snapshots` | `total_exec_ms` | `NUMERIC` |
| `crm_deals` | `amount` | `NUMERIC(14,2)` |
| `skill_harvest_checkpoints` | `total_files` | `INTEGER` |
| `agent_traces_v2_2026_04` | `cost_usd` | `number` |
| `agent_traces_v2_2026_05` | `cost_usd` | `number` |
| `agent_traces_v2_2026_06` | `cost_usd` | `number` |
| `agent_traces_v2_2026_07` | `cost_usd` | `number` |
| `agent_traces_v2_2026_08` | `cost_usd` | `number` |
| `agent_traces_v2_2026_09` | `cost_usd` | `number` |
| `agent_traces_v2_2026_10` | `cost_usd` | `number` |
| `agent_traces_v2_2026_11` | `cost_usd` | `number` |
| `agent_traces_v2_2026_12` | `cost_usd` | `number` |
| `agent_traces_v2_2027_01` | `cost_usd` | `number` |
| `agent_traces_v2_2027_02` | `cost_usd` | `number` |
| `agent_traces_v2_2027_03` | `cost_usd` | `number` |
| `agent_traces_v2_2027_04` | `cost_usd` | `number` |
| `agent_traces_v2_2027_05` | `cost_usd` | `number` |
| `agent_traces_v2_2027_06` | `cost_usd` | `number` |
| `agent_traces_v2_2027_07` | `cost_usd` | `number` |
| `agent_daily_metrics` | `total_cost_usd` | `number` |
| `agent_daily_metrics` | `total_tokens` | `number` |
| `knowledge_graph_health` | `total_score` | `number` |
| `llm_cost_by_caller` | `cost_usd` | `number` |
| `slack_dispatch_health` | `total_dispatches` | `number` |
| `usage_records_cost_safe` | `cost_usd` | `number` |
