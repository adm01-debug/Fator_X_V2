# 01 — INVENTÁRIO DO SISTEMA E REGISTRO DE COBERTURA

> **Auditoria de QA — Fator X V2 / Nexus Agents Studio**
> Commit auditado: `d912348` (= `origin/main` em 2026-11-21T19:41Z) · Auditoria executada em 2026-11-22/23
> **Sessão somente leitura.** Nenhum arquivo do repositório foi alterado, nenhuma migration aplicada,
> nenhuma escrita em banco, storage ou serviço externo. `git status --porcelain` vazio ao fim de cada fase.

## Como ler este arquivo

Cada item do inventário termina com um status de cobertura:

| Status                    | Significado                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| **revisado**              | o item foi lido/medido nesta auditoria                               |
| **não revisado + motivo** | o item existe no inventário e não foi coberto; o motivo está escrito |

E cada afirmação carrega um nível de evidência:

| Marca              | Significado                                                        |
| ------------------ | ------------------------------------------------------------------ |
| **EXECUTADO**      | rodei o comando, a consulta ou a requisição e vi a saída           |
| **RASTREADO**      | segui o caminho lendo o código, sem executar                       |
| **NÃO VERIFICADO** | não foi possível confirmar; o motivo e o que faltou estão escritos |

Nunca aparece "testado" ou "validado" para algo que foi apenas rastreado.

---

## 1. Stack e estrutura

| Camada             | Tecnologia                                                               | Versão (de `package.json`)                               |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| Build / dev server | Vite                                                                     | `^5.4.19` (dev em `localhost:8080`, `vite.config.ts:15`) |
| UI                 | React + ReactDOM                                                         | `^18.3.1`                                                |
| Linguagem          | TypeScript                                                               | `^5.8.3`                                                 |
| Roteamento         | react-router-dom                                                         | `^7.18.5`                                                |
| Estado servidor    | @tanstack/react-query                                                    | `^5.107.1`                                               |
| Estado cliente     | zustand                                                                  | `^5.0.14`                                                |
| Estilo             | Tailwind CSS + shadcn/ui (Radix)                                         | `^3.4.17`                                                |
| Backend            | Supabase (Postgres + Auth + Storage + Edge Functions Deno)               | `@supabase/supabase-js` `2.119.0`                        |
| Validação          | zod                                                                      | `^3.25.76`                                               |
| Testes unitários   | Vitest + Testing Library + jsdom                                         | `^3.2.7`                                                 |
| Testes e2e         | Playwright (+ `@axe-core/playwright`)                                    | `^1.65.0`                                                |
| Carga              | k6                                                                       | via `grafana/setup-k6-action`                            |
| Observabilidade    | `@sentry/react` `^11`, `web-vitals` `^5.2.0`, OTel e Langfuse (próprios) | —                                                        |
| Editor de texto    | TipTap                                                                   | `^3.x`                                                   |
| Gráficos           | recharts `^3.10.1`, reactflow `^11.11.4`, dagre                          | —                                                        |

**Gerenciador de pacotes: `npm`.** Existem `bun.lock` (435 KB) e `bun.lockb` (247 KB) no repositório, mas o CI
usa `npm ci` em todos os jobs (`.github/workflows/ci.yml:25,59,110,150,215,242`) e `package-lock.json`
(675 KB) é o lock efetivo. Node: o CI roda **22** (`setup-node@v7.1.0` com `node-version: '22'`).
→ _status: revisado (EXECUTADO: leitura dos YAML + `npm ci` rodado nesta sessão, exit 0)_

### Contagem de arquivos (EXECUTADO: `find`/`ls`)

| Diretório                            | Arquivos                                                 |
| ------------------------------------ | -------------------------------------------------------- |
| `src/**` (`.ts` + `.tsx`)            | **1.237**                                                |
| `src/pages/`                         | 141                                                      |
| `src/components/`                    | 557                                                      |
| `src/services/`                      | 166                                                      |
| `src/lib/`                           | 93                                                       |
| `src/hooks/`                         | 44                                                       |
| `src/stores/`                        | 12                                                       |
| `src/config/`                        | 10                                                       |
| `src/integrations/`                  | 5                                                        |
| `src/test/` + `src/tests/`           | 193                                                      |
| `src/contexts/`                      | 1 (`AuthContext.tsx`)                                    |
| `supabase/functions/`                | **90 pastas** (89 functions + `_shared` com 30 arquivos) |
| `supabase/migrations/`               | **338** arquivos `.sql`                                  |
| `scripts/`                           | 27 itens                                                 |
| `.github/workflows/`                 | 10                                                       |
| `e2e/`                               | 7 specs (41 testes)                                      |
| `tests/rls/`                         | 1 spec (8 testes)                                        |
| `tests/load/`                        | k6 (`llm-gateway.k6.js`)                                 |
| `src/integrations/supabase/types.ts` | 15.459 linhas, **377** declarações de tabela/view        |

→ _status: revisado_

### Grafo de código

`graphify-out/graph.json` existe e está no commit auditado: **13.990 nós, 37.299 arestas, 912 comunidades**
(`graphify-out/.session-start.log`, confirma `grafo pronto no commit d912348b…`). Foi usado como primeira
orientação pelos agentes de inventário antes de qualquer busca textual.
→ _status: revisado (EXECUTADO)_

---

## 2. Pontos de entrada

| Ponto               | Arquivo                              | O que faz                                                                                                                                                 |
| ------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTML raiz           | `index.html`                         | metas de SEO/OG, **cabeçalhos de segurança via `<meta>`** (linhas 8-12 — ver achado SEC-HDR-01), manifest PWA, JSON-LD                                    |
| Bootstrap JS        | `src/main.tsx:1-20`                  | `initSentry()` (11) → `initGlobalErrorHandlers()` (14) → `bootstrapLangfuseExporter()` (17) → `createRoot().render(<StrictMode><App/></StrictMode>)` (19) |
| Árvore da aplicação | `src/App.tsx` (1.538 linhas)         | 11 providers aninhados, 6 "Mounters" de alerta **fora** do Router, `<BrowserRouter>` com **152 elementos `<Route>`**                                      |
| Backend HTTP        | `supabase/functions/<nome>/index.ts` | 89 endpoints Deno, cada um com seu `Deno.serve`/`serve`                                                                                                   |
| Jobs                | `cron.schedule` em migrations        | 12 jobs declarados (ver §Banco)                                                                                                                           |
| Webhooks de entrada | 5 edge functions                     | `openclaw-webhook`, `slack-events-webhook`, `bitrix24-webhook`, `whatsapp-webhook`, `webhook-receiver`                                                    |

→ _status: revisado_

---

## 3. Build, deploy e ambientes — **a parte mais divergente da documentação**

### 3.1 Build (EXECUTADO nesta sessão)

| Comando                                                                                | Resultado                                                           |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `npm ci`                                                                               | exit 0                                                              |
| `npm run typecheck` (`tsc --noEmit` em `tsconfig.app.json` **e** `tsconfig.node.json`) | exit 0, zero erros                                                  |
| `npx eslint .` (repositório inteiro)                                                   | exit 0 — **0 erros, 1 aviso** (`@typescript-eslint/no-unused-vars`) |
| `npx vitest run`                                                                       | exit 0 — **200 arquivos, 6.226 testes, todos passam**, 90,3 s       |
| `npx vite build`                                                                       | exit 0, 1 min 14 s                                                  |
| `node scripts/check-bundle-size.mjs`                                                   | exit 0 — **2.501,2 KB / 2.600 KB (96 % do orçamento)**              |
| `node scripts/check-agents-md-integrity.mjs`                                           | exit 0 — 8 seções, 49.604 bytes                                     |
| `npx vitest run --config vitest.rls.config.ts`                                         | exit 0 — **8 testes, todos SKIPPED** (ver RLS-TEST-01)              |
| `npx playwright test` (5 specs, 31 testes)                                             | **31 passaram** após instalar o ffmpeg que faltava (ver E2E-01)     |
| `node scripts/db-drift-check.mjs` (local, sem `DB_MCP_URL`)                            | exit 0 com `::warning:: … pulado (opt-in)`                          |

Aviso do build que importa: `vendor-B5bnu-b3.js` com **2.246,66 KB** (gzip 670 KB), acima do limite de
900 KB do Vite. O orçamento total está em 96 % — qualquer dependência nova estoura.
→ _status: revisado_

### 3.2 Ambientes — quantos existem de verdade

| Ambiente                   | Existe?                     | Evidência                                                                                                                                                                                            |
| -------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local / dev**            | sim                         | `vite` em `localhost:8080`; `npm run dev`                                                                                                                                                            |
| **Produção do front-end**  | sim, no **Lovable**         | `https://superagent-lab.lovable.app` responde **200** e renderiza o login (EXECUTADO, Playwright MCP)                                                                                                |
| **Produção na Vercel**     | **não**                     | o time `juca1` (único da conta) tem **0 projetos** e **0 deployments**; `filter_project_envs fator-x-v2` → **404 Project not found**; não há `vercel.json` nem `.vercel/` no repositório (EXECUTADO) |
| **Preview / staging**      | **não identificado**        | nenhum ambiente de preview acessível nesta sessão                                                                                                                                                    |
| **Banco de produção**      | sim, `qdlnzopxrlsoljcrcmzv` | `supabase/config.toml:1`; alcançado pelo CI via `DB_MCP_URL` (MCP `supabase-fatorx-v2-mcp 5.3.0`)                                                                                                    |
| **Banco de teste/preview** | **não existe**              | `tests/rls/` depende de credencial de produção; não há Postgres descartável configurado                                                                                                              |

→ _status: revisado_

### 3.3 Como o código chega em produção — dois caminhos, um só funciona

| O que                   | Automático no merge? | Evidência                                                                                                                                                                                                       |
| ----------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Edge functions** (89) | **SIM**              | `.github/workflows/edge-deploy.yml:9-16` dispara em push na `main` que toque `supabase/functions/**`, `supabase/config.toml` ou o script. Run 44942293262 (commit `d912348`): `✅ Deployed: 89 \| ❌ Failed: 0` |
| **Front-end**           | **NÃO**              | nenhum workflow publica o front; Vercel sem projeto; Lovable publica por **botão manual** (`docs/RUNBOOK.md`)                                                                                                   |
| **Migrations**          | **NÃO**              | nenhum workflow aplica migration; o `DB Drift Check` só **compara**                                                                                                                                             |

**O HTML em produção não corresponde a nenhuma versão do `index.html` deste repositório** (EXECUTADO):

| Elemento                        | HEAD (`index.html`)                                                     | Servido em produção agora                                   |
| ------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `dns-prefetch`                  | `qdlnzopxrlsoljcrcmzv.supabase.co` (linha 17)                           | **`tdprnylgyrogbbhgdoik.supabase.co`** — projeto abandonado |
| CSP `connect-src`               | inclui `*.lovable.app`, `*.lovable.dev`, `cdn.gpteng.co`, `*.sentry.io` | **nenhum deles**                                            |
| CSP `media-src` / `form-action` | presentes                                                               | **ausentes**                                                |

A linha `index.html:17` com o ID antigo foi corrigida pela **PR #80, mergeada em 2026-11-11T23:30:39Z**
(o corpo da PR lista `index.html:17` explicitamente). Logo **o build em produção é anterior a 2026-11-11**:
não contém as PRs #80 a #145, incluindo a correção da validação do login (#97), a restauração de
`key_value` em `workspace_secrets` (#137) e a migração do envio de WhatsApp para edge (#142).
→ _status: revisado · ver achado DEPLOY-01_

### 3.4 Assimetria que o executor precisa internalizar

Mudança em **edge function vai para produção no merge**. Mudança em **front-end não vai**. As duas convivem no
mesmo repositório, com o mesmo fluxo de PR, e nada no repositório avisa a diferença.
→ _status: revisado_

---

## 4. Workflows de CI (10) e o que cada um realmente barra

| Workflow                        | Gatilhos                                       | Barra merge?                                                                  |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `ci.yml` (**Nexus CI**)         | push `main`, PR, manual                        | parcialmente — ver tabela de jobs                                             |
| `codeql.yml`                    | push `main`, PR, semanal (seg 05:17 UTC)       | **não** (`continue-on-error: true`, não é check obrigatório, `upload: never`) |
| `edge-deploy.yml`               | push `main` em `supabase/functions/**`, manual | não é gate; **publica em produção**                                           |
| `guards.yml`                    | push, PR, manual                               | não é check obrigatório                                                       |
| `dependency-review.yml`         | PR                                             | não é check obrigatório                                                       |
| `automation-local.yml`          | push, PR, manual                               | não é check obrigatório                                                       |
| `contexto.yml`                  | push, agendado (a cada hora), manual           | não é gate (gera contexto para agentes)                                       |
| `inventario-estado-semanal.yml` | agendado, manual                               | não é gate                                                                    |
| `anti-stale-dependabot.yml`     | agendado, manual                               | não é gate                                                                    |
| `release-drafter.yml`           | push, PR                                       | não é gate                                                                    |

### 4.1 Jobs do `ci.yml` (10) — quem roda quando, e quem bloqueia

| Job                  | Nome do check                     | Roda em push na `main`?      | É check obrigatório? |
| -------------------- | --------------------------------- | ---------------------------- | -------------------- |
| `security-audit`     | `Security Audit`                  | sim                          | **SIM**              |
| `db-drift-check`     | `DB Drift Check`                  | sim                          | **SIM**              |
| `lint-and-typecheck` | `Lint & Typecheck`                | sim                          | **SIM**              |
| `unit-tests`         | `Unit Tests`                      | sim                          | **SIM**              |
| `build`              | `Build`                           | sim                          | **SIM**              |
| `e2e-tests`          | `E2E Tests`                       | **não** (`if: pull_request`) | não                  |
| `edge-contracts`     | `Edge Function Contract Tests`    | **não**                      | não                  |
| `lighthouse`         | `Lighthouse CI (desktop\|mobile)` | **não**                      | não                  |
| `load-test`          | `Load Test (k6 — llm-gateway)`    | **não**                      | não                  |
| `notify-failure`     | —                                 | só em falha de push          | não                  |

Confirmado no run 44942293202 (commit `d912348`): os 5 obrigatórios rodaram com `success`; `E2E Tests`,
`Edge Function Contract Tests`, `Lighthouse CI` e `Load Test` aparecem **`skipped`**. (EXECUTADO)

### 4.2 Proteção da `main` (EXECUTADO: `github_get_branch_protection`)

```
required_status_checks: ["Security Audit","Lint & Typecheck","Unit Tests","Build","DB Drift Check"], strict: false
enforce_admins: true · required_linear_history: true · allow_force_pushes: false · allow_deletions: false
required_pull_request_reviews: AUSENTE  → zero aprovações necessárias
required_conversation_resolution: false · required_signatures: false
```

→ _status: revisado_

### 4.3 Secrets de Actions (15 nomes, valores nunca lidos) (EXECUTADO)

`DB_MCP_URL`, `E2E_EMAIL`, `E2E_PASSWORD`, `GOOGLE_MAPS_API_KEY`, `MAPBOX_ACCESS_TOKEN`,
`OPENROUTER_API_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_URL`, `VERCEL_TOKEN`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PROJECT_ID`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`.
**Ausente e referenciado:** `SLACK_WEBHOOK_URL` (`ci.yml:4` e job `notify-failure`) → alerta de CI nunca
dispara. `HERMES_API_KEY`, `HERMES_BASE_URL` e `OPENCLAW_WEBHOOK_SECRET` são aplicados por
`edge-deploy.yml:56-58` e também **não constam** na lista — `apply_secret` só age se o valor não for vazio,
então são silenciosamente ignorados.
→ _status: revisado_

---

## 5. Repositório e proteções da plataforma (EXECUTADO: `github_get_repo`)

| Item                              | Valor medido                                                                                          | Divergência                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `private` / `visibility`          | **false / public**                                                                                    | `AGENTS.md` afirma "**privado**" — **falso**   |
| `allow_forking`                   | true                                                                                                  | —                                              |
| `secret_scanning`                 | **disabled**                                                                                          | —                                              |
| `secret_scanning_push_protection` | **disabled**                                                                                          | nada barrou o commit da chave do achado SEC-01 |
| `dependabot_security_updates`     | **disabled**                                                                                          | há 19 alertas abertos e nenhum PR automático   |
| `delete_branch_on_merge`          | false                                                                                                 | `AGENTS.md` manda apagar a branch — é manual   |
| `homepage`                        | `https://fator-x-v2.vercel.app`                                                                       | aponta para Vercel, que não tem projeto        |
| `default_branch`                  | `main`                                                                                                | —                                              |
| Alertas Dependabot abertos        | **19** = 2 críticos (`tinypool`, dev) · 2 altos (`vite` dev, **`zod` runtime**) · 14 médios · 1 baixo | —                                              |
| Code scanning                     | **404 "no analysis found"** após 830 execuções do CodeQL                                              | ver achado CQL-01                              |
| PRs abertas                       | **0**                                                                                                 | nenhum conflito com outro agente               |

→ _status: revisado_

---

## 6. Limitações desta auditoria — o que ficou **não coberto**, e por quê

| Camada / item                                                                                                   | Status                            | Motivo exato                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Banco de produção, estado vivo** (conteúdo de tabela, policies reais, `cron.job`, grants, buckets, `pg_proc`) | **não revisado**                  | Nenhum MCP desta sessão aponta para `qdlnzopxrlsoljcrcmzv`. Verificado: `SUPABASE - GESTÃO DE CLIENTES` = `pgxfvjmuubtbowutlide`; `SUPABASE - GESTÃO DE PRODUTOS` = `doufsxqlfjyuvxuezpln`; `ZAPP WEB V2` = 227 tabelas sem `agents`/`workspace_members`/`audit_log`; `PROMO FINANCE V2` = 286 tabelas, idem; `PROMO CHAMPIONS` = erro `401 Invalid access token`. Toda a camada de banco foi auditada **estaticamente** (migrations + `types.ts`) e está marcada RASTREADO. |
| **`public.exec_sql` — existe hoje? com que grants?**                                                            | **não revisado**                  | É o item mais importante não coberto. Há migration de hotfix revogando (`20260905140000:21-27`), e o drift check indica as 338 migrations registradas, mas sem acesso ao banco não há confirmação. **Primeira ação do executor.**                                                                                                                                                                                                                                            |
| **Área autenticada da aplicação** (143 das 151 rotas)                                                           | **não revisado**                  | Não há credencial de teste nesta sessão. Os secrets `E2E_EMAIL`/`E2E_PASSWORD` existem no repositório, mas não nesta sessão. Toda a UI logada foi auditada por leitura de código (RASTREADO); só as 8 rotas públicas foram executadas.                                                                                                                                                                                                                                       |
| **Histórico do git** (varredura de segredos já removidos)                                                       | **não revisado**                  | Clone **raso**: `.git/shallow` presente, `git rev-list --count HEAD` = **50** commits (o mais antigo `f618216`, 2026-11-13). Em repositório **público**, essa varredura é necessária.                                                                                                                                                                                                                                                                                        |
| **Versão publicada no Lovable vs HEAD**                                                                         | **parcialmente**                  | Provado que é **anterior a 2026-11-11** pela diferença de `index.html`. O commit exato é **NÃO VERIFICADO** (sem acesso ao painel do Lovable).                                                                                                                                                                                                                                                                                                                               |
| **Gasto real de LLM já ocorrido**                                                                               | **não revisado**                  | Exigiria o painel da OpenRouter e tabelas de uso do banco.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **`VITE_SENTRY_DSN` configurado em produção**                                                                   | **não revisado**                  | Variável de ambiente do host Lovable, não legível daqui.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **CODEOWNERS inerte**                                                                                           | **não revisado**                  | `AGENTS.md` afirma 27 entradas `@nexus/*` com times inexistentes; não rodei `github_get_codeowners_errors`.                                                                                                                                                                                                                                                                                                                                                                  |
| **Lighthouse / k6**                                                                                             | **não revisado**                  | Rodam só em PR; não executei nesta sessão. Sem baseline de performance medida.                                                                                                                                                                                                                                                                                                                                                                                               |
| **Exploração da `migrate-helper`**                                                                              | **deliberadamente não executado** | Seria extrair segredo de produção. A prova de que está no ar é o log de deploy, não uma chamada. Um probe HTTP sem a chave (esperando 401) foi **bloqueado pelo classificador de permissão da sessão**.                                                                                                                                                                                                                                                                      |

---

> **As seções 7 a 16 (inventário item a item de cada camada) são acrescentadas no commit seguinte desta
> mesma branch.** Esta primeira parte reúne o que foi medido diretamente contra o repositório, o CI, o
> GitHub e a produção viva, e não muda com o resto da auditoria.
