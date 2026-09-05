# Auditoria de Estado — `supabase/functions/` (Edge Functions Deno)

**Repositório:** `/home/user/Fator-X-V2`
**Escopo:** exclusivamente `supabase/functions/` — **86 Edge Functions** + 1 diretório `_shared` (28 módulos). 27.595 linhas em 132 arquivos `.ts`.
**Data:** 2026-08-16

---

## 0. Declaração de método e honestidade

**Docs do projeto estão desatualizados — confirmado.** Afirmam 63 functions; `ls supabase/functions/ | wc -l` retorna **87 entradas**, das quais **86 são Edge Functions** e 1 é `_shared` (biblioteca, sem `index.ts` — `wc -l` = 0). O denominador correto de functions auditáveis é **86**, não 87 nem 63.

### O que eu li integralmente (26 functions, `index.ts` completo)

`browser-session-cancel`, `health-check`, `voice-session`, `bitrix24-api`, `slack-dlq-discard`, `text-to-speech`, `voice-transcribe`, `pg-net-smoke-test`, `slack-agent-notify`, `replay-fork-execute`, `quick-agent-test`, `memory-manager`, `memory-tools`, `guardrails-engine` (parcial: linhas 1–101), `computer-use-execute`, `guardrails-ml`, `smart-model-router`, `cron-executor`, `rag-embed-backfill`, `whatsapp-router` (linhas 1–60), `whatsapp-webhook` (linhas 1–140 + 265–330 + mapa de decisões), `bitrix24-webhook` (mapa de decisões), `openclaw-webhook` (mapa de decisões), `slack-events-webhook` (mapa de decisões), `visual-search` (estrutura), `nlp-pipeline` (estrutura).

Li também integralmente 5 módulos `_shared`: `auth.ts`, `cors.ts`, `requireEnv.ts`, `security.ts`, `webhookSignature.ts`.

### O que eu NÃO li linha a linha (60 functions)

Para as demais **60 functions** eu **não li o corpo completo**. Para elas apliquei verificação mecânica exaustiva e reprodutível, e **toda afirmação nas colunas Invocador / Env vars / Tabelas / Auth deriva dessas buscas**, não de leitura:

- **Invocador:** `grep -rn "['\"\`/]<nome>['\"\`?/]" src/`+`grep -rn "<nome>" supabase/functions/`(excluindo o próprio dir) + varredura em`_.sql`, `_.json`, `_.toml`, `_.yml`.
- **Env vars:** regex cobrindo `Deno.env.get|requireEnv|requireEnvDefault|optionalEnv|requireEnvBool|requireEnvNumber|requireEnvCached|requireEnvUrl` sobre **todos** os `.ts` do diretório (não só `index.ts`).
- **Tabelas:** regex `\.from\('x'\)|\.rpc\('x'\)` sobre todos os `.ts` do diretório.
- **Auth:** contagem de `authenticateRequest|getAuthUserId|validateApiKey`, `auth.getUser()|auth.getClaims()`, ocorrências de `401/403`, e presença de `SERVICE_ROLE_KEY|createAdminClient`.
- **Mock/TODO:** grep repo-wide por `TODO|FIXME|XXX|HACK|not implemented|stub|placeholder|mock|in production|for now|simplified|will integrate|hardcoded|por enquanto|futuramente`.

**Consequência honesta:** para as 60 não lidas, a classificação `IMPLEMENTADO_TOTAL` significa _"tem invocador provado, tem lógica de I/O real (fetch e/ou DB), tem auth, e não disparou nenhum marcador de stub"_ — **não** significa que eu verifiquei a corretude semântica da lógica. Um mock sem comentário delator escaparia da minha varredura. Marquei essas linhas com `[mec]`; as lidas em full com `[lido]`.

### Fato de ambiente incorporado (medido pelo solicitante, não por mim)

215 tabelas no banco, **apenas 5 com dados**; **`cron.job` retorna 0 linhas — nenhum job pg_cron agendado**. Portanto **nenhuma function roda por agendamento hoje**. Isso afeta materialmente 6 functions cujo design pressupõe cron (ver §5).

---

## 1. Fato estrutural que muda a leitura de tudo: `config.toml`

```toml
project_id = "qdlnzopxrlsoljcrcmzv"

[functions.openclaw-webhook]      verify_jwt = false
[functions.whatsapp-router]       verify_jwt = false
[functions.rag-embed-backfill]    verify_jwt = false
[functions.slack-events-webhook]  verify_jwt = false
```

`supabase/config.toml:1-13` — arquivo inteiro, 13 linhas.

**Apenas 4 functions são públicas.** As outras 82 herdam o default da plataforma Supabase, `verify_jwt = true` — ou seja, o gateway exige um JWT válido **antes** do código rodar. Isso é a camada de auth real da maioria das functions que não têm checagem interna.

### Três project refs diferentes no mesmo repositório

| Ref                    | Onde aparece                                                                | Papel                                                |
| ---------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| `qdlnzopxrlsoljcrcmzv` | `supabase/config.toml:1`; fallback hardcoded em `cron-executor/index.ts:62` | projeto de deploy das functions                      |
| `tdprnylgyrogbbhgdoik` | `src/integrations/supabase/externalClient.ts:4`                             | "EXTERNAL database where all application data lives" |
| `fqdohnmgmtaycfwsioik` | `supabase/migrations/20260721155600_...sql:65`                              | alvo hardcoded do trigger de `whatsapp-router`       |

`src/integrations/supabase/externalClient.ts:15-28` define `supabaseExternal` apontando para `VITE_EXTERNAL_SUPABASE_URL` com fallback para `VITE_SUPABASE_URL`. **21 chamadas a `datahub-query` e 1 a `test-runner` usam `supabaseExternal.functions.invoke(...)`** — isto é, invocam as functions no projeto _externo_, não no projeto onde `config.toml` as publica.

---

## 2. Tabela de auditoria — 86 functions

Legenda: `[lido]` = `index.ts` lido integralmente · `[mec]` = verificado mecanicamente (ver §0) · Auth `plat` = só `verify_jwt` da plataforma · `SR` = usa SERVICE_ROLE_KEY

| Function | Classificação | Quem invoca (arquivo:linha) | Env vars exigidas | Tabelas | Auth | Evidência | O que falta |
| ------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------------------------------------------------------------------------- |
| a2a-server `[mec]` | IMPLEMENTADO_PARCIAL | `src/components/integrations/A2APanel.tsx:36`, `src/services/llmGatewayService.ts:161` | HF_API_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY, **SUPABASE_SERVICE_ROLE_KEY** | agents | plat + SR | 3 fetch, 2 DB ops, 256 ln | Zero `getUser()`/`401`/`403` no código: sem authz de workspace, confia só no gateway |
| agent-conversational-builder `[mec]` | IMPLEMENTADO_PARCIAL | `src/components/agent-builder/ConversationalBuilder.tsx:60` | **LOVABLE_API_KEY** | — | plat | 1 fetch, 0 DB, 144 ln | Sem `getUser()`/401; nada persistido |
| agent-eval-runner `[mec]` | IMPLEMENTADO_TOTAL | `src/hooks/useAgentEvals.ts:149` | LOVABLE_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | agent_eval_datasets, agent_eval_results, agent_eval_runs, agents | JWT+SR | 2 fetch, 7 DB, 16 branches | Sem 401/403 explícito após `getUser()` |
| agent-workflow-runner `[mec]` | IMPLEMENTADO_TOTAL | `src/hooks/useAgentWorkflows.ts:134`; `supabase/functions/synthetic-runner/index.ts:52` | LOVABLE_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | agent_workflow_runs, agent_workflows, agents | JWT+SR | 2 fetch, 4 DB, 17 branches | — |
| audio-transcribe `[mec]` | IMPLEMENTADO_TOTAL | `src/services/audioService.ts:41`; `smolagent-runtime/index.ts:133` | **HF_API_TOKEN** | — | `authenticateRequest` | 2 fetch, 9 branches | 503 se HF_API_TOKEN ausente |
| automation-pipeline `[mec]` | IMPLEMENTADO_TOTAL | `src/hooks/useAutomationRules.ts:93` | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | automation_logs, automation_rules | JWT+SR | 2 fetch, 4 DB, 15 branches | — |
| bitrix24-api `[lido]` | IMPLEMENTADO_PARCIAL | `src/services/llmGatewayService.ts:169` | **BITRIX24_DOMAIN** | workspace_secrets | `authenticateRequest` (`:35`) | Lido 63 ln: auth+ratelimit+Zod+retry OK | `:49` retorna 503 sem BITRIX24_DOMAIN; token vem de `workspace_secrets` (tabela vazia) |
| bitrix24-oauth `[mec]` | IMPLEMENTADO_PARCIAL | `src/services/llmGatewayService.ts:165` | BITRIX24_CLIENT_ID, BITRIX24_CLIENT_SECRET, BITRIX24_DOMAIN, SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | workspace_secrets | plat + SR | 1 fetch, 3 DB, 97 ln | Zero `getUser()`/401/403 — callback OAuth com SR e sem authz própria |
| bitrix24-webhook `[lido-parcial]` | **IMPLEMENTADO_PARCIAL** | Webhook externo (Bitrix24); URL montada em `src/services/bitrix24WebhookService.ts:133` | **BITRIX24_APP_TOKEN**, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | agent_routing_config, bitrix24_webhook_events, trace_events, workspace_secrets | HMAC fail-closed (`:94-102`, `:273-284`) | `:102` `constantTimeEqual`; rejeita 401 em assinatura inválida | **Código diz `verify_jwt: false` (`:33`) mas NÃO está em `config.toml` → plataforma exige JWT e Bitrix24 não envia: webhook inalcançável.** `:361` dispatch é placeholder |
| browser-agent-run `[mec]` | IMPLEMENTADO_TOTAL | `src/services/browserAgentService.ts:42` | LOVABLE_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY | browser_sessions | JWT (`getUser`+401) | 3 fetch, 4 DB, 18 branches, 301 ln | — |
| browser-session-cancel `[lido]` | IMPLEMENTADO_TOTAL | `src/services/browserAgentService.ts:48` | SUPABASE_URL, SUPABASE_ANON_KEY | browser_sessions | JWT `getClaims` (`:24-27`) | Lido 42 ln: escopo por `user_id` (`:35`) e `status=running` (`:36`) | — |
| cerebro-brain `[mec]` | IMPLEMENTADO_TOTAL | `src/services/cerebroService.ts:76` | HF_API_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY | 13 tabelas (agent_memories, agent_traces, agents, chunks, documents, knowledge_bases, knowledge_entities, knowledge_relations, workflows, workspace_members, …) | JWT | 4 fetch, **38 DB ops**, 38 branches, 501 ln | `:123` relações hardcoded "from system structure" |
| cerebro-query `[mec]` | IMPLEMENTADO_TOTAL | `src/components/super-cerebro/notebook/AiStudio.tsx:32`, `src/services/cerebroService.ts:45` | SUPABASE_URL, SUPABASE_ANON_KEY | agent_traces, agents, chunks, collections, knowledge_bases, workspace_members | JWT | 3 fetch, 6 DB; chama `rag-rerank` (`:120`) | — |
| code-interpreter-execute `[mec]` | IMPLEMENTADO_TOTAL | `src/services/codeInterpreterService.ts:34,50` | LOVABLE_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY | code_executions | JWT (`getUser`+401) | 1 fetch, 3 DB, 21 branches, 303 ln | — |
| computer-use-execute `[lido]` | **SUGERIDO_OU_INICIADO** | `src/pages/ComputerUsePage.tsx:49` | SUPABASE_URL, SUPABASE_ANON_KEY, **SUPABASE_SERVICE_ROLE_KEY** | — | JWT ou SR-como-bearer (`:31`) | **Lido 167 ln: 100% simulado.** `:102-133` array de passos fixos; `:97` "screenshot" é foto do Unsplash; `:89,99,137` `setTimeout` fingindo latência; input `goal` nunca é usado | Tudo. Não existe VM, browser, nem vision loop. `:31` aceita a service_role key crua como bearer do cliente |
| cost-calculator `[mec]` | IMPLEMENTADO_PARCIAL | `src/hooks/useCostEstimate.ts:63`, `src/services/costCalculatorService.ts:107`, `src/lib/otel-genai.ts:93` | — (usa `createAdminClient()`, `:43`) | model_pricing | plat + SR | 0 fetch, 1 DB, 93 ln | Zero `getUser()`/401/403 com SR; `model_pricing` sem dados → base de cálculo vazia |
| crm-bitrix-sync `[mec]` | IMPLEMENTADO_PARCIAL | `src/services/crmService.ts:524` | **BITRIX24_DOMAIN** | crm_activities, workspace_secrets | `authenticateRequest` + SR | 1 fetch, 2 DB, 179 ln | Depende de `workspace_secrets` (vazia) e BITRIX24_DOMAIN |
| crm-cadence-runner `[mec]` | IMPLEMENTADO_TOTAL | `src/services/crmCadenceService.ts:326` | **SUPABASE_SERVICE_ROLE_KEY** | 9 tabelas + rpc `verify_cron_token` | `authenticateRequest` + membership 403 (`:108`) + token de cron (`:124-132`) | 4 fetch, 19 DB, 36 branches, 459 ln | Execução global exige `verify_cron_token`; **sem pg_cron nunca dispara sozinha** (§5) |
| crm-enrich `[mec]` | IMPLEMENTADO_TOTAL | `src/services/crmService.ts:544` | **LOVABLE_API_KEY** | crm_activities, crm_companies, crm_contacts | `authenticateRequest` + SR | 1 fetch, 4 DB, 28 branches | — |
| cron-executor `[lido]` | **IMPLEMENTADO_PARCIAL** | `src/services/cronSchedulerService.ts:271` (botão manual) | SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | cron_schedules, cron_schedule_executions | **plat apenas** (0 `getUser`, 0 `401/403`) | **Lido 215 ln.** `:98-101` `case 'workflow'`/`case 'agent'` → `execStatus='success'` e `break` **sem executar nada** | Branches workflow/agent são no-op que reportam sucesso falso. `:62` fallback hardcoded ao ref `qdlnzopxrlsoljcrcmzv`. Sem pg_cron, só roda no botão manual |
| datahub-mcp-server `[mec]` | IMPLEMENTADO_TOTAL | `src/services/datahubService.ts:310`, `src/components/datahub/MCPServerPanel.tsx:22` | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | — | JWT (4× 401/403) | 0 fetch, 4 DB, 28 branches, 395 ln | `:234` cross-reference delega a `datahub-query` (que está quebrada — ver abaixo) |
| datahub-query `[mec]` | **IMPLEMENTADO_PARCIAL** | **21 call sites**, todos via `supabaseExternal`: `DataHubQueryBuilderTab.tsx:89`, `InlineEditCell.tsx:36`, `RecordDetail.tsx:34`, `DataHubSyncTab.tsx:74`, …; `smolagent-runtime/index.ts:84` | HF_API_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY | rpc **`exec_sql`** | JWT (6× 401/403) | 949 ln, 122 branches, 50 returns — a maior e mais invocada | **`exec_sql` tem 0 definições em 326 migrations** (`grep -rl exec_sql supabase/migrations/` → 0). O próprio código admite: `:848` `"(deploy exec_sql RPC SECURITY DEFINER on this project to enable)"`. Caminho SQL principal não funciona |
| doc-ocr `[mec]` | IMPLEMENTADO_TOTAL | `src/pages/AIStudioPage.tsx:125`, `src/services/knowledgeService.ts:395`; `smolagent-runtime/index.ts:175` | **HF_API_TOKEN** | — | `authenticateRequest` | 2 fetch, 13 branches | 503 sem HF_API_TOKEN |
| doc-parse `[mec]` | IMPLEMENTADO_TOTAL | `src/services/documentIngestionService.ts:178,241` | HF_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | audit_events, chunks, collections, document_ingestions, documents | `authenticateRequest` + SR | 1 fetch, **21 DB**, 34 branches, 622 ln; dispara `rag-embed-backfill` em background (`:604`) | — |
| doc-rechunk `[mec]` | IMPLEMENTADO_TOTAL | `src/components/super-cerebro/DocumentChunkingDialog.tsx:103` | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | audit_events, chunks, documents, workspace_members | `authenticateRequest` + SR | 0 fetch, 7 DB, 219 ln | — |
| dr-orchestrator `[mec]` | IMPLEMENTADO_PARCIAL | `src/services/drDrillService.ts:141` | SUPABASE_URL, SUPABASE_ANON_KEY, **SUPABASE_SERVICE_ROLE_KEY** | dr_drills, dr_snapshots + rpc start/record/complete_dr_drill | **plat apenas** | 11 DB ops; **todas as 4 RPCs existem** nas migrations | Zero `getUser()`/401/403 com SR — orquestra drills de DR sem authz de workspace |
| eval-engine-v2 `[mec]` | IMPLEMENTADO_TOTAL | `src/services/evalEngineService.ts:31` | SUPABASE_URL | eval_runs | `authenticateRequest` | 2 fetch, 1 DB, 251 ln | — |
| eval-judge `[mec]` | IMPLEMENTADO_TOTAL | `src/services/evaluationsService.ts:140` | HF_API_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY | agents, evaluation_runs, test_cases, workspace_members, workspace_secrets | JWT | 4 fetch, 8 DB, 22 branches | — |
| global-search `[mec]` | IMPLEMENTADO_TOTAL | `src/hooks/useGlobalSearch.ts:29` | LOVABLE_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY | agents, agent_workflows, agent_eval_datasets, automation_rules, documents, kb_articles, knowledge_bases | JWT (3× 401/403) | 1 fetch, 7 DB, 295 ln | 7 tabelas alvo praticamente vazias |
| graph-execute `[mec]` | IMPLEMENTADO_TOTAL | `src/services/agentGraphService.ts:90` | LOVABLE_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | agent_graphs, agents, graph_executions | JWT+SR | 2 fetch, 5 DB, 17 branches | — |
| guardrails-engine `[lido-parcial]` | IMPLEMENTADO_TOTAL | `src/services/llmGatewayService.ts:146`, `src/services/securityService.ts:131,222` | — | — | `authenticateRequest` (`:610`) | Lido 1–101: rails reais de injection/PII/toxicity/secret-leak, puro regex determinístico | Detecção heurística por regex; sem ML (coerente com o nome "engine") |
| guardrails-ml `[lido]` | **IMPLEMENTADO_PARCIAL** | `src/services/guardrailsMLService.ts:27,38` | — | — | `authenticateRequest` (`:155`) | **Lido 194 ln.** 4 camadas, **todas regex** (`:43,78,102,126`) | **Cabeçalho `:12-14` promete "HF ML models via Hugging Face Inference API se HUGGINGFACE_API_KEY em workspace_secrets" — há 0 chamadas `fetch` no arquivo.** `:101` admite "heuristic — would call HF in prod". O "ML" do nome não existe |
| health-check `[lido]` | IMPLEMENTADO_TOTAL | `src/services/healthService.ts:42` | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | workspaces | **plat apenas** | Lido 55 ln: checa DB real (`:25`), degrada sem env (`:21-22`), 503 se down | Endpoint de saúde sem auth própria (aceitável) |
| hf-autotrain `[mec]` | IMPLEMENTADO_TOTAL | `src/services/fineTuningService.ts:48` | **HF_API_TOKEN**, SUPABASE_URL, SUPABASE_ANON_KEY | agent_traces, workspace_members | JWT | **7 fetch**, 6 DB, 25 branches, 227 ln | — |
| image-analysis `[mec]` | IMPLEMENTADO_TOTAL | `src/services/visionService.ts:35`, `src/pages/AIStudioPage.tsx:149`; `smolagent-runtime/index.ts:118` | **HF_API_TOKEN** | — | `authenticateRequest` | 5 fetch, 10 branches | 503 sem HF_API_TOKEN |
| incident-orchestrator `[mec]` | IMPLEMENTADO_PARCIAL | `src/services/incidentService.ts:105` | SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | agents, chaos_experiments, incident_playbooks + rpc create/update_incident_run, get_current_oncall | **plat apenas** | 6 DB ops; todas as 3 RPCs existem nas migrations | Zero `getUser()`/401/403 — orquestra incidentes com SR sem authz de workspace |
| kb-analyze-gaps `[mec]` | IMPLEMENTADO_PARCIAL | `src/services/knowledgeManagementService.ts:152` | **LOVABLE_API_KEY**, SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | kb_query_gaps, oracle_history | plat + SR | 2 fetch, 4 DB, 98 ln | Zero `getUser()`; 1 ocorrência 401/403 é do upstream |
| kb-translate-article `[mec]` | IMPLEMENTADO_PARCIAL | `src/services/knowledgeManagementService.ts:130` | **LOVABLE_API_KEY**, SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | kb_articles, kb_translations | plat + SR | 2 fetch, 4 DB, 86 ln | Idem: sem authz própria com SR |
| lgpd-manager `[mec]` | IMPLEMENTADO_TOTAL | `src/services/lgpdService.ts:24,32,40,48` (4 ações) | — | agent_memories, consent_records, data_deletion_requests, security_events, session_traces, sessions | `authenticateRequest` | 0 fetch, **11 DB**, 21 branches, 10 returns | — |
| llm-gateway `[mec]` | IMPLEMENTADO_TOTAL | `src/services/workflowsService.ts:297`, `src/components/agent-builder/AgentPlayground.tsx:86`; `oracle-research/index.ts:173,218`; `memory-tools/index.ts:123` | HF*API_TOKEN, LOVABLE_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY + 10 flags `ENABLE*\*` | 13 tabelas + rpc `check_budget` | JWT (6× 401/403) | **896 ln, 115 branches, 11 fetch, 20 DB** — hub central, 5 arquivos | 10 feature-flags `ENABLE_*` sem default documentado |
| memory-manager `[lido]` | **IMPLEMENTADO_PARCIAL** | `src/services/memoryService.ts:116` | — | agent_memories | `authenticateRequest` + `requireWorkspace` (`:35`) | **Lido 142 ln.** add/search/list/forget reais | `:121` **`const deletedCount = 0;`** hardcoded → `forget_all` sempre responde `deleted_count: 0`. `:127-133` `promote_to_fact` retorna `{promoted:true}` sem gravar nada — `:132` "Will integrate with Super Cérebro facts table". `:69` busca vetorial adiada ("ETAPA 13") |
| memory-tools `[lido]` | IMPLEMENTADO_TOTAL | `src/services/memoryService.ts:22` | SUPABASE_URL, SUPABASE_ANON_KEY | agent_memories, workspace_members | JWT `getUser`+401 (`:40-41`) | **Lido 159 ln.** 5 tools reais; `memory_compact` chama `llm-gateway` (`:123`) | `:35` `req.headers.get('Authorization')!` com `!` — NPE se header ausente (mas gateway já barra) |
| nlp-pipeline `[lido-parcial]` | IMPLEMENTADO_PARCIAL | `src/services/nlpPipelineService.ts:46` | — | 4 tabelas | `authenticateRequest` | Lido estrutura: 10 extratores reais (CPF `:38`, CNPJ `:43`, phone `:48`, email `:58`, quantity `:63`, colors `:82`, engraving `:92`, deadline `:100`, product `:121`, sentiment `:136`) | Cabeçalho `:14` promete "LLM fallback (via llm-gateway) for complex order extraction" — **0 chamadas `fetch` no arquivo**; fallback não existe |
| notebook-podcast-generate `[mec]` | IMPLEMENTADO_TOTAL | `src/services/notebookPodcastsService.ts:57` | **LOVABLE_API_KEY**, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | collections, document_ingestions, notebook_notes, notebook_podcasts, workspace_members | JWT (3× 401/403) | 2 fetch, 13 DB, 314 ln | Única function sem `getCorsHeaders`/`handleCorsPreflight` (cors=0) |
| notification-sender `[mec]` | IMPLEMENTADO_TOTAL | `src/services/notificationEngineService.ts:228` | SLACK_BOT_TOKEN, WHATSAPP_API_KEY, WHATSAPP_API_URL, WHATSAPP_INSTANCE, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | notification_templates, notifications | JWT (4× 401/403) | **6 fetch**, 26 branches, 296 ln | 7 segredos obrigatórios — o mais exigente do lote |
| openclaw-proxy `[mec]` | IMPLEMENTADO_PARCIAL | `src/services/openclawDeployService.ts:90`; `whatsapp-router/index.ts:120` | **OPENCLAW_URL**, **OPENCLAW_API_TOKEN**, SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | openclaw_events | **plat apenas** | 2 fetch, 1 DB, 20 branches, 188 ln | Zero `getUser()`/401/403 — proxy com SR e token externo sem authz própria |
| openclaw-webhook `[lido-parcial]` | IMPLEMENTADO_TOTAL | Webhook externo (OpenCLAW). `verify_jwt=false` em `config.toml:3-4` | **OPENCLAW_WEBHOOK_SECRET**, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | openclaw_events, openclaw_whatsapp_instances, openclaw_whatsapp_messages, webhook_events | **HMAC + timestamp, fail-closed** | `:83` 500 se secret ausente; `:89` 401 sem assinatura; `:95` 401 sem timestamp; `:100` 401 se fora da janela de replay; `:112` 401 se HMAC inválido | Nada — é o webhook mais bem defendido do lote |
| oracle-council `[mec]` | IMPLEMENTADO_TOTAL | `src/stores/oracleStore.ts:153`, `src/services/oracleService.ts:33`, `OracleComparisonPanel.tsx:86` | SUPABASE_URL, SUPABASE_ANON_KEY | — | JWT (3× 401/403) | 6 fetch, 471 ln, 14 branches | Não persiste nada (0 DB ops) |
| oracle-research `[mec]` | IMPLEMENTADO_TOTAL | `src/services/llmGatewayService.ts:150` | SUPABASE_URL, SUPABASE_ANON_KEY | oracle_history + rpc `hybrid_memory_search`, `touch_memory` | `authenticateRequest` | 6 fetch, 5 DB; chama `llm-gateway` (`:173`, `:218`); ambas RPCs existem | — |
| pg-net-smoke-test `[lido]` | **MORTO_OU_ABANDONADO** | **NINGUÉM** — ver §4 prova 1 | SUPABASE_URL, SUPABASE_ANON_KEY, **SUPABASE_SERVICE_ROLE_KEY** | rpc pg_net_schema, pg_net_smoke_post, pg_net_smoke_response, is_workspace_admin | JWT + admin (`:47-52`) | **Lido 136 ln.** Lógica real e completa; as 3 RPCs pg_net existem nas migrations | Órfã **e quebrada**: `:47` chama `is_workspace_admin` com `userClient` (role `authenticated`), mas `migrations/20260723135724_...sql:3` faz `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` e `:10` concede só a `service_role` → `roleError` → `:50` retorna 500 para todos |
| product-mockup `[mec]` | IMPLEMENTADO_PARCIAL | `src/services/productMockupService.ts:45,73,102,134`; `smolagent-runtime/index.ts:155` | **HF_API_TOKEN**, SUPABASE_URL, SUPABASE_ANON_KEY | — | JWT | 6 fetch, 21 branches, 234 ln | `:105-106` "In production, composite product onto generated background / **For now**, return both images for frontend compositing"; `:173` "**For now**, generate a new image (simplified inpainting)" — composição/inpainting não implementados |
| queue-worker `[mec]` | IMPLEMENTADO_PARCIAL | `src/services/queueManagerService.ts:180` | SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | queue_items, task_queues | **plat apenas** | 2 fetch, 9 DB, 228 ln | Zero `getUser()`/401/403 com SR; worker sem pg_cron nunca drena a fila sozinho (§5) |
| quick-agent-test `[lido]` | IMPLEMENTADO_PARCIAL | `RealExamplePreview.tsx:161`, `QuickAgentTestPanel.tsx:112` | **LOVABLE_API_KEY** | — | **plat apenas** | **Lido 137 ln.** Chamada LLM real, Zod, rate-limit, mapeamento de modelos (`:38-47`) | Zero `getUser()`/401/403 no código; comentário em functions irmãs afirma que "verify_jwt=false é o padrão do deploy" — **falso**, o default do Supabase é `true` |
| rag-embed-backfill `[lido]` | **IMPLEMENTADO_PARCIAL** | `doc-parse/index.ts:604` (background, best-effort). `verify_jwt=false` em `config.toml:9-10` | SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | agent_memories_v2 | **NENHUMA** — pública + service role | **Lido 173 ln.** `:53-64` handler entra direto em `createClient(url, serviceKey)` após só rate-limit; nenhum `getUser`/401/403 | **Vulnerabilidade #1 (§6).** `:3` diz "Executada via cron a cada 5 min" — não há pg_cron (§5) |
| rag-embed-v2 `[mec]` | IMPLEMENTADO_TOTAL | `src/services/ragPipelineService.ts:18`; `semantic-search/index.ts:114`; `rag-embed-backfill/index.ts:22` | **HUGGINGFACE_API_KEY**, **OPENAI_API_KEY** (em `embedder.ts`) | workspace_members, workspace_secrets | `authenticateRequest` | 3 fetch, 194 ln + `embedder.ts` | Sem provider real cai em modo `degraded` (hash) — consumidores rejeitam (`rag-embed-backfill:42-44`) |
| rag-ingest `[mec]` | IMPLEMENTADO_TOTAL | `src/components/knowledge/KnowledgeBaseDetail.tsx:95`, `src/services/knowledgeService.ts:259,365` | SUPABASE_URL, SUPABASE_ANON_KEY | chunks, documents, workspace_members, workspace_secrets | JWT | 2 fetch, 8 DB, 125 ln | — |
| rag-rerank `[mec]` | IMPLEMENTADO_TOTAL | `src/services/ragPipelineService.ts:101`, `src/services/knowledgeService.ts:166`; `cerebro-query/index.ts:120` | HF_API_TOKEN, ENABLE_HF_RERANKER | workspace_members, workspace_secrets | `authenticateRequest` | 2 fetch, 146 ln | Legado (v1); v2 coexiste |
| rag-rerank-v2 `[mec]` | IMPLEMENTADO_TOTAL | `src/services/ragPipelineService.ts:33` | **COHERE_API_KEY**, **HUGGINGFACE_API_KEY** | workspace_members, workspace_secrets | `authenticateRequest` | 3 fetch, 244 ln | Sem as 2 chaves não reordena |
| replay-fork-execute `[lido]` | **IMPLEMENTADO_PARCIAL** | `src/services/replayForkService.ts:88` | SUPABASE_URL, SUPABASE_ANON_KEY | replay_forks | JWT `getUser`+401 (`:89-94`), escopo `user_id` (`:113`) | **Lido 155 ln.** `:25` **"Lightweight deterministic mock-runner. In production this would call the agent runtime."** `:36-54` fabrica passos com SHA-256 do seed; `:57` custo = `remainingCount * 0.0023` | Runtime de agente real. Persiste resultado fabricado em `replay_forks` como se fosse execução |
| sbom-scanner `[mec]` | IMPLEMENTADO_TOTAL | `src/services/sbomService.ts:138` | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | sbom_components, sbom_snapshots + rpc `record_vulnerability` | JWT (3× 401/403) | 1 fetch, 3 DB, 18 branches; RPC existe | — |
| semantic-search `[mec]` | IMPLEMENTADO_TOTAL | `src/services/searchService.ts:34`; `visual-search/index.ts:136` | SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | chunks, documents + rpc `match_documents` | JWT (4× 401/403) | 2 fetch, 3 DB, 255 ln; chama `rag-embed-v2` (`:114`); RPC existe | — |
| skill-classify-llm `[mec]` | IMPLEMENTADO_TOTAL | `src/services/skillReclassificationService.ts:188` | **LOVABLE_API_KEY** | — | `authenticateRequest` | 2 fetch, 251 ln + `departments.ts` espelhado (teste de paridade em `src/test/skill-departments-parity.test.ts:41`) | `:130` comenta "verify_jwt = false é o padrão do deploy" — **premissa falsa** (default é `true`); a auth interna salva |
| skill-describe-llm `[mec]` | IMPLEMENTADO_TOTAL | `src/services/skillEnrichmentService.ts:127` | **LOVABLE_API_KEY** | — | `authenticateRequest` | 2 fetch, 345 ln; paridade testada em `src/test/skill-description-parity.test.ts:14` | `:209` mesma premissa falsa sobre verify_jwt |
| skill-harvester `[mec]` | IMPLEMENTADO_TOTAL | `src/services/skillHarvestService.ts:143` | **GITHUB_TOKEN**/**GITHUB_API_KEY**, **LOVABLE_API_KEY** | skill_harvest_candidates, skill_harvest_runs + rpc is_workspace_admin, log_audit_entry | `authenticateRequest` + admin | **507 ln, 45 branches**, 4 arquivos; ambas RPCs existem | — |
| slack-agent-notify `[lido]` | **MORTO_OU_ABANDONADO** | **NINGUÉM** — ver §4 prova 2 | **SLACK_BOT_TOKEN**, SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | slack_agent_notifications, audit_events | **plat apenas** | **Lido 147 ln.** Lógica completa: regras, template `:42`, Slack `:117`, auditoria `:132` | `:4-5` diz ser disparada "via pg_net.http_post from server code or triggers" — **não existe nenhum trigger nem job que a chame** (0 pg_cron; 0 ocorrências no repo) |
| slack-alert-dispatcher `[mec]` | IMPLEMENTADO_PARCIAL | `src/hooks/useSlackConfig.ts:144`, `SlackTestBroadcastButton.tsx:18` | SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | audit_events, slack_channel_routes, slack_dispatch_dlq | **plat apenas** | 2 fetch, 3 DB, 146 ln | Zero `getUser()`/401/403 com SR |
| slack-dlq-discard `[lido]` | IMPLEMENTADO_TOTAL | `src/components/slack/SlackDlqPanel.tsx:58` | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | slack_dispatch_dlq + rpc is_workspace_admin | JWT (`:36-37`) + **admin via SR** (`:56-57`) | **Lido 71 ln.** Chama a RPC com `admin` (service_role) — correto, ao contrário de `pg-net-smoke-test` | — |
| slack-dlq-retry `[mec]` | IMPLEMENTADO_PARCIAL | `src/components/slack/SlackDlqPanel.tsx:45` | SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | slack_dispatch_dlq | **plat apenas** | 2 fetch, 3 DB, 113 ln | Zero `getUser()`/401/403 — a gêmea `slack-dlq-discard` exige admin; esta não |
| slack-events-webhook `[lido-parcial]` | IMPLEMENTADO_TOTAL | Webhook externo (Slack Events API). `verify_jwt=false` em `config.toml:12-13` | **SLACK_SIGNING_SECRET**, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | audit_events, slack_bot_bindings, slack_workspace_config | **Assinatura Slack, fail-closed** | `:60` `requireEnv("SLACK_SIGNING_SECRET")` (lança se ausente); `:61` `verifySlackSignature`; `:63` 401 | — |
| slack-rag-sync `[mec]` | IMPLEMENTADO_PARCIAL | `src/hooks/useSlackConfig.ts:336` | **SLACK_BOT_TOKEN**, SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | agent_memories_v2, slack_rag_sources | **plat apenas** | 2 fetch, 4 DB, 224 ln | Zero `getUser()`/401/403 com SR |
| slack-verify-connection `[mec]` | IMPLEMENTADO_TOTAL | `src/hooks/useSlackConfig.ts:171` | SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | audit_events, slack_workspace_config + rpc is_workspace_admin | JWT + admin (3× 401/403) | 2 fetch, 3 DB; `:6` documenta corretamente "Requer JWT (verify_jwt=true padrão)" | — |
| smart-model-router `[lido]` | IMPLEMENTADO_TOTAL | `src/services/modelRouterService.ts:25` | — | — | `authenticateRequest` (`:150`) | **Lido 190 ln.** Scoring real (`:63-93`), roteamento por tier/budget/provider (`:96-136`), custo estimado (`:138`) | Catálogo de 7 modelos hardcoded (`:47-58`), não lê `model_pricing` |
| smolagent-runtime `[mec]` | IMPLEMENTADO_TOTAL | `src/pages/SmolagentPage.tsx:56,77`; `widget-proxy/index.ts:65`; `workflow-engine-v2/index.ts:236` | HF_API_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY | agent_traces, workspace_members | JWT | **696 ln, 17 fetch** — orquestra 5 functions (`datahub-query:84`, `image-analysis:118`, `audio-transcribe:133`, `product-mockup:155`, `doc-ocr:175`, `text-to-speech:191`) | `:278` extração de snippets "simplified" |
| synthetic-runner `[mec]` | IMPLEMENTADO_PARCIAL | `src/services/syntheticService.ts:100` | SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | synthetic_checks, synthetic_results | **plat apenas** | 1 fetch, 4 DB, 163 ln; alveja `llm-gateway`/`agent-workflow-runner` (`:51-52`) | Zero `getUser()`/401/403 com SR; monitoramento sintético sem pg_cron não roda periodicamente (§5) |
| test-runner `[mec]` | IMPLEMENTADO_TOTAL | `TestExecutionPanel.tsx:30` (via `supabaseExternal`), `src/services/llmGatewayService.ts:173` | SUPABASE_URL, SUPABASE_ANON_KEY | agents | `authenticateRequest` | 1 fetch, 1 DB, 115 ln + 3 arquivos de contract test | Invocada no projeto _externo_ (§1) |
| text-to-speech `[lido]` | IMPLEMENTADO_TOTAL | `src/services/audioService.ts:104`, `src/pages/AIStudioPage.tsx:94`; `smolagent-runtime/index.ts:191` | **HF_API_TOKEN** | — | `authenticateRequest` (`:26`) | **Lido 79 ln.** 3 modelos MMS-TTS (`:10-14`), timeout 15s (`:43`), retry (`:54`), devolve `audio/wav` | `:39` 503 sem HF_API_TOKEN |
| validate-access `[mec]` | IMPLEMENTADO_PARCIAL | `src/services/accessControlService.ts:130` | SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | access_blocked_log, geo_allowed_countries, ip_whitelist | **plat apenas** (2× 401/403 são o veredito, não auth) | 0 fetch, 4 DB, 165 ln | Zero `getUser()` — function de controle de acesso sem auth própria, com SR |
| visual-search `[mec]` | IMPLEMENTADO_PARCIAL | `src/services/searchService.ts:56` | **LOVABLE_API_KEY**, SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | — | **plat apenas** | Vision real (`:68`) → encaminha a `semantic-search` (`:136`), 169 ln | Zero `getUser()`/401/403 com SR |
| voice-session `[lido]` | IMPLEMENTADO_PARCIAL | `src/services/voiceAgentService.ts:33,39` | SUPABASE_URL, SUPABASE_ANON_KEY | voice_sessions, workspaces | JWT `getUser`+401 (`:22-23`) | **Lido 62 ln.** `start` (`:32`) e `end` (`:44`) implementados | Schema declara 4 ações (`:7` `start                                                                                                                                                                                                                                                | end | append | get`) mas só 2 existem — `append`e`get`caem no`:57` `"invalid action"` 400 |
| voice-synthesize `[mec]` | IMPLEMENTADO_TOTAL | `src/services/voiceAgentService.ts:54` | **LOVABLE_API_KEY**, SUPABASE_URL, SUPABASE_ANON_KEY | agents, voice_sessions | JWT `getUser`+401 | 2 fetch, 4 DB, 95 ln | — |
| voice-transcribe `[lido]` | IMPLEMENTADO_TOTAL | `src/services/voiceAgentService.ts:46` | **LOVABLE_API_KEY**, SUPABASE_URL, SUPABASE_ANON_KEY | voice_sessions | JWT `getUser`+401 (`:24-25`) | **Lido 82 ln.** Zod com teto de ~10MB (`:8`), Gemini (`:39`), trata 429/402 (`:52-53`), atualiza transcript (`:70`) | `:63` duração é estimativa grosseira (`bytes/2000`) |
| webhook-receiver `[mec]` | IMPLEMENTADO_TOTAL | `src/services/webhookTriggerService.ts:347` | — (usa `createAdminClient()`, `:34`) | webhook_endpoints, webhook_events + rpc `increment_webhook_counter` | **HMAC** (`_shared/webhookSignature.ts`, 5 refs) | 4 DB, 17 branches, 255 ln, 12 returns; RPC existe; versionamento testado em `_shared/edge-contract_test.ts:210` | — |
| whatsapp-router `[lido-parcial]` | **MORTO_OU_ABANDONADO** | Trigger `openclaw_whatsapp_autoreply_ai` — **mas aponta para outro projeto**, ver §4 prova 3. `verify_jwt=false` em `config.toml:6-7` | **WHATSAPP_ROUTER_TOKEN**, SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | openclaw_events, openclaw_whatsapp_instances, openclaw_whatsapp_messages | **Token dedicado, fail-closed** (`:38-44`) | **Lido 1–60.** `requireEnv('WHATSAPP_ROUTER_TOKEN')` lança se ausente; `constantTimeEqual` (`:41`) | O trigger que a chamaria posta em `fqdohnmgmtaycfwsioik.supabase.co` — projeto diferente de `qdlnzopxrlsoljcrcmzv` |
| whatsapp-webhook `[lido-parcial]` | **IMPLEMENTADO_PARCIAL** | Webhook externo (Meta/Twilio/Z-API/Evolution); URL em `src/services/whatsappWebhookService.ts:138` | **WHATSAPP_META_APP_SECRET**, **WHATSAPP_META_VERIFY_TOKEN**, **WHATSAPP_TWILIO_AUTH_TOKEN**, **WHATSAPP_ZAPI_TOKEN**, **WHATSAPP_EVOLUTION_TOKEN** | agent_routing_config, openclaw_events, trace_events, whatsapp_webhook_events, workspace_secrets | **HMAC por provider, fail-closed** | **Lido 1–140, 265–330.** Twilio HMAC-SHA1 canônico (`:271-302`), Meta SHA-256 (`:305-309`), Z-API/Evolution bearer constant-time (`:313-318`); todos `return false` sem segredo; anti-replay 5 min (`:33`, `:481`) + nonce (`:84-105`) | **Código diz `verify_jwt: false` (`:11`) mas NÃO está em `config.toml` → plataforma exige JWT; nenhum dos 4 providers envia JWT: webhook inalcançável.** 5 segredos obrigatórios |
| widget-proxy `[mec]` | IMPLEMENTADO_TOTAL | `src/services/deploymentsService.ts:66,70`, `src/services/widgetService.ts` | SUPABASE_URL, **SUPABASE_SERVICE_ROLE_KEY** | — | `authenticateRequest` | 1 fetch, 91 ln; roteia para `smolagent-runtime` (`:65`) | — |
| workflow-engine-v2 `[mec]` | IMPLEMENTADO_PARCIAL | `src/services/workflowsService.ts:193,255` | HF_API_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY | workflow_runs, workflow_steps, workflows | **plat apenas** | 5 fetch, 11 DB, 31 branches, 377 ln; chama `smolagent-runtime` (`:236`) | Zero `getUser()`/401/403. `_shared/webhookSender.ts:4` registra: "PROBLEMA: workflow-engine-v2 chama webhooks sem assinatura HMAC" |

---

## 3. Contagem por classificação (denominador = 86)

| Classificação        |   Qtde |     % |
| -------------------- | -----: | ----: |
| IMPLEMENTADO_TOTAL   | **51** | 59,3% |
| IMPLEMENTADO_PARCIAL | **31** | 36,0% |
| SUGERIDO_OU_INICIADO |  **1** |  1,2% |
| MORTO_OU_ABANDONADO  |  **3** |  3,5% |
| **Total**            | **86** |  100% |

> Denominador declarado: **86 Edge Functions**. O `ls` retorna 87 entradas porque inclui `_shared/`, que é biblioteca compartilhada (28 módulos, sem `index.ts`) e não é uma function.

**SUGERIDO_OU_INICIADO (1):** `computer-use-execute`.
**MORTO_OU_ABANDONADO (3):** `pg-net-smoke-test`, `slack-agent-notify`, `whatsapp-router`.

**IMPLEMENTADO_PARCIAL (31):** a2a-server, agent-conversational-builder, bitrix24-api, bitrix24-oauth, bitrix24-webhook, cron-executor, crm-bitrix-sync, datahub-query, guardrails-ml, incident-orchestrator, kb-analyze-gaps, kb-translate-article, memory-manager, nlp-pipeline, openclaw-proxy, product-mockup, queue-worker, quick-agent-test, rag-embed-backfill, replay-fork-execute, slack-alert-dispatcher, slack-dlq-retry, slack-rag-sync, synthetic-runner, validate-access, visual-search, voice-session, whatsapp-webhook, workflow-engine-v2, cost-calculator, dr-orchestrator.

---

## 4. Functions órfãs — com prova

### Prova 1 — `pg-net-smoke-test`

```
$ grep -rn "pg-net-smoke-test" --include=*.ts --include=*.tsx --include=*.sql \
    --include=*.json --include=*.toml --include=*.yml . | grep -v node_modules \
    | grep -v "^./supabase/functions/pg-net-smoke-test/"
(nenhuma saída)
```

Zero referências no repositório inteiro: nem `src/`, nem outra function, nem migration, nem `config.toml`, nem `docs/api/openapi.yaml`. Não é webhook público (`config.toml` não a lista → `verify_jwt=true`).
**Agravante:** mesmo se invocada, retorna 500 para todos — `index.ts:47` chama `is_workspace_admin` com cliente `authenticated`, mas `migrations/20260723135724_d78bc28b-1ad8-490e-ae93-98d93a70c8e1.sql:3` revoga esse EXECUTE de `authenticated` e `:10` concede só a `service_role`.

### Prova 2 — `slack-agent-notify`

```
$ grep -rn "slack-agent-notify" --include=*.ts --include=*.tsx --include=*.sql \
    --include=*.json --include=*.toml --include=*.yml . | grep -v node_modules \
    | grep -v "^./supabase/functions/slack-agent-notify/"
(nenhuma saída)
```

Zero referências. O cabeçalho `supabase/functions/slack-agent-notify/index.ts:4-5` declara ser disparada "via `pg_net.http_post` from server code or triggers" — não existe trigger nem job que o faça, e `cron.job` está vazio (fato medido). A function é funcionalmente completa (147 ln) e simplesmente nunca executa.

### Prova 3 — `whatsapp-router`

```
$ grep -rn "whatsapp-router" ... (idem)
./supabase/migrations/20260721155600_...sql:65: v_url := 'https://fqdohnmgmtaycfwsioik.supabase.co/functions/v1/whatsapp-router';
./supabase/config.toml:6:[functions.whatsapp-router]
```

Nenhuma referência em `src/`. O único invocador é o trigger `openclaw_whatsapp_autoreply_ai` (`migrations/20260721155600_...sql:86-88`, `AFTER INSERT ON public.openclaw_whatsapp_messages`), mas `:65` fixa a URL no projeto **`fqdohnmgmtaycfwsioik`**, enquanto `config.toml:1` publica em **`qdlnzopxrlsoljcrcmzv`**. A instância deployada aqui nunca recebe a chamada.
**Agravante duplo:** `:70` envia `X-Router-Token` de `current_setting('app.whatsapp_router_token', true)`, que retorna NULL→`''` se a GUC não estiver setada; `index.ts:41` faz `constantTimeEqual` fail-closed → 401 mesmo se a URL estivesse certa.

---

## 5. Impacto transversal: nenhum pg_cron agendado

Fato medido: `cron.job` retorna 0 linhas. Seis functions declaram ou pressupõem execução agendada e **hoje só rodam se alguém apertar um botão** (ou não rodam de forma alguma):

| Function             | Evidência da premissa de cron                                             | Estado real hoje                                                      |
| -------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `rag-embed-backfill` | `index.ts:3` "Executada via cron a cada 5 min"                            | Só via `doc-parse/index.ts:604` (best-effort, background)             |
| `cron-executor`      | Todo o propósito; `BodySchema` comentado `index.ts:8` "invocado por cron" | Só botão manual `cronSchedulerService.ts:271`; `cron_schedules` vazia |
| `crm-cadence-runner` | `verify_cron_token` RPC (`index.ts:124`) para execução global             | Só invocação autenticada por usuário                                  |
| `synthetic-runner`   | Monitoramento sintético periódico                                         | Só `syntheticService.ts:100` manual                                   |
| `queue-worker`       | Drenagem de fila                                                          | Só `queueManagerService.ts:180` manual                                |
| `slack-agent-notify` | `index.ts:4-5` "via pg_net.http_post from triggers"                       | **Nunca executa** (órfã)                                              |

---

## 6. Achados de SEGURANÇA — ordenados por gravidade

### 🔴 CRÍTICO 1 — `rag-embed-backfill`: endpoint público, sem auth, com SERVICE_ROLE

- `supabase/config.toml:9-10` → `verify_jwt = false` (gateway não exige JWT)
- `supabase/functions/rag-embed-backfill/index.ts:53-64` → handler passa direto de rate-limit para `createClient(supabaseUrl, serviceKey)`; **zero** `auth.getUser()`, zero `401`, zero `403`
- `index.ts:62` → `requireEnv("SUPABASE_SERVICE_ROLE_KEY")`
- `index.ts:89-90` (`const authHeader = \`Bearer ${serviceKey}\``) e `:116`→ repassa a **service_role key** como header a`rag-embed-v2`

**Superfície:** qualquer pessoa na internet pode POSTar e disparar leituras/escritas com service_role em `agent_memories_v2` e queimar cota de embedding (HF/OpenAI). Única barreira: `RATE_LIMITS.heavy` em memória, por instância.

### 🔴 CRÍTICO 2 — Dois webhooks com assinatura correta são inalcançáveis (mismatch `config.toml`)

`bitrix24-webhook` e `whatsapp-webhook` documentam no código `verify_jwt: false` mas **não estão em `config.toml`**:

- `supabase/functions/bitrix24-webhook/index.ts:33` → `* verify_jwt: false (Bitrix24 cannot send JWT — auth is via app_token)`
- `supabase/functions/whatsapp-webhook/index.ts:11` → `* verify_jwt: false (providers cannot send JWT)`
- `supabase/config.toml:1-13` → lista **apenas** openclaw-webhook, whatsapp-router, rag-embed-backfill, slack-events-webhook

**Consequência dupla:** (a) _disponibilidade_ — o gateway rejeita com 401 todo POST de Bitrix24/Meta/Twilio/Z-API/Evolution antes do código rodar; a verificação HMAC caprichada (`whatsapp-webhook:271-318`, `bitrix24-webhook:94-102`) nunca é exercitada; (b) _risco de regressão_ — se alguém "consertar" adicionando `verify_jwt=false` sem revisar, expõe os handlers, que aí passam a depender inteiramente do HMAC. Hoje o HMAC está fail-closed e correto, então a correção é segura — mas deve ser feita com essa consciência.

### 🟠 ALTO 3 — 16 functions usam SERVICE_ROLE_KEY sem nenhuma verificação de identidade no código

Dependem **exclusivamente** do `verify_jwt` da plataforma: qualquer usuário autenticado do projeto — de qualquer workspace — alcança o handler, que então opera com privilégio total, ignorando RLS.

| Function                 | arquivo:linha (uso de SR)                                                                       | Agravante                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `validate-access`        | `validate-access/index.ts` (SR + `ip_whitelist`, `geo_allowed_countries`, `access_blocked_log`) | É a própria function de controle de acesso                             |
| `incident-orchestrator`  | SR + `create_incident_run`/`update_incident_run`                                                | Cria/atualiza incidentes de qualquer workspace                         |
| `slack-dlq-retry`        | SR + `slack_dispatch_dlq`                                                                       | A gêmea `slack-dlq-discard:56-57` exige `is_workspace_admin`; esta não |
| `slack-alert-dispatcher` | SR + `slack_channel_routes`                                                                     | Dispara mensagens Slack                                                |
| `slack-rag-sync`         | SR + `SLACK_BOT_TOKEN`                                                                          | Lê Slack e escreve em `agent_memories_v2`                              |
| `openclaw-proxy`         | SR + `OPENCLAW_API_TOKEN`                                                                       | Proxy para serviço externo                                             |
| `queue-worker`           | SR + `queue_items`, `task_queues`                                                               | Drena filas de qualquer workspace                                      |
| `synthetic-runner`       | SR + `synthetic_checks`                                                                         | —                                                                      |
| `cron-executor`          | SR; `:62-70` POSTa em `/functions/v1/${schedule.target_id}` com `Bearer ${serviceRoleKey}`      | Alvo vem do banco → invocador arbitrário de functions com service_role |
| `visual-search`          | SR + `LOVABLE_API_KEY`                                                                          | —                                                                      |
| `kb-analyze-gaps`        | SR + `LOVABLE_API_KEY`                                                                          | —                                                                      |
| `kb-translate-article`   | SR + `LOVABLE_API_KEY`                                                                          | —                                                                      |
| `bitrix24-oauth`         | SR + `workspace_secrets`                                                                        | Callback OAuth grava segredos                                          |
| `a2a-server`             | SR + `agents`                                                                                   | Endpoint A2A                                                           |
| `dr-orchestrator`        | SR + `start_dr_drill`/`record_dr_step`/`complete_dr_drill`                                      | Dispara drills de disaster recovery                                    |
| `cost-calculator`        | `createAdminClient()` (`:43`) + `model_pricing`                                                 | Leitura apenas                                                         |

_Nota atenuante:_ `cron-executor:78-92` (branch `webhook`) **não** vaza a service_role — envia só `Content-Type`. O risco ali é SSRF via `schedule.target_id`, não vazamento de credencial.

### 🟠 ALTO 4 — `computer-use-execute` aceita a service_role key crua como bearer do cliente

`supabase/functions/computer-use-execute/index.ts:29-32`:

```ts
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
let authorized = false;
if (token === serviceKey) {
  authorized = true;
}
```

Normaliza um fluxo em que a service_role key trafega como `Authorization` de cliente. Comparação por `===` (não constant-time) → oráculo de timing teórico. A function é 100% simulada, então não há dado real em risco — mas o padrão é perigoso se copiado.

### 🟡 MÉDIO 5 — `workflow-engine-v2` envia webhooks sem assinatura HMAC

`supabase/functions/_shared/webhookSender.ts:4` documenta o próprio defeito:

> `PROBLEMA: workflow-engine-v2 chama webhooks sem assinatura HMAC.`

O helper corretivo existe (`webhookSender.ts:50` diz servir "workflow-engine-v2, cron-executor, notification-sender"), mas `workflow-engine-v2/index.ts` não tem `getUser()`/401/403 e o `_shared` registra a pendência como aberta.

### 🟡 MÉDIO 6 — `pg-net-smoke-test` chama RPC admin com privilégio insuficiente (fail-closed acidental)

`pg-net-smoke-test/index.ts:47` usa `userClient.rpc('is_workspace_admin', ...)`, mas `migrations/20260723135724_...sql:3,10` revogam de `authenticated` e concedem só a `service_role`. Resultado: `:50` retorna 500 `auth_check_failed` para todos. Falha fechada (não é vazamento), mas o comentário `:44-46` afirma ter _corrigido_ justamente esse bug — a correção está errada. `slack-dlq-discard:56` mostra o padrão certo (chamar via cliente `admin`).

### 🟢 BAIXO 7 — CORS

Nenhuma function retorna `Access-Control-Allow-Origin: *` hardcoded (`grep -cE "Allow-Origin['\"]?\s*:\s*['\"]\*"` = 0 em todas as 86). `_shared/cors.ts:5-22` usa allowlist + patterns. **Porém** `cors.ts:57-66`: se `ENVIRONMENT=development` ou `DENO_ENV=development`, devolve `origin || '*'` com todos os headers — se essa var vazar para produção, o CORS abre geral.
Exceção pontual: `notebook-podcast-generate` é a única sem `getCorsHeaders`/`handleCorsPreflight` (contagem 0).

---

## 7. Dependências ausentes (não-segurança)

| Dependência                  | Consumidor                                                                                                                                                      | Situação                                                                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`exec_sql` (RPC)**         | `datahub-query/index.ts:844`                                                                                                                                    | **0 definições em 326 migrations.** O próprio código admite em `:848`: "deploy exec_sql RPC SECURITY DEFINER on this project to enable". É a function mais invocada do sistema (21 call sites) |
| `is_workspace_admin` (grant) | `pg-net-smoke-test/index.ts:47`                                                                                                                                 | Existe, mas sem EXECUTE para `authenticated`                                                                                                                                                   |
| `workspace_secrets`          | bitrix24-api, bitrix24-oauth, bitrix24-webhook, crm-bitrix-sync, eval-judge, llm-gateway, rag-embed-v2, rag-ingest, rag-rerank, rag-rerank-v2, whatsapp-webhook | Tabela existe; entre as 210 sem dados → toda integração Bitrix24 e todo rerank/embed por segredo de workspace estão inertes                                                                    |
| `model_pricing`              | cost-calculator, llm-gateway                                                                                                                                    | Sem dados → cálculo de custo sem base                                                                                                                                                          |

**RPCs verificadas como existentes** (todas com ≥1 definição nas migrations): `verify_cron_token`, `check_budget`, `hybrid_memory_search`, `touch_memory`, `increment_webhook_counter`, `record_vulnerability`, `log_audit_entry`, `create_incident_run`, `get_current_oncall`, `update_incident_run`, `start_dr_drill`, `record_dr_step`, `complete_dr_drill`, `match_documents`, `pg_net_schema`, `pg_net_smoke_post`, `pg_net_smoke_response`, `is_workspace_admin`.

---

## 8. Total de arquivos lidos

| Categoria                                                                          |             Qtde |
| ---------------------------------------------------------------------------------- | ---------------: |
| `index.ts` lidos integralmente                                                     |               20 |
| `index.ts` lidos parcialmente (trechos citados, com linhas)                        |                6 |
| Módulos `_shared/*.ts` lidos integralmente                                         |                5 |
| Migrations SQL lidas (trechos citados)                                             |                3 |
| Arquivos frontend lidos (`externalClient.ts`, `client.ts`)                         |                2 |
| `supabase/config.toml` lido integralmente                                          |                1 |
| **Total de arquivos efetivamente abertos e lidos**                                 |           **37** |
| `index.ts` verificados apenas por busca mecânica (não lidos)                       |           **60** |
| Arquivos varridos por grep (todos os `.ts` de functions + `src/` + 326 migrations) | 132 + 326 + src/ |

**Declaração final:** não afirmo ter lido os 60 `index.ts` marcados `[mec]`. Para eles, as colunas Invocador, Env vars, Tabelas e Auth são resultado direto das buscas descritas em §0 e são reproduzíveis; a coluna Classificação para esses casos é uma inferência a partir desses sinais, não de leitura semântica do código.
