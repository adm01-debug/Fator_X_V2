# 02 — MATRIZ DE CENÁRIOS

> Commit `d912348`. Cada cenário é marcado **EXECUTADO** (rodei e vi o resultado) ou **RASTREADO** (segui o
> caminho pelo código). Onde "encontrado" difere de "esperado", o cenário virou achado, com o ID.

## 0. Como esta matriz foi gerada

Os cenários não foram improvisados. Para cada jornada e cada operação que grava dado, cruzei quatro dimensões:

| Dimensão           | Valores usados                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ator**           | visitante sem login · usuário autenticado · usuário de outro workspace · `workspace_admin` · chamador anônimo de API (internet) · job agendado (cron) · provedor externo (webhook) |
| **Estado do dado** | vazio · 1 registro · muitos · no limite · inválido · duplicado · já excluído                                                                                                       |
| **Entrada**        | válida · vazia · enorme · malformada · caractere especial · valor de borda                                                                                                         |
| **Condição**       | clique duplo · duas abas · dois usuários ao mesmo tempo · rede caindo no meio · sessão expirada · terceiro fora do ar · reenvio · passos fora de ordem                             |

**Limite estrutural desta matriz, declarado antes dos resultados:** não houve credencial de usuário nesta
sessão, e o banco de produção não era acessível (ver `01-INVENTARIO.md` §6). Portanto **toda combinação que
exige estar logado é RASTREADA, não EXECUTADA**. Das 151 rotas, apenas as **8 públicas** puderam ser
exercidas de verdade. Isso não é uma escolha de escopo: é a limitação da sessão, e está refletida na contagem.

---

## 1. Cenários EXECUTADOS

### 1.1 Cadeia de build e qualidade (ator: CI / desenvolvedor)

| #    | Cenário                                                | Esperado                              | Encontrado                                                                             | Veredito           |
| ---- | ------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------- | ------------------ |
| E-01 | `npm ci` em clone limpo                                | instala sem erro                      | exit 0                                                                                 | ✅                 |
| E-02 | `npm run typecheck` (2 tsconfigs)                      | zero erro                             | exit 0, zero erro                                                                      | ✅                 |
| E-03 | `npx eslint .` no repositório inteiro                  | zero erro                             | 0 erro, 1 aviso                                                                        | ✅                 |
| E-04 | `npx vitest run` — suíte completa                      | tudo passa                            | **200 arquivos, 6.226 testes, 100 % passam** em 90,3 s                                 | ✅                 |
| E-05 | `npx vite build`                                       | build limpo                           | exit 0; **aviso**: chunk `vendor` 2.246 KB > 900 KB                                    | ⚠️ PERF-01         |
| E-06 | `node scripts/check-bundle-size.mjs`                   | dentro do orçamento                   | 2.501,2/2.600 KB = **96 %**                                                            | ⚠️ PERF-02         |
| E-07 | `node scripts/db-drift-check.mjs` **sem** `DB_MCP_URL` | deveria avisar que não verificou      | exit **0** + `::warning:: … pulado (opt-in)`                                           | ⚠️ CI-02           |
| E-08 | `npx vitest run --config vitest.rls.config.ts`         | testar RLS                            | exit 0 com **8 de 8 SKIPPED**                                                          | ❌ **RLS-TEST-01** |
| E-09 | `npx playwright test` (5 specs) sem ffmpeg             | falhar nas asserções reais, se falhar | **26 de 26 falharam** com `Executable doesn't exist at …/ffmpeg-…`, escondendo a causa | ❌ **E2E-01**      |
| E-10 | idem, após `npx playwright install ffmpeg`             | tudo passa                            | **31 de 31 passaram** em 38,7 s                                                        | ✅                 |
| E-11 | `node scripts/check-agents-md-integrity.mjs`           | íntegro                               | exit 0, 8 seções                                                                       | ✅                 |

### 1.2 Rotas públicas, ator = visitante sem login (app buildada, 390 px e 768 px)

| #    | Rota                              | Condição                                | Esperado                                                      | Encontrado                                                                                             | Veredito          |
| ---- | --------------------------------- | --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------- |
| E-12 | `/`                               | 390 px                                  | renderiza, sem rolagem horizontal                             | `overflowH = nao`, 0 elemento estourando                                                               | ✅                |
| E-13 | `/auth`                           | 390 px e 768 px                         | idem                                                          | idem, login completo                                                                                   | ✅                |
| E-14 | `/reset-password`                 | sem token na URL                        | mensagem de link inválido                                     | "Link inválido — Este link de recuperação é inválido ou expirou. Voltar para o login"                  | ✅                |
| E-15 | `/rota-inexistente-qa`            | —                                       | página 404                                                    | "404 Página não encontrada — A rota /rota-inexistente-qa não existe ou foi movida. Voltar"             | ✅                |
| E-16 | `/help/primeiros-passos`          | **backend inalcançável** (rede cortada) | mensagem de erro ou estado vazio, com opção de tentar de novo | **"Carregando..." para sempre**, 2 × `ERR_TUNNEL_CONNECTION_FAILED` no console, nenhuma mensagem       | ❌ **UI-LOAD-01** |
| E-17 | todas as 5 rotas, 390 px e 768 px | —                                       | nenhum erro de console                                        | **em 10 de 10**: `X-Frame-Options may only be set via an HTTP header… It may not be set inside <meta>` | ❌ **SEC-HDR-01** |

### 1.3 Rotas protegidas, ator = visitante sem login (Playwright local)

| #    | Cenário                   | Esperado                         | Encontrado  | Veredito |
| ---- | ------------------------- | -------------------------------- | ----------- | -------- |
| E-18 | `/deployments` sem sessão | redireciona para login           | redireciona | ✅       |
| E-19 | `/workflows` sem sessão   | redireciona                      | redireciona | ✅       |
| E-20 | `/oracle` sem sessão      | redireciona                      | redireciona | ✅       |
| E-21 | `/monitoring` sem sessão  | redireciona                      | redireciona | ✅       |
| E-22 | `/knowledge` sem sessão   | redireciona                      | redireciona | ✅       |
| E-23 | `/datahub` sem sessão     | redireciona                      | redireciona | ✅       |
| E-24 | `/agents` sem sessão      | redireciona                      | redireciona | ✅       |
| E-25 | lote do spec `navigation` | todas as protegidas redirecionam | passa       | ✅       |

### 1.4 Formulário de login, ator = visitante (entrada inválida, local)

| #    | Entrada                                   | Esperado                | Encontrado               | Veredito |
| ---- | ----------------------------------------- | ----------------------- | ------------------------ | -------- |
| E-26 | campos vazios → enviar                    | erro de obrigatoriedade | mostra erro de validação | ✅       |
| E-27 | e-mail malformado                         | erro de formato         | mostra erro de e-mail    | ✅       |
| E-28 | alternar login/cadastro                   | troca o formulário      | troca                    | ✅       |
| E-29 | cadastro: indicador de força de senha     | aparece                 | aparece                  | ✅       |
| E-30 | "esqueci minha senha"                     | abre o formulário       | abre                     | ✅       |
| E-31 | alternar visibilidade da senha            | alterna                 | alterna                  | ✅       |
| E-32 | axe: violações críticas/sérias em `/auth` | nenhuma                 | nenhuma                  | ✅       |

### 1.5 Produção viva, ator = visitante (somente GET, sem tentativa de login)

| #    | Cenário                                  | Esperado                  | Encontrado                                                                                            | Veredito                       |
| ---- | ---------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| E-33 | `GET https://superagent-lab.lovable.app` | 200, app renderiza        | 200, título e login renderizados                                                                      | ✅                             |
| E-34 | `GET /dashboard` sem sessão              | tela de login             | tela de login                                                                                         | ✅                             |
| E-35 | `GET /rota-que-nao-existe-qa-audit`      | 404 (como no local, E-15) | **tela de login, não 404**                                                                            | ❌ **DEPLOY-01** (build velha) |
| E-36 | HTML servido × `index.html` do HEAD      | iguais                    | **`dns-prefetch` para projeto abandonado, CSP sem `*.sentry.io`, sem `media-src`, sem `form-action`** | ❌ **DEPLOY-01**               |

### 1.6 Plataforma: GitHub, CI e deploy (ator = sistema)

| #    | Cenário                                                       | Esperado                  | Encontrado                                                                                                                         | Veredito                         |
| ---- | ------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| E-37 | push na `main` dispara os 5 checks obrigatórios               | 5 rodam e passam          | run 44942293202: 5 `success`                                                                                                       | ✅                               |
| E-38 | push na `main` roda E2E / Lighthouse / k6 / contratos de edge | deveriam cobrir a main    | **4 `skipped`** (`if: pull_request`) e **nenhum é obrigatório**                                                                    | ❌ **E2E-01**                    |
| E-39 | `Security Audit` barra vulnerabilidade                        | barrar o que existe       | `npm audit` completo: **23 (15 moderadas, 6 altas, 2 críticas)**; o comando do gate devolve **4 (3 moderadas, 1 alta)** e sai 0    | ❌ **CI-01**                     |
| E-40 | `DB Drift Check` no CI                                        | verificar banco × repo    | **rodou de verdade**: `MCP conectado: supabase-fatorx-v2-mcp 5.3.0`, `repo=338 banco=338`, `RLS: 221/221`, zero escrita anon       | ✅ (e corrige `ESTADO-ATUAL.md`) |
| E-41 | merge na `main` publica edge functions                        | sim                       | run 44942293262: `✅ Deployed: 89 \| ❌ Failed: 0`, incluindo `migrate-helper`                                                     | ✅ (e é parte do **SEC-01**)     |
| E-42 | merge na `main` publica o front                               | sim                       | Vercel: **0 projetos, 0 deployments**; nenhum workflow publica front                                                               | ❌ **DEPLOY-01**                 |
| E-43 | CodeQL produz alertas                                         | sim                       | **830 execuções `success`** e `list_code_scanning_alerts` → **404 "no analysis found"** (`upload: never`)                          | ❌ **CQL-01**                    |
| E-44 | falha de CI avisa alguém                                      | Slack                     | `SLACK_WEBHOOK_URL` **não existe** nos secrets → só um `::warning::`                                                               | ❌ **SLACK-01**                  |
| E-45 | PR exige aprovação humana                                     | sim                       | `required_pull_request_reviews` **ausente** → merge com zero aprovação                                                             | ❌ **CI-03**                     |
| E-46 | repositório é privado                                         | sim (`AGENTS.md`)         | **`private: false`, `visibility: public`**; secret scanning e push protection **disabled**                                         | ❌ **SEC-01** (agravante)        |
| E-47 | manifest de deploy reflete o deploy                           | sim (guard de CI confere) | manifest diz **`verify_jwt_true: 80`**; o script deploya **89 com `--no-verify-jwt`**; o guard só compara manifest × `config.toml` | ❌ **SEC-02**                    |

### 1.7 Banco e MCP (ator = auditor)

| #    | Cenário                                            | Esperado  | Encontrado                                                                                  | Veredito                |
| ---- | -------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------- | ----------------------- |
| E-48 | ler o banco oficial `qdlnzopxrlsoljcrcmzv` por MCP | conseguir | **nenhum MCP aponta para ele**; os 5 conectados são de outros produtos (um deles com `401`) | ⛔ camada não coberta   |
| E-49 | os MCPs conectados são o Fator X?                  | não       | ZAPP: 227 tabelas, sem `agents`/`workspace_members`/`audit_log`; FINANCE: 286, idem         | ✅ (confirmado que não) |

**Total EXECUTADO: 49 cenários.**

---

## 2. Cenários RASTREADOS

Rastreados de ponta a ponta pelo código (interface → hook → chamada → backend → banco → resposta → interface),
sem execução. **Nenhum destes deve ser lido como "testado".** Cada linha cita o arquivo onde o caminho foi
lido; o achado correspondente traz o `arquivo:linha` completo.

### 2.1 Jornada "entrar no sistema" (ator: visitante → autenticado)

| #    | Cenário                       | Esperado                                                                                       | Encontrado (lendo o código)                                                                                                                                                         | Achado          |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| R-01 | login com credencial válida   | sessão criada, `syncExternalAuth` propaga o token ao client externo antes de qualquer consulta | `syncExternalAuth()` **não é aguardada** em `AuthContext.tsx:38,47` e `setLoading(false)` roda antes (`:36`); o client externo tem `persistSession: false` (`externalClient.ts:43`) | **SRV-RACE-01** |
| R-02 | recarregar a página logado    | sessão restaurada e token propagado                                                            | mesma corrida de R-01, agora na primeira pintura                                                                                                                                    | SRV-RACE-01     |
| R-03 | sessão expirada durante uso   | redireciona para login                                                                         | `AuthGuardLayout` (`App.tsx:200-204`) reage a `!user`; o que acontece com consultas em voo não foi verificado                                                                       | NÃO VERIFICADO  |
| R-04 | trocar de usuário rapidamente | estado do usuário anterior descartado                                                          | `use2FA.ts:24-28` é um IIFE async **sem guard de cancelamento** e descarta o `error`                                                                                                | **HK-RACE-01**  |

### 2.2 Jornada "criar e versionar agente" (ator: autenticado)

| #    | Cenário                                  | Esperado                              | Encontrado                                                                                                                                                                                | Achado           |
| ---- | ---------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| R-05 | salvar agente → lista atualiza           | cache invalidado                      | **nenhuma** invalidação de `['agents']`/`['agent', id]`/`['agent-versions', agentId]` parte do store (`agentBuilderStore.ts:183,210,273`) nem do layout (`AgentBuilderLayout.tsx:64,151`) | **HK-CACHE-01**  |
| R-06 | duas abas salvando o mesmo agente        | conflito detectado, versão correta    | `agentBuilderStore.ts:181` usa `agent.version + 1` (valor **local**) em vez de `current.version + 1`; erro de versão duplicada engolido                                                   | **HK-VER-01**    |
| R-07 | excluir agente com RLS negando           | item volta para a lista, erro visível | exclusão otimista **sem rollback** (`agentBuilderStore.ts:311-316`)                                                                                                                       | **HK-OPT-01**    |
| R-08 | sair do builder com autosave pendente    | timer cancelado                       | timer global lê `get()` no disparo (`agentBuilderStore.ts:60,99-105`): pode salvar **sobre outro agente**                                                                                 | **HK-SAVE-01**   |
| R-09 | vincular ferramenta ao agente duas vezes | sem linha duplicada                   | upsert com `tool_integration_id: null` e `onConflict: 'agent_id,tool_integration_id'` (`agentBuilderStore.ts:248-268`) — `NULL` não casa em `ON CONFLICT`                                 | **HK-UPSERT-01** |

### 2.3 Jornada "editar workflow" (ator: autenticado)

| #    | Cenário                                          | Esperado                         | Encontrado                                                                                                                                                                                     | Achado         |
| ---- | ------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| R-10 | digitar no canvas                                | autosave com debounce            | `WorkflowCanvasTab.tsx:50` passa `watchValue` **literal** e `useWorkflowAutosave.ts:63` tem deps `[watchValue, enabled]` + `use-workflow-persistence.ts:121-123` refaz fetch → **loop de 3 s** | **HK-LOOP-01** |
| R-11 | salvar workflow quando o insert das etapas falha | erro visível, etapas preservadas | `use-workflow-persistence.ts:82` **apaga todos** os `workflow_steps`; `:102-104` apenas loga a falha do insert; `:121` mostra **toast de sucesso** → perda silenciosa de etapas                | **WF-LOSS-01** |
| R-12 | rejeitar aprovação de workflow                   | erro visível se falhar           | `approvalService.ts:35-39` faz `update` sem checar `.error` e sem retorno, enquanto o caminho de aprovação ao lado checa                                                                       | **SRV-ERR-01** |

### 2.4 Jornada "consultar o Oráculo" (ator: autenticado; terceiro fora do ar)

| #    | Cenário                                    | Esperado                     | Encontrado                                                                                                                                   | Achado           |
| ---- | ------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| R-13 | edge `oracle-council` indisponível         | erro na tela, retry limitado | `oracleStore.ts:277-286` reagenda `submitQuery` **a cada 3 s, indefinidamente**, enquanto a mensagem casar com `fetch`/`network`/`502`/`503` | **ORA-RETRY-01** |
| R-14 | resposta SSE cortada na fronteira de chunk | evento remontado             | `oracleStore.ts:210-215` **não tem buffer** (a implementação correta existe em `useStreamingResponse.ts:167,182-184`)                        | **ORA-SSE-01**   |
| R-15 | gateway devolve `{"error": …}`             | mensagem de erro             | `useStreamingResponse.ts:265-277` trata falha de `JSON.parse` como **token bruto** → o erro aparece como texto da resposta do agente         | **STR-ERR-01**   |

### 2.5 Jornada "ingerir documento no RAG" (ator: autenticado)

| #    | Cenário                                     | Esperado                     | Encontrado                                                                                        | Achado                         |
| ---- | ------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------ |
| R-16 | upload de PDF válido                        | grava em `knowledge-uploads` | bucket privado, 50 MB, 12 mime types, policies por `auth.uid()` — **bem feito**                   | ✅                             |
| R-17 | reenviar o mesmo arquivo da mesma ingestão  | sobrescreve                  | `documentIngestionService.ts:159-162` usa `upsert: true`, e o bucket **não tem policy de UPDATE** | **STOR-01** (impacto HIPÓTESE) |
| R-18 | arquivo acima de 50 MB / mime fora da lista | rejeitado pelo bucket        | limites existem na migration                                                                      | ✅ RASTREADO                   |

### 2.6 Jornada "operar com permissões" (atores: todos os papéis)

| #    | Cenário                                                                                                          | Esperado                            | Encontrado                                                                                                                | Achado                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| R-19 | encarregado de LGPD abre `/lgpd`                                                                                 | acessa                              | exige `settings.api_keys` (`App.tsx:805`) → **não acessa**                                                                | **RBAC-01**                               |
| R-20 | quem gerencia chave de API abre `/security/forensic-snapshots`                                                   | não deveria                         | **acessa** (mesma permissão, `App.tsx:1148`)                                                                              | **RBAC-01**                               |
| R-21 | usuário sem papel abre `/code-interpreter` (executa código)                                                      | bloqueado por RBAC                  | **só exige sessão** (`App.tsx:1090`), sem `ProtectedRoute`                                                                | **RBAC-02**                               |
| R-22 | idem `/computer-use`, `/browser-agent`, `/deployments`, `/canary`, `/budgets`, `/creator-payouts`, `/governance` | RBAC                                | sem guard, só sessão                                                                                                      | **RBAC-02**                               |
| R-23 | carregar permissões quando a consulta de `roles` falha                                                           | erro visível, nada liberado         | `rbacService.ts:149-150` não checa `roleResult.error` e cai em `roleId = ''`; o filtro seguinte usa `''` numa coluna UUID | **RBAC-03**                               |
| R-24 | `workspace_admin`                                                                                                | tudo liberado por desenho (ADR-005) | `useRBAC.ts:105` → `if (state.role === 'workspace_admin') return true`                                                    | ✅ por desenho; é UX, a fronteira é a RLS |

### 2.7 Chamador anônimo da internet (ator: qualquer pessoa, sem login)

| #    | Cenário                                                                           | Esperado   | Encontrado                                                                                                                                 | Achado                                                 |
| ---- | --------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| R-25 | `POST /functions/v1/migrate-helper?action=credentials` com a chave do repositório | 401        | devolve `service_role` + `SUPABASE_DB_URL` (`migrate-helper/index.ts:30-38`), sem JWT (`config.toml:15-16`), **deployada** (log de deploy) | **SEC-01** — exploit **deliberadamente não executado** |
| R-26 | `POST /functions/v1/cron-executor`                                                | 401        | handler vai de CORS + rate limit direto a `createClient(url, serviceRoleKey)` (`:10-35`) → dispara todos os jobs vencidos                  | **SEC-02**                                             |
| R-27 | `POST /functions/v1/queue-worker`                                                 | 401        | drena a fila e repassa a própria `service_role` como `Bearer` a outras edges (`:135-140`)                                                  | **SEC-02**                                             |
| R-28 | `POST /functions/v1/skill-classify-llm` (e outras 6)                              | 401        | chama a OpenRouter via `_shared/ai-provider.ts`, **sem orçamento**, com rate limit só em memória do isolate (`rate-limiter.ts:40`)         | **COST-01**                                            |
| R-29 | `POST /functions/v1/rag-embed-backfill`                                           | 401        | backfill de embedding com `service_role`                                                                                                   | SEC-02 + COST-01                                       |
| R-30 | webhook com assinatura inválida (os 5 receptores)                                 | 401        | **os 5 verificam HMAC e devolvem 401** — `openclaw`, `slack-events`, `bitrix24`, `whatsapp`, `webhook-receiver`                            | ✅                                                     |
| R-31 | `bitrix24-webhook` com `domain` + `event_id` adivinhados, **sem assinatura**      | 401        | o dedupe roda **antes** da checagem de assinatura → `200 {"ok":true,"deduped":true}`                                                       | **WH-ORDER-01**                                        |
| R-32 | `webhook-receiver` em linha com `is_public = true`                                | autenticar | aceita qualquer origem (`:167-182`)                                                                                                        | **WH-PUB-01**                                          |

### 2.8 Volume e carga (ator: autenticado, workspace com dado real)

| #    | Cenário                                       | Esperado    | Encontrado                                                                                                                                | Achado         |
| ---- | --------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| R-33 | abrir observabilidade com muitos traces       | paginado    | `monitoringService.ts:17,51,65,84,148,170` faz `select('*')` **sem limite** em `agent_traces`, `session_traces`, `trace_events`, `alerts` | **PERF-03**    |
| R-34 | qualquer listagem grande                      | paginada    | **120 selects sem limite** e **162 `select('*')`** na camada de services                                                                  | PERF-03        |
| R-35 | digitar no estimador de custo                 | debounce    | `useCostEstimate.ts:118` não faz debounce de `systemPrompt`/`userInput` e `:63` invoca a edge → **uma invocação por tecla**, em 5 telas   | **PERF-04**    |
| R-36 | ficar na tela de login com os Mounters ativos | sem polling | 6 Mounters montam fora do Router (`App.tsx:226-231`), 4 abrem canal de realtime; polling na tela de login **NÃO VERIFICADO**              | NÃO VERIFICADO |

### 2.9 Dado fictício gravado em produção (ator: autenticado)

| #    | Cenário                                           | Esperado                                    | Encontrado                                                                                                                                                   | Achado         |
| ---- | ------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| R-37 | clicar "simular" em experimentos de prompt        | nada é gravado, ou é marcado como sintético | 50 linhas aleatórias **inseridas** em `prompt_experiment_runs` (`PromptExperimentsPage.tsx:282-303` → `promptExperimentService.ts:140`), sem marca de origem | **DATA-01**    |
| R-38 | promover variante vencedora depois de simular     | bloqueado, porque a medição é falsa         | `guardrailsOk` (`:313-329`) exige `runs >= 50` — exatamente o que a simulação entrega — e libera `promoteWinner`                                             | **DATA-01**    |
| R-39 | abrir a tela de Conhecimento                      | dado real                                   | 4 painéis 100 % falsos na mesma tela (`KnowledgePage.tsx:496,497,555,560`)                                                                                   | **UI-MOCK-01** |
| R-40 | ver métrica de memória/teste A-B no Agent Builder | dado real                                   | `MemoryModule.tsx:318-320` e `PromptABTestDialog.tsx:44-61` exibem `Math.random()`                                                                           | UI-MOCK-01     |

### 2.10 Interface incompleta (ator: autenticado)

| #    | Cenário                               | Esperado                    | Encontrado                                                                                                                                                               | Achado          |
| ---- | ------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| R-41 | marcar notificação como lida          | marca                       | botão sem handler (`NotificationBell.tsx:102`)                                                                                                                           | **UI-DEAD-01**  |
| R-42 | atualizar servidor MCP                | atualiza                    | botão `RefreshCw` sem `onClick` (`MCPServerManager.tsx:109`), ao lado de um remover que funciona (`:112`)                                                                | UI-DEAD-01      |
| R-43 | consulta falha em tela com `useQuery` | mensagem de erro            | **59 de 83** componentes com `useQuery` não tratam erro; 13 sem loading; 17 sem estado vazio                                                                             | **UI-STATE-01** |
| R-44 | abrir editor de postmortem            | link na tela de postmortems | rota existe (`App.tsx:1298`) e **nenhum link aponta para ela**                                                                                                           | **UI-ORPH-01**  |
| R-45 | abrir game day ao vivo                | link na tela de game days   | rota existe (`App.tsx:1256`) e **nenhum link**                                                                                                                           | UI-ORPH-01      |
| R-46 | usar a feature A2A / agent card       | funciona                    | as 4 funções de storage batem em `agent_configs`, **tabela que não existe em migration nenhuma** (`agentCardService.ts:222,238,261,280`), e `A2ARegistry.tsx:11` consome | **SRV-DEAD-01** |

**Total RASTREADO: 46 cenários** (dos quais 4 ficaram NÃO VERIFICADO dentro do próprio rastreio).

---

## 3. Resumo da matriz

|                                                             | Quantidade |
| ----------------------------------------------------------- | ---------- |
| Cenários **EXECUTADOS**                                     | **49**     |
| Cenários **RASTREADOS**                                     | **46**     |
| Total                                                       | **95**     |
| Divergência esperado × encontrado (viraram achado)          | **38**     |
| Conforme o esperado (registrados para ninguém gastar etapa) | **53**     |
| NÃO VERIFICADO dentro do rastreio                           | **4**      |

### O que a matriz **não** cobre, e por quê

- **Nenhuma combinação exige-login foi executada** (143 das 151 rotas): sem credencial de teste nesta sessão.
- **Nenhum cenário com dado real de volume**: banco de produção inacessível; não há ambiente de preview.
- **Nenhum cenário de concorrência real** (duas abas, dois usuários simultâneos): exigiria sessão autenticada.
- **Nenhum exploit executado** contra produção, por decisão: `R-25` é o caso mais grave da auditoria e está
  provado por log de deploy + leitura de código, não por chamada.
