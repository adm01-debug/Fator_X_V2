# Contexto do projeto para agentes de IA

GERADO AUTOMATICAMENTE por scripts/ai-context/gerar.mjs — não editar à mão; será sobrescrito.
Publicado em `docs/contexto/codigo/` na branch `contexto` (gerada, nunca abra PR dela) a cada push em `main` e a cada 10 minutos pelo workflow `contexto.yml`; índice único das três fontes em `docs/contexto/00-INDEX.md`. Gere local com `node scripts/ai-context/gerar.mjs`. Commit-base: `f6a5b20d9954767d6694620903f5ecea83c002ca` (2026-11-14T11:11:36-03:00).

## Como usar (leia antes de planejar ou executar qualquer tarefa)
1. **Tela/rota/menu** → `rotas.json` (url/vista/menu → arquivo → hooks → tabelas → edges; `rotas_http_backend` para APIs) e `modulos.json` (módulo inteiro + dependências entre módulos).
2. **Hook/serviço/lógica** → `hooks.json`, `logica.json` (quem usa, o que toca, se tem teste).
3. **Edge function / serverless** → `edge-functions.json` (verify_jwt, tabelas, env, quem chama, órfãs).
4. **Banco** → `banco.json` (colunas, RLS, policies, índices, FKs, triggers, cron jobs, buckets, drift migration×types, uso no código) — visão do código; para o banco vivo use o MCP.
5. **Antes de criar arquivo** → `convencoes.json` (onde ficam as coisas, nomenclatura, alias), `componentes.json` (nomes duplicados, órfãos), `grafo.json` (hubs, ciclos de import) e `grafo-graphify.json` (grafo por AST: comunidades, símbolos mais chamados, comunidade de cada arquivo).
6. **CI/scripts/deploy/env/integrações/permissões/flags** → `ferramentas.json` e `scripts.json`.
7. **Antes de abrir PR** → `testes.json` (o que tem e não tem teste, onde os testes ficam), `baseline.json` (alertas, TODOs, hotspots, últimos commits).
Os JSONs são grandes: filtre com `grep`/`jq` pelo caminho/arquivo/tabela da sua tarefa; não carregue tudo.

## Stack
- linguagens: TypeScript (1391), SQL (332), Markdown (114), JavaScript (52), JSON (24), YAML (13), Shell (10), Python (5)
- linguagem_principal: TypeScript
- framework: React
- backend_http: n/d
- bundler: Vite
- roteador: react-router
- banco: Supabase
- testes: vitest, playwright
- ui: tailwind, radix/shadcn
- estado: react-query, zustand
- gerenciador_pacotes: bun
- node: n/d
- python: n/d
- deploy: n/d
- monorepo: n/d
- pastas_fonte: src

## Números
| item | qtd |
|---|---|
| arquivos_total | 1970 |
| arquivos_codigo | 1447 |
| linhas_codigo | 316560 |
| rotas | 151 |
| rotas_http_backend | 12 |
| vistas_por_id | 0 |
| itens_menu | 121 |
| modulos | 71 |
| componentes | 661 |
| hooks | 75 |
| edge_functions | 87 |
| tabelas | 327 |
| migrations | 329 |
| cron_jobs | 37 |
| testes | 239 |
| workflows | 7 |
| scripts | 43 |
| docs_md | 114 |

## Onde ficam as coisas
- telas: src/pages (140)
- componentes: src/components (516), src/pages (141), src/App.tsx (1)
- hooks: src/hooks (43), src/components (9), src/services (9)
- servicos_logica: src/services (166), src/lib (90), src/stores (12)
- testes: co-localizado (*.test) (196), outro (23), e2e/ (9)
- edge_functions: supabase/functions
- migrations: supabase/migrations
- scripts: scripts/ci (11), scripts/inventario (4), scripts/maintenance (4)
- docs: docs (41), (raiz) (24), .github (2)
- nomenclatura: {"componentes":"PascalCase (93%)","hooks":"use + PascalCase","servicos":"camelCase (97%)","edge_functions":"kebab-case (100%)","tabelas":"snake_case (89%)"}
- instruções para agentes no repo: AGENTS.md, CLAUDE.md

## Módulos (menu → domínio)
| módulo | itens de menu | telas/rotas | arquivos | hooks locais | edges | tabelas |
|---|---|---|---|---|---|---|
| components/agent-builder | 0 | 0 | 51 | 29 | 11 | 23 |
| components/agents | 0 | 0 | 104 | 17 | 2 | 14 |
| components/automation | 0 | 0 | 14 | 2 | 28 | 41 |
| components/charts | 0 | 0 | 12 | 1 | 0 | 0 |
| components/chat | 0 | 0 | 11 | 1 | 0 | 0 |
| components/crm | 0 | 0 | 10 | 1 | 3 | 3 |
| components/dashboard | 0 | 0 | 7 | 6 | 0 | 13 |
| components/datahub | 0 | 0 | 22 | 1 | 2 | 0 |
| components/deployments | 0 | 0 | 5 | 0 | 2 | 6 |
| components/dialogs | 0 | 0 | 5 | 0 | 4 | 17 |
| components/integrations | 0 | 0 | 7 | 0 | 3 | 7 |
| components/knowledge | 0 | 0 | 11 | 0 | 8 | 8 |
| components/monitoring | 0 | 0 | 8 | 0 | 0 | 7 |
| components/oracle | 0 | 0 | 13 | 2 | 1 | 3 |
| components/security | 0 | 0 | 16 | 6 | 1 | 14 |
| components/shared | 0 | 0 | 45 | 13 | 6 | 11 |
| components/skills | 0 | 0 | 26 | 5 | 3 | 11 |
| components/slack | 0 | 0 | 7 | 7 | 5 | 11 |
| components/super-cerebro | 0 | 0 | 58 | 35 | 8 | 22 |
| components/tools | 0 | 0 | 7 | 0 | 2 | 0 |
| components/ui | 0 | 0 | 48 | 4 | 0 | 0 |
| components/workflows | 0 | 0 | 16 | 5 | 3 | 6 |
| config | 0 | 0 | 10 | 0 | 0 | 0 |
| data | 0 | 0 | 5 | 0 | 0 | 0 |
| hooks | 0 | 0 | 44 | 67 | 14 | 33 |
| lib | 0 | 0 | 45 | 85 | 62 | 119 |
| lib/skills | 0 | 0 | 19 | 0 | 0 | 2 |
| lib/validations | 0 | 0 | 12 | 0 | 0 | 0 |
| pages | 114 | 151 | 141 | 95 | 74 | 151 |
| services | 0 | 0 | 146 | 28 | 58 | 118 |
| services/presets | 0 | 0 | 5 | 0 | 0 | 0 |
| services/types | 0 | 0 | 15 | 0 | 0 | 0 |
| stores | 0 | 0 | 10 | 0 | 1 | 6 |

## Rotas (url → arquivo)
- `/` [tela] → src/pages/DashboardPage.tsx
- `/*` [tela] → src/pages/NotFound.tsx
- `/a2a` [tela] → src/pages/A2APanelPage.tsx
- `/ab-test` [tela] → src/pages/PromptABTestPage.tsx
- `/admin` [tela] → src/pages/AdminPage.tsx (protegida)
- `/agent-builder` [tela] → src/pages/AgentBuilder.tsx
- `/agent-evals` [tela] → src/pages/AgentEvalsPage.tsx
- `/agent-experiments` [tela] → src/pages/AgentExperimentsPage.tsx
- `/agent-sessions` [tela] → src/pages/AgentSessionsPage.tsx
- `/agents` [tela] → src/pages/AgentsPage.tsx
- `/agents/:id` [tela] → src/pages/AgentDetailPage.tsx
- `/agents/:id/alerts` [tela] → src/pages/AgentAlertsPage.tsx
- `/agents/:id/traces` [tela] → src/pages/AgentTracesPage.tsx
- `/agents/:id/versions` [tela] → src/pages/AgentVersioningPage.tsx
- `/agents/:id/versions/v/:versionId` [tela] → src/pages/AgentVersioningPage.tsx
- `/agents/installed-skills` [tela] → src/pages/AgentInstalledSkillsPage.tsx
- `/agents/new` [tela] → src/pages/CreateAgentPage.tsx
- `/agents/swarm` [tela] → src/pages/SwarmOrchestrationPage.tsx
- `/agents/templates` [tela] → src/pages/AgentTemplatesPage.tsx
- `/agents/workflows` [tela] → src/pages/AgentWorkflowsPage.tsx
- `/ai-studio` [tela] → src/pages/AIStudioPage.tsx
- `/approvals` [tela] → src/pages/ApprovalQueuePage.tsx (protegida)
- `/arena` [tela] → src/pages/AgentArenaPage.tsx
- `/auth` [tela] → src/pages/AuthPage.tsx (protegida)
- `/automation` [tela] → src/pages/AutomationCenterPage.tsx
- `/automations` [tela] → src/pages/AutomationsPage.tsx
- `/billing` [tela] → src/pages/BillingPage.tsx (protegida)
- `/brain` [tela] → src/pages/SuperCerebroPage.tsx
- `/browser-agent` [tela] → src/pages/BrowserAgentPage.tsx
- `/budgets` [tela] → src/pages/BudgetsPage.tsx
- `/builder` [tela] → src/pages/AgentBuilder.tsx
- `/builder/:id` [tela] → src/pages/AgentBuilder.tsx
- `/canary` [tela] → src/pages/CanaryDeploymentsPage.tsx
- `/chat` [tela] → src/pages/ChatWithAgentPage.tsx
- `/chat/:agentId` [tela] → src/pages/ChatWithAgentPage.tsx
- `/code-interpreter` [tela] → src/pages/CodeInterpreterPage.tsx
- `/compliance-frameworks` [tela] → src/pages/ComplianceFrameworksPage.tsx (protegida)
- `/compliance-reports` [tela] → src/pages/ComplianceReportsPage.tsx (protegida)
- `/computer-use` [tela] → src/pages/ComputerUsePage.tsx
- `/cost-optimizer` [tela] → src/pages/CostOptimizerPage.tsx
- `/cost-simulator` [tela] → src/pages/CostSimulatorPage.tsx
- `/creator-payouts` [tela] → src/pages/CreatorPayoutsPage.tsx
- `/crm` [tela] → src/pages/CrmPage.tsx
- `/dashboard` [tela] → src/pages/DashboardPage.tsx
- `/data-storage` [tela] → src/pages/DataStoragePage.tsx
- `/datahub` [tela] → src/pages/DataHubPage.tsx
- `/debugger` [tela] → src/pages/AgentDebuggerPage.tsx
- `/deploy/openclaw` [tela] → src/pages/OpenclawDeployPage.tsx
- `/deployments` [tela] → src/pages/DeploymentsPage.tsx
- `/disaster-recovery` [tela] → src/pages/DisasterRecoveryPage.tsx (protegida)
- `/docs/partitioning` [tela] → src/pages/PartitioningDocsPage.tsx
- `/docs/typography` [tela] → src/pages/TypographyDocsPage.tsx
- `/email-triggers` [tela] → src/pages/EmailCalendarTriggersPage.tsx
- `/entity-resolution` [tela] → src/pages/EntityResolutionLogsPage.tsx
- `/evaluations` [tela] → src/pages/EvaluationsPage.tsx
- `/federated-learning` [tela] → src/pages/FederatedLearningPage.tsx (protegida)
- `/fine-tuning` [tela] → src/pages/FineTuningPage.tsx
- `/governance` [tela] → src/pages/GovernancePage.tsx
- `/governance/freeze-windows` [tela] → src/pages/FreezeWindowsPage.tsx (protegida)
- `/graph-executions` [tela] → src/pages/GraphExecutionsPage.tsx
- `/help/:slug` [tela] → src/pages/PublicHelpCenterPage.tsx
- `/help/:slug/:articleSlug` [tela] → src/pages/PublicHelpCenterPage.tsx
- `/help/:slug/forum` [tela] → src/pages/PublicForumPage.tsx
- `/help/:slug/forum/:threadId` [tela] → src/pages/PublicForumPage.tsx
- `/knowledge` [tela] → src/pages/KnowledgePage.tsx
- `/knowledge-decay` [tela] → src/pages/KnowledgeDecayPage.tsx
- `/knowledge-graph` [tela] → src/pages/KnowledgeGraphPage.tsx
- `/knowledge-management` [tela] → src/pages/KnowledgeManagementPage.tsx
- `/knowledge-management/article/:id` [tela] → src/pages/ArticleEditorPage.tsx
- `/lgpd` [tela] → src/pages/LGPDCompliancePage.tsx (protegida)
- `/llm-cost-by-caller` [tela] → src/pages/LlmCostByCallerPage.tsx
- `/marketplace-pro` [tela] → src/pages/MarketplaceMonetizedPage.tsx
- `/mcp-servers` [tela] → src/pages/MCPServersPage.tsx
- `/memory` [tela] → src/pages/MemoryPage.tsx
- `/mobile-sdk` [tela] → src/pages/MobileSDKPage.tsx
- `/monitoring` [tela] → src/pages/MonitoringPage.tsx
- `/monitoring/metrics` [tela] → src/pages/AgentMetricsPage.tsx
- `/multi-tenancy` [tela] → src/pages/MultiTenancyPage.tsx (protegida)
- `/nlp` [tela] → src/pages/NLPPipelinePage.tsx
- `/observability` [tela] → src/pages/ObservabilityOTelPage.tsx
- `/observability/chaos` [tela] → src/pages/ChaosLabPage.tsx (protegida)
- `/observability/cost-anomalies` [tela] → src/pages/CostAnomaliesPage.tsx
- `/observability/dr-drills` [tela] → src/pages/DRDrillsPage.tsx (protegida)
- `/observability/game-days` [tela] → src/pages/GameDaysPage.tsx
- `/observability/game-days/:id/live` [tela] → src/pages/GameDayLivePage.tsx
- `/observability/oncall` [tela] → src/pages/OncallPage.tsx
- `/observability/playbooks` [tela] → src/pages/IncidentPlaybooksPage.tsx
- `/observability/postmortems` [tela] → src/pages/PostmortemsPage.tsx
- `/observability/postmortems/:id` [tela] → src/pages/PostmortemEditorPage.tsx
- `/observability/slo` [tela] → src/pages/SLODashboard.tsx
- `/observability/synthetic` [tela] → src/pages/SyntheticMonitoringPage.tsx
- `/openclaw` [tela] → src/pages/OpenclawDeployPage.tsx
- `/openclaw/templates` [tela] → src/pages/OpenclawTemplatesPage.tsx
- `/oracle` [tela] → src/pages/OraclePage.tsx
- `/orchestration` [tela] → src/pages/AgentOrchestrationPage.tsx
- `/prompts` [tela] → src/pages/PromptsPage.tsx
- `/prompts/:id` [tela] → src/pages/PromptEditorPage.tsx
- `/prompts/experiments` [tela] → src/pages/PromptExperimentsPage.tsx
- `/rbac/permissions` [tela] → src/pages/PermissionsPage.tsx (protegida)
- `/rbac/roles` [tela] → src/pages/RolesPage.tsx (protegida)
- `/rbac/roles/:roleKey` [tela] → src/pages/RolePermissionsPage.tsx (protegida)
- `/replay` [tela] → src/pages/ReplayForkPage.tsx
- `/reset-password` [tela] → src/pages/ResetPasswordPage.tsx
- `/residency` [tela] → src/pages/DataResidencyPage.tsx (protegida)
- `/routing` [tela] → src/pages/RoutingConfigPage.tsx
- `/search` [tela] → src/pages/SearchPage.tsx
- `/security` [tela] → src/pages/SecurityPage.tsx (protegida)
- `/security/assets` [tela] → src/pages/AssetInventoryPage.tsx (protegida)
- `/security/bcp` [tela] → src/pages/BCPPage.tsx (protegida)
- `/security/bcp-tests` [tela] → src/pages/BCPTestRunsPage.tsx (protegida)
- `/security/changes` [tela] → src/pages/ChangeManagementPage.tsx (protegida)
- `/security/chaos-experiments` [tela] → src/pages/ChaosExperimentsPage.tsx
- `/security/forensic-snapshots` [tela] → src/pages/ForensicSnapshotsPage.tsx (protegida)
- `/security/ip-whitelist` [tela] → src/pages/IPWhitelistPage.tsx (protegida)
- `/security/ir` [tela] → src/pages/IRPlaybooksPage.tsx (protegida)
- `/security/pentest-findings` [tela] → src/pages/PentestFindingsPage.tsx (protegida)
- `/security/pentests` [tela] → src/pages/PentestPage.tsx (protegida)
- `/security/performance` [tela] → src/pages/PerformancePage.tsx (protegida)
- `/security/risks` [tela] → src/pages/RiskRegisterPage.tsx (protegida)
- `/security/sbom` [tela] → src/pages/SBOMPage.tsx (protegida)
- `/security/secrets-rotation` [tela] → src/pages/SecretsRotationPage.tsx (protegida)
- `/security/vendors` [tela] → src/pages/VendorsPage.tsx (protegida)
- `/security/vulnerabilities` [tela] → src/pages/VulnerabilitiesPage.tsx (protegida)
- `/settings` [tela] → src/pages/SettingsPage.tsx (protegida)
- `/settings/budget` [tela] → src/pages/BudgetSettingsPage.tsx (protegida)
- `/settings/slack` [tela] → src/pages/SlackSettingsPage.tsx (protegida)
- `/share/n` [tela] → src/pages/PublicNoteView.tsx
- `/simulation` [tela] → src/pages/AgentSimulationPage.tsx
- `/skills` [tela] → src/pages/SkillsMarketplacePage.tsx
- `/skills/audit` [tela] → src/pages/SkillbookAuditPage.tsx
- `/skills/composer` [tela] → src/pages/SkillComposerPage.tsx
- `/skills/harvest` [tela] → src/pages/SkillHarvestPage.tsx (protegida)
- `/skills/library` [tela] → src/pages/SkillLibraryPage.tsx
- `/smolagent` [tela] → src/pages/SmolagentPage.tsx
- `/sso` [tela] → src/pages/EnterpriseSSOPage.tsx (protegida)
- `/super-cerebro` [tela] → src/pages/SuperCerebroPage.tsx
- `/super-cerebro/e2ee-simulacao` [tela] → src/pages/E2EESimulationPage.tsx
- `/super-cerebro/n/:notebookId/note/:noteId` [tela] → src/pages/SuperCerebroPage.tsx
- `/synthetic-data` [tela] → src/pages/SyntheticDataPage.tsx
- `/system-jobs` [tela] → src/pages/SystemJobsPage.tsx
- `/team` [tela] → src/pages/TeamPage.tsx (protegida)
- `/tools` [tela] → src/pages/ToolsPage.tsx
- `/traces` [tela] → src/pages/TracesTimelinePage.tsx
- `/vendas` [tela] → src/pages/CrmPage.tsx
- `/vision` [tela] → src/pages/VisionAgentsPage.tsx
- `/voice` [tela] → src/pages/VoiceAgentStudioPage.tsx
- `/voice-agents` [tela] → src/pages/VoiceAgentsPage.tsx
- `/voice-telephony` [tela] → src/pages/VoiceTelephonyPage.tsx
- `/webhook-events` [tela] → src/pages/WebhookEventsPage.tsx
- `/widget-builder` [tela] → src/pages/WidgetBuilderPage.tsx
- `/workflows` [tela] → src/pages/WorkflowsPage.tsx

## Rotas HTTP de backend
- `GET /{t}` → scripts/ai-context/cenarios.mjs
- `GET /a` → scripts/ai-context/cenarios.mjs
- `GET /a` → scripts/ai-context/cenarios.mjs
- `POST /b` → scripts/ai-context/cenarios.mjs
- `POST /b` → scripts/ai-context/cenarios.mjs
- `DELETE /c` → scripts/ai-context/cenarios.mjs
- `PUT /d` → scripts/ai-context/cenarios.mjs
- `GET /items` → scripts/ai-context/gerar.unit.mjs
- `GET /u` → scripts/ai-context/cenarios.mjs
- `GET /users` → scripts/ai-context/cenarios.mjs
- `POST /users/:id` → scripts/ai-context/cenarios.mjs
- `GET /x` → scripts/ai-context/cenarios.mjs

## Vistas por id (menu/ViewRouter → arquivo)
- (nenhum)

## Edge functions
- `a2a-server` — tabelas: agents; chamada por 1 arquivo(s) do front
- `agent-conversational-builder` — tabelas: -; chamada por 1 arquivo(s) do front
- `agent-eval-runner` — tabelas: agent_eval_datasets, agent_eval_results, agent_eval_runs, agents; chamada por 1 arquivo(s) do front
- `agent-workflow-runner` — tabelas: agent_workflow_runs, agent_workflows, agents; chamada por 1 arquivo(s) do front
- `audio-transcribe` — tabelas: -; chamada por 1 arquivo(s) do front
- `automation-pipeline` — tabelas: automation_logs, automation_rules; chamada por 1 arquivo(s) do front
- `bitrix24-api` — tabelas: workspace_secrets; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `bitrix24-oauth` — tabelas: workspace_secrets; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `bitrix24-webhook` — tabelas: agent_routing_config, bitrix24_webhook_events, trace_events, workspace_secrets; chamada por 1 arquivo(s) do front
- `browser-agent-run` — tabelas: browser_sessions; chamada por 1 arquivo(s) do front
- `browser-session-cancel` — tabelas: browser_sessions; chamada por 1 arquivo(s) do front
- `cerebro-brain` — tabelas: agent_memories, agent_traces, agents, chunks, documents, entity_resolution_logs, knowledge_bases, knowledge_entities, knowledge_relations, tool_integrations, workflow_steps, workflows, workspace_members; chamada por 1 arquivo(s) do front
- `cerebro-query` — tabelas: agent_traces, agents, chunks, collections, knowledge_bases, workspace_members; chamada por 3 arquivo(s) do front
- `code-interpreter-execute` — tabelas: code_executions; chamada por 1 arquivo(s) do front
- `computer-use-execute` — tabelas: -; chamada por 1 arquivo(s) do front
- `cost-calculator` — tabelas: model_pricing; chamada por 4 arquivo(s) do front
- `crm-bitrix-sync` — tabelas: crm_activities, workspace_secrets; chamada por 1 arquivo(s) do front
- `crm-cadence-runner` — tabelas: crm_activities, crm_cadence_enrollments, crm_cadence_runs, crm_cadence_steps, crm_cadences, crm_companies, crm_contacts, crm_deals, slack_channel_routes; chamada por 1 arquivo(s) do front
- `crm-enrich` — tabelas: crm_activities, crm_companies, crm_contacts; chamada por 1 arquivo(s) do front
- `cron-executor` — tabelas: cron_schedule_executions, cron_schedules; chamada por 1 arquivo(s) do front
- `datahub-mcp-server` — tabelas: -; chamada por 2 arquivo(s) do front
- `datahub-query` — tabelas: -; chamada por 12 arquivo(s) do front
- `doc-ocr` — tabelas: -; chamada por 0 arquivo(s) do front
- `doc-parse` — tabelas: audit_events, chunks, collections, document_ingestions, documents; chamada por 1 arquivo(s) do front
- `doc-rechunk` — tabelas: audit_events, chunks, documents, workspace_members; chamada por 1 arquivo(s) do front
- `dr-orchestrator` — tabelas: dr_drills, dr_snapshots; chamada por 1 arquivo(s) do front
- `eval-engine-v2` — tabelas: eval_runs; chamada por 1 arquivo(s) do front
- `eval-judge` — tabelas: agents, evaluation_runs, test_cases, workspace_members, workspace_secrets; chamada por 1 arquivo(s) do front
- `global-search` — tabelas: agent_eval_datasets, agent_workflows, agents, automation_rules, documents, kb_articles, knowledge_bases; chamada por 1 arquivo(s) do front
- `graph-execute` — tabelas: agent_graphs, agents, graph_executions; chamada por 1 arquivo(s) do front
- `guardrails-engine` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `guardrails-ml` — tabelas: -; chamada por 1 arquivo(s) do front
- `health-check` — tabelas: workspaces; chamada por 1 arquivo(s) do front
- `hf-autotrain` — tabelas: agent_traces, workspace_members; chamada por 1 arquivo(s) do front
- `image-analysis` — tabelas: -; chamada por 1 arquivo(s) do front
- `incident-orchestrator` — tabelas: agents, chaos_experiments, incident_playbooks; chamada por 1 arquivo(s) do front
- `kb-analyze-gaps` — tabelas: kb_query_gaps, oracle_history; chamada por 1 arquivo(s) do front
- `kb-translate-article` — tabelas: kb_articles, kb_translations; chamada por 1 arquivo(s) do front
- `lgpd-manager` — tabelas: agent_memories, consent_records, data_deletion_requests, security_events, session_traces, sessions; chamada por 1 arquivo(s) do front
- `llm-gateway` — tabelas: agent_traces, agent_usage, agents, audit_events, budgets, model_pricing, session_traces, sessions, trace_events, usage_records, workspace_members, workspace_secrets; chamada por 3 arquivo(s) do front
- `memory-manager` — tabelas: agent_memories; chamada por 1 arquivo(s) do front
- `memory-tools` — tabelas: agent_memories, workspace_members; chamada por 1 arquivo(s) do front
- `migrate-helper` (verify_jwt=false) — tabelas: -; chamada por 0 arquivo(s) do front
- `nlp-pipeline` — tabelas: -; chamada por 1 arquivo(s) do front
- `notebook-podcast-generate` — tabelas: collections, document_ingestions, notebook_notes, notebook_podcasts, workspace_members; chamada por 1 arquivo(s) do front
- `notification-sender` — tabelas: notification_templates, notifications; chamada por 1 arquivo(s) do front
- `openclaw-proxy` — tabelas: openclaw_events; chamada por 1 arquivo(s) do front
- `openclaw-webhook` (verify_jwt=false) — tabelas: openclaw_events, openclaw_whatsapp_instances, openclaw_whatsapp_messages, webhook_events; chamada por 0 arquivo(s) do front
- `oracle-council` — tabelas: -; chamada por 2 arquivo(s) do front
- `oracle-research` — tabelas: oracle_history; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `pg-net-smoke-test` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `product-mockup` — tabelas: -; chamada por 1 arquivo(s) do front
- `queue-worker` — tabelas: queue_items, task_queues; chamada por 1 arquivo(s) do front
- `quick-agent-test` — tabelas: -; chamada por 2 arquivo(s) do front
- `rag-embed-backfill` (verify_jwt=false) — tabelas: agent_memories_v2; chamada por 0 arquivo(s) do front
- `rag-embed-v2` — tabelas: workspace_members, workspace_secrets; chamada por 1 arquivo(s) do front
- `rag-ingest` — tabelas: chunks, documents, workspace_members, workspace_secrets; chamada por 1 arquivo(s) do front
- `rag-rerank` — tabelas: workspace_members, workspace_secrets; chamada por 2 arquivo(s) do front
- `rag-rerank-v2` — tabelas: workspace_members, workspace_secrets; chamada por 1 arquivo(s) do front
- `replay-fork-execute` — tabelas: replay_forks; chamada por 1 arquivo(s) do front
- `sbom-scanner` — tabelas: sbom_components, sbom_snapshots; chamada por 1 arquivo(s) do front
- `semantic-search` — tabelas: chunks, documents; chamada por 1 arquivo(s) do front
- `skill-classify-llm` — tabelas: -; chamada por 1 arquivo(s) do front
- `skill-describe-llm` — tabelas: -; chamada por 1 arquivo(s) do front
- `skill-harvester` — tabelas: skill_harvest_candidates, skill_harvest_runs; chamada por 1 arquivo(s) do front
- `slack-agent-notify` — tabelas: audit_events, slack_agent_notifications; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `slack-alert-dispatcher` — tabelas: audit_events, slack_channel_routes, slack_dispatch_dlq; chamada por 2 arquivo(s) do front, por SQL/cron
- `slack-dlq-discard` — tabelas: slack_dispatch_dlq; chamada por 1 arquivo(s) do front
- `slack-dlq-retry` — tabelas: slack_dispatch_dlq; chamada por 1 arquivo(s) do front, por SQL/cron
- `slack-events-webhook` (verify_jwt=false) — tabelas: audit_events, slack_bot_bindings, slack_workspace_config; chamada por 0 arquivo(s) do front
- `slack-rag-sync` — tabelas: agent_memories_v2, slack_rag_sources; chamada por 1 arquivo(s) do front
- `slack-verify-connection` — tabelas: audit_events, slack_workspace_config; chamada por 1 arquivo(s) do front
- `smart-model-router` — tabelas: -; chamada por 1 arquivo(s) do front
- `smolagent-runtime` — tabelas: agent_traces, workspace_members; chamada por 1 arquivo(s) do front
- `synthetic-runner` — tabelas: synthetic_checks, synthetic_results; chamada por 1 arquivo(s) do front
- `test-runner` — tabelas: agents; chamada por 1 arquivo(s) do front
- `text-to-speech` — tabelas: -; chamada por 1 arquivo(s) do front
- `validate-access` — tabelas: access_blocked_log, geo_allowed_countries, ip_whitelist; chamada por 1 arquivo(s) do front
- `visual-search` — tabelas: -; chamada por 1 arquivo(s) do front
- `voice-session` — tabelas: voice_sessions, workspaces; chamada por 1 arquivo(s) do front
- `voice-synthesize` — tabelas: agents, voice_sessions; chamada por 1 arquivo(s) do front
- `voice-transcribe` — tabelas: voice_sessions; chamada por 1 arquivo(s) do front
- `webhook-receiver` — tabelas: webhook_endpoints, webhook_events; chamada por 1 arquivo(s) do front
- `whatsapp-router` (verify_jwt=false) — tabelas: openclaw_events, openclaw_whatsapp_instances, openclaw_whatsapp_messages; chamada por 0 arquivo(s) do front, por SQL/cron
- `whatsapp-webhook` — tabelas: agent_routing_config, openclaw_events, trace_events, whatsapp_webhook_events, workspace_secrets; chamada por 1 arquivo(s) do front
- `widget-proxy` (verify_jwt=false) — tabelas: agents; chamada por 3 arquivo(s) do front
- `workflow-engine-v2` — tabelas: workflow_runs, workflow_steps, workflows; chamada por 2 arquivo(s) do front

## Cron jobs (pg_cron / vercel)
- `capture-db-health-every-5min` */5 * * * * (20260722145902_bffbbc2f-7da7-4f0e-b6a8-be6145c81fd8.sql)
- `capture-perf-snapshot` 30 3 * * * (20260712110111_d29cf27d-e265-45e4-9c07-ea47c7556b1d.sql)
- `capture-perf-snapshot-daily` 15 3 * * * (20260712141949_f64f8ab6-c2f6-4d98-9414-3c8b9331391b.sql)
- `check-db-bloat` 45 3 * * * (20260712110111_d29cf27d-e265-45e4-9c07-ea47c7556b1d.sql)
- `cleanup-orphan-sessions` */10 * * * * (20260712221325_43a8ea08-bda6-4ab8-a468-36bd9d01b3d3.sql)
- `cost-anomalies-15min` */15 * * * * (20260418011629_10215e66-8af6-43ef-8878-dfad3008e2ef.sql)
- `cost-baselines-daily` 0 3 * * * (20260418011629_10215e66-8af6-43ef-8878-dfad3008e2ef.sql)
- `detect-health-trend-every-15min` */15 * * * * (20260722150725_4521cb94-3976-49fb-bb41-77e85d84133d.sql)
- `detect-slo-breach-every-15min` 3,18,33,48 * * * * (20260722155416_27f52f22-f229-45f3-bb70-630ae935d1d7.sql)
- `detect-slow-queries-every-15min` */15 * * * * (20260722131714_a629dcc0-0085-420c-b3e8-cd4aa9ba2a44.sql)
- `drop-old-partitions` 0 4 2 * * (20260711192756_81a71657-35d7-4b95-886e-5418c4366995.sql)
- `ensure-monthly-partitions` 0 3 25 * * (20260711192438_0faffc45-e93e-4815-aa19-74e1ca834c37.sql)
- `lgpd-cleanup-auth-attempts` 0 2 * * * (20260724000013_lgpd_cron_jobs.sql)
- `lgpd-retention-daily` 0 3 * * * (20260724000013_lgpd_cron_jobs.sql)
- `lgpd-review-reminders` 0 9 * * 1 (20260724000013_lgpd_cron_jobs.sql)
- `lgpd-sar-deadline-check` 0 */4 * * * (20260724000013_lgpd_cron_jobs.sql)
- `openclaw_events_retention_30d` 22 3 * * * (20260721155600_72a5ec4e-2f3f-4e6c-920c-6ca21ac9fa07.sql)
- `openclaw_whatsapp_retention_90d` 17 3 * * * (20260721155600_72a5ec4e-2f3f-4e6c-920c-6ca21ac9fa07.sql)
- `pg-net-smoke-hourly` 7 * * * * (20260711150423_bba9de7c-1db3-4f2d-b5b6-0d350a14cd37.sql)
- `prune-db-health-samples-daily` 20 3 * * * (20260722145902_bffbbc2f-7da7-4f0e-b6a8-be6145c81fd8.sql)
- `prune-perf-snapshots` 0 4 * * 0 (20260712110111_d29cf27d-e265-45e4-9c07-ea47c7556b1d.sql)
- `prune-wal-snapshots` 17 3 * * * (20260712221141_8e272b4f-54a1-4f81-be5c-3f8cc75c1f27.sql)
- `purge-crm-cadence-runs-daily` 17 4 * * * (20260726204455_55304cd4-8c37-46ac-85cf-57b2bdd78169.sql)
- `purge-stale-harvest-checkpoints` 17 * * * * (20260728173157_f38e019d-7b41-4e45-b713-45fdd1057cbc.sql)
- `purge-template-skill-links-daily` 20 3 * * * (20260727222828_0e04ba87-95df-4fb1-a15f-c0f1884b826b.sql)
- `refresh-agent-daily-metrics` */15 * * * * (20260711184857_ce70aa1d-6251-4af5-875c-aab67f442443.sql)
- `reset-pg-stat-statements-weekly` 0 4 * * 0 (20260722131714_a629dcc0-0085-420c-b3e8-cd4aa9ba2a44.sql)
- `retention-traces-watchdog` 5 * * * * (20260711145341_79d9091c-8cdd-400d-9a95-7be037c213ef.sql)
- `sample-rollback-stats` * * * * * (20260712220719_3fc26932-b5a6-4238-964a-fec84c988444.sql)
- `sample-wal-stats` * * * * * (20260712221141_8e272b4f-54a1-4f81-be5c-3f8cc75c1f27.sql)
- `slack-cleanup-dedupe` */15 * * * * (20260722115006_467c9efd-0632-4b3a-933a-eaf90b2302c2.sql)
- `slack-dlq-retry` */5 * * * * → edge slack-dlq-retry (20260722115149_be884e60-7f6c-4a27-ae07-ddf3f70078c6.sql)
- `slack-ephemeral-cleanup` 0 4 * * * (20260722111023_29402337-9431-4982-b960-8853ae788102.sql)
- `smoke-test-conn-every-6h` 19 */6 * * * (20260722154138_2ef2284f-1a62-42ab-86d6-2a9568b047aa.sql)
- `smoke-test-health-alerts-every-6h` 7 */6 * * * (20260722151353_92ffa439-904b-4b2a-bffd-f4f2d215c5c6.sql)
- `smoke-test-wal-every-6h` 13 */6 * * * (20260722154138_2ef2284f-1a62-42ab-86d6-2a9568b047aa.sql)
- `traces-retention-90d` 15 3 * * * (20260711144656_374ce40c-5f54-4b86-8568-64aaaf7153b0.sql)

## Integrações externas
- SDKs: Sentry, Supabase, react-query, zod
- hosts mais citados: router.huggingface.co, ai.gateway.lovable.dev, api.openai.com, openrouter.ai, api.anthropic.com, generativelanguage.googleapis.com, nexus.promobrindes.com.br, qdlnzopxrlsoljcrcmzv.supabase.co, slack.com, api-inference.huggingface.co, api.cohere.ai, api.exemplo.com, api.resend.com, api.slack.com, app.promobrindes.com.br
- webhooks recebidos: migrate-helper, openclaw-webhook, rag-embed-backfill, slack-events-webhook, whatsapp-router, widget-proxy
- env de integração (só nomes): ANTHROPIC_API_KEY, BITRIX24_CLIENT_ID, BITRIX24_CLIENT_SECRET, BITRIX24_WEBHOOK_TOKEN, COHERE_API_KEY, GITHUB_API_KEY, GITHUB_TOKEN, HF_API_TOKEN, HUGGINGFACE_API_KEY, LOVABLE_API_KEY, OPENAI_API_KEY, OPENCLAW_API_TOKEN, OPENCLAW_WEBHOOK_SECRET, OPENROUTER_API_KEY, RESEND_API_KEY, SLACK_ALERT_WEBHOOK_URL, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, TWILIO_AUTH_TOKEN, VITE_LANGFUSE_SECRET_KEY, VITE_SENTRY_DSN, WHATSAPP_API_KEY, WHATSAPP_API_URL, WHATSAPP_EVOLUTION_TOKEN, WHATSAPP_INSTANCE, WHATSAPP_META_APP_SECRET, WHATSAPP_TWILIO_AUTH_TOKEN, WHATSAPP_ZAPI_TOKEN

## Permissões / papéis
- papéis no código: user (61), button (46), system (42), status (31), alert (16), assistant (15), group (7), admin (6), listbox (6), option (6), tab (6), tablist (6), progressbar (5), radio (5), radiogroup (5), dialog (4), region (4), agent (2), anon (2), img (2), log (2), navigation (2), service_role (2), article (1), ausente (1), authenticated (1), banner (1), combobox (1), editor (1), finance (1), link (1), list (1), logistics (1), manager (1), menuitem (1), presentation (1), purchasing (1), sales (1), searchbox (1), separator (1), string (1), sup (1), superadmin (1), support (1), switch (1), textbox (1), tool (1), toolbar (1), viewer (1), workspace_admin (1)
- enums de papel: nenhum
- guards: src/components/agent-builder/GuardrailsConfig.tsx, src/components/agent-builder/GuardrailsPolicyEditor.tsx, src/components/agent-builder/modules/GuardrailsModule.tsx, src/components/agents/versioning/GuardrailsDiffPanel.tsx, src/components/layout/AuthGuard.tsx, src/components/rbac/AccessControl.tsx, src/components/rbac/ProtectedRoute.tsx, src/components/security/GuardrailPolicies.tsx, src/components/security/GuardrailsLibrary.tsx, src/components/security/GuardrailsSimulator.tsx · rotas protegidas: 39 · públicas: /, /*, /a2a, /ab-test, /agent-builder, /agent-evals, /agent-experiments, /agent-sessions, /agents, /agents/:id, /agents/:id/alerts, /agents/:id/traces, /agents/:id/versions, /agents/:id/versions/v/:versionId, /agents/installed-skills, /agents/new, /agents/swarm, /agents/templates, /agents/workflows, /ai-studio, /arena, /automation, /automations, /brain, /browser-agent, /budgets, /builder, /builder/:id, /canary, /chat, /chat/:agentId, /code-interpreter, /computer-use, /cost-optimizer, /cost-simulator, /creator-payouts, /crm, /dashboard, /data-storage, /datahub, /debugger, /deploy/openclaw, /deployments, /docs/partitioning, /docs/typography, /email-triggers, /entity-resolution, /evaluations, /fine-tuning, /governance, /graph-executions, /help/:slug, /help/:slug/:articleSlug, /help/:slug/forum, /help/:slug/forum/:threadId, /knowledge, /knowledge-decay, /knowledge-graph, /knowledge-management, /knowledge-management/article/:id, /llm-cost-by-caller, /marketplace-pro, /mcp-servers, /memory, /mobile-sdk, /monitoring, /monitoring/metrics, /nlp, /observability, /observability/cost-anomalies, /observability/game-days, /observability/game-days/:id/live, /observability/oncall, /observability/playbooks, /observability/postmortems, /observability/postmortems/:id, /observability/slo, /observability/synthetic, /openclaw, /openclaw/templates, /oracle, /orchestration, /prompts, /prompts/:id, /prompts/experiments, /replay, /reset-password, /routing, /search, /security/chaos-experiments, /share/n, /simulation, /skills, /skills/audit, /skills/composer, /skills/library, /smolagent, /super-cerebro, /super-cerebro/e2ee-simulacao, /super-cerebro/n/:notebookId/note/:noteId, /synthetic-data, /system-jobs, /tools, /traces, /vendas, /vision, /voice, /voice-agents, /voice-telephony, /webhook-events, /widget-builder, /workflows
- feature flags: ENABLE_AUTO_CLASSIFY, ENABLE_HF_RERANKER, ENABLE_LANGUAGE_DETECTION, ENABLE_ML_INJECTION_CHECK, ENABLE_TOXICITY_CHECK, ENABLE_AGENTIC_GUARDRAIL, ENABLE_EMOTION_DETECTION, ENABLE_HALLUCINATION_CHECK, ENABLE_HF_EMBEDDINGS, ENABLE_KEYPHRASE_EXTRACTION, ENABLE_OUTPUT_TOXICITY, ENABLE_PII_ML, FEATURE_X, nova-tela, novo-inbox

## Alertas (baseline.json → alertas)
- rotas_sem_arquivo: 0
- componentes_ambiguos: 0
- menu_sem_destino: 7 — ex.: Coleções -> collections, Especialistas -> experts, Fatos -> facts
- edges_orfas: 6 — ex.: bitrix24-api, bitrix24-oauth, guardrails-engine
- edges_chamadas_sem_pasta: 0
- tabelas_sem_rls: 9 — ex.: agent_traces_v2_2026_11, agent_traces_v2_2026_12, agent_traces_v2_2027_01
- tabelas_usadas_sem_definicao: 0
- tabelas_com_drift_migration_vs_types: 41 — ex.: agent_installed_skills, agent_memories, agent_memories_v2
- rpcs_sem_definicao: 1 — ex.: exec_sql
- componentes_orfaos: 36 — ex.: src/components/agents/AgentCardGrid.tsx, src/components/agents/detail/SLOPanel.tsx, src/components/agents/wizard/WizardStepComponents.tsx
- componentes_com_nome_duplicado: 18 — ex.: AddressCard, CommandPalette, CrossDbResults
- scripts_orfaos: 0
- env_usadas_nao_declaradas: 5 — ex.: DEV, MODE, PROD
- ciclos_de_import: 1
- possiveis_segredos_no_codigo: 2 — ex.: scripts/ai-context/cenarios.mjs:102, scripts/ci/inventario-banco.unit.mjs:138

## Grafo de código (graphify)
- 13781 nós · 36998 arestas · 894 comunidades · grafo do commit `f6a5b20d`
- comunidades maiores: button.tsx (334), lucide-react (324), PageHeader.tsx (163), App.tsx (154), logger.ts (147), cn (132), ref_https (124), checkRateLimit (121), templateSkillLinkService.ts (117), SkillHarvestPage.tsx (113), 🚀 Nexus Agents Studio — Análise Exaustiva de Funcionalidades (110), skillEnrichmentService.ts (98)
- símbolos mais chamados: cn() (src/lib/utils.ts), fromTable() (src/lib/supabaseExtended.ts), getWorkspaceId() (src/lib/agentService.ts), useAuth() (src/contexts/AuthContext.tsx), q() (scripts/supabase_snapshot/snapshot.py), useAgentBuilderStore (src/stores/agentBuilderStore.ts), useCerebroStore (src/stores/cerebroStore.ts), useWorkspaceId() (src/hooks/use-data.ts), useCurrentWorkspace() (src/hooks/useCurrentWorkspace.ts), useToast() (src/hooks/use-toast.ts), .collect() (scripts/supabase_snapshot/test_snapshot.py), excluded_sql() (scripts/supabase_snapshot/snapshot.py)
- consulta local: `graphify query "<pergunta>"`, `graphify path "<A>" "<B>"`, `graphify explain "<X>"`

## Hotspots (arquivos mais alterados, 90 dias)
- package-lock.json (19)
- package.json (19)
- supabase/deployment-manifest.json (8)
- .github/workflows/ci.yml (7)
- AGENTS.md (4)
- supabase/functions/agent-workflow-runner/index.ts (4)
- supabase/functions/llm-gateway/index.ts (4)
- supabase/functions/voice-synthesize/index.ts (4)
- CHANGELOG.md (3)
- ESTADO-ATUAL.md (3)
- supabase/functions/code-interpreter-execute/index.ts (3)
- supabase/functions/crm-enrich/index.ts (3)
- supabase/functions/datahub-query/index.ts (3)
- supabase/functions/global-search/index.ts (3)
- supabase/functions/graph-execute/index.ts (3)

## Workflows
- `automation-local.yml` — Automação local (pull_request, push, workflow_dispatch)
- `ci.yml` — Nexus CI (pull_request, push, workflow_dispatch)
- `codeql.yml` — CodeQL (pull_request, push, schedule; cron 17 5 * * 1)
- `contexto.yml` — Contexto para agentes de IA (10 min) (push, schedule, workflow_dispatch; cron 3-59/10 * * * *)
- `guards.yml` — Guards (pull_request, push, workflow_dispatch)
- `inventario-estado-semanal.yml` — Inventário do estado real (semanal) (schedule, workflow_dispatch; cron 23 10 * * 1)
- `release-drafter.yml` — release-drafter (pull_request, push)

## Scripts npm
- `maintenance:doctor`: `sh scripts/maintenance/run.sh doctor --root .`
- `maintenance:check`: `sh scripts/maintenance/run.sh check --root . --ref origin/main`
- `maintenance:heal`: `sh scripts/maintenance/run.sh heal --root . --ref origin/main`
- `test:maintenance`: `node --test scripts/maintenance/maintenance.unit.mjs`
- `dev`: `vite`
- `build`: `vite build`
- `build:dev`: `vite build --mode development`
- `build:analyze`: `vite build && echo 'Open dist/bundle-report.html in your browser'`
- `check:bundle`: `node scripts/check-bundle-size.mjs`
- `docs:pdf`: `node scripts/generate-audit-pdf.mjs`
- `lint`: `eslint .`
- `typecheck`: `tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json`
- `preview`: `vite preview`
- `test`: `vitest run`
- `test:watch`: `vitest`
- `test:coverage`: `vitest run --coverage`
- `test:coverage:ci`: `vitest run --coverage --reporter=verbose`
- `test:rls`: `vitest run --config vitest.rls.config.ts`
- `lhci`: `lhci autorun`
- `lhci:mobile`: `lhci autorun --config=./lighthouserc.mobile.json`
- `lhci:local`: `vite build && lhci autorun && lhci autorun --config=./lighthouserc.mobile.json`
- `test:e2e`: `playwright test`
- `test:e2e:ui`: `playwright test --ui`
- `test:e2e:auth`: `playwright test e2e/auth-flows.spec.ts`
- `test:e2e:visual`: `playwright test e2e/visual.spec.ts`
- `test:e2e:update`: `playwright test --update-snapshots`
- `test:load`: `k6 run tests/load/llm-gateway.k6.js`
- `test:load:smoke`: `k6 run --vus 1 --duration 30s tests/load/llm-gateway.k6.js`
- `prepare`: `husky`
- `automation:doctor`: `node scripts/automation.mjs doctor`
- `automation:test`: `node scripts/automation.mjs test`
- `automation:check`: `node scripts/automation.mjs check --ref HEAD`
- `automation:heal`: `node scripts/automation.mjs heal --ref origin/main`
- `automation:nightly`: `node scripts/automation.mjs nightly --ref origin/main`
- `automation:graph`: `node scripts/automation.mjs graph`
- `automation:status`: `node scripts/automation.mjs graph status`
- `automation:install-hooks`: `node scripts/automation.mjs install-hooks`
- `automation:uninstall-hooks`: `node scripts/automation.mjs uninstall-hooks`

## Documentos (raiz e docs/)
- `.github/PULL_REQUEST_TEMPLATE.md` (31 linhas)
- `.github/pull_request_template.md` (26 linhas)
- `AGENTS.md` — AGENTS.md — Fator X V2 (Nexus Agents Studio) (123 linhas)
- `BACKLOG-10-10.md` — 🎯 Backlog 10/10 — Nexus Agents Studio / FATOR X (166 linhas)
- `CHANGELOG.md` — Changelog (190 linhas)
- `CLAUDE.md` (2 linhas)
- `CODE_OF_CONDUCT.md` — Código de Conduta — Contributor Covenant v2.1 (64 linhas)
- `CONTRIBUTING.md` — Guia de Contribuição — Nexus / Agent Studio (53 linhas)
- `COVERAGE-REPORT.md` — 📊 Coverage Report — Nexus Agents Studio / FATOR X (101 linhas)
- `DESIGN.md` — 🎨 DESIGN.md — Nexus Agents Studio / FATOR X (516 linhas)
- `ESTADO-ATUAL.md` — ESTADO ATUAL DO SISTEMA — Fator X V2 / Nexus Agents Studio (468 linhas)
- `FUNCIONALIDADES-DO-SISTEMA.md` — 🚀 Nexus Agents Studio — Funcionalidades do Sistema (712 linhas)
- `GAP-ANALYSIS-GITHUB-TOPICS-AGENT-2026-04-05.md` — 🔍 ANÁLISE EXAUSTIVA: GitHub /topics/agent vs NEXUS AGENTS STUDIO (183 linhas)
- `HANDOFF-AGENTIC-FRAMEWORK-ANALYSIS.md` — 🔄 HANDOFF: Análise Exaustiva GitHub /topics/agentic-framework (245 linhas)
- `HANDOFF-AUTOMATION-ANALYSIS.md` — 🔄 HANDOFF: Análise Exaustiva GitHub /topics/automation (327 linhas)
- `NEXUS-AUDITORIA-FRONTEND-COVERAGE.md` — 🔍 AUDITORIA: COBERTURA FRONTEND vs BACKEND (92 linhas)
- `NEXUS-GAP-ANALYSIS-AUTOMATION.md` — 📊 Gap Analysis: GitHub /topics/automation vs Nexus Agents Studio (184 linhas)
- `NEXUS-RELATORIO-TESTES-ABRANGENTE-V2.md` — 🧪 RELATÓRIO QA TOTAL V2 — NEXUS AGENTS STUDIO (108 linhas)
- `NEXUS-RELATORIO-TESTES-ABRANGENTE-V3.md` — Nexus QA — Relatório V3 (Hardening Final) (47 linhas)
- `NEXUS-RELATORIO-TESTES-ABRANGENTE-V4.md` — Nexus QA — Relatório V4 (Excelência Absoluta) (48 linhas)
- `NEXUS-RELATORIO-TESTES-ABRANGENTE-V5.md` — 🏆 NEXUS — RELATÓRIO V5 (Sprint Polish Arquitetural) (65 linhas)
- `NEXUS-RELATORIO-TESTES-ABRANGENTE-V6.md` — NEXUS — Relatório de Testes Abrangente V6 (62 linhas)
- `NEXUS-RELATORIO-TESTES-ABRANGENTE.md` — 🧪 RELATÓRIO DE TESTES ABRANGENTE — NEXUS AGENTS STUDIO (110 linhas)
- `README.md` — ⚡ Nexus Agents Studio (77 linhas)
- `RELATORIO-FINAL-50-ETAPAS.md` — RELATÓRIO FINAL — PLANO 50-ETAPAS-10-10 (379 linhas)
- `SECURITY.md` — Política de Segurança — Nexus Agents Studio (73 linhas)
- `docs/AGENTES-A-IMPLEMENTAR.md` — 🤖 Agentes a Implementar — Fator X / Promo Brindes (323 linhas)
- `docs/ARQUITETURA-BIBLIOTECA-SKILLS.md` — Arquitetura da Biblioteca de Skills (57 linhas)
- `docs/AUDITORIA-BACKEND-SENIOR.md` — Auditoria Enterprise — Back-End Sênior · Fator X (Nexus) (255 linhas)
- `docs/AUDITORIA_BACKEND_2026-07-12.md` — 🔍 Auditoria Back-End Exaustiva — Nexus / Fator X (256 linhas)
- `docs/AUDITORIA_NEXUS_10-10.md` — 🔬 AUDITORIA TÉCNICA EXAUSTIVA — NEXUS AGENTS STUDIO (225 linhas)
- `docs/AUTOGRAPH-MEMORY-LAYER.md` — Autograph Memory Layer — Guia Técnico (66 linhas)
- `docs/AUTOGRAPH-SIMULATION-2026-07-21.md` — Autograph Memory Layer — Simulação de Cenários (2026-07-21) (84 linhas)
- `docs/AUTOMACAO_LOCAL.md` — Automação local — Fator_X_V2 (74 linhas)
- `docs/CHECKLIST-COMPLETO-LOVABLE-vs-CODIGO-REAL.md` — 🔍 CHECKLIST EXAUSTIVO — O QUE O LOVABLE DEVE TER CRIADO (841 linhas)
- `docs/CONTRIBUTING.md` — 🛠 Contributing — Nexus Agents Studio (18 linhas)
- `docs/DATA-DICTIONARY.md` — Data Dictionary (Core Tables) (24 linhas)
- `docs/EDGE-FUNCTIONS-AUDIT-2026-07-21.md` — Auditoria de Edge Functions — Fator X (217 linhas)
- `docs/FASE10-PERFORMANCE-INSIGHTS.md` — Fase 10 — Performance Insights & Auto-EXPLAIN (36 linhas)
- `docs/FASE11-TIMESERIES-DASHBOARD.md` — Fase 11 — Séries temporais WAL/Conexões + EXPLAIN 1-clique (28 linhas)
- `docs/FASE12-PROACTIVE-TRENDS.md` — Fase 12 — Alertas Proativos de Tendência (44 linhas)
- `docs/FASE13-SMOKE-TEST-ALERTS.md` — Fase 13 — Smoke Test Automatizado dos Alertas de Tendência (chaos-lite) (47 linhas)
- `docs/FASE14-SMOKE-COVERAGE-SLO.md` — Fase 14 — Smoke Coverage Estendido + Painel SLO dos Detectores (50 linhas)
- `docs/FASE15-SLO-BREACH-SLACK-DISPATCH.md` — Fase 15 — Dispatch automático para Slack quando SLO dos detectores quebra (52 linhas)
- `docs/FASE6-HARDENING-FINAL.md` — 🏁 Fase 6 — Hardening Final (Rumo ao 10/10) (40 linhas)
- `docs/FASE7-HARDENING-POS-10-10.md` — 🏁 Fase 7 — Hardening Pós-10/10 (Slack DLQ + DB Health) (31 linhas)
- `docs/FASE8-OBSERVABILIDADE-PROFUNDA.md` — Fase 8 — Observabilidade Profunda e Auto-Drenagem (42 linhas)
- `docs/FASE8-TEST-REPORT.md` — 📊 Relatório de Testes — Fase 8 (Observabilidade Profunda) (78 linhas)
- `docs/FASE9-PERF-TUNING.md` — Fase 9 — Perf Tuning e Alerting Automático de Queries Lentas (55 linhas)
- `docs/FUNCIONALIDADES-SEM-INTERFACE-VISUAL-V2.md` — 🕳️ Funcionalidades sem Interface Visual Completa — V2 (234 linhas)
- `docs/FUNCIONALIDADES-SEM-INTERFACE-VISUAL.md` — 🕳️ Funcionalidades sem Interface Visual Completa (194 linhas)
- `docs/FUNCIONALIDADES-SISTEMA-COMPLETO.md` — 🚀 Nexus Agents Studio — Análise Exaustiva de Funcionalidades (366 linhas)
- `docs/GAP-ANALYSIS-CLASSE-MUNDIAL-2026.md` — 🌍 Análise de Gaps — Classe Mundial vs Nexus Agents Studio (433 linhas)
- `docs/HYBRID-SEARCH-V2-SIMULATION-2026-07-21.md` — Simulação — Retrieval Híbrido v2 (pgvector) no `oracle-research` (29 linhas)
- `docs/ONBOARDING.md` — 🚀 Onboarding — Nexus Agents Studio (33 linhas)
- `docs/QA-BASELINE-2026-07-15.md` — QA Baseline — 2026-07-15 (Fase 1 completa) (24 linhas)
- `docs/QA-SIM-2026-07-21.md` — QA Simulação Exaustiva — 2026-07-21 (77 linhas)
- `docs/RUNBOOK.md` — Nexus Agents Studio — Runbook Operacional (1186 linhas)
- `docs/SIMULACAO-CENARIOS-2026-07-22.md` — Simulação de Cenários — Slack Integration (2026-07-22) (51 linhas)
- `docs/SIMULACAO-CENARIOS-FASE6.md` — 🧪 Simulação Fase 6 — 200 cenários auditados (84 linhas)
- `docs/SIMULACAO-CENARIOS-FASE7.md` — 🧪 Simulação Fase 7 — 120 cenários pós-10/10 (63 linhas)
- `docs/SIMULACAO-SUPER-CEREBRO-2026-07-22.md` — 🧪 Simulação — Super Cérebro NotebookLM + Obsidian (2026-07-22) (107 linhas)
- `docs/SIMULACAO-SUPER-CEREBRO-V1.5-2026-07-22.md` — Simulação — Super Cérebro v1.5.0 (102 linhas)
- `docs/SKILLS-10-10-2026-07-23.md` — Skills de Agentes — Rumo ao 10/10 (59 linhas)
- `docs/SLACK-INTEGRATION.md` — Integração Slack — Documentação Técnica (88 linhas)
- `docs/TYPOGRAPHY-MIGRATION-REPORT.md` — Relatório da Migração de Tipografia — Fator X (79 linhas)
- `docs/prod-readiness.md` (59 linhas)
- subpastas de docs/: docs/auditoria-estado-2026-08 (11), docs/adr (7), docs/agentes (6), docs/architecture (2), docs/contexto (2), docs/runbooks (2), docs/migration (1)
- CHANGELOG topo: [1.6.1] - 2026-09-05

## Últimos commits
- 2026-11-14 `f6a5b20d` feat(validacao): adiciona zod as rotas de entrada do auth (#92)
- 2026-11-14 `715e9cd5` fix(ci): k6 do llm-gateway conta só 5xx/rede como falha (#88)
- 2026-11-14 `067d5656` docs: adiciona inventario de prontidao de producao (main f618216) (#89)
- 2026-11-13 `f6182168` feat(llm-gateway): adiciona fallback OPENROUTER_API_KEY no env (#87)
- 2026-11-13 `8e722da7` fix(ci): sobe node-version para 22 nos jobs npm (#86)
- 2026-11-13 `c1ba2138` chore(lint): zerar erros do ESLint (13 → 0) (#85)
- 2026-11-12 `46af5baa` fix(edge): corrige erros de tipagem em webhooks (#84)
- 2026-11-12 `12be1922` fix(tiptap): alinha extensoes para v3 e remove Link duplicada do StarterKit (#65)
- 2026-11-12 `81afc708` chore(deps-dev)(deps-dev): bump the dev-dependencies group across 1 directory with 7 updates (#72)
- 2026-11-12 `d41db745` chore(deps)(deps): bump @sentry/react from 10.73.0 to 11.11.0 in the sentry group across 1 directory (#63)
- 2026-11-12 `ba8344c3` chore(ci): atualiza comentario do SUPABASE_ACCESS_TOKEN no inventario semanal (#79)
- 2026-11-12 `1033b2fe` fix(cors): adiciona *.vercel.app ao ALLOWED_ORIGIN_PATTERNS
- 2026-11-11 `60e36b81` feat(notificacao): envio real de e-mail via Resend no notification-sender (#82)
- 2026-11-11 `d53c9e3c` fix(widget): widget de chat funciona em site de cliente e chave de API volta a validar (#81)
- 2026-11-11 `b8f1e832` feat(edge): troca o Lovable AI Gateway pelo DeepSeek nas edges de texto (#78)

## Arquivos deste diretório
- `docs/contexto/codigo/rotas.json`
- `docs/contexto/codigo/modulos.json`
- `docs/contexto/codigo/componentes.json`
- `docs/contexto/codigo/hooks.json`
- `docs/contexto/codigo/edge-functions.json`
- `docs/contexto/codigo/banco.json`
- `docs/contexto/codigo/ferramentas.json`
- `docs/contexto/codigo/scripts.json`
- `docs/contexto/codigo/testes.json`
- `docs/contexto/codigo/logica.json`
- `docs/contexto/codigo/grafo.json`
- `docs/contexto/codigo/grafo-arestas.json`
- `docs/contexto/codigo/convencoes.json`
- `docs/contexto/codigo/grafo-graphify.json`
- `docs/contexto/codigo/baseline.json`
- `docs/contexto/codigo/manifest.json` (commit, data, hashes, erros — único arquivo com data/hora)
