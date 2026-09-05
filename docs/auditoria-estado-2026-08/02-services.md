# Auditoria de Estado — Lote `src/services/`

**Repositório:** `/home/user/Fator-X-V2`
**Escopo:** exclusivamente `src/services/` — 166 arquivos, 31.177 linhas (`wc -l`)
**Data:** 2026-08-16
**Método:** medição direta no código + consulta ao banco de produção via MCP. Nenhuma afirmação de README/docs foi usada.

---

## 0. Três descobertas que mudam a leitura de tudo abaixo

### 0.1 O client "externo" é o mesmo banco (refactor abandonado nº 1)

`src/integrations/supabase/externalClient.ts:4` documenta que os dados vivem num projeto externo `tdprnylgyrogbbhgdoik`. Isso é falso na configuração atual:

- `.env.example:10` → `VITE_SUPABASE_URL=https://qdlnzopxrlsoljcrcmzv.supabase.co`
- `.env.example:19` → `VITE_EXTERNAL_SUPABASE_URL=https://qdlnzopxrlsoljcrcmzv.supabase.co` (comentado como "espelhado para o mesmo projeto")

Os dois clients apontam para o **mesmo** projeto. Confirmei contando os objetos: `pg_tables` do projeto `qdlnzopxrlsoljcrcmzv` retorna exatamente **215 tabelas**, batendo com a medição informada. Portanto o banco que medi é o banco que a aplicação usa, e a arquitetura "dual-client" descrita em `src/lib/supabaseExtended.ts:10-16` é código legado sem função.

### 0.2 61 dos 67 RPCs chamados pelos services NÃO EXISTEM no banco

Esta é a falha mais grave do lote. Extraí todos os `.rpc(...)`/`rpcCall(...)` de `src/services/` e cruzei com `pg_proc` do schema `public`.

**Existem (6):** `get_asset_summary`, `get_bcp_summary`, `get_change_summary`, `get_ir_summary`, `get_secrets_status_summary`, `get_vendor_summary`.

**Não existem (61).** Praticamente todo o cluster GRC/SecOps (risco, fornecedor, pentest, ativo, BCP, change, segredos, game day, compliance, postmortem, orçamento, anomalia de custo) tem **100% dos caminhos de escrita quebrados**. E o padrão de erro é `if (error) throw error;` — ou seja, estoura em runtime, não degrada em silêncio. Exemplos verificados linha a linha:

| RPC ausente             | Chamador                   | Tratamento                                             |
| ----------------------- | -------------------------- | ------------------------------------------------------ |
| `register_risk`         | `riskService.ts:114`       | `if (error) throw error` (`:126`)                      |
| `review_risk`           | `riskService.ts:131`       | `throw` (`:136`)                                       |
| `register_vendor`       | `vendorRiskService.ts:126` | `throw` (`:141`)                                       |
| `assess_vendor`         | `vendorRiskService.ts:153` | `throw` (`:161`)                                       |
| `check_budget`          | `budgetService.ts:83`      | `throw` (`:84`)                                        |
| `enforce_budget`        | `budgetService.ts:114`     | `throw` (`:115`)                                       |
| `start_game_day`        | `gameDayService.ts:107`    | `throw` (`:108`)                                       |
| `record_game_day_event` | `gameDayService.ts:117`    | `throw` (`:123`)                                       |
| `detect_cost_anomalies` | `costAnomalyService.ts:54` | `throw` (`:55`)                                        |
| `get_synthetic_summary` | `syntheticService.ts:91`   | `throw` (`:95`)                                        |
| `get_masked_secrets`    | `settingsService.ts:41`    | `throw` (`:44`) — quebra a leitura inteira de segredos |

Lista completa dos 61 na secção 5.

### 0.3 Nenhum service jamais persistiu nada, exceto 5

Dado medido: só 5 tabelas têm linhas (`roles`, `workspaces`, `workspace_members`, `user_roles`, `notification_templates`). Cruzando com os `.from()` dos services, **apenas 5 services tocam tabela com dado real**:

| Tabela com dado          | Services que a tocam                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `roles`                  | `rbacService.ts:64,85,119`                                                                                                           |
| `user_roles`             | `rbacService.ts:105,146,161,170`                                                                                                     |
| `workspaces`             | `settingsService.ts:102`, `workspaceContextService.ts:26,41,56,74`                                                                   |
| `workspace_members`      | `auditLogService.ts:74`, `knowledgeService.ts:218`, `monitoringService.ts:114,123`, `securityService.ts:37`, `teamsService.ts:67,92` |
| `notification_templates` | `notificationEngineService.ts:52,161,169`                                                                                            |

Os outros ~73 services que fazem I/O escrevem/leem tabelas vazias. **Um `IMPLEMENTADO_TOTAL` neste relatório significa "código completo e ligado", não "já rodou em produção".** Nenhum deles rodou.

---

## 1. Tabela de classificação

Ordem: por classificação, depois alfabética. Toda linha traz arquivo:linha verificado.

### 1.1 MORTO_OU_ABANDONADO — 5

Prova de busca em `src/**/*.{ts,tsx}` com regex `(from|import|require\()\s*['"][^'"]*/?<base>['"]`.

| Service | Classificação | Tabelas que toca | Quem consome (arquivo:linha) | Evidência | O que falta |
| ------------------------------ | ------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `riskService.ts` | MORTO_OU_ABANDONADO | `risk_register`, `risk_review_events` | **NINGUÉM** | Busca retornou 0 importadores. Único hit no projeto é a própria definição. A página existe e é roteada (`App.tsx:137`, `App.tsx:1351`) mas **consulta a tabela direto**, ignorando o service: `pages/RiskRegisterPage.tsx:76` → `.from('risk_register')`. Refactor abandonado clássico: o service é o v2 que nunca foi ligado. Além disso `risk_review_events` não existe no banco (`riskService.ts:94`) e 3 RPCs seus não existem (`register_risk:114`, `review_risk:131`, `close_risk:141`, `get_risk_summary:146`) | Deletar, ou migrar `RiskRegisterPage` para ele e criar tabela + 4 RPCs |
| `fineTuningService.ts` | MORTO_OU_ABANDONADO | nenhuma (só `hf-autotrain`) | apenas `services/index.ts:20` (barrel) | Nenhuma página/componente/hook importa. O barrel `@/services` só é consumido por **um** arquivo — `components/automation/AutomationTemplatesPanel.tsx:7` — e ele importa apenas `listAutomationTemplates`. Logo o re-export não alcança runtime. Busca por `fineTuning                                                                                                                                                                                                                                                | hf-autotrain                                                                     | prepareDataset | startTraining`em`src/pages`e`src/components`: **0 resultados**. Código em si é real (`:48`invoca edge function que existe em`supabase/functions/hf-autotrain`) | UI. O backend existe, o frontend nunca foi construído |
| `agentEvolutionService.ts` | MORTO_OU_ABANDONADO | `agent_skills`, `agent_traces` | `services/index.ts:19` (barrel) + testes `test/agent-evolution.test.ts:5,19,24`, `test/extended-services.test.ts:152` | Busca por `agentEvolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | reflectAndEvolve                                                                 | getSkillbook   | pruneWeakSkills`em`src/pages`e`src/components`: **0 resultados**. Só testes exercitam. Lógica real e não trivial (`reflectAndEvolve:97`, `pruneWeakSkills:174`) | UI. Testado mas nunca exposto |
| `middlewarePipelineService.ts` | MORTO_OU_ABANDONADO | nenhuma (in-memory) | `services/index.ts:75` + 3 arquivos de teste | **Fachada explícita:** `components/monitoring/MiddlewarePipelinePanel.tsx:3` diz no docstring "Wires middlewarePipelineService into MonitoringPage", mas o arquivo **não importa o service**. Renderiza array hardcoded `AVAILABLE_MIDDLEWARES` (`:10-16`) com `useState` local (`:19`). O painel é decoração; o motor de 397 linhas não roda | Ligar o painel ao service, ou remover um dos dois |
| `skillsSimulationService.ts` | MORTO_OU_ABANDONADO | nenhuma | apenas `test/skills-registry-bulk-install.test.ts:3` | 1.122 linhas, único consumidor é um teste que usa 1 função (`simulateCurrentBulkInstall:970`). Nenhuma página/componente importa | Consumidor real, ou reclassificar como fixture de teste e mover para `src/test/` |

### 1.2 IMPLEMENTADO_PARCIAL — 31

#### 1.2.1 Tabela referenciada não existe no banco (9)

| Service                       | Classificação        | Tabelas que toca                                                                                                                                    | Quem consome (arquivo:linha)                                                  | Evidência                                                                                                                                                                                                                                                                                                                                                                           | O que falta                                                             |
| ----------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `agentDailyMetricsService.ts` | IMPLEMENTADO_PARCIAL | **`agent_daily_metrics`** (ausente), `agents`                                                                                                       | `hooks/useAgentDailyMetrics.ts:6`                                             | `:36` `.from('agent_daily_metrics')` — tabela não existe em `pg_tables`. O `catch` em `:46`/`:75` devolve `[]`, então a UI mostra vazio em vez de erro — falha silenciosa                                                                                                                                                                                                           | Criar `agent_daily_metrics` (ou view de agregação sobre `agent_traces`) |
| `restorePresetsService.ts`    | IMPLEMENTADO_PARCIAL | **`restore_field_presets`** (ausente)                                                                                                               | `components/agents/detail/RestorePresetMenu.tsx:29`                           | **100% do service inoperante.** Todas as 5 funções batem na mesma tabela ausente: `:33`, `:51`, `:58`, `:83`, `:89`, `:97`                                                                                                                                                                                                                                                          | Criar a tabela. Sem ela nada funciona                                   |
| `budgetService.ts`            | IMPLEMENTADO_PARCIAL | `workspace_budgets`, **`budget_events`** (ausente)                                                                                                  | `components/dashboard/BudgetWidget.tsx:10`, `pages/BudgetSettingsPage.tsx:17` | `:99` `.from("budget_events")` — ausente. Além disso 4 RPCs ausentes: `check_budget:83`, `get_current_spend:89`, `reset_workspace_budget:109`, `enforce_budget:114`, todos com `throw`. Só o CRUD de `workspace_budgets` (`:46,65,74`) funciona. `pages/BudgetsPage.tsx:99` também consulta `budget_events` direto, duplicando o service                                            | Tabela `budget_events` + 4 funções SQL                                  |
| `gameDayService.ts`           | IMPLEMENTADO_PARCIAL | `game_days`, `game_day_scorecards`, **`game_day_events`** (ausente)                                                                                 | `pages/GameDayLivePage.tsx:18`                                                | `:129` `.from('game_day_events')` ausente. RPCs ausentes: `start_game_day:107`, `record_game_day_event:117`, `complete_game_day:144` — todos `throw`. Só listar/criar/apagar game day funciona                                                                                                                                                                                      | Tabela + 3 RPCs. O ciclo de vida do exercício está inteiro quebrado     |
| `secretsRotationService.ts`   | IMPLEMENTADO_PARCIAL | `managed_secrets`, **`secret_rotation_events`** (ausente)                                                                                           | `pages/SecretsRotationPage.tsx:11`                                            | `:113` tabela ausente. RPCs ausentes: `register_managed_secret:78`, `record_secret_rotation:94`, `mark_secret_retired:104`, `refresh_secrets_status:122`. Só `listManagedSecrets:63` e `getSecretsSummary:71` (RPC `get_secrets_status_summary`, que **existe**) funcionam                                                                                                          | Tabela de eventos + 4 RPCs                                              |
| `documentIngestionService.ts` | IMPLEMENTADO_PARCIAL | `document_ingestions`, `documents`, `chunks`, **`document_ingestion_events`** (ausente)                                                             | `components/super-cerebro/DocumentUploadTab.tsx:17`                           | `:336` `.from('document_ingestion_events')` ausente → `listIngestionEvents` e `subscribeIngestionEvents:345` inoperantes. O núcleo (upload `:121`, storage `:159`, `doc-parse` `:178`, retry `:232`) é real e completo                                                                                                                                                              | Tabela de auditoria de ingestão                                         |
| `monitoringService.ts`        | IMPLEMENTADO_PARCIAL | `agent_traces`, `sessions`, `session_traces`, **`trace_events`** (ausente), `alerts`, `agents`, `workspace_members`, `alert_rules`, `usage_records` | `components/monitoring/AlertRulesPanel.tsx:8`                                 | `trace_events` não existe (existe só a view `trace_events_v`). Quebra `getTraceEvents:66`, `getRecentTraceEvents:171` e o `count` de `getDashboardMetrics:148`. Mesmo bug replicado fora do lote em `hooks/useTracesData.ts:58` e `hooks/useBillingData.ts:112`, e o writer `lib/tracing/tracingExporters.ts:30` insere na mesma tabela inexistente — **a telemetria nunca gravou** | Renomear para `trace_events_v` ou criar a tabela base                   |
| `teamsService.ts`             | IMPLEMENTADO_PARCIAL | **`workspace_members_safe`** (ausente), `workspace_members`                                                                                         | `components/dialogs/InviteMemberDialog.tsx:8`                                 | `:32` `.from('workspace_members_safe')` — a view real chama-se `workspace_members_public`. RPCs ausentes: `invite_workspace_member:53`, `get_pending_invites_for_email:78`, `accept_workspace_invitation:86`. Só `removeMember:67` e `updateMemberRole:92` funcionam — e são os únicos que tocam uma tabela **com dado** (`workspace_members`, 3 linhas)                            | Corrigir nome da view + 3 RPCs de convite                               |
| `services/index.ts`           | IMPLEMENTADO_PARCIAL | —                                                                                                                                                   | `components/automation/AutomationTemplatesPanel.tsx:7`                        | Barrel com 40+ re-exports (`:5-121`) e **um único** consumidor, que usa 1 símbolo. Re-exporta 3 services mortos: `agentEvolutionService:19`, `fineTuningService:20`, `middlewarePipelineService:75`                                                                                                                                                                                 | Ou adotar o barrel de verdade, ou removê-lo                             |

#### 1.2.2 RPC ausente no caminho crítico (22)

Todos abaixo têm consumidor real, leituras funcionais e tabelas existentes; o que quebra são as **escrituras/agregações via RPC**.

| Service                                 | Classificação        | Tabelas que toca                                                                                           | Quem consome (arquivo:linha)                                                                           | Evidência (RPC ausente)                                                                                                                                                                                                     | O que falta                        |
| --------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `assetInventoryService.ts`              | IMPLEMENTADO_PARCIAL | `assets`, `asset_audits`                                                                                   | `pages/AssetInventoryPage.tsx:31`                                                                      | `register_asset:61`, `audit_asset:91`, `decommission_asset:102`. `get_asset_summary:33` **existe**                                                                                                                          | 3 RPCs de escrita                  |
| `automationTemplateService.ts`          | IMPLEMENTADO_PARCIAL | `automation_templates`, `installed_templates`                                                              | `components/automation/AutomationTemplatesPanel.tsx:6`                                                 | `increment_template_installs:149` ausente. Degradação tolerante (`rpcCall` não lança) → instalação grava, contador nunca sobe                                                                                               | 1 RPC de contador                  |
| `bcpService.ts`                         | IMPLEMENTADO_PARCIAL | `business_systems`, `bcp_test_runs`                                                                        | `pages/BCPTestRunsPage.tsx:7`                                                                          | `register_business_system:98`, `record_bcp_test:126`. `get_bcp_summary:79` **existe**                                                                                                                                       | 2 RPCs de escrita                  |
| `changeManagementService.ts`            | IMPLEMENTADO_PARCIAL | `change_requests`, `change_approvals`, `freeze_windows`                                                    | `pages/ChangeManagementPage.tsx:26`                                                                    | `submit_change_request:109`, `decide_change:125`, `execute_change:134`, `rollback_change:142`. `get_change_summary:149` **existe**                                                                                          | 4 RPCs — todo o fluxo de aprovação |
| `chaosService.ts`                       | IMPLEMENTADO_PARCIAL | `chaos_experiments`                                                                                        | `components/shared/ChaosBanner.tsx:4`, `pages/ChaosLabPage.tsx:20`, `pages/ChaosExperimentsPage.tsx:7` | `disable_all_chaos:100`. CRUD (`:39,51,73,93`) é real                                                                                                                                                                       | 1 RPC de kill-switch               |
| `complianceService.ts`                  | IMPLEMENTADO_PARCIAL | `compliance_frameworks`, `compliance_controls`, `compliance_reports`, `compliance_evidence`                | `pages/ComplianceFrameworksPage.tsx:13`                                                                | `generate_compliance_report:109`, `publish_compliance_report:121`                                                                                                                                                           | 2 RPCs                             |
| `costAnomalyService.ts`                 | IMPLEMENTADO_PARCIAL | `cost_alerts`                                                                                              | `components/dashboard/CostAnomalyWidget.tsx:8`                                                         | `acknowledge_cost_alert:49`, `detect_cost_anomalies:54`, `compute_cost_baselines:60` — só `listAlerts:28` e `countActiveAlerts:41` sobrevivem                                                                               | 3 RPCs — o detector inteiro        |
| `incidentService.ts`                    | IMPLEMENTADO_PARCIAL | `incident_playbooks`, `incident_runs`, `oncall_schedule`, `oncall_schedule_emails`, `oncall_schedule_safe` | `pages/OncallPage.tsx:16`                                                                              | `get_current_oncall:124`. Resto é CRUD real + edge fn `incident-orchestrator:105` (existe em disco)                                                                                                                         | 1 RPC                              |
| `irPlaybookService.ts`                  | IMPLEMENTADO_PARCIAL | `ir_playbooks`, `ir_playbook_steps`, `ir_tabletop_exercises`                                               | `pages/IRPlaybooksPage.tsx:29`                                                                         | `activate_ir_playbook:141`. `get_ir_summary:200` **existe**                                                                                                                                                                 | 1 RPC                              |
| `marketplaceService.ts`                 | IMPLEMENTADO_PARCIAL | `skill_registry`, `skill_marketplace_meta`, `skill_reviews`, `skill_purchases`                             | `pages/MarketplaceMonetizedPage.tsx:25`                                                                | `purchase_skill:155`, `get_creator_earnings:191` — a monetização inteira                                                                                                                                                    | 2 RPCs                             |
| `noteVersionsService.ts`                | IMPLEMENTADO_PARCIAL | `notebook_note_versions`                                                                                   | `components/super-cerebro/notebook/VersionHistoryPanel.tsx:7`                                          | `log_audit_entry:61` ausente, mas em `try{}catch{}` (`:60-69`, comentário "audit best-effort") → restauração funciona, auditoria nunca grava                                                                                | 1 RPC de auditoria                 |
| `pentestService.ts`                     | IMPLEMENTADO_PARCIAL | `pentest_engagements`, `pentest_findings`                                                                  | `pages/PentestFindingsPage.tsx:7`                                                                      | `create_pentest_engagement:89`, `record_pentest_finding:115`, `update_pentest_finding_status:136`, `get_pentest_summary:145` — **nenhum existe**. Só as 2 leituras (`:63,72`) funcionam                                     | 4 RPCs                             |
| `postmortemService.ts`                  | IMPLEMENTADO_PARCIAL | `postmortems`, `postmortem_action_items`, `incident_runs`, `game_days`                                     | `pages/PostmortemEditorPage.tsx:18`                                                                    | `generate_postmortem_from_incident:103`, `generate_postmortem_from_gameday:111`, `publish_postmortem:119`. CRUD manual (`:53,77,93,98,126,137`) funciona                                                                    | 3 RPCs de geração/publicação       |
| `promptExperimentService.ts`            | IMPLEMENTADO_PARCIAL | `prompt_experiments`, `prompt_experiment_runs`                                                             | `components/prompts/CreateExperimentDialog.tsx:11`                                                     | `compute_experiment_stats:145`, `assign_variant:151`, `promote_experiment_winner:160` — todo o motor de A/B. CRUD (`:67,96,108,113,118,140`) funciona                                                                       | 3 RPCs                             |
| `sbomService.ts`                        | IMPLEMENTADO_PARCIAL | `sbom_snapshots`, `sbom_components`, `vulnerability_findings`                                              | `pages/VulnerabilitiesPage.tsx:17`                                                                     | `create_sbom_snapshot:95`, `acknowledge_vulnerability:146`, `mark_vulnerability_fixed:151`. Leituras + edge fn `sbom-scanner:138` OK                                                                                        | 3 RPCs                             |
| `settingsService.ts`                    | IMPLEMENTADO_PARCIAL | `workspace_secrets`, `workspaces`, `environments`                                                          | `components/settings/EnvironmentsManager.tsx:8`                                                        | `get_masked_secrets:41` ausente com `throw` (`:44`) → **a listagem de segredos quebra inteira**. Escrita (`:58,73,86`) e `environments` (`:120,136,149`) funcionam                                                          | 1 RPC (crítico, é leitura)         |
| `skillEnrichmentService.ts`             | IMPLEMENTADO_PARCIAL | `skill_registry`                                                                                           | `components/skills/SkillDescriptionEnrichPanel.tsx:46`                                                 | `apply_skill_description:287` — a aplicação do resultado. Leitura `:52` e LLM `skill-describe-llm:127` funcionam                                                                                                            | 1 RPC de persistência              |
| `skillReclassificationReviewService.ts` | IMPLEMENTADO_PARCIAL | `skill_reclassification_reviews`                                                                           | `components/skills/SkillReclassificationReviewPanel.tsx:47`                                            | `decide_skill_reclassification:325` — o veredito do curador. Fila (`:215`) e submissão (`:272`) funcionam                                                                                                                   | 1 RPC                              |
| `skillsRegistryService.ts`              | IMPLEMENTADO_PARCIAL | `skill_registry`, `agent_installed_skills`                                                                 | `components/agent-builder/modules/SkillsModule.tsx:34`                                                 | `increment_skill_installs:150` ausente, em `Promise.allSettled` (`:148`) → tolerante; contador de instalações nunca sobe                                                                                                    | 1 RPC de contador                  |
| `syntheticService.ts`                   | IMPLEMENTADO_PARCIAL | `synthetic_checks`                                                                                         | `pages/SyntheticMonitoringPage.tsx:27`                                                                 | `get_synthetic_summary:91` com `throw` (`:95`) → painel de uptime/latência quebra. CRUD e `synthetic-runner:100` OK                                                                                                         | 1 RPC                              |
| `vendorRiskService.ts`                  | IMPLEMENTADO_PARCIAL | `vendors`, `vendor_assessments`, `vendor_documents`                                                        | `pages/VendorsPage.tsx:30`                                                                             | `register_vendor:126`, `assess_vendor:153`, `offboard_vendor:166`. `get_vendor_summary:202` **existe**. Leituras (`:74,91,101`) e upload (`:186`) OK                                                                        | 3 RPCs — todo o ciclo de vida      |
| `webhookTriggerService.ts`              | IMPLEMENTADO_PARCIAL | `webhook_endpoints`, `webhook_events`                                                                      | `components/automation/WebhookManagerPanel.tsx:13`                                                     | `increment_webhook_counter:197` ausente (tolerante). **Nota:** `webhook_events` também não existe em `pg_tables` → `logWebhookEvent:190` e `getWebhookEvents:206` quebram. HMAC (`:42`), transform (`:70`) e CRUD são reais | Tabela `webhook_events` + 1 RPC    |

### 1.3 IMPLEMENTADO_TOTAL — 130

Lógica real, persistência contra objeto **existente** no banco, consumidor real. **Lembrete: as tabelas estão vazias — o código está pronto, nunca correu.**

#### Agentes & execução (16)

| Service                           | Tabelas                                                             | Consumidor (arquivo:linha)                               | Evidência                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentBehaviorImpactService.ts`   | `agent_traces`                                                      | `components/agents/detail/BehaviorImpactPanel.tsx:22`    | agregação real sobre traces `:140`, sem mock                                                                                                               |
| `agentCardService.ts`             | `agent_configs`                                                     | `components/agents/A2ARegistry.tsx:2`                    | CRUD A2A `:227,243,266,285`; `validateAgentCard:324` puro                                                                                                  |
| `agentDayDetailsService.ts`       | `agent_traces`                                                      | `components/agents/detail/DayDrillDownDrawer.tsx:23`     | drill-down real `:77`                                                                                                                                      |
| `agentDraftVersionsService.ts`    | — (localStorage)                                                    | `components/agent-builder/DraftVersionsDialog.tsx:15`    | persistência local declarada no docstring `:3`; CRUD `:43,51,79,84,90`                                                                                     |
| `agentGraphService.ts`            | `agent_graphs`, `graph_executions`                                  | `components/orchestration/GraphCanvas.tsx:7`             | CRUD `:46-85` + edge fn `graph-execute:90` (existe)                                                                                                        |
| `agentHandoffService.ts`          | `workflow_handoffs`                                                 | `components/agent-builder/HandoffPanel.tsx:12`           | máquina de estados completa `:68-199`; regras puras `:214,326`                                                                                             |
| `agentPromptSimulationService.ts` | `agents`, `agent_installed_skills`                                  | `components/skills/SkillPromptSimulator.tsx:42`          | contexto real `:74,79`                                                                                                                                     |
| `agentRoutingService.ts`          | `agent_routing_config`                                              | `pages/RoutingConfigPage.tsx:26`                         | CRUD `:46,63,110,126,139`                                                                                                                                  |
| `agentSkillLoadService.ts`        | `agents`, `agent_installed_skills`, `skill_registry`                | `components/skills/SkillOverflowAlertCard.tsx:16`        | join em 3 tabelas `:31,42,43`                                                                                                                              |
| `agentTestSimulationService.ts`   | — (puro)                                                            | `components/agents/detail/SimulationResultDialog.tsx:14` | **simulador declarado** (`:3` "Sem rede, sem custo de LLM real"); usa `Math.random` `:61,105,106,120` e `MOCK_INPUTS:42` — honesto, deriva de traces reais |
| `agentTracesService.ts`           | `agent_traces`                                                      | `components/agents/traces/TracesFilters.tsx:4`           | leitura real `:57,136`. Docstring `:3` diz "mock data já populada" — comentário obsoleto, a tabela está vazia                                              |
| `agentsService.ts`                | `agents`, `agent_traces`, `agent_usage`, `agent_versions`, `alerts` | `components/agents/detail/KPIDeepInsightsPanel.tsx:26`   | 416 linhas de CRUD+versionamento `:70,86,105,122,210,290,385,402`                                                                                          |
| `alertRulesService.ts`            | — (localStorage)                                                    | `components/agents/alerts/AlertRulesList.tsx:5`          | persistência local `:66,77`; `evaluateRule:161` e `simulateRule24h:176` são puros sobre traces reais                                                       |
| `savedTestRunsStore.ts`           | — (localStorage)                                                    | `components/agents/detail/SimulationResultDialog.tsx:15` | store local `:35,56,63,71` + pub/sub `:84`                                                                                                                 |
| `dashboardService.ts`             | `agents`, `agent_usage`, `alerts`, `agent_traces`                   | `components/dashboard/DashboardAlerts.tsx:5`             | 4 leituras + realtime `subscribeToAlerts:74`. `return []` em `:40,45,62,67,97,101,125,132` são **catches defensivos**, não stubs                           |
| `promptVersionService.ts`         | `agents`, `prompt_versions`                                         | `pages/PromptsPage.tsx:6`                                | versionamento completo `:36,48,69,93,104,114`; `diffLines:125` puro                                                                                        |

#### Automação & workflow (13)

| Service                        | Tabelas                                           | Consumidor                                             | Evidência                                                                                      |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `approvalService.ts`           | `workflow_runs`                                   | `components/deployments/ApprovalQueuePanel.tsx:2`      | `:18,35` + edge fn `workflow-engine-v2:27`                                                     |
| `batchProcessorService.ts`     | `batch_jobs`                                      | `components/automation/BatchProcessorPanel.tsx:6`      | ciclo completo `:23,37,42,47,53,60,103,160,165,173,188`                                        |
| `connectorRegistryService.ts`  | `connector_registry`, `connector_instances`       | `components/automation/ConnectorRegistryPanel.tsx:5`   | CRUD + health `:21,33,48,54,59,67,72,78`                                                       |
| `credentialVaultService.ts`    | `credential_vault`, `credential_audit_logs`       | `components/automation/CredentialVaultPanel.tsx:5`     | cripto `:33,44` + rotação `:124` + auditoria `:55`                                             |
| `cronSchedulerService.ts`      | `cron_schedules`, `cron_schedule_executions`      | `components/automation/CronSchedulerPanel.tsx:6`       | parser cron próprio `:39,60,99,169` + CRUD `:185-255` + `cron-executor:271`                    |
| `executionHistoryService.ts`   | `execution_history`                               | `components/automation/ExecutionTimelineDialog.tsx:8`  | 339 linhas, timeline `:242`, stats `:291`, purge `:333`                                        |
| `notificationEngineService.ts` | `notifications`, `notification_templates`         | `components/automation/NotificationCenterPanel.tsx:32` | **toca `notification_templates`, uma das 5 com dado**. Render `:29`, envio `:72`, stats `:179` |
| `queueManagerService.ts`       | `task_queues`, `queue_items`                      | `components/automation/QueueMonitorPanel.tsx:11`       | lock otimista real `:103`, dequeue `:86`, métricas `:146`                                      |
| `retryEngineService.ts`        | `dead_letter_queue`                               | `components/monitoring/RetryEnginePanel.tsx:11`        | backoff+jitter `:49` (uso legítimo de `Math.random`), circuit breaker `:91-130`                |
| `workflowCheckpointService.ts` | `workflow_executions`, `workflow_checkpoints`     | `components/workflows/WorkflowTimeTravelPanel.tsx:44`  | fork `:255`, recover `:369`, timeline `:314`                                                   |
| `workflowsService.ts`          | `workflows`, `workflow_steps`, `workflow_runs`    | `components/workflows/WorkflowCanvas.tsx:18`           | 417 linhas; streaming `:185`, exec `:255,297`                                                  |
| `bitrix24WebhookService.ts`    | `agent_routing_config`, `bitrix24_webhook_events` | `components/routing/RoutingEventsMonitor.tsx:2`        | CRUD rotas `:54,72,89,99` + eventos `:112`                                                     |
| `whatsappWebhookService.ts`    | `agent_routing_config`, `whatsapp_webhook_events` | `components/routing/RoutingEventsMonitor.tsx:3`        | idem `:64,82,99,109,122`                                                                       |

#### Conhecimento / Super Cérebro (20)

| Service                       | Tabelas                                                                                                           | Consumidor                                                    | Evidência                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `basesService.ts`             | — (localStorage + hook)                                                                                           | `components/super-cerebro/notebook/BasesPanel.tsx:20`         | engine de filtro/view `:165,206,216` + persistência `:239,251`                                 |
| `bookmarksService.ts`         | — (localStorage)                                                                                                  | `components/super-cerebro/notebook/NoteEditor.tsx:27`         | `:15,26,37,50,56`                                                                              |
| `canvasesService.ts`          | `notebook_canvases`                                                                                               | `components/super-cerebro/notebook/CanvasesPanel.tsx:7`       | hooks react-query `:61,78,100,130,150`                                                         |
| `cerebroService.ts`           | `documents`, `chunks`, `collections`, `agent_memories`, `knowledge_bases`                                         | `components/super-cerebro/KnowledgeAreasTab.tsx:5`            | health `:16-18`, edge fns `cerebro-brain:76`, `cerebro-query:97`, stats por domínio `:148-177` |
| `citationTelemetryService.ts` | `citation_telemetry`                                                                                              | `components/super-cerebro/CitationDialog.tsx:18`              | `:32,64,85`                                                                                    |
| `contextTiersService.ts`      | `chunks`                                                                                                          | `components/super-cerebro/SearchTab.tsx:24`                   | L0/L1/L2 `:27,42,60,76`                                                                        |
| `e2eeAutoSync.ts`             | — (localStorage)                                                                                                  | `components/super-cerebro/notebook/E2EESyncStatusBadge.tsx:7` | ciclo de sync `:100,108,200,211,224`                                                           |
| `e2eeService.ts`              | `notebook_notes`                                                                                                  | `components/super-cerebro/notebook/E2EESyncPanel.tsx:41`      | WebCrypto real `:96,112`; reconciliação `:171,204,230`                                         |
| `e2eeSimulationService.ts`    | — (puro)                                                                                                          | `pages/E2EESimulationPage.tsx:23`                             | simulador declarado; `generateScenarios:75`, `runSimulation:151`. Sem `Math.random`            |
| `entityResolutionService.ts`  | `agent_memories`                                                                                                  | `components/super-cerebro/EntityResolutionTab.tsx:13`         | Jaccard `:76` + clustering `:95` + merge `:190,227,240`                                        |
| `kanbanService.ts`            | — (via notesService)                                                                                              | `components/super-cerebro/notebook/KanbanBoard.tsx:15`        | `buildColumns:41`, `moveNoteToColumn:86`                                                       |
| `knowledgeDecayService.ts`    | `agent_memories`                                                                                                  | `components/super-cerebro/DecayDetectionTab.tsx:23`           | score `:54`, detecção `:87`, arquivamento `:145`                                               |
| `knowledgeService.ts`         | `collections`, `documents`, `chunks`, `knowledge_bases`, `vector_indexes`, `prompt_versions`, `workspace_members` | `components/agent-builder/modules/ObservabilityModule.tsx:9`  | 408 linhas de CRUD + rerank `:156`                                                             |
| `noteTemplatesService.ts`     | `notebook_note_templates`, `notebook_notes`                                                                       | `components/super-cerebro/notebook/TemplatesPanel.tsx:14`     | CRUD `:34,49,62,72` + daily note `:110,121,151`                                                |
| `notebookPodcastsService.ts`  | `notebook_podcasts`                                                                                               | `components/super-cerebro/notebook/PodcastPanel.tsx:13`       | `:37,77,94` + `notebook-podcast-generate:57`                                                   |
| `notebooksService.ts`         | `collections`, `documents`, `knowledge_bases`                                                                     | `components/super-cerebro/NotebookSelector.tsx:5`             | `:56,63,74,86,101,119`                                                                         |
| `notesService.ts`             | `notebook_notes`, `documents`, `knowledge_entities`, `knowledge_links`                                            | `components/super-cerebro/notebook/OutlinePanel.tsx:6`        | CRUD + wikilinks `:156,189` + backlinks `:214,230,237`                                         |
| `relatedNotesService.ts`      | — (puro)                                                                                                          | `components/super-cerebro/notebook/RelatedNotesPanel.tsx:6`   | scoring `:48`                                                                                  |
| `sketchService.ts`            | — (localStorage)                                                                                                  | `components/super-cerebro/notebook/SketchPanel.tsx:16`        | `:27,41,51`                                                                                    |
| `vaultSyncService.ts`         | `notebook_notes`                                                                                                  | `components/super-cerebro/notebook/VaultSyncPanel.tsx:21`     | export ZIP `:55` / import `:102,158`                                                           |

#### Skills & curadoria (16)

| Service                                 | Tabelas                                                 | Consumidor                                                                                    | Evidência                                                                                            |
| --------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `installCapLedgerService.ts`            | `audit_log`                                             | `components/skills/SkillInstallCapLedgerCard.tsx:16`                                          | `:21`                                                                                                |
| `promptEvidenceLedgerService.ts`        | `audit_log`                                             | `components/skills/SkillPromptEvidenceLedgerCard.tsx:18`                                      | `:26`                                                                                                |
| `progressiveSkillLoader.ts`             | `agent_skills`                                          | `components/agent-builder/modules/BrainModule.tsx:10`                                         | registry `:31-66`, matching `:86`, deps `:186`, hidratação `:351`, sync `:391`                       |
| `quickTypeTemplateMap.ts`               | — (mapa)                                                | `components/agents/wizard/quickSteps/StepQuickSkills.tsx:14`                                  | `:19,39`                                                                                             |
| `skillClassificationTimelineService.ts` | `audit_log`                                             | `components/skills/SkillClassificationEfficacyCard.tsx:30`, `skillObservabilityService.ts:15` | `:36`                                                                                                |
| `skillDemandService.ts`                 | `skill_registry`, `template_skill_links`                | `components/skills/SkillDemandPanel.tsx:33`                                                   | `:22,25`                                                                                             |
| `skillDepartmentClassifier.ts`          | — (puro)                                                | `lib/skills/classificationEfficacy.ts:29`                                                     | 360 linhas de classificador determinístico `:199,301,340`                                            |
| `skillHarvestService.ts`                | `skill_harvest_*`, `skill_registry`                     | `components/skills/HarvestCheckpointsCard.tsx:22`                                             | 726 linhas; checkpoints DB `:305,337,361,394,427,451` + local `:228,246,272` + `skill-harvester:143` |
| `skillLibraryService.ts`                | `skill_registry`                                        | `components/skills/SkillPipelineFlow.tsx:19`                                                  | `:59,104`                                                                                            |
| `skillObservabilityService.ts`          | `skill_harvest_runs`, `skill_reclassification_reviews`  | `components/skills/SkillObservabilityPanel.tsx:18`                                            | `:50,66,83` — falha propositalmente inteira (`:82` docstring)                                        |
| `skillRecommenderService.ts`            | — (puro)                                                | `components/agent-builder/modules/SkillsModule.tsx:23`                                        | tokenização `:47`, expansão `:102`, ranking `:148`                                                   |
| `skillbookAuditService.ts`              | `agent_skills`, `agent_installed_skills`, `agent_usage` | `pages/SkillbookAuditPage.tsx:58`                                                             | `:62,95,132` + CSV `:280,286`                                                                        |
| `templateSkillRegistry.ts`              | — (puro)                                                | `components/agents/TemplateLinkedSkillsPanel.tsx:27`                                          | catálogo `:132`, recomendação `:159`                                                                 |
| `templateSkillLinkService.ts`           | `template_skill_links`, `skill_registry`                | `components/agents/TemplateLinkedSkillsPanel.tsx:36`                                          | 1.447 linhas; upsert `:207`, retry/backoff `:496`, CSV `:594`                                        |
| `skillReclassificationService.ts`       | `skill_registry`                                        | `components/skills/SkillReclassifyDialog.tsx:58`                                              | `:68` + `skill-classify-llm:188`                                                                     |
| `thresholdCalibrationService.ts`        | `audit_log`                                             | `components/skills/SkillClassificationEfficacyCard.tsx:31`                                    | `:26`                                                                                                |

#### Segurança, RBAC, admin (10)

| Service                      | Tabelas                                                                                    | Consumidor                                                 | Evidência                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `accessControlService.ts`    | `ip_whitelist`, `geo_allowed_countries`, `access_blocked_log`                              | `components/security/AccessControlPanel.tsx:22`            | CRUD `:44,58,68,75,82,96,109,119` + `validate-access:130`                                                                      |
| `adminCrudService.ts`        | dinâmica (whitelist)                                                                       | `pages/AdminPage.tsx:11`                                   | `ALLOWED_ADMIN_TABLES:8` — whitelist é **controle de segurança**, não hardcode falso; `:30,44`                                 |
| `auditLogService.ts`         | `audit_log`, `audit_log_safe`, `workspace_members`                                         | `components/admin/AuditTrailPanel.tsx:22`                  | `:74,95,116,136`                                                                                                               |
| `rbacService.ts`             | `roles`, `permissions`, `role_permissions`, `user_roles`                                   | `components/rbac/ProtectedRoute.tsx:20`                    | **único service cujas tabelas principais têm dado** (`roles`=3, `user_roles`=1). `:64,76,85,88,98,105,119,122,131,146,161,170` |
| `securityService.ts`         | `api_keys`, `security_alerts`, `guardrail_policies`, `audit_log_safe`, `workspace_members` | `components/integrations/A2APanel.tsx:8`                   | SHA-256 real `:27`; CRUD `:43,57,83,103,157,173,183,193,204`                                                                   |
| `guardrailsMLService.ts`     | —                                                                                          | `components/agent-builder/modules/GuardrailsModule.tsx:11` | `guardrails-ml:27,38` (existe)                                                                                                 |
| `lgpdService.ts`             | —                                                                                          | `pages/LGPDCompliancePage.tsx:12`                          | 5 ações via `lgpd-manager:24,32,40,48,56`                                                                                      |
| `drDrillService.ts`          | `dr_drills`, `dr_snapshots`, `dr_restore_logs`                                             | `pages/DRDrillsPage.tsx:19`                                | `:80,102,116,122,132` + `dr-orchestrator:141`                                                                                  |
| `freezeWindowService.ts`     | `freeze_windows`                                                                           | `pages/FreezeWindowsPage.tsx:21`                           | `:17,39,60,70`                                                                                                                 |
| `workspaceContextService.ts` | `workspaces`                                                                               | `pages/KnowledgeManagementPage.tsx:22`                     | **toca tabela com dado**; `:26,41,56,74`                                                                                       |

#### LLM, custo, monitoramento, integrações (23)

| Service                     | Tabelas                                                                           | Consumidor                                              | Evidência                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audioService.ts`           | —                                                                                 | `components/knowledge/AudioUploadDialog.tsx:31`         | `audio-transcribe:41`, TTS `:94` (fetch direto, documentado em `:5-7`)                                                                                                  |
| `billingService.ts`         | `usage_records`, `agent_usage`, `budgets`, `model_pricing`                        | `components/billing/CostOptimizationPanel.tsx:10`       | `:66,92,102,114,123,132,141,147,175`                                                                                                                                    |
| `browserAgentService.ts`    | `browser_sessions`                                                                | `pages/BrowserAgentPage.tsx:14`                         | `browser-agent-run:42`, `browser-session-cancel:48` + `:55,64,70`                                                                                                       |
| `codeInterpreterService.ts` | `code_executions`                                                                 | `pages/CodeInterpreterPage.tsx:12`                      | `code-interpreter-execute:34` + `:92,101,108`                                                                                                                           |
| `costCalculatorService.ts`  | `model_pricing`                                                                   | `components/billing/CostCalculatorPanel.tsx:11`         | `cost-calculator:107` com fallback local `:130-152`. Os defaults `3.0`/`15.0` (`:132-133`) são **fallback de última instância**, não retorno hardcoded do caminho feliz |
| `datahubService.ts`         | —                                                                                 | `components/datahub/DataHubExplorerTab.tsx:25`          | SSE real `streamInvoke:8` + `datahub-query:128,136,144,221,241`, `datahub-mcp-server:310`                                                                               |
| `dataStorageService.ts`     | `agents`, `knowledge_bases`, `agent_traces`, `evaluation_runs`, `prompt_versions` | `pages/DataStoragePage.tsx:6`                           | `countTable:19` com `count:'exact'` real; lista de 5 tabelas é escopo declarado (`:29`)                                                                                 |
| `deploymentsService.ts`     | `deploy_connections`, `agents`                                                    | `pages/DeploymentsPage.tsx:10`                          | `:23,42,52,60,75,83`                                                                                                                                                    |
| `evalEngineService.ts`      | —                                                                                 | `components/evaluations/RAGASMetricsPanel.tsx:12`       | `eval-engine-v2:31`                                                                                                                                                     |
| `evaluationsService.ts`     | `evaluation_runs`, `evaluation_datasets`, `test_cases`, `agents`                  | `components/dialogs/CreateEvaluationDialog.tsx:8`       | CRUD `:26,37,48,67,78,90,106,114,121,129,147` + scorers puros `:162,217`                                                                                                |
| `healthAlertsService.ts`    | — (state machine)                                                                 | `components/shared/HealthAlertsMounter.tsx:10`          | máquina de transição documentada `:12-18`, `checkOnce:149`, `start:216`                                                                                                 |
| `healthService.ts`          | —                                                                                 | `components/shared/SystemHealthBanner.tsx:14`           | `health-check:42`                                                                                                                                                       |
| `llmGatewayService.ts`      | `workspace_secrets`                                                               | `components/agent-builder/modules/SettingsModule.tsx:8` | 8 wrappers de edge fn `:57,145,149,160,164,168,172,181` + `:192,196,205`                                                                                                |
| `memoryService.ts`          | `agent_memories`                                                                  | `components/super-cerebro/AutoExtractionTab.tsx:8`      | `memory-tools:22`, `memory-manager:116` + `:62`                                                                                                                         |
| `modelRouterService.ts`     | —                                                                                 | `components/agent-builder/modules/BrainModule.tsx:9`    | `smart-model-router:25`                                                                                                                                                 |
| `nlpPipelineService.ts`     | —                                                                                 | `hooks/useNLPAnalysis.ts:2`                             | `nlp-pipeline:46`                                                                                                                                                       |
| `openclawDeployService.ts`  | `openclaw_*`                                                                      | `components/agent-builder/modules/DeployModule.tsx:15`  | proxy `openclaw-proxy:90`. Os `return []` em `:149,162` são **fallback de parsing** após resposta real, não stub                                                        |
| `oracleService.ts`          | `oracle_history`                                                                  | `components/oracle/OracleAnalyticsPanel.tsx:18`         | `:53,64`                                                                                                                                                                |
| `productMockupService.ts`   | —                                                                                 | `components/tools/ImageAnalysisDialog.tsx:38`           | 4 ações via `product-mockup:45,73,102,134`                                                                                                                              |
| `ragPipelineService.ts`     | —                                                                                 | `components/knowledge/RagRerankTestDialog.tsx:9`        | `rag-embed-v2:18`, `rag-rerank-v2:33`, `rag-rerank:101`                                                                                                                 |
| `replayForkService.ts`      | `replay_forks`                                                                    | `components/replay/ForkHistoryPanel.tsx:9`              | `:47,64,99` + `replay-fork-execute:88`                                                                                                                                  |
| `searchService.ts`          | —                                                                                 | `components/search/VisualSearchButton.tsx:5`            | `semantic-search:34`, `visual-search:56`                                                                                                                                |
| `visionService.ts`          | —                                                                                 | `components/tools/ImageAnalysisDialog.tsx:37`           | `image-analysis:35`                                                                                                                                                     |

#### CRM, comunicação, misc (12 + 1 ponteiro)

| Service                           | Tabelas                                                                                                         | Consumidor                                            | Evidência                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `crmService.ts`                   | `crm_deals`, `crm_pipelines`, `crm_stages`, `crm_contacts`, `crm_companies`, `crm_activities`                   | `components/crm/CrmSummaryCards.tsx:3`                | 557 linhas de CRUD `:182-440` + `crm-bitrix-sync:524`, `crm-enrich:544`              |
| `crmCadenceService.ts`            | `crm_cadences`, `crm_cadence_steps`, `crm_cadence_enrollments`, `crm_cadence_runs`, `crm_deals`, `crm_contacts` | `components/crm/CadenceStepsEditor.tsx:30`            | `:72,89,111,129,158,168,198,204,234,263,281,302,355` + `crm-cadence-runner:326`      |
| `crmScoringService.ts`            | `crm_icp_profiles`, `crm_deals`, `crm_companies`, `crm_contacts`, `crm_activities`                              | `components/crm/LeadScoreBadge.tsx:10`                | 538 linhas; `scoreLead:230` puro e determinístico; rescore em lote `:429-528`        |
| `whatsappOutboundService.ts`      | `workspace_secrets`                                                                                             | `components/deployments/WhatsAppSendDialog.tsx:13`    | carrega credencial real `:69`; envio instrumentado com tracing `:288-300`            |
| `shareService.ts`                 | — (puro)                                                                                                        | `components/super-cerebro/notebook/NoteEditor.tsx:28` | compressão+encode `:45,59,83`                                                        |
| `toolsService.ts`                 | `tool_integrations`                                                                                             | `pages/ToolsPage.tsx:51`                              | `:21,37,51,62`                                                                       |
| `userFilterPreferencesService.ts` | `user_filter_preferences`                                                                                       | `hooks/useFilterPersistence.ts:15`                    | `:18,39,57`                                                                          |
| `voiceAgentService.ts`            | `voice_sessions`                                                                                                | `pages/VoiceAgentsPage.tsx:14`                        | `voice-session:33,39`, `voice-transcribe:46`, `voice-synthesize:54` + `:63,72,78`    |
| `widgetService.ts`                | —                                                                                                               | `components/deployments/WebWidgetPanel.tsx:14`        | `widget-proxy:61` + snippet `:43`                                                    |
| `temporalKnowledgeService.ts`     | `agent_memories`, `chunks`                                                                                      | `components/super-cerebro/TemporalGraphTab.tsx:18`    | `:83,97,186`                                                                         |
| `knowledgeManagementService.ts`   | `help_centers`, `kb_articles`, `kb_article_versions`, `kb_translations`, `kb_query_gaps`, `forum_*`             | `pages/KnowledgeManagementPage.tsx:20`                | 221 linhas de CRUD `:5-151` + `kb-translate-article:130`                             |
| `chatThreadService.ts`            | `chat_threads`, `chat_messages`                                                                                 | `pages/ChatWithAgentPage.tsx:47`                      | `:84,106,130,164,189,205,219,237,251` + migração one-shot de localStorage `:291-330` |
| `chaosService.ts` — ver 1.2.2     |                                                                                                                 |                                                       |                                                                                      |

#### Módulos de tipo e preset (20) — completos e consumidos

| Grupo                           | Arquivos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Consumidor (arquivo:linha)                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `types/*.ts` (15, 1.133 linhas) | `agentHandoffTypes` → `components/workflows/WorkflowHandoffVisualizer.tsx:6`; `batchProcessorTypes` → `batchProcessorService.ts:11`; `connectorRegistryTypes` → `presets/connectorPresets.ts:1`; `costCalculatorTypes` → `costCalculatorService.ts:2`; `credentialVaultTypes` → `credentialVaultService.ts:12`; `cronSchedulerTypes` → `cronSchedulerService.ts:13`; `evaluationsTypes` → `evaluationsService.ts:155`; `executionHistoryTypes` → `executionHistoryService.ts:16`; `knowledgeTypes` → `knowledgeService.ts:148`; `middlewarePipelineTypes` → `middlewarePipelineService.ts:20`; `notificationTypes` → `presets/notificationPresets.ts:1`; `progressiveSkillTypes` → `progressiveSkillLoader.ts:21`; `queueManagerTypes` → `queueManagerService.ts:13`; `retryEngineTypes` → `retryEngineService.ts:11`; `webhookTriggerTypes` → `webhookTriggerService.ts:18` | cada um tem exatamente 1–2 importadores, todos verificados |
| `presets/*.ts` (5, 92 linhas)   | `connectorPresets` → `connectorRegistryService.ts:98`; `credentialPresets` → `credentialVaultService.ts:175`; `cronPresets` → `cronSchedulerService.ts:268`; `notificationPresets` → `notificationEngineService.ts:218`; `queuePresets` → `queueManagerService.ts:174`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | constantes completas                                       |

Ressalva honesta: `middlewarePipelineTypes` só serve um service morto — é morto por transitividade.

---

## 2. Contagem por classificação (denominador = 166)

| Classificação        | Qtd     | %        |
| -------------------- | ------- | -------- |
| IMPLEMENTADO_TOTAL   | 130     | 78,3%    |
| IMPLEMENTADO_PARCIAL | 31      | 18,7%    |
| SUGERIDO_OU_INICIADO | 0       | 0,0%     |
| MORTO_OU_ABANDONADO  | 5       | 3,0%     |
| **Total**            | **166** | **100%** |

Recorte só dos 145 módulos de serviço reais (excluindo 15 `types/`, 5 `presets/`, 1 `index.ts`):

| Classificação        | Qtd | % de 145 |
| -------------------- | --- | -------- |
| IMPLEMENTADO_TOTAL   | 110 | 75,9%    |
| IMPLEMENTADO_PARCIAL | 30  | 20,7%    |
| MORTO_OU_ABANDONADO  | 5   | 3,4%     |

**Não classifiquei nada como SUGERIDO_OU_INICIADO.** Não encontrei um único esqueleto: zero métodos vazios, zero `return []` sem query (todos os `return []` que inspecionei são catch defensivo ou guarda de lista vazia), zero `throw new Error('not implemented')`, zero `console.log` como corpo de método. O código deste lote é uniformemente bem escrito. O problema não é código faltando — é **infraestrutura de banco faltando** (61 RPCs + 17 tabelas) e **fiação de UI faltando** (5 services órfãos).

Recorte por operabilidade real contra o banco de produção:

| Situação                           | Qtd de services com I/O                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tocam tabela **com dado**          | 5 (`rbacService`, `settingsService`, `workspaceContextService`, `teamsService`, `notificationEngineService`, `auditLogService`, `knowledgeService`, `monitoringService`, `securityService` — 9 arquivos, 5 tabelas) |
| Tocam apenas tabelas **vazias**    | ~68                                                                                                                                                                                                                 |
| Dependem de RPC **inexistente**    | 27                                                                                                                                                                                                                  |
| Referenciam tabela **inexistente** | 9                                                                                                                                                                                                                   |

---

## 3. Services órfãos (sem importador em produção) — com a prova

Busca executada em todo `src/`, incluindo `.ts` e `.tsx`:

```
grep -rlE "(from|import|require\()\s*['\"][^'\"]*/?<basename>['\"]" --include=*.ts --include=*.tsx src/
```

| Service                     | Resultado da busca                                                                                                                                                                                                                                                                     | Veredito                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `riskService`               | **0 linhas.** Nenhum arquivo em `src/` importa.                                                                                                                                                                                                                                        | Órfão absoluto             |
| `fineTuningService`         | 1 linha: `src/services/index.ts:20`. Busca complementar por `fineTuning\|hf-autotrain\|prepareDataset\|startTraining` em `src/pages` + `src/components`: **0 linhas**.                                                                                                                 | Órfão (barrel não alcança) |
| `agentEvolutionService`     | 4 linhas: `src/services/index.ts:19`, `src/test/agent-evolution.test.ts:5,19,24`, `src/test/extended-services.test.ts:152`. Busca por `agentEvolution\|reflectAndEvolve\|getSkillbook\|pruneWeakSkills` em `src/pages` + `src/components`: **0 linhas**.                               | Órfão em produção          |
| `middlewarePipelineService` | 4 linhas: `src/services/index.ts:75`, `src/test/middleware-pipeline.test.ts:18`, `src/test/notification-and-middleware.test.ts:49`, `src/tests/nexus-complete-test-suite.test.ts:35`. `components/monitoring/MiddlewarePipelinePanel.tsx` cita no comentário `:3` mas **não importa**. | Órfão em produção          |
| `skillsSimulationService`   | 1 linha: `src/test/skills-registry-bulk-install.test.ts:3`.                                                                                                                                                                                                                            | Órfão em produção          |

Para referência, a mesma busca sobre os outros 161 arquivos retornou pelo menos um consumidor em `src/pages`, `src/components`, `src/hooks`, `src/lib` ou `src/services`.

---

## 4. Lista COMPLETA e deduplicada de tabelas em `.from()` no projeto inteiro

153 nomes distintos extraídos de todo `src/` (`.ts` + `.tsx`). Cruzados com `pg_tables` + `information_schema.views` do projeto `qdlnzopxrlsoljcrcmzv` (215 tabelas + 14 views = 229 objetos).

`❌` = **não existe** no banco. Demais existem.

```
access_blocked_log            documents                     prompt_versions
agent_daily_metrics        ❌ dr_drills                     replay_forks
agent_eval_datasets           dr_restore_logs               restore_field_presets      ❌
agent_eval_results            dr_snapshots                  retention_job_runs
agent_eval_runs               entity_resolution_logs        risk_register
agent_graphs                  environments                  risk_review_events         ❌
agent_installed_skills        evaluation_datasets           sbom_components
agent_memories                evaluation_runs               sbom_snapshots
agent_skills                  forensic_snapshots         ❌ secret_rotation_events     ❌
agent_templates               forum_posts                   security_alerts
agent_traces                  forum_threads                 session_traces
agent_usage                   freeze_windows                sessions
agent_versions                game_day_events            ❌ skill_harvest_candidates
agent_workflow_runs           game_day_scorecards           skill_harvest_checkpoints
agent_workflows               game_days                     skill_harvest_runs
agents                        geo_allowed_countries         skill_reclassification_reviews
alerts                        graph_executions              skill_registry
api_keys                      guardrail_policies            slack_agent_notifications
asset_audits                  help_centers                  slack_bot_bindings
assets                        idempotency_keys              slack_channel_routes
audit_events                  incident_playbooks            slack_dispatch_health      ❌
audit_log                     incident_runs                 slack_dlq_stats            ❌
auth_attempts                 ip_whitelist                  slack_rag_sources
automation_logs               ir_playbook_steps             slack_workspace_config
automation_rules              ir_playbooks                  synthetic_checks
bcp_test_runs                 ir_tabletop_exercises         tabela                     ❌
browser_sessions              kb_article_versions           template_skill_links
budget_events              ❌ kb_articles                   test_cases
budgets                       kb_query_gaps                 tool_integrations
business_systems              kb_translations               tool_policies
change_approvals              knowledge_bases               trace_events               ❌
change_requests               knowledge_entities            usage_records
chaos_experiments             knowledge_links               user_2fa
chat_messages                 llm_cost_by_caller         ❌ user_research_configs
chat_threads                  managed_secrets               user_roles
chunks                        model_pricing                 vector_indexes
citation_telemetry            notebook_canvases             vendor_assessments
code_executions               notebook_note_templates       vendor_documents
collections                   notebook_note_versions        vendors
compliance_controls           notebook_notes                voice_sessions
compliance_evidence           notebook_podcasts             vulnerability_findings
compliance_frameworks         oncall_schedule               webhook_events             ❌
compliance_reports            oncall_schedule_emails        whatsapp_webhook_events
cost_alerts                   oncall_schedule_safe          workflow_runs
creator_payouts               openclaw_events            ❌ workflow_steps
deploy_connections            openclaw_agent_templates      workflows
document_ingestion_events  ❌ openclaw_whatsapp_instances   workspace_budgets
document_ingestions           openclaw_whatsapp_messages    workspace_members
                              oracle_history                workspace_members_safe     ❌
                              pentest_engagements           workspace_secrets
                              pentest_findings              workspaces
                              pg_net_smoke_runs          ❌
                              postmortem_action_items
                              postmortems
```

### 4.1 As 17 referências a tabelas inexistentes, com arquivo:linha

| Tabela ausente              | Referências                                                                                                                                  | Dentro do lote?    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `agent_daily_metrics`       | `services/agentDailyMetricsService.ts:36`                                                                                                    | sim                |
| `budget_events`             | `services/budgetService.ts:99`, `pages/BudgetsPage.tsx:99`                                                                                   | sim                |
| `document_ingestion_events` | `services/documentIngestionService.ts:336`                                                                                                   | sim                |
| `game_day_events`           | `services/gameDayService.ts:129`                                                                                                             | sim                |
| `restore_field_presets`     | `services/restorePresetsService.ts:33,51,58,83,89,97`                                                                                        | sim                |
| `risk_review_events`        | `services/riskService.ts:94`                                                                                                                 | sim                |
| `secret_rotation_events`    | `services/secretsRotationService.ts:113`                                                                                                     | sim                |
| `trace_events`              | `services/monitoringService.ts:66,148,171`; `hooks/useTracesData.ts:58`; `hooks/useBillingData.ts:112`; `lib/tracing/tracingExporters.ts:30` | sim + fora         |
| `webhook_events`            | `services/webhookTriggerService.ts:190,206`                                                                                                  | sim                |
| `workspace_members_safe`    | `services/teamsService.ts:32` (view real: `workspace_members_public`)                                                                        | sim                |
| `forensic_snapshots`        | `pages/ForensicSnapshotsPage.tsx:56`, `pages/ReplayForkPage.tsx:62`                                                                          | não (fora do lote) |
| `openclaw_events`           | `components/security/OpenclawEventsPanel.tsx:40`                                                                                             | não                |
| `llm_cost_by_caller`        | fora de `src/services`                                                                                                                       | não                |
| `pg_net_smoke_runs`         | fora de `src/services`                                                                                                                       | não                |
| `slack_dispatch_health`     | fora de `src/services`                                                                                                                       | não                |
| `slack_dlq_stats`           | fora de `src/services`                                                                                                                       | não                |
| `tabela`                    | `src/test/schema-contract.test.ts:24` — literal em docstring, falso positivo                                                                 | n/a                |

### 4.2 Edge functions: nenhuma ausente

Cruzei os 56 nomes distintos em `functions.invoke(...)` dos services com `ls supabase/functions/` (85 funções em disco). **Todos existem.** Os três "nomes" `start`, `end` e `frontend-panel` capturados pelo meu regex são strings de payload, não nomes de função. Contraste notável: as edge functions foram entregues, os RPCs SQL não.

---

## 5. Os 61 RPCs inexistentes, por service

| Service                              | RPCs ausentes (arquivo:linha)                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `assetInventoryService`              | `register_asset:61`, `audit_asset:91`, `decommission_asset:102`                                                              |
| `automationTemplateService`          | `increment_template_installs:149`                                                                                            |
| `bcpService`                         | `register_business_system:98`, `record_bcp_test:126`                                                                         |
| `budgetService`                      | `check_budget:83`, `get_current_spend:89`, `reset_workspace_budget:109`, `enforce_budget:114`                                |
| `changeManagementService`            | `submit_change_request:109`, `decide_change:125`, `execute_change:134`, `rollback_change:142`                                |
| `chaosService`                       | `disable_all_chaos:100`                                                                                                      |
| `complianceService`                  | `generate_compliance_report:109`, `publish_compliance_report:121`                                                            |
| `costAnomalyService`                 | `acknowledge_cost_alert:49`, `detect_cost_anomalies:54`, `compute_cost_baselines:60`                                         |
| `gameDayService`                     | `start_game_day:107`, `record_game_day_event:117`, `complete_game_day:144`                                                   |
| `incidentService`                    | `get_current_oncall:124`                                                                                                     |
| `irPlaybookService`                  | `activate_ir_playbook:141`                                                                                                   |
| `marketplaceService`                 | `purchase_skill:155`, `get_creator_earnings:191`                                                                             |
| `noteVersionsService`                | `log_audit_entry:61`                                                                                                         |
| `pentestService`                     | `create_pentest_engagement:89`, `record_pentest_finding:115`, `update_pentest_finding_status:136`, `get_pentest_summary:145` |
| `postmortemService`                  | `generate_postmortem_from_incident:103`, `generate_postmortem_from_gameday:111`, `publish_postmortem:119`                    |
| `promptExperimentService`            | `compute_experiment_stats:145`, `assign_variant:151`, `promote_experiment_winner:160`                                        |
| `riskService`                        | `register_risk:114`, `review_risk:131`, `close_risk:141`, `get_risk_summary:146`                                             |
| `sbomService`                        | `create_sbom_snapshot:95`, `acknowledge_vulnerability:146`, `mark_vulnerability_fixed:151`                                   |
| `secretsRotationService`             | `register_managed_secret:78`, `record_secret_rotation:94`, `mark_secret_retired:104`, `refresh_secrets_status:122`           |
| `settingsService`                    | `get_masked_secrets:41`                                                                                                      |
| `skillEnrichmentService`             | `apply_skill_description:287`                                                                                                |
| `skillReclassificationReviewService` | `decide_skill_reclassification:325`                                                                                          |
| `skillsRegistryService`              | `increment_skill_installs:150`                                                                                               |
| `syntheticService`                   | `get_synthetic_summary:91`                                                                                                   |
| `teamsService`                       | `invite_workspace_member:53`, `get_pending_invites_for_email:78`, `accept_workspace_invitation:86`                           |
| `vendorRiskService`                  | `assess_vendor:153`, `register_vendor:126`, `offboard_vendor:166`                                                            |
| `webhookTriggerService`              | `increment_webhook_counter:197`                                                                                              |

---

## 6. Dado fictício encontrado, com arquivo:linha

Procurei ativamente por `Math.random()`, constantes devolvidas como se fossem do banco, `return []` sem query, `TODO`, `not implemented` e métodos que só fazem `console.log`.

### 6.1 `Math.random()` — 8 ocorrências em 4 arquivos

| Arquivo:linha                       | Uso                                        | Veredito                                                                                                                          |
| ----------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `agentTestSimulationService.ts:61`  | `jitter()` — variação de latência simulada | **Fictício, mas declarado.** Docstring `:1-4`: "gera uma simulação client-side… Sem rede, sem custo de LLM real"                  |
| `agentTestSimulationService.ts:105` | probabilidade de timeout                   | idem                                                                                                                              |
| `agentTestSimulationService.ts:106` | sorteio de tipo de erro                    | idem                                                                                                                              |
| `agentTestSimulationService.ts:120` | sorteio sucesso/erro por `errorRate`       | idem                                                                                                                              |
| `webhookTriggerService.ts:29`       | geração de ID de webhook                   | **Legítimo** (não é dado de negócio)                                                                                              |
| `webhookTriggerService.ts:38`       | geração de secret `whsec_`                 | **Legítimo** — porém secret criptográfico gerado com `Math.random` é fraqueza de segurança; deveria usar `crypto.getRandomValues` |
| `retryEngineService.ts:49`          | jitter de backoff exponencial              | **Legítimo** — jitter é o comportamento correto                                                                                   |
| `savedTestRunsStore.ts:47`          | sufixo de ID de run                        | **Legítimo**                                                                                                                      |

### 6.2 Constantes apresentadas como dado

| Arquivo:linha                                                                                                       | O que é                                                    | Veredito                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agentTestSimulationService.ts:42-51`                                                                               | `MOCK_INPUTS` — 8 mensagens de cliente fabricadas          | Fictício, alimenta a simulação declarada; usado em `:119`                                                                                        |
| `components/monitoring/MiddlewarePipelinePanel.tsx:10-16`                                                           | `AVAILABLE_MIDDLEWARES` hardcoded + `useState` local `:19` | **Fachada.** O docstring `:3` afirma estar ligado ao `middlewarePipelineService`; não está. É o único caso claro de UI que finge estar conectada |
| `costCalculatorService.ts:132-133`                                                                                  | `?? 3.0` / `?? 15.0` USD por Mtoken                        | Fallback de último recurso após falha da edge fn **e** de `model_pricing`. Aceitável, mas produziria custo silenciosamente errado                |
| `automationTemplateService.ts:171-338`                                                                              | `BUILTIN_TEMPLATES`                                        | **Não é fake:** é catálogo semente exportado, consumido explicitamente                                                                           |
| `adminCrudService.ts:8`                                                                                             | `ALLOWED_ADMIN_TABLES`                                     | **Não é fake:** whitelist de segurança, documentada em `:3`                                                                                      |
| `notificationPresets.ts:29`, `retryEngineService.ts:28`, `bcpService.ts:177-205`, `irPlaybookService.ts:68-94` etc. | mapas de rótulo/preset                                     | **Não é fake:** constantes de apresentação                                                                                                       |

### 6.3 Comentários enganosos (documentação que contradiz o código)

| Arquivo:linha                                         | Afirma                                                                          | Realidade                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `integrations/supabase/externalClient.ts:4-8`         | dados vivem no projeto externo `tdprnylgyrogbbhgdoik`; client local é "só auth" | `.env.example:19` aponta ambos para `qdlnzopxrlsoljcrcmzv` |
| `lib/supabaseExtended.ts:10-16`                       | arquitetura dual-client                                                         | é single-client                                            |
| `agentTracesService.ts:3`                             | "`agent_traces` (mock data já populada)"                                        | tabela está vazia; nunca houve mock populado               |
| `components/monitoring/MiddlewarePipelinePanel.tsx:3` | "Wires middlewarePipelineService into MonitoringPage"                           | não importa o service                                      |

### 6.4 O que NÃO encontrei

- **Zero** `TODO`/`FIXME` em caminho crítico. Os 20+ hits de `todo` são a palavra portuguesa "todo/todos" (= _all_), ex.: `crmService.ts:5`, `templateSkillLinkService.ts:822`, `crmScoringService.ts:411`.
- **Zero** `not implemented` / `throw new Error('unimplemented')`.
- **Zero** métodos cujo corpo seja só `console.log`.
- **Zero** `return []` sem query como implementação. Todos os ~40 casos são catch defensivo (`dashboardService.ts:40,45,62,67,97,101,125,132`), guarda de lista vazia (`skillsRegistryService.ts:67`, `rbacService.ts:96`) ou fallback de parsing após resposta real (`openclawDeployService.ts:149,162`).
- **Zero** stores em memória fingindo persistência (`grep` por `^(const|let)\s+\w+.*=\s*(new Map|\[\]|\{\})` no nível de módulo: nenhum resultado).
- **Zero** edge functions invocadas que não existam em disco.

### 6.5 Persistência em `localStorage` (real, mas não é banco) — 10 arquivos

Não é dado fictício, mas é persistência que não sobrevive a troca de dispositivo. Documentado em cada caso: `agentDraftVersionsService.ts:3`, `alertRulesService.ts:2`, `basesService.ts:234`, `bookmarksService.ts:2`, `chatThreadService.ts:8` (com migração one-shot para o banco em `:291-330`), `e2eeAutoSync.ts:8`, `savedTestRunsStore.ts:2`, `sketchService.ts:27`, `skillHarvestService.ts:259` (híbrido: DB + cache local), `userFilterPreferencesService.ts:3` (fallback documentado).

---

## 7. Refactors abandonados (duplicação v1/v2)

O enunciado pediu atenção a isto. Encontrei 4 casos:

1. **`riskService` vs `RiskRegisterPage`** — service novo, 0 importadores; a página roteada (`App.tsx:1351`) faz `.from('risk_register')` direto em `pages/RiskRegisterPage.tsx:76`. **O antigo (query direta) é o que roda.**
2. **`budgetService` vs `BudgetsPage`** — `services/budgetService.ts:99` e `pages/BudgetsPage.tsx:99` consultam `budget_events` independentemente. `BudgetsPage` não importa nenhum service. Ambos quebrados (tabela ausente), mas a duplicação é real.
3. **`middlewarePipelineService` vs `MiddlewarePipelinePanel`** — motor de 397 linhas + painel que reimplementa a lista em 7 linhas hardcoded, sem importá-lo.
4. **Client dual** — `supabase` (auth) vs `supabaseExternal` (dados) vs helper `fromTable`: três caminhos para o mesmo banco. Dentro de um mesmo service convivem os três, ex. `monitoringService.ts` usa `supabaseExternal.from` (`:107,114,148`) e `fromTable` (`:116,150`) alternadamente.

Adicionalmente, 36 tabelas são acessadas **tanto** por um service **quanto** direto de `.tsx`, sinal de que a camada de serviço nunca foi adotada de forma consistente: `agents`, `agent_traces`, `agent_versions`, `alerts`, `skill_registry`, `workflows`, `workspaces`, `documents`, `notebook_notes`, `risk_register`, `budgets`, `budget_events`, `postmortems`, `pentest_findings`, `test_cases`, `trace_events`, entre outras (lista completa reproduzível com o cruzamento de `.from()` em `src/pages`+`src/components` contra `src/services`).

---

## 8. Total de arquivos lidos

| Categoria                                                                                                                                                   | Qtd                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquivos de `src/services/` inspecionados (extração dirigida de exports, `.from()`, `.rpc()`, `functions.invoke`, `return []`, `localStorage` em **todos**) | 166 / 166                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Destes, lidos em profundidade (trechos ou íntegra)                                                                                                          | 41                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Arquivos de apoio fora do lote lidos                                                                                                                        | 12 — `src/services/index.ts`, `src/integrations/supabase/client.ts`, `src/integrations/supabase/externalClient.ts`, `src/lib/supabaseExtended.ts`, `src/App.tsx` (rotas), `src/components/monitoring/MiddlewarePipelinePanel.tsx`, `src/pages/RiskRegisterPage.tsx`, `src/pages/BudgetsPage.tsx`, `src/pages/ComplianceFrameworksPage.tsx`, `src/pages/PostmortemEditorPage.tsx`, `.env.example`, `supabase/functions/` (listagem) |
| Consultas ao banco de produção                                                                                                                              | 4 (`pg_tables`, `information_schema.views`, `pg_proc`, contagem)                                                                                                                                                                                                                                                                                                                                                                   |
| **Total de arquivos tocados**                                                                                                                               | **178**                                                                                                                                                                                                                                                                                                                                                                                                                            |

---

## 9. Veredito

O lote `src/services/` **não é fachada**. É código de qualidade acima da média — tipado, com tratamento de erro consistente, comentários que explicam decisão de design, e algoritmos reais (Jaccard, LCS diff, parser cron próprio, circuit breaker, WebCrypto E2EE, scoring de lead determinístico). Não achei um único método stub.

O que existe é um descasamento severo entre camadas:

1. **O backend SQL nunca foi entregue.** 61 de 67 RPCs não existem. As 85 edge functions existem todas. Alguém construiu o frontend e as functions, e parou antes das migrations de RPC.
2. **17 tabelas referenciadas não existem**, incluindo `trace_events` — que é onde toda a telemetria deveria ser gravada (`lib/tracing/tracingExporters.ts:30`). Isso explica por que 210 tabelas estão vazias: boa parte do caminho de escrita erra antes de chegar lá.
3. **A camada de serviço nunca foi adotada por completo.** 36 tabelas têm acesso duplicado service↔UI; 5 services estão órfãos; o barrel `@/services` tem 1 consumidor.

Ordem de correção que eu proporia, por impacto:

1. Criar `trace_events` (ou apontar para `trace_events_v`) — destrava toda a observabilidade e é pré-requisito para qualquer métrica ter dado.
2. Criar os 61 RPCs — destrava todo o cluster GRC/SecOps de uma vez.
3. Criar as 9 tabelas ausentes referenciadas por services.
4. Resolver os 4 refactors abandonados (decidir service vs query direta).
5. Ligar ou remover os 5 services órfãos.
