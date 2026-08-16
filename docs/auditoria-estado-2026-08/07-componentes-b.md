# Auditoria de Estado — Lote B (`src/components/*` + `openclaw/`)

> **Regra aplicada:** medir, não confiar. Toda classificação abaixo tem arquivo:linha.
> **Contexto de banco (fato verificado externamente):** 215 tabelas, apenas 5 com dado.
> Vazias: `crm_deals`, `crm_contacts`, `crm_companies`, `crm_activities`, `crm_cadences`,
> `chat_threads`, `chat_messages`, `alerts`, `alert_rules`, `budgets`, `cost_alerts`,
> `deploy_connections`, `environments`, `eval_runs`, `evaluation_runs`, `agent_traces`,
> `execution_history`. **Zero jobs pg_cron.**
>
> Escopo: 30 subdiretórios de `src/components/` + `src/components/NavLink.tsx` + `/openclaw/`.
> Fora de escopo (outros agentes): `agents/`, `agent-builder/`, `super-cerebro/`, `skills/`,
> `datahub/`, `shared/`, `workflows/`, `oracle/`, `security/`, `automation/`, `knowledge/`,
> `integrations/`.

---

## 0. Veredito de uma linha

O lote B é, em maioria, **código honesto ligado ao banco real** — muito melhor do que o
padrão "dashboard de mentira". O dado fictício está concentrado em **4 focos**
(`DeploymentWizard`, `MiddlewarePipelinePanel`, `HuggingFaceTab`, tiles de SLA da
`DeploymentsPage`) e em **~1.600 linhas de código morto** (14 primitivos `ui/` órfãos +
`sandbox/` duplicado + 2 widgets de dashboard nunca montados).

O problema estrutural maior **não é dado falso: é a ausência dos 11 jobs pg_cron declarados
em migrações**, que deixa 5 painéis corretos alimentando-se de tabelas/MVs que nunca são
populadas.

---

## 1. Tabela de classificação por funcionalidade

### 1.1 Dashboards, métricas, gráficos, monitoramento e SLO (foco principal)

| Funcionalidade                                                      | Módulo                   | Classificação                              | Evidência (arquivo:linha)                                                                                                                                                                                             | O que falta                                                                                                                    |
| ------------------------------------------------------------------- | ------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Gráficos de uso (requests/erros, custo, latência, tokens) — 30 dias | `dashboard/`             | IMPLEMENTADO_TOTAL                         | `src/components/dashboard/UsageCharts.tsx:24-48` (agrega `UsageRow[]` recebido por props); `:106-127` empty-state honesto "Sem dados neste período"                                                                   | Nada no componente. Depende de `usage_daily` ter linhas                                                                        |
| Comparação "vs período anterior"                                    | `charts/` + `dashboard/` | **IMPLEMENTADO_PARCIAL** (rótulo enganoso) | `src/components/charts/ComparisonToggle.tsx:34-47` — desloca o **mesmo array** N posições; `src/components/dashboard/UsageCharts.tsx:82,87` chama com `offset=15` sobre janela de 30 dias                             | Buscar de fato o período anterior (dias −59..−30) no banco, ou renomear para "1ª vs 2ª quinzena"                               |
| Biblioteca de gráficos SVG própria (bar/area/line/pie/radar)        | `charts/`                | IMPLEMENTADO_TOTAL                         | `charts/LightBarChart.tsx`, `LightAreaChart.tsx`, `LightLineChart.tsx`, `LightPieChart.tsx`, `LightRadarChart.tsx`; internos `ChartTooltip`/`ChartLegend`/`useChartDimensions` importados em `LightAreaChart.tsx:2-4` | —                                                                                                                              |
| Anotações em gráfico                                                | `charts/`                | **MORTO_OU_ABANDONADO**                    | `charts/ChartAnnotation.tsx` — exportado em `charts/index.ts:8` e **nunca importado** por nenhum arquivo fora de `charts/` (nem dentro)                                                                               | Remover ou usar                                                                                                                |
| Insights automáticos do dashboard                                   | `dashboard/`             | IMPLEMENTADO_TOTAL                         | `dashboard/DashboardInsight.tsx:13-32` — heurística sobre `agents`/`usageStats`/`recentTraces` reais, sem número inventado                                                                                            | —                                                                                                                              |
| Alertas críticos no dashboard                                       | `dashboard/`             | IMPLEMENTADO_TOTAL (sem dado)              | `dashboard/DashboardAlerts.tsx:10-14` `getUnresolvedAlerts(5)`; `:17-21` realtime subscribe                                                                                                                           | Tabela `alerts` vazia + **nenhum job que gere alerta**                                                                         |
| Feed de atividade                                                   | `dashboard/`             | IMPLEMENTADO_TOTAL                         | `dashboard/ActivityFeed.tsx:40-45` `getAuditLog({limit:15})` com refetch 30s                                                                                                                                          | —                                                                                                                              |
| Widget de orçamento                                                 | `dashboard/`             | **MORTO_OU_ABANDONADO (órfão)**            | `dashboard/BudgetWidget.tsx` — 0 imports em todo o `src/` (varredura completa); código em si é real (`:15-20` `budgetService.checkBudget`)                                                                            | Montar em alguma página, ou excluir. `budgets` vazia                                                                           |
| Widget de anomalia de custo                                         | `dashboard/`             | **MORTO_OU_ABANDONADO (órfão)**            | `dashboard/CostAnomalyWidget.tsx` — 0 imports; consome `countActiveAlerts` de `cost_alerts` (vazia, alimentada por cron `cost-anomalies-15min` inexistente)                                                           | Montar + criar o cron                                                                                                          |
| Seletor de intervalo do dashboard                                   | `dashboard/`             | IMPLEMENTADO_TOTAL                         | `dashboard/DateRangePicker.tsx` (52 linhas, puro UI, consumido)                                                                                                                                                       | —                                                                                                                              |
| Cobertura de embeddings + DLQ                                       | `metrics/`               | IMPLEMENTADO_TOTAL                         | `metrics/EmbeddingCoverageCard.tsx:48-58` RPC `get_embedding_coverage` (definida em 5 migrações); `:69+` `reset_embedding_dead_letter`                                                                                | —                                                                                                                              |
| Saúde do Knowledge Graph (score 0-100)                              | `metrics/`               | **IMPLEMENTADO_PARCIAL**                   | `metrics/KnowledgeGraphHealthCard.tsx:66-69` RPC `get_knowledge_graph_health`; comentário `:12` declara "refresh diário via pg_cron" — **não há job**                                                                 | Criar o cron de refresh da MV `knowledge_graph_health`                                                                         |
| Métricas de Random Recall                                           | `metrics/`               | IMPLEMENTADO_TOTAL                         | `metrics/RandomRecallMetricsCard.tsx:43-51` query real em `audit_events` filtrando `event_type='random_recall'`                                                                                                       | —                                                                                                                              |
| Web Vitals (CLS/INP/LCP/FCP/TTFB)                                   | `monitoring/`            | IMPLEMENTADO_TOTAL (efêmero)               | `monitoring/WebVitalsPanel.tsx:66-90` — `performance.getEntriesByType` real, thresholds do Google em `:31-36`                                                                                                         | Não persiste nada; medição só da sessão atual                                                                                  |
| Traces + árvore de spans                                            | `monitoring/`            | IMPLEMENTADO_TOTAL (sem dado)              | `monitoring/TracingPanel.tsx:47-52` `getRecentTraceEvents(50)`; `SpanTreeView.tsx` renderiza `data.spans`                                                                                                             | `agent_traces` vazia                                                                                                           |
| Filtros avançados de trace                                          | `monitoring/`            | IMPLEMENTADO_TOTAL                         | `monitoring/AdvancedTraceFilters.tsx:22-31` — componente controlado, sem dado próprio                                                                                                                                 | —                                                                                                                              |
| Exportador Langfuse                                                 | `monitoring/`            | IMPLEMENTADO_PARCIAL                       | `monitoring/LangfuseExporterDialog.tsx:12,30-32` — config só em `localStorage`, chave pública apenas                                                                                                                  | Persistir por workspace; sem secret key não exporta server-side                                                                |
| Regras de alerta automático                                         | `monitoring/`            | **IMPLEMENTADO_PARCIAL**                   | `monitoring/AlertRulesPanel.tsx:20-23` lista, `:26-36` cria, `:39-42` deleta — CRUD real em `alert_rules`                                                                                                             | **Não existe avaliador**: nenhum cron/trigger lê `alert_rules`. Regra criada nunca dispara                                     |
| Pipeline de middleware                                              | `monitoring/`            | **SUGERIDO_OU_INICIADO (fachada)**         | `MiddlewarePipelinePanel.tsx:10-17` array fixo; `:19` estado inicial fixo; `:3` comentário mente ("Wires middlewarePipelineService") mas **nenhum import de serviço**                                                 | Ligar em `services/middlewarePipelineService.ts` (existe e é testado) e persistir                                              |
| Retry & Circuit Breaker                                             | `monitoring/`            | IMPLEMENTADO_PARCIAL                       | `monitoring/RetryEnginePanel.tsx:9-11` importa só `RETRY_PRESETS` e `DEFAULT_CIRCUIT_CONFIG` (constantes)                                                                                                             | É um **catálogo estático**, não um "status" (cabeçalho `:2` promete "Circuit breaker status"). Falta estado runtime do breaker |
| Histórico de drilldown SLO                                          | `slo/`                   | IMPLEMENTADO_TOTAL                         | `slo/DrilldownAuditPanel.tsx:42-53` copia URL de estado; alimentado por `lib/slo/useDrilldownAuditLog`                                                                                                                | Só sessão local (por design declarado)                                                                                         |
| Saúde do banco (snapshot)                                           | `admin/`                 | IMPLEMENTADO_TOTAL                         | `admin/DbHealthCard.tsx:54+` RPC `get_db_health_snapshot` (3 migrações)                                                                                                                                               | —                                                                                                                              |
| Série temporal de saúde do banco                                    | `admin/`                 | **IMPLEMENTADO_PARCIAL**                   | `admin/DbHealthTimeseriesCard.tsx:37` RPC `get_db_health_timeseries`, que lê snapshots gravados pelo cron `capture-perf-snapshot` (`supabase/migrations/20260712110111_*.sql:254`) — **job inexistente**              | Criar o cron; sem ele a série é sempre vazia                                                                                   |
| SLO dos detectores                                                  | `admin/`                 | **IMPLEMENTADO_PARCIAL**                   | `admin/DetectorSloCard.tsx:35` RPC `get_detector_slo_status`; `:20-28` lista jobs esperados (`detect-health-trend-every-15min`, smokes 6h) que **não existem no pg_cron**                                             | O card vai reportar SLO estourado/vazio para todos                                                                             |
| Trilha de auditoria                                                 | `admin/`                 | IMPLEMENTADO_TOTAL                         | `admin/AuditTrailPanel.tsx:53+` via `auditLogService`                                                                                                                                                                 | —                                                                                                                              |
| Saúde de partições                                                  | `system/`                | IMPLEMENTADO_TOTAL                         | `system/PartitionHealthCard.tsx:30-33` RPC `get_partition_health_snapshot` (3 migrações), refetch 60s                                                                                                                 | —                                                                                                                              |

### 1.2 Billing

| Funcionalidade                           | Módulo     | Classificação            | Evidência (arquivo:linha)                                                                                                                                                                                                                                                                                                                                                                                      | O que falta                                                            |
| ---------------------------------------- | ---------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Stream de custo em tempo real            | `billing/` | IMPLEMENTADO_TOTAL       | `billing/RealTimeCostStream.tsx:50-72` — realtime `postgres_changes` INSERT em `usage_records`                                                                                                                                                                                                                                                                                                                 | Sem dado até haver uso                                                 |
| Calculadora de custo LLM                 | `billing/` | IMPLEMENTADO_TOTAL       | `billing/CostCalculatorPanel.tsx:19-23` `getAllPricing()`; `:57-60` `calculateCost` real                                                                                                                                                                                                                                                                                                                       | —                                                                      |
| Recomendações de otimização de custo     | `billing/` | **IMPLEMENTADO_PARCIAL** | Regras 2 e 3 usam dado real (`:70-115`); regra 1 e a "dica" usam **percentuais inventados** — `:43-45`, `:59`, `:124`                                                                                                                                                                                                                                                                                          | Substituir estimativas fixas por cálculo com `model_pricing` real      |
| **Gateway de pagamento / cobrança real** | `billing/` | **NÃO EXISTE**           | Varredura por `stripe\|paypal\|payment_intent\|checkout.session\|mercadopago\|pagseguro\|asaas` em `src/` + `supabase/functions/`: **zero implementação**. Só menções de catálogo (`services/presets/credentialPresets.ts:10`, `services/webhookTriggerService.ts:286`) e admissão explícita em `pages/MarketplaceMonetizedPage.tsx:52` — _"Pagamento mock nesta versão — Stripe Connect na próxima iteração"_ | Tudo. `billing/` é **FinOps de custo de LLM**, não cobrança de cliente |

### 1.3 RBAC

| Funcionalidade                    | Módulo                        | Classificação                   | Evidência (arquivo:linha)                                                                                                                                                                                                                                                                                                                               | O que falta                                                 |
| --------------------------------- | ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Guard de rota por permissão       | `rbac/`                       | IMPLEMENTADO_TOTAL              | `rbac/ProtectedRoute.tsx:33-90`; usado **77×** em `src/App.tsx`                                                                                                                                                                                                                                                                                         | —                                                           |
| Render condicional por permissão  | `rbac/`                       | IMPLEMENTADO_TOTAL              | `rbac/AccessControl.tsx:36-54`; usado em 16 arquivos                                                                                                                                                                                                                                                                                                    | —                                                           |
| Confirmação de ação perigosa      | `rbac/`                       | IMPLEMENTADO_TOTAL              | `rbac/DangerousActionDialog.tsx` (284 l.) + `auditLogService`; usado em 13 arquivos                                                                                                                                                                                                                                                                     | —                                                           |
| Carregamento de papéis/permissões | `rbac/`                       | IMPLEMENTADO_TOTAL              | `src/hooks/useRBAC.ts:49-58` lê `workspace_members` → `rbacService.getUserPermissions`                                                                                                                                                                                                                                                                  | —                                                           |
| **Tela de permissões — salva?**   | `rbac/` (consumidor `pages/`) | **NÃO SALVA — somente leitura** | `src/pages/RolePermissionsPage.tsx` (145 l.): **nenhum `insert`/`update`/`upsert`/`delete`**. `:44-47` só lê `role_permissions`; `:117-126` renderiza check/X **estáticos, sem toggle e sem botão salvar**. Confirmado também na API: `src/services/rbacService.ts` expõe `assignRole`/`removeRole` mas **nenhuma função de gravar permissão em papel** | Toggle + mutation em `role_permissions` + função de serviço |

### 1.4 CRM

| Funcionalidade                         | Módulo | Classificação                                 | Evidência (arquivo:linha)                                                                                                                                                                                                                                                                     | O que falta                                                                                                                                                  |
| -------------------------------------- | ------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cards de resumo (forecast, win rate)   | `crm/` | IMPLEMENTADO_TOTAL                            | `crm/CrmSummaryCards.tsx:14-38` — 100% derivado de `CrmSummary` do serviço, zero literal                                                                                                                                                                                                      | Dado (`crm_deals` vazia)                                                                                                                                     |
| Tabelas de negócios/contatos/empresas  | `crm/` | IMPLEMENTADO_TOTAL                            | `crm/DealsTable.tsx`, `ContactsTable.tsx`, `CompaniesTable.tsx` → `services/crmService`                                                                                                                                                                                                       | Dado                                                                                                                                                         |
| **Integração Bitrix24 — é real?**      | `crm/` | **IMPLEMENTADO_TOTAL na plumbing, sem dado**  | `src/services/crmService.ts:4` "modelo canônico próprio (`crm_*`), espelhado a partir do Bitrix24"; `:520-528` `syncFromBitrix24` → `functions.invoke('crm-bitrix-sync')`. Edge functions existem: `supabase/functions/bitrix24-api`, `bitrix24-oauth`, `bitrix24-webhook`, `crm-bitrix-sync` | **Não é UI solta** — é modelo espelhado. Falta rodar o sync (tabelas `crm_*` todas vazias) e `BITRIX24_WEBHOOK_TOKEN` está `REPLACE_ME` em `.env.example:29` |
| Perfil ICP + score de lead + simulador | `crm/` | IMPLEMENTADO_TOTAL                            | `crm/IcpProfilePanel.tsx:213` embute `LeadScoreSimulator`; ambos via `services/crmScoringService`                                                                                                                                                                                             | Dado                                                                                                                                                         |
| Cadências de vendas (editor + painel)  | `crm/` | IMPLEMENTADO_PARCIAL                          | `crm/CadencesPanel.tsx`, `CadenceStepsEditor.tsx` → `crmCadenceService`                                                                                                                                                                                                                       | —                                                                                                                                                            |
| **Execução de cadências**              | `crm/` | **IMPLEMENTADO_PARCIAL — nunca roda sozinha** | `src/services/crmCadenceService.ts:326` invoca `crm-cadence-runner` **manualmente**. A única menção a cron é a _purga_ (`supabase/migrations/20260726204455_*.sql:28` `purge-crm-cadence-runs-daily`) — e não há job algum no banco                                                           | Agendar o runner                                                                                                                                             |
| Histórico de execuções de cadência     | `crm/` | IMPLEMENTADO_TOTAL (read-only por design)     | `crm/CadenceRunsPanel.tsx:1-8` (comentário explica a decisão) + `listCadenceRuns`                                                                                                                                                                                                             | Dado                                                                                                                                                         |

### 1.5 Chat

| Funcionalidade                               | Módulo  | Classificação                | Evidência (arquivo:linha)                                                                                                                                                                                                                                                             | O que falta                   |
| -------------------------------------------- | ------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Chat chama LLM de verdade?**               | `chat/` | **SIM — IMPLEMENTADO_TOTAL** | `src/pages/ChatWithAgentPage.tsx:257` `stream(buildEdgeUrl('llm-gateway'), payload, …)`; payload com `model`/`messages`/`session_id` em `:239-254`; SSE real em `src/hooks/useStreamingResponse.ts` (retry exponencial, abort). Edge function `supabase/functions/llm-gateway` existe | —                             |
| Persistência de conversa                     | `chat/` | IMPLEMENTADO_TOTAL           | `ChatWithAgentPage.tsx:273-283` `appendMessage` em `chat_threads`/`chat_messages` com `parentId`                                                                                                                                                                                      | Tabelas vazias = ninguém usou |
| Composer, bolhas, typing, emoji, dia, limpar | `chat/` | IMPLEMENTADO_TOTAL           | 11 componentes presentacionais puros; `EmojiPicker.tsx:11-17` catálogo estático (correto para emoji)                                                                                                                                                                                  | —                             |
| Anexar arquivo                               | `chat/` | **SUGERIDO_OU_INICIADO**     | `chat/ChatComposer.tsx:79-84` — botão `disabled` + tooltip **"Anexar (em breve)"**                                                                                                                                                                                                    | Upload + storage              |

### 1.6 Voice, Sandbox, Replay, Debug

| Funcionalidade                  | Módulo     | Classificação                                     | Evidência (arquivo:linha)                                                                                                                                                                                                                                                                                                 | O que falta                                                                                                                   |
| ------------------------------- | ---------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Visualizador de áudio (FFT)     | `voice/`   | **REAL** — IMPLEMENTADO_TOTAL                     | `voice/AudioVisualizer.tsx:31-61` — `AudioContext` + `createAnalyser` + `getByteFrequencyData` reais sobre `MediaStream`; alimentado por `pages/VoiceAgentStudioPage.tsx:35` `getUserMedia({audio:true})`                                                                                                                 | —                                                                                                                             |
| Waveform de voz                 | `voice/`   | **REAL** — IMPLEMENTADO_TOTAL                     | `voice/VoiceWaveform.tsx:16-30`; usado em `pages/VoiceAgentsPage.tsx:246` com stream de `:112`                                                                                                                                                                                                                            | —                                                                                                                             |
| **Abas de sandbox**             | `sandbox/` | **MORTO_OU_ABANDONADO — 4/4 órfãos (329 linhas)** | `sandbox/SandboxConfigTab.tsx`, `SandboxExecuteTab.tsx`, `SandboxOutputTab.tsx`, `SandboxSecurityTab.tsx` — **zero imports em todo o `src/`**. O painel vivo (`components/workflows/SandboxExecutionPanel.tsx`) tem as abas **inline** (`:84-92`) e importa `./sandbox/SandboxFields` (`:22`), um diretório **diferente** | Excluir a duplicata. Nota: o painel vivo delega execução ao prop `onExecute` (`:43-45`) — a execução real depende do chamador |
| Fork de replay + diff de estado | `replay/`  | IMPLEMENTADO_TOTAL                                | `replay/StateDiff.tsx:13-30` diff linha a linha real; `replay/ForkHistoryPanel.tsx` → `replayForkService`; edge function `supabase/functions/replay-fork-execute` existe                                                                                                                                                  | Dado                                                                                                                          |
| Debug do cache de signed URLs   | `debug/`   | **REAL** — IMPLEMENTADO_TOTAL                     | `debug/SignedUrlCacheDebugPanel.tsx:25-33` — opt-in por DEV/query/localStorage; `:37-39` estatísticas reais de `lib/signedUrlCache` (hit rate, avgFetchMs)                                                                                                                                                                | —                                                                                                                             |

### 1.7 Layout / navegação

| Funcionalidade                      | Módulo    | Classificação                                   | Evidência (arquivo:linha)                                                                                                                                                | O que falta          |
| ----------------------------------- | --------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| **Menu lateral → páginas existem?** | `layout/` | **IMPLEMENTADO_TOTAL — 110/110 itens têm rota** | `layout/AppSidebar.tsx` declara 110 URLs únicas; `src/App.tsx` declara 151 `path=`. Diff `menu − rotas` = **vazio**. (41 rotas existem sem entrada no menu — deep links) | Nenhum link quebrado |
| Shell da aplicação                  | `layout/` | IMPLEMENTADO_TOTAL                              | `layout/AppLayout.tsx` (294 l.), `AuthGuard.tsx` (13 l.)                                                                                                                 | —                    |
| Prefetch de rota no hover           | raiz      | IMPLEMENTADO_TOTAL                              | `src/components/NavLink.tsx:14-16` `prefetchRoute(to)`                                                                                                                   | —                    |

### 1.8 OpenClaw (os dois)

| Funcionalidade                                                  | Módulo                     | Classificação                                     | Evidência (arquivo:linha)                                                                                                                                                                                                                                                                                                | O que falta                                                                                                                                                                                                                              |
| --------------------------------------------------------------- | -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **O que é**                                                     | `/openclaw/` (topo)        | **CONFIG DE INFRA EXTERNA, não código da app**    | `openclaw/README.md:1-10` — agente OpenClaw da Promo Brindes em VPS Hostinger KVM4, `https://openclaw-sbem.srv1481814.hstgr.cloud`, Claude Sonnet/Opus/Haiku 4.x, canais WhatsApp + webhooks Bitrix24                                                                                                                    | Nada a implementar; é template + docs                                                                                                                                                                                                    |
| Template de configuração                                        | `/openclaw/config/`        | SUGERIDO_OU_INICIADO                              | `openclaw/config/openclaw.json.template` — todos os segredos são `CHANGE_ME_*` (`ANTHROPIC_API_KEY`, `GATEWAY_TOKEN`, `HOOKS_TOKEN`)                                                                                                                                                                                     | Preencher no servidor (por design)                                                                                                                                                                                                       |
| Workspace do agente (SOUL/AGENTS/USER/HEARTBEAT/skill Bitrix24) | `/openclaw/workspace/`     | Documentação — não é código executável            | 5 arquivos `.md`                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                        |
| Scripts de operação                                             | `/openclaw/scripts/`       | IMPLEMENTADO_TOTAL (shell)                        | `openclaw/scripts/healthcheck.sh:1-6` reinicia container Docker; `backup.sh`                                                                                                                                                                                                                                             | Precisa de crontab no VPS (`README.md:29`)                                                                                                                                                                                               |
| **Está ligado ao app?**                                         | `src/components/openclaw/` | **SIM — IMPLEMENTADO_TOTAL, mas não configurado** | `openclaw/OpenclawStatusBadge.tsx:17-23` poll 30s de `getOpenclawHealth`; `OpenclawTestConsole.tsx:47` `chatWithOpenclawAgent`; `OpenclawWhatsappSetup.tsx:15` `pairWhatsapp`/`getWhatsappStatus` + persistência em `openclaw_whatsapp_instances` (`:66-70`, `:88+`). Tudo passa por `supabase/functions/openclaw-proxy` | **Secrets ausentes**: `openclaw-proxy/index.ts:35-36` exige `OPENCLAW_URL` e `OPENCLAW_API_TOKEN`; **nenhuma das duas está em `.env.example`**. O badge já prevê isso (`OpenclawStatusBadge.tsx:26` estado `"OpenClaw Mal Configurado"`) |

### 1.9 Demais módulos do lote

| Funcionalidade                                      | Módulo           | Classificação                               | Evidência (arquivo:linha)                                                                                                                                                                                                                                                                                                                        | O que falta                                              |
| --------------------------------------------------- | ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Notificações de agente no Slack                     | `slack/`         | IMPLEMENTADO_TOTAL                          | `slack/SlackAgentNotificationsPanel.tsx:7-9` supabase + `useSlackConfig`                                                                                                                                                                                                                                                                         | `SLACK_BOT_TOKEN=xoxb-REPLACE_ME` (`.env.example:27`)    |
| Vínculo canal↔agente                                | `slack/`         | IMPLEMENTADO_TOTAL                          | `slack/SlackBotBindingPanel.tsx:6-9`                                                                                                                                                                                                                                                                                                             | —                                                        |
| Saúde do despacho Slack 24h                         | `slack/`         | IMPLEMENTADO_TOTAL                          | `slack/SlackHealthCard.tsx:24-28` lê view `slack_dispatch_health`; taxa de erro **calculada** em `:36-38`, sem literal                                                                                                                                                                                                                           | Dado                                                     |
| DLQ do Slack (retry/discard)                        | `slack/`         | IMPLEMENTADO_TOTAL                          | `slack/SlackDlqPanel.tsx` → `functions.invoke`; funcs `slack-dlq-retry`, `slack-dlq-discard` existem                                                                                                                                                                                                                                             | —                                                        |
| Fontes RAG do Slack                                 | `slack/`         | IMPLEMENTADO_TOTAL                          | `slack/SlackRagSourcesPanel.tsx:6` `useSlackRagSources`; func `slack-rag-sync`                                                                                                                                                                                                                                                                   | —                                                        |
| Wizard de onboarding Slack                          | `slack/`         | IMPLEMENTADO_TOTAL (**único com teste**)    | `slack/SlackOnboardingWizard.tsx:13`; `slack/__tests__/SlackOnboardingWizard.test.tsx`                                                                                                                                                                                                                                                           | —                                                        |
| Broadcast de teste                                  | `slack/`         | IMPLEMENTADO_TOTAL                          | `slack/SlackTestBroadcastButton.tsx` → `functions.invoke`                                                                                                                                                                                                                                                                                        | —                                                        |
| **Wizard de implantação**                           | `deployments/`   | **MORTO_OU_ABANDONADO (teatro)**            | ver §2, itens 1-4                                                                                                                                                                                                                                                                                                                                | Reescrever inteiro                                       |
| Inbox WhatsApp                                      | `deployments/`   | IMPLEMENTADO_TOTAL                          | `deployments/WhatsAppInboxPanel.tsx:5,28-42` query real em eventos WhatsApp com `signature_valid`, `routing_status`; mascaramento de telefone em `:65-70`                                                                                                                                                                                        | Dado; funcs `whatsapp-webhook`/`whatsapp-router` existem |
| Envio WhatsApp                                      | `deployments/`   | IMPLEMENTADO_TOTAL                          | `deployments/WhatsAppSendDialog.tsx` → `whatsappOutboundService`                                                                                                                                                                                                                                                                                 | Token `REPLACE_ME` (`.env.example:31-32`)                |
| Widget web embutível                                | `deployments/`   | IMPLEMENTADO_TOTAL                          | `deployments/WebWidgetPanel.tsx:10-14` `buildWidgetEmbedSnippet`/`sendWidgetChatMessage`/`checkWidgetEndpointAvailable`; func `widget-proxy` existe                                                                                                                                                                                              | —                                                        |
| Fila de aprovação (HITL)                            | `deployments/`   | IMPLEMENTADO_TOTAL                          | `deployments/ApprovalQueuePanel.tsx:14-18` refetch 10s; `:26-30` approve/reject reais                                                                                                                                                                                                                                                            | —                                                        |
| Datasets de avaliação                               | `evaluations/`   | IMPLEMENTADO_TOTAL                          | `evaluations/EvaluationDatasetsPanel.tsx` → `evaluationsService` + `supabaseExternal.from`                                                                                                                                                                                                                                                       | `eval_runs`/`evaluation_runs` vazias                     |
| Métricas RAGAS                                      | `evaluations/`   | IMPLEMENTADO_TOTAL                          | `evaluations/RAGASMetricsPanel.tsx:11` `runRAGASEvaluation`; `:26` barra derivada de `value*100` (sem literal)                                                                                                                                                                                                                                   | —                                                        |
| Relatório de auditoria de eval                      | `evaluations/`   | **IMPLEMENTADO_PARCIAL**                    | JSON real (`AuditReportDialog.tsx:15-34`); **PDF é fake** (`:41-45`)                                                                                                                                                                                                                                                                             | Ver §2 item 8                                            |
| Gerenciador de ambientes                            | `settings/`      | IMPLEMENTADO_TOTAL                          | `settings/EnvironmentsManager.tsx` → `settingsService` + `AccessControl`                                                                                                                                                                                                                                                                         | `environments` vazia                                     |
| Chaves de API                                       | `settings/`      | IMPLEMENTADO_TOTAL                          | `settings/ApiKeysTab.tsx` → `settingsService`                                                                                                                                                                                                                                                                                                    | —                                                        |
| Servidores MCP                                      | `settings/`      | IMPLEMENTADO_TOTAL                          | `settings/MCPServersPanel.tsx:10` → `lib/mcp`; `src/lib/mcp/mcpRegistry.ts:17-23` lê e `:49-58` grava em `mcp_servers`; conexão real tentada em `:40-46`                                                                                                                                                                                         | —                                                        |
| **Aba HuggingFace**                                 | `settings/`      | **SUGERIDO_OU_INICIADO (vitrine estática)** | ver §2 item 7                                                                                                                                                                                                                                                                                                                                    | Verificação real de status                               |
| Mockup de produto (mockup/upscale/inpaint/segment)  | `tools/`         | IMPLEMENTADO_TOTAL                          | 4 abas → `services/productMockupService.ts:45,73,102,134` `functions.invoke('product-mockup')`; func existe                                                                                                                                                                                                                                      | —                                                        |
| Análise de imagem                                   | `tools/`         | IMPLEMENTADO_TOTAL                          | `tools/ImageAnalysisDialog.tsx` → `visionService.ts:35` `functions.invoke('image-analysis')`                                                                                                                                                                                                                                                     | —                                                        |
| 5 diálogos de criação (eval, KB×2, prompt, convite) | `dialogs/`       | IMPLEMENTADO_TOTAL                          | Todos com serviço real: `evaluationsService`+`llmGatewayService`, `knowledgeService`, `securityService`, `teamsService`                                                                                                                                                                                                                          | —                                                        |
| Diff de prompt                                      | `prompts/`       | IMPLEMENTADO_TOTAL                          | `prompts/PromptDiff.tsx` (101 l., puro)                                                                                                                                                                                                                                                                                                          | —                                                        |
| Criar experimento de prompt                         | `prompts/`       | IMPLEMENTADO_TOTAL                          | `prompts/CreateExperimentDialog.tsx` → `promptExperimentService`                                                                                                                                                                                                                                                                                 | —                                                        |
| Toggle de Random Recall por agente                  | `memory/`        | IMPLEMENTADO_TOTAL                          | `memory/RandomRecallToggleCard.tsx:52-58` lê `agents.config`; grava em `agents.config.random_recall_enabled` (jsonb)                                                                                                                                                                                                                             | —                                                        |
| Badge de tier de memória                            | `memory/`        | IMPLEMENTADO_TOTAL                          | `memory/MemoryTierBadge.tsx` (46 l., puro)                                                                                                                                                                                                                                                                                                       | —                                                        |
| Canvas de grafo (ReactFlow)                         | `orchestration/` | IMPLEMENTADO_TOTAL                          | `orchestration/GraphCanvas.tsx:2-7` ReactFlow real; `NodeConfigPanel.tsx` → `agentGraphService`                                                                                                                                                                                                                                                  | —                                                        |
| Busca visual                                        | `search/`        | IMPLEMENTADO_TOTAL                          | `search/VisualSearchButton.tsx` → `searchService.ts:56` `functions.invoke('visual-search')`                                                                                                                                                                                                                                                      | —                                                        |
| Monitor de eventos de roteamento                    | `routing/`       | IMPLEMENTADO_TOTAL                          | `routing/RoutingEventsMonitor.tsx:10,16` duas queries (Bitrix + WhatsApp)                                                                                                                                                                                                                                                                        | Dado                                                     |
| Painel de branding do login                         | `auth/`          | IMPLEMENTADO_TOTAL (decorativo)             | `auth/AuthBrandingPanel.tsx:48-53` `Math.random()` para partículas — **puramente visual**, não é métrica                                                                                                                                                                                                                                         | —                                                        |
| Força de senha                                      | `auth/`          | IMPLEMENTADO_TOTAL                          | `auth/PasswordStrength.tsx` (34 l.)                                                                                                                                                                                                                                                                                                              | —                                                        |
| **Primitivos shadcn/ui**                            | `ui/`            | IMPLEMENTADO_TOTAL, com **14 órfãos**       | Customização real e consistente: `ui/button.tsx:18` variante extra `gradient` (`nexus-gradient-bg`), `:8` `active:scale-[0.97]`, sombras `shadow-nexus-*`; tokens tipográficos próprios (`text-body-sm`, `text-meta`, `text-title-sm`) em vez de `text-sm`/`text-xs` — aplicados de forma uniforme (`badge.tsx:7`, `button.tsx:8`). Órfãos em §3 | Remover os 14 não usados                                 |

---

## 2. 🚨 SEÇÃO DESTACADA — todo dado fictício / hardcoded encontrado

Ordenado por **gravidade** (quanto engana o operador).

### GRAVÍSSIMO — funcionalidade inteira é teatro

**1. Deploy que não faz deploy**

```
src/components/deployments/DeploymentWizard.tsx:28   // Simulate industrial deployment pipeline
src/components/deployments/DeploymentWizard.tsx:29   await new Promise(r => setTimeout(r, 2000));
src/components/deployments/DeploymentWizard.tsx:34   toast.success(`Agente ${agentName} implantado em ${targetEnv.toUpperCase()}`);
```

E o único consumidor confirma que nada acontece:

```
src/pages/DeploymentsPage.tsx:223-225   onDeploy={(env) => { logger.info(`Deploying to ${env}`, {...}); }}
```

→ O usuário vê "Agente implantado em PRODUCTION" e **nada foi gravado, chamado ou publicado**.

**2. "Checklist de Integridade" com resultados fixos** — os três "testes" são literais de array, executados zero vezes:

```
src/components/deployments/DeploymentWizard.tsx:105   { label: "Verificação de Guardrails",  status: "Passou"   }
src/components/deployments/DeploymentWizard.tsx:106   { label: "Análise de Latência P95",    status: "< 800ms"  }
src/components/deployments/DeploymentWizard.tsx:107   { label: "Consistência de Memória",    status: "Ok"       }
```

**3. Versão de release inventada** — sempre "v2.4.1", para qualquer agente:

```
src/components/deployments/DeploymentWizard.tsx:128   ...implantar a versão <span ...>v2.4.1</span>...
```

**4. SLA de uptime inventado + fallback de latência disfarçado de medição**

```
src/pages/DeploymentsPage.tsx:195   { label: 'Gateway Neural',   val: '99.99%' }              ← literal, nunca calculado
src/pages/DeploymentsPage.tsx:196   { label: 'Latência Global',  val: `${health?.checks?.gateway?.latency_ms || 142}ms` }
```

O `|| 142` é o pior tipo: quando o health check falha, a tela exibe "142ms" com cor verde
(`text-nexus-emerald` fixa em `:196`) como se fosse leitura real.

### GRAVE — painel finge estar ligado a um serviço

**5. Middleware Pipeline — comentário mente, dados são array fixo, toggle não persiste**

```
src/components/monitoring/MiddlewarePipelinePanel.tsx:3    * Wires middlewarePipelineService into MonitoringPage.   ← FALSO: nenhum import de serviço
src/components/monitoring/MiddlewarePipelinePanel.tsx:10-17 const AVAILABLE_MIDDLEWARES = [ …5 itens fixos… ]
src/components/monitoring/MiddlewarePipelinePanel.tsx:19    useState(new Set(['logging','token_counter','cost_tracker']))
```

Bug adicional na linha 19: `'cost_tracker'` **não existe** em `AVAILABLE_MIDDLEWARES`, então o
badge "N ativo(s)" (`:37`) conta **3** enquanto só **2** linhas acendem. O serviço real
(`src/services/middlewarePipelineService.ts`) existe e tem testes
(`src/test/middleware-pipeline.test.ts`) — está apenas desconectado da UI.

**6. Retry/Circuit Breaker apresentado como "status", é catálogo estático**

```
src/components/monitoring/RetryEnginePanel.tsx:2     * RetryEnginePanel — Circuit breaker status and retry policies.
src/components/monitoring/RetryEnginePanel.tsx:13-20 const PRESET_META = { …descrições hardcoded… }
src/components/monitoring/RetryEnginePanel.tsx:9-11  importa apenas RETRY_PRESETS e DEFAULT_CIRCUIT_CONFIG (constantes)
```

Os números exibidos (tentativas, delays, thresholds, `:85-90`) são **constantes de código**,
não estado de um breaker em execução. Nenhuma métrica runtime.

**7. HuggingFace — 7 features marcadas "Ativo" sem nenhuma verificação**

```
src/components/settings/HuggingFaceTab.tsx:3-10   const FEATURES = [ …6× status:'active', 1× 'available'… ]
src/components/settings/HuggingFaceTab.tsx:4      '…Detecta prompt injection com 99.9% precisão'   ← claim de acurácia sem fonte
```

Nenhuma chamada a API, nenhum ping, nenhuma leitura de config. O selo verde "Ativo" é
literal de array — o painel diria "Ativo" mesmo sem `huggingface_api_key` cadastrada.

### MODERADO

**8. Geração de PDF simulada**

```
src/components/evaluations/AuditReportDialog.tsx:40-41  // Em um sistema real, usaríamos jspdf ou similar.
                                                        // Aqui simularemos a geração…
src/components/evaluations/AuditReportDialog.tsx:42-45  setTimeout(() => { window.print(); …toast.success('Relatório gerado') }, 1000)
```

O delay de 1s existe só para parecer processamento. (O export JSON, `:15-34`, é real.)

**9. Percentuais de economia inventados em recomendações de custo**

```
src/components/billing/CostOptimizationPanel.tsx:43   'gpt-5': 'gpt-5-mini (-60% custo)'
src/components/billing/CostOptimizationPanel.tsx:44   'claude-sonnet-4': 'claude-haiku-4 (-75% custo)'
src/components/billing/CostOptimizationPanel.tsx:45   'gemini-2.5-pro': 'gemini-2.5-flash (-80% custo)'
src/components/billing/CostOptimizationPanel.tsx:59   savingsEstimate: '40-80%'
src/components/billing/CostOptimizationPanel.tsx:124  '…reduzir custos em até 30%.'
```

Ironia: o próprio componente já carrega `getModelPricing()` (`:29`) e **não o usa** para
esses cálculos — as recomendações 2 e 3 (`:70-115`) são derivadas de dado real, provando que
a infraestrutura para calcular existe.

**10. "Comparar período anterior" não compara período anterior**

```
src/components/charts/ComparisonToggle.tsx:34-47   generateComparisonData(data, keys, offset)
                                                    → prev = data[i - shift]  (mesmo array deslocado)
src/components/dashboard/UsageCharts.tsx:82         generateComparisonData(chartData, ['requests'], 15)
src/components/dashboard/UsageCharts.tsx:87         generateComparisonData(chartData, ['cost'], 15)
```

Sobre uma janela de 30 dias com offset 15, a "linha do período anterior" é a **primeira
quinzena da mesma janela**, não os 30 dias anteriores. Rótulo do botão: "vs anterior"
(`UsageCharts.tsx:167`). Não é dado inventado, mas é **rótulo falso sobre dado real**.

### BENIGNO — `Math.random()` puramente cosmético (registrado para completude)

```
src/components/ui/sidebar.tsx:536            largura aleatória 50-90% do skeleton (padrão shadcn, comentado em :534)
src/components/auth/AuthBrandingPanel.tsx:48-53  posição/tamanho/delay de partículas decorativas do login
src/components/billing/RealTimeCostStream.tsx:60 id de fallback quando o payload realtime não traz `row.id`
```

Nenhum destes alimenta um número exibido como métrica.

### Varredura negativa (o que **não** foi encontrado — igualmente relevante)

Grep em todo o escopo por `Math.random`, `|| <número ≥2 dígitos>`, `'99.` , `"99.`,
`'<n>ms'`, `<n>.<n>%` — **nenhuma outra ocorrência** de métrica hardcoded em card.
Especificamente limpos: `crm/CrmSummaryCards.tsx`, `slack/SlackHealthCard.tsx`,
`evaluations/RAGASMetricsPanel.tsx`, `metrics/*`, `admin/*`, `system/*`, `dashboard/*`.
Todos calculam de dado do banco ou mostram `0`/`—`/empty-state.

---

## 3. 🔴 Achado estrutural: 11 jobs pg_cron declarados, ZERO existem

Isto não é dado falso — é **pior**: são painéis corretos alimentando-se de fontes que nunca
são populadas, então exibem `0`/vazio **sem sinalizar que a causa é infra ausente**.

Jobs declarados nas migrações (34 arquivos contêm `cron.schedule`):

| Job                                             | Migração                                            | Painel do meu escopo que depende dele                            |
| ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| `capture-perf-snapshot`                         | `20260712110111_*.sql:254`                          | `admin/DbHealthTimeseriesCard.tsx:37` (série sempre vazia)       |
| `check-db-bloat`                                | `20260712110111_*.sql:256`                          | `admin/DbHealthCard.tsx` (alertas de bloat nunca gerados)        |
| `prune-perf-snapshots`                          | `20260712110111_*.sql:258`                          | —                                                                |
| `cost-baselines-daily`                          | `20260418011629_*.sql:221`                          | `dashboard/CostAnomalyWidget.tsx`                                |
| `cost-anomalies-15min`                          | `20260418011629_*.sql:223`                          | `dashboard/CostAnomalyWidget.tsx` (`cost_alerts` vazia)          |
| `detect-health-trend-every-15min` + 3 smokes 6h | —                                                   | `admin/DetectorSloCard.tsx:20-28` (SLO de todos estourado/vazio) |
| refresh de `knowledge_graph_health`             | citado em `metrics/KnowledgeGraphHealthCard.tsx:12` | MV nunca recalculada                                             |
| `purge-crm-cadence-runs-daily`                  | `20260726204455_*.sql:28`                           | `crm/CadenceRunsPanel.tsx`                                       |
| `lgpd-*` (4 jobs)                               | —                                                   | fora do escopo                                                   |

Some-se: **nenhum job avalia `alert_rules`** — logo `monitoring/AlertRulesPanel.tsx` grava
regras que nunca disparam, e `dashboard/DashboardAlerts.tsx` nunca receberá alerta.

---

## 4. Contagem por classificação

Unidade = funcionalidade das tabelas §1 (74 linhas classificadas; `ui/` contado como 1).

| Classificação                     | Qtd | %   |
| --------------------------------- | --- | --- |
| IMPLEMENTADO_TOTAL                | 48  | 65% |
| IMPLEMENTADO_PARCIAL              | 13  | 18% |
| SUGERIDO_OU_INICIADO              | 4   | 5%  |
| MORTO_OU_ABANDONADO               | 7   | 9%  |
| NÃO EXISTE (gateway de pagamento) | 1   | 1%  |
| Documentação/config (não código)  | 2   | —   |

**IMPLEMENTADO_PARCIAL (13):** comparação de período · KG Health (cron) · Langfuse ·
Alert Rules (sem avaliador) · Retry Panel · DbHealthTimeseries (cron) · DetectorSlo (cron) ·
Cost Optimization (% fixos) · Cadências (execução) · Sync Bitrix24 (sem dado) ·
AuditReport PDF · `ui/` (14 órfãos) · Cadences Panel.

**SUGERIDO_OU_INICIADO (4):** Middleware Pipeline · HuggingFace Tab · anexo no chat ·
template OpenClaw (`CHANGE_ME_*`).

**MORTO_OU_ABANDONADO (7):** DeploymentWizard · ChartAnnotation · BudgetWidget ·
CostAnomalyWidget · 4× abas de `sandbox/` (contadas como 1) · 14 primitivos `ui/`
(contados como 1) · `sandbox/` completo.

Linhas: **~20.100** no escopo. **~1.930 linhas comprovadamente mortas ou fictícias** (9,6%):
1.283 (`ui/` órfão) + 329 (`sandbox/`) + 162 (`DeploymentWizard`) + 112 (`BudgetWidget` +
`CostAnomalyWidget`) + 75 (`MiddlewarePipelinePanel`) + 62 (`ChartAnnotation`).

---

## 5. Componentes órfãos — com prova

Método: para cada arquivo, `grep -rl "<basename>" src/` excluindo o próprio arquivo → 0 hits.
Para `ui/`, `grep -rl "ui/<nome>" src/` excluindo `src/components/ui/` → 0 hits.

### 5.1 Órfãos funcionais (6 arquivos, 601 linhas)

| Arquivo                                          | Linhas | Prova                                                                                                                |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `src/components/dashboard/BudgetWidget.tsx`      | 72     | 0 imports; nem `DashboardPage.tsx` nem `BudgetsPage.tsx` o referenciam                                               |
| `src/components/dashboard/CostAnomalyWidget.tsx` | 40     | 0 imports                                                                                                            |
| `src/components/sandbox/SandboxSecurityTab.tsx`  | 100    | 0 imports; painel vivo usa `components/workflows/sandbox/SandboxFields` (`SandboxExecutionPanel.tsx:22`)             |
| `src/components/sandbox/SandboxConfigTab.tsx`    | 82     | idem                                                                                                                 |
| `src/components/sandbox/SandboxExecuteTab.tsx`   | 75     | idem                                                                                                                 |
| `src/components/sandbox/SandboxOutputTab.tsx`    | 72     | idem                                                                                                                 |
| `src/components/charts/ChartAnnotation.tsx`      | 62     | Exportado em `charts/index.ts:8` mas `grep -rn "ChartAnnotation"` só acha a definição e o re-export — 0 consumidores |

### 5.2 Primitivos shadcn/ui nunca usados (14 arquivos, ~1.283 linhas)

`carousel.tsx` (224) · `menubar.tsx` (207) · `context-menu.tsx` (178) · `form.tsx` (130) ·
`navigation-menu.tsx` (121) · `breadcrumb.tsx` (90) · `pagination.tsx` (83) ·
`input-otp.tsx` (61) · `calendar.tsx` (54) · `accordion.tsx` (52) · `avatar.tsx` (38) ·
`resizable.tsx` (37) · `aspect-ratio.tsx` (5) · `use-toast.ts` (3)

Todos com **0 referências** fora de `src/components/ui/`. São o scaffold padrão do
`shadcn add --all` do Lovable, nunca podados.

Casos limítrofes (1 consumidor cada, **não** órfãos): `drawer.tsx` ←
`components/agents/detail/DayDrillDownDrawer.tsx`; `hover-card.tsx` ←
`components/super-cerebro/notebook/WikilinkHoverCard.tsx`.

### 5.3 Não são órfãos (verificado, contra a intuição)

`charts/ChartTooltip.tsx`, `ChartLegend.tsx`, `useChartDimensions.ts` — 0 uso **fora** de
`charts/`, mas importados internamente por `LightAreaChart.tsx:2-4`, `LightBarChart.tsx:2-4`,
`LightLineChart.tsx:2-3`, `LightPieChart.tsx:2-3`. **Manter.**

---

## 6. Metodologia — lidos integralmente vs amostrados

**Lidos integralmente (28 arquivos, ~3.400 linhas)** — todos os candidatos a dado fictício e
todos os pontos de decisão do escopo:

`dashboard/UsageCharts.tsx` · `dashboard/DashboardInsight.tsx` · `dashboard/CostAnomalyWidget.tsx` ·
`dashboard/BudgetWidget.tsx` · `dashboard/DashboardAlerts.tsx` · `charts/ComparisonToggle.tsx` ·
`charts/index.ts` · `monitoring/MiddlewarePipelinePanel.tsx` · `monitoring/RetryEnginePanel.tsx` ·
`monitoring/TracingPanel.tsx` · `deployments/DeploymentWizard.tsx` · `settings/HuggingFaceTab.tsx` ·
`rbac/AccessControl.tsx` · `rbac/ProtectedRoute.tsx` · `rbac/index.ts` · `voice/AudioVisualizer.tsx` ·
`sandbox/SandboxExecuteTab.tsx` · `NavLink.tsx` · `openclaw/OpenclawStatusBadge.tsx` ·
`openclaw/config/openclaw.json.template` · `openclaw/README.md` · `openclaw/scripts/healthcheck.sh` ·
`replay/StateDiff.tsx` (parcial→total) · `pages/RolePermissionsPage.tsx` (fora do escopo, mas
necessário para responder "RBAC salva?") · `pages/DeploymentsPage.tsx` (trecho relevante) ·
`ui/button.tsx` · `ui/badge.tsx` · `ui/sidebar.tsx` (trecho do skeleton).

**Amostrados por cabeçalho + grep dirigido (≈45 arquivos):** todos os demais de `crm/`,
`slack/`, `monitoring/`, `billing/`, `evaluations/`, `settings/`, `tools/`, `dialogs/`,
`metrics/`, `admin/`, `chat/`, `system/`, `memory/`, `orchestration/`, `prompts/`, `search/`,
`debug/`, `routing/`, `auth/`, `layout/`, `slo/`.

**Verificados por varredura automática (100% do escopo, sem exceção):**

- `Math.random()` / `Math.floor(Math.random` — 11 ocorrências, todas classificadas em §2
- `mock|fake|dummy|em breve|coming soon|TODO|FIXME|not implemented|simulat` — 80 hits
  triados; os verdadeiros positivos estão em §2
- literais suspeitos de métrica (`|| <n≥2 díg>`, `99.`, `<n>ms`, `<n>.<n>%`) — 3 hits, todos em §2
- fonte de dados por arquivo (`@/services/*`, `supabase.from/rpc`, `functions.invoke`) — tabela completa gerada
- orfandade — varredura por basename em todo o `src/`
- menu × rotas — 110 URLs de `AppSidebar.tsx` × 151 `path=` de `App.tsx`, diff vazio
- gateway de pagamento — grep global em `src/` + `supabase/functions/`
- RPCs referenciadas × definidas em `supabase/migrations/` (326 arquivos) — 7/7 existem
- `cron.schedule` em migrações — 11 jobs nomeados, confrontados com "0 jobs pg_cron" no banco

**Nenhum arquivo do projeto foi editado.** Único arquivo criado: este relatório.
