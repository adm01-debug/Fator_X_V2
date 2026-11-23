# 03 — ACHADOS

> Commit `d912348`. Agrupados **por causa raiz**, não por sintoma: um problema com dez ocorrências é **um**
> achado com dez locais. Cada achado tem ID, camada, evidência com `arquivo:linha`, causa raiz, impacto em
> uma frase que um não-dev entende, severidade e confiança.

**Severidade** — Crítica: perda ou vazamento de dado, falha de segurança, fluxo principal quebrado ·
Alta: função importante falha ou dá resultado errado · Média: funciona com defeito ou fragilidade ·
Baixa: acabamento e higiene.
**Confiança** — CONFIRMADO: li o código que roda e/ou executei · HIPÓTESE: não verificado, com o motivo e o
que faltou.

## Contagem

| Severidade  | Confirmados | Hipóteses |   Total |
| ----------- | ----------: | --------: | ------: |
| **Crítica** |          12 |         1 |  **13** |
| **Alta**    |          32 |         2 |  **34** |
| **Média**   |          41 |         3 |  **44** |
| **Baixa**   |          12 |         0 |  **12** |
| **Total**   |      **97** |     **6** | **103** |

Além dos 103, há **15 verificações que deram "sem defeito"** — 9 na §9 e 6 nos adendos — registradas para o
executor não gastar etapa nelas.

---

## CAUSA RAIZ A — "o que está declarado não é o que está em execução"

A causa estrutural desta auditoria. Em cinco lugares diferentes, um documento, um manifest, uma config ou um
teste afirma um estado e a execução faz outra coisa. Nenhum dos cinco é um descuido isolado: todos compartilham
a mesma origem — **não existe nenhum guard que compare a intenção declarada com o efeito produzido**. Corrigir
cada sintoma sem fechar essa lacuna devolve o problema em outro lugar.

### SEC-01 · Crítica · CONFIRMADO · Segurança / Edge / Infra

**A chave que dá controle total do banco de produção é obtenível por qualquer pessoa na internet.**

Evidência:

- `supabase/functions/migrate-helper/index.ts:5` — `ACCESS_KEY` hex de 48 caracteres **hardcoded e commitada**
  (valor não reproduzido). É o único controle de acesso da function (`:14-19`).
- `:30-38` — com `?action=credentials`, responde JSON com `SUPABASE_URL`,
  **`SUPABASE_SERVICE_ROLE_KEY`** e **`SUPABASE_DB_URL`**.
- `:6-10` — CORS `Access-Control-Allow-Origin: '*'`.
- `supabase/config.toml:15-16` — `verify_jwt = false`.
- `:1-3` — comentário do próprio autor: "Edge function temporária para migração de banco. Após a migração,
  remova esta função." Não foi removida.
- **Está no ar:** log do job 136961936305 (`Edge Deploy`, run 44942293262, commit `d912348`, 2026-11-21):
  `Deploying Function: migrate-helper` · `Deployed Functions on project qdlnzopxrlsoljcrcmzv: migrate-helper`
  · `✅ Deployed: 89 | ❌ Failed: 0`.
- **O repositório é público:** `github_get_repo` → `"private": false`, `"visibility": "public"`,
  `secret_scanning: disabled`, `secret_scanning_push_protection: disabled`. `AGENTS.md` afirma "**privado**".

Causa raiz: credencial embutida em código, em repositório cuja visibilidade real nunca foi conferida, com as
proteções da plataforma que a teriam barrado desligadas, e com deploy automático que a republica a cada push.

Impacto: **qualquer pessoa pode ler, alterar e apagar todos os dados do sistema**, incluindo os cadastros de
usuário — sem senha, sem login, sem deixar rastro de quem foi.

Exploit **deliberadamente não executado** (seria extrair segredo de produção). A prova de que está no ar é o
log de deploy. Um probe HTTP sem a chave (esperando 401) foi bloqueado pelo classificador de permissão da
sessão — o que não enfraquece o achado.
→ Etapas **001–005**

### SEC-02 · Crítica · CONFIRMADO · Backend (edge) / Infra

**O deploy desliga a verificação de login de todas as 89 funções de backend, e 24 delas não verificam nada por conta própria.**

Três artefatos em contradição direta:

| Fonte                                 | Afirma                                                                    | Evidência                                   |
| ------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| `supabase/config.toml`                | 9 functions sem JWT, 80 com                                               | linhas 3-31                                 |
| `supabase/deployment-manifest.json`   | **`verify_jwt_true: 80`** / `verify_jwt_false: 9`                         | EXECUTADO: 80 entradas `"verify_jwt": true` |
| `scripts/deploy-edge-functions.sh:23` | deploya **as 89** com `--no-verify-jwt`, no laço da linha 18, sem exceção | —                                           |

E o CI certifica a versão errada: `.github/workflows/guards.yml:125` roda
`node scripts/edge-deploy/generate-manifest.mjs --check` comparando o manifest com o `config.toml` —
**nunca com o script de deploy**. Enquanto os dois documentos concordarem, o CI fica verde.
O deploy é automático: `.github/workflows/edge-deploy.yml:9-16,62`.

Das 89, **21 não têm nenhum mecanismo de autenticação do chamador** (medição inicial: 24; ver reconciliação abaixo) (EXECUTADO: varredura por
`auth.getUser`, `authenticateRequest`, `hmacSha256Hex`, `constantTimeEqual`, `x-access-key`, `CRON_SECRET`,
`WEBHOOK_SECRET`, `x-signature`, `x-hub-signature`, `x-slack-signature`, `SIGNING_SECRET`, `verify_token`),
e **16 delas instanciam cliente com `SUPABASE_SERVICE_ROLE_KEY`**, que ignora a RLS:

`a2a-server`, `agent-conversational-builder`, `bitrix24-oauth`, `cost-calculator`, `cron-executor`,
`geo-code`, `health-check`, `incident-orchestrator`, `kb-analyze-gaps`, `kb-translate-article`,
`openclaw-proxy`, `queue-worker`, `quick-agent-test`, `rag-embed-backfill`, `skill-classify-llm`,
`skill-describe-llm`, `slack-agent-notify`, `slack-alert-dispatcher`, `slack-dlq-retry`, `slack-rag-sync`,
`synthetic-runner`, `validate-access`, `visual-search`, `workflow-engine-v2`.

Prova detalhada em `cron-executor/index.ts:10-35`: CORS (11-12) → rate limit (14-16) → zod
`z.object({}).passthrough().optional()` (8, 19-27) → `createClient(url, serviceRoleKey)` (28-35).
**Nenhuma checagem de quem chamou, em nenhum ponto.**

> **Reconciliação da contagem — três medições, e a terceira resolve.** Minha varredura por padrão de busca
> deu **24**; a do inventário da camada edge deu **21**. Para escrever o plano, cada uma das 24 functions foi
> **aberta e lida individualmente** — e essa leitura mostrou que **três delas de fato autenticam**:
> `skill-classify-llm`, `skill-describe-llm` e `geo-code` (esta por cascata). Minha varredura as classificou
> errado porque o mecanismo que usam não casava com nenhum dos padrões de busca. **O número correto é 21**, o
> mesmo do inventário da camada — e as etapas 025, 026 e 028 do plano existem para confirmar e endurecer
> essas três, não para criar autenticação onde já há.
> A leitura individual também encontrou uma function **sem nenhum chamador** (`slack-agent-notify`), cuja
> etapa (018) é remover, não autenticar. As três listas concordam no que importa: as que usam `service_role`
> sem autenticar o chamador.

Causa raiz: uma flag posta no laço do script de deploy — provavelmente para destravar os webhooks, que
legitimamente não recebem JWT — e nunca restringida a eles; somada a um guard de CI que valida documentos
entre si em vez de validar o deploy.

Impacto: **qualquer pessoa na internet pode disparar tarefas internas do sistema** — rodar todos os jobs
agendados, drenar a fila de trabalho, mandar mensagem no Slack da empresa, gastar crédito de IA.
→ Etapas **006–032**

### DEPLOY-01 · Crítica · CONFIRMADO · Infraestrutura

**O site que está no ar não é a versão do código, e nada publica o front-end automaticamente.**

Evidência (EXECUTADO, Playwright MCP contra produção + `ls` + MCP da Vercel + API do GitHub):

| Elemento                        | HEAD (`index.html`)                                                     | Servido em produção                                         |
| ------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `dns-prefetch`                  | `qdlnzopxrlsoljcrcmzv.supabase.co` (linha 17)                           | **`tdprnylgyrogbbhgdoik.supabase.co`** (projeto abandonado) |
| CSP `connect-src`               | inclui `*.lovable.app`, `*.lovable.dev`, `cdn.gpteng.co`, `*.sentry.io` | **nenhum deles**                                            |
| CSP `media-src` / `form-action` | presentes                                                               | **ausentes**                                                |
| `/rota-inexistente`             | 404 (confirmado local: "404 Página não encontrada")                     | **tela de login**                                           |

A linha `index.html:17` com o ID antigo foi corrigida pela **PR #80, mergeada em 2026-11-11T23:30:39Z** (o
corpo da PR a lista explicitamente). Logo o build em produção é **anterior a 2026-11-11**, e não contém as
PRs #80 a #145 — incluindo a correção da validação do login (#97), a restauração de `key_value` em
`workspace_secrets` (#137) e a migração do WhatsApp para edge (#142).

E não há caminho automático: Vercel com **0 projetos e 0 deployments** no único time da conta
(`list_projects`, `list_deployments`, `filter_project_envs` → 404); sem `vercel.json` nem `.vercel/`; nenhum
workflow publica o front; o Lovable publica por **botão manual** (`docs/RUNBOOK.md`).
`docs/agentes/deploy.md:14-16` declara a Vercel como caminho oficial.

Causa raiz: o caminho de publicação do front-end foi perdido (Vercel desfeita) e substituído por uma ação
manual que ninguém executa, sem nada no repositório que sinalize isso. Edge functions, ao contrário, sobem
automaticamente — a assimetria não está documentada em lugar nenhum.

Impacto: **correções mergeadas há 11 dias não chegaram ao usuário**, e ninguém sabe disso. Pior: quem mergear
uma correção de front e disser "está em produção" estará errado.

Consequência direta (Alta): **o Sentry não funciona em produção.** `src/main.tsx:7` chama `initSentry`,
`src/lib/sentry.ts:8` e `src/lib/webVitals.ts:16` enviam eventos — e a CSP em vigor não permite
`*.sentry.io` em `connect-src`. Erro de usuário real não chega a lugar nenhum.
→ Etapas **063–068**

### CQL-01 · Alta · CONFIRMADO · Infraestrutura (CI)

**A análise de segurança de código roda há 830 execuções e joga o resultado no lixo.**

- `.github/workflows/codeql.yml:26,36` — analisa `javascript-typescript` com
  `security-extended,security-and-quality`; `:37-41` sobre `src`, `supabase/functions` e `scripts`.
- **`:59` → `upload: never`** · **`:17` → `continue-on-error: true`**
- EXECUTADO: `github_list_runs_for_workflow codeql.yml` → `total_count: 830`, as 3 últimas com
  `conclusion: success`; e `github_list_code_scanning_alerts` → **404 `"no analysis found"`**.

Causa raiz: a mesma de SEC-02 — um controle configurado e com o efeito desligado, sem nada que detecte a
diferença entre "roda" e "produz resultado útil".

Impacto: o sistema paga 830 execuções de análise de segurança e **nunca viu um único resultado**. O conjunto
`security-extended` inclui detecção de credencial em código, e `supabase/functions` está no escopo — ou seja,
a ferramenta que teria apontado a chave do SEC-01 estava ligada, olhando o arquivo certo, com a saída
desligada. Que a consulta específica teria disparado é **HIPÓTESE** (não rodei o CodeQL).
→ Etapa **069**

### VIS-01 · Alta · CONFIRMADO · Infraestrutura (CI)

**O teste que detecta mudança visual indevida compara a tela com a foto que acabou de tirar dela mesma.**

`.github/workflows/ci.yml:152-155`:

```
- name: Refresh visual baselines for CI environment
  run: npx playwright test e2e/visual.spec.ts --update-snapshots
- name: Run Playwright tests
  run: npx playwright test
```

A baseline é regravada imediatamente antes da comparação. `e2e/visual.spec.ts` (4 testes) nunca pode falhar,
e as baselines versionadas em `e2e/__screenshots__/` são decorativas no CI.

Causa raiz: um problema de ambiente (fontes/renderização diferentes entre CI e local) foi resolvido anulando
a verificação em vez de tolerando a diferença — e `playwright.config.ts:38-42` **já tem** a tolerância
configurada (`threshold: 0.2`, `maxDiffPixelRatio: 0.05`), o que torna o `--update-snapshots` redundante.

Impacto: qualquer mudança que quebre o layout passa pelo CI sem ser vista.
→ Etapa **070**

### RLS-TEST-01 · Alta · CONFIRMADO · Banco / CI

**A única defesa real dos dados tem teste escrito, e esse teste nunca roda.**

- EXECUTADO: `npx vitest run --config vitest.rls.config.ts` → exit **0**, `8 tests | 8 skipped`,
  `⚠️ RLS tests skipped — set SUPABASE_SERVICE_ROLE_KEY`.
- EXECUTADO: `grep -rn "test:rls\|vitest.rls" .github/workflows/` → **nenhuma ocorrência**. O script existe em
  `package.json:24` e nenhum job o chama.
- `vitest.config.ts:12` exclui `tests/rls/**` da suíte principal — então também não entra nos 6.226 testes.
- Os secrets `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` e `SUPABASE_ANON_KEY` **existem** no repositório.

Causa raiz: o teste foi escrito com "pular se não houver credencial" e nunca foi ligado a um job que forneça
a credencial. O skip é silencioso e sai 0, então nada acusa.

Impacto: a regra que impede um cliente de ver os dados de outro **não é verificada por nada**. Em um sistema
multi-workspace, é a verificação mais importante que existe.
→ Etapas **071–073**

### LINT-01 · Média · CONFIRMADO · Higiene / Tipos

**O gate de "tolerância zero" do CI não segura o que diz segurar.**

- `.github/workflows/ci.yml:65-83` promete falhar em qualquer violação de `nexus-design/*` e
  `@typescript-eslint/no-explicit-any`; `AGENTS.md` repete a promessa.
- Falha 1: o comando é `npx eslint src/ …` (`:68`) — as **90 edge functions ficam fora**, embora
  `eslint.config.js:13,30` aplique a regra a `**/*.{ts,tsx}`.
- Falha 2: o script do gate percorre `r[].messages` (`:71-83`), e violações desativadas por comentário vêm em
  **`suppressedMessages`**, lista separada. Suprimir basta para passar.
- EXECUTADO: `npx eslint supabase/functions scripts e2e tests -f json` → 202 arquivos, **0 erros**, e
  **121 mensagens suprimidas**, sendo **115 `@typescript-eslint/no-explicit-any`** (17 em
  `test-runner/versioning_contract_test.ts`, 15 em `datahub-query/index.ts`, 12 em `llm-gateway/index.ts`, …).
- EXECUTADO: `npx eslint src/ -f json` → **154 suprimidas**: 88 `react-hooks/exhaustive-deps`,
  31 `jsx-a11y/label-has-associated-control`, 11 `no-control-regex`, 6 `no-explicit-any`, 18 de a11y.
- **Total: 275 violações desativadas por comentário, com o CI verde.**

Por que não é só higiene: há **40 `as any`** em `supabase/functions/`, várias como
`(supabase as any).from(...)` (ex.: `llm-gateway/index.ts:376,383,391,409`) — isso desliga a checagem de tipo
contra o schema **na camada que escreve no banco**. E **267 `as unknown as`** em `src/` (52 só em
`src/services/`) convertem a resposta do Supabase para o tipo de domínio sem validar nada em runtime.

Impacto: quando uma coluna mudar de nome ou de tipo, nada acusa em build nem em CI — quebra em produção, na
tela do usuário.
→ Etapas **281–290**

---

## CAUSA RAIZ B — "o privilégio do sistema é usado no lugar da identidade de quem pediu"

Seis achados com a mesma forma: a função pega a chave que ignora todas as regras de acesso (`service_role`) e
age com ela, sem antes estabelecer **quem** está pedindo. O helper correto existe no repositório
(`supabase/functions/_shared/auth.ts`, exportado como `authenticateRequest` por `_shared/mod.ts`) e **24
functions já o usam** — a referência de uso correto é `whatsapp-outbound/index.ts:9-11,20`, que resolve o
workspace no servidor via `workspace_members`.

### SEC-03 · Crítica · CONFIRMADO · Backend (edge)

**Duas funções aceitam qualquer texto como senha e seguem com privilégio total.**
`supabase/functions/kb-analyze-gaps/index.ts:27-32` faz
`const auth = req.headers.get('Authorization'); if (!auth) return 401` — e **nada mais**: o token nunca é
validado. Em `:43-45` cria o cliente com `requireEnv('SUPABASE_SERVICE_ROLE_KEY')`. Idem
`kb-translate-article/index.ts:35-40`.
Causa raiz: checagem de **presença** do header confundida com checagem de **validade** do token.
Impacto: `Authorization: Bearer qualquer-coisa` passa. **É pior que não ter autenticação**, porque a função
devolve 401 para quem não manda header e por isso parece protegida em qualquer inspeção rápida — inclusive na
minha primeira varredura. Ambas gastam LLM.
→ Etapas **034, 035**

### SEC-06 · Alta · CONFIRMADO · Backend (edge)

**O executor de tarefas agendadas manda requisição autenticada para qualquer endereço que estiver no banco.**
`supabase/functions/cron-executor/index.ts:62-70` monta `${baseUrl}/functions/v1/${schedule.target_id}` a
partir da tabela `cron_schedules`, **sem validar `target_id`**, e põe o próprio `service_role` no header
`Authorization`. O ramo de webhook (`:79-82`) usa `schedule.target_id` como URL inteira.
Causa raiz: destino de requisição vindo de dado, combinado com credencial privilegiada no header.
Impacto: quem conseguir escrever uma linha em `cron_schedules` — ou simplesmente chamar a função, que é
pública (SEC-02) — faz o sistema entregar a chave do banco para um servidor escolhido por ele.
→ Etapa **038**

### SEC-04 · Alta · CONFIRMADO (código) / HIPÓTESE (desfecho) · Backend (edge)

**Uma busca por imagem chama a busca semântica com a chave do sistema em vez do login do usuário.**
`supabase/functions/visual-search/index.ts:141-150` encaminha para `semantic-search` com
`Authorization: Bearer ${SERVICE_KEY}` e `apikey: SERVICE_KEY`; `visual-search` não autentica ninguém. E
`semantic-search/index.ts:83-90` faz `auth.getUser()` e devolve 401 sem usuário.
**Dois desfechos, e qual deles é exige um teste que esta sessão não pôde fazer:**
(a) se a `service_role` passa pelo `getUser()` → **bypass de autorização**, chamador anônimo busca em
qualquer workspace (seria Crítica); (b) se não passa (o esperado, pois o JWT de `service_role` não tem `sub`)
→ **`visual-search` está quebrada** e nunca devolveu resultado (Alta, funcionalidade morta).
**NÃO VERIFICADO qual.** Faltou: chamar `semantic-search` com `service_role` como Bearer em ambiente
descartável. A etapa começa por esse teste.
→ Etapa **036**

### SEC-05 · Alta · CONFIRMADO · Backend (edge)

**O servidor de agente-para-agente inventa uma credencial quando o chamador não manda nenhuma.**
`supabase/functions/a2a-server/index.ts:235` monta `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` quando o
request não traz `Authorization` e **segue processando**; a function usa `SERVICE_ROLE_KEY` em `:202`.
Causa raiz: ausência de credencial tratada como credencial anônima válida, em vez de 401.
Impacto: o protocolo A2A, que conecta agentes entre si, aceita chamada sem identificação.
→ Etapa **037**

### SEC-10 · Média · RASTREADO · Backend (edge) / Multi-tenant

**A verificação de "este usuário pertence a este workspace" só acontece em 4 das 89 funções.**
`supabase/functions/_shared/auth.ts:93-96` só confere pertencimento quando `requireWorkspace` é `true` ou
quando o chamador envia `x-workspace-id`; medido em **4** functions
(`memory-manager` entre elas). Nas demais, um usuário autenticado de um workspace pode operar sobre o
`workspace_id` de outro se o id vier no payload. **A última defesa seria a RLS, que não foi possível
verificar nesta sessão** (sem acesso ao banco).
→ Etapas **074–077**

### RBAC-04 · Média · CONFIRMADO · Hooks / Multi-tenant

**Para quem participa de mais de um workspace, as permissões carregadas são de um workspace arbitrário.**
`src/hooks/useRBAC.ts:55-57` resolve o workspace com `.limit(1).maybeSingle()` **sem nenhuma ordenação nem
escolha explícita** — o Postgres devolve a linha que quiser. O mesmo padrão aparece em 5 services
(`monitoringService.ts:114,123`, `auditLogService.ts:73`, `securityService.ts:36`,
`knowledgeService.ts:217`).
Impacto: o usuário vê permissões e dados de um workspace que não é o que ele escolheu na tela, de forma não
determinística.
→ Etapas **078–080**

---

## CAUSA RAIZ C — "gasto de dinheiro sem teto nem dono"

### COST-01 · Crítica · CONFIRMADO · Backend (edge) / Custo

**Sete endereços públicos gastam o crédito de IA do dono, sem login e sem orçamento.**
`supabase/functions/_shared/ai-provider.ts` (52 linhas, lido na íntegra) exporta
`AI_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions'` (`:11`) e
`AI_API_KEY_ENV = 'OPENROUTER_API_KEY'` (`:12`). Quem importa isso fala **direto com a OpenRouter**, fora do
`llm-gateway`. O arquivo **não tem nenhuma verificação de orçamento** e não grava consumo: `aiCostUsd`
(`:44-52`) é função pura e devolve **`null`** para qualquer modelo fora das 3 linhas da tabela (`:37-41`) —
custo não contabilizado em silêncio.

**19 functions** importam `ai-provider`: `agent-conversational-builder`, `agent-eval-runner`,
`agent-workflow-runner`, `browser-agent-run`, `code-interpreter-execute`, `crm-enrich`, `global-search`,
`graph-execute`, `kb-analyze-gaps`, `kb-translate-article`, `llm-gateway`, `notebook-podcast-generate`,
`quick-agent-test`, `skill-classify-llm`, `skill-describe-llm`, `visual-search`, `voice-synthesize`,
`voice-transcribe`, `widget-proxy`. **Sete delas não exigem nenhuma autenticação** (cruzamento com SEC-02):
`agent-conversational-builder`, `kb-analyze-gaps`, `kb-translate-article`, `quick-agent-test`,
`skill-classify-llm`, `skill-describe-llm`, `visual-search`.

O único freio nessas 7 é frágil e foi medido: usam `checkRateLimit` (5 com `RATE_LIMITS.heavy` = 5/min), mas
`supabase/functions/_shared/rate-limiter.ts:40` guarda o estado em `const store = new Map<string, number[]>()`
— **memória do isolate**, não banco. Em Edge Functions o isolate é efêmero e replicado: o contador reinicia e
não é compartilhado. O identificador cai para `x-forwarded-for` (`:61`) quando não há usuário.

Causa raiz: o controle de orçamento foi implementado **em um** dos caminhos de chamada de LLM, e um helper
compartilhado abriu um segundo caminho que não passa por ele.

Impacto: **qualquer pessoa na internet pode esvaziar o saldo de IA do dono**, em sete endereços, sem conta.
Quanto já foi gasto assim é **NÃO VERIFICADO** (exigiria o painel da OpenRouter).
→ Etapas **039–045**

### COST-02 · Crítica · CONFIRMADO · Backend (edge) / Regra de negócio

**O único freio de orçamento que existe é desligado por omitir um campo no pedido.**
`supabase/functions/llm-gateway/index.ts:264` → `if (!workspaceId) return { allowed: true };`
e `workspaceId` é **opcional** no payload (`:325-332`). Uma chamada sem `workspace_id` devolve "permitido"
**antes** de tudo: não chama `rpc('check_budget')` (`:267`), não varre `budgets` (`:285-299`) e não aplica o
kill switch por agente (`:307`).
Causa raiz: o caminho "não sei de quem é esta chamada" foi tratado como "não há orçamento a aplicar", e o
default escolhido foi **permitir**.
Impacto: o orçamento do sistema é opcional para quem chama. Quantas chamadas reais chegam sem `workspace_id`
é **NÃO VERIFICADO** (precisa dos logs do gateway).
→ Etapa **033**

### COST-03 · Alta · CONFIRMADO · Regra de negócio

**O mesmo custo é calculado em dois lugares, com unidades diferentes e fontes diferentes.**

| Onde                              | Unidade                                    | Fonte               | Cobertura                |
| --------------------------------- | ------------------------------------------ | ------------------- | ------------------------ |
| `llm-gateway/index.ts:58,68-69`   | por **1.000** tokens (`input_cost_per_1k`) | tabela no **banco** | o que estiver cadastrado |
| `_shared/ai-provider.ts:37-41,51` | por **1.000.000** tokens (`PRICES_PER_1M`) | **hardcoded**       | **3 modelos**            |

Causa raiz: duas implementações independentes do mesmo cálculo, nascidas em momentos diferentes, sem uma
fonte única de preço.
Impacto: qualquer relatório que some as duas origens está somando números incomparáveis; e o caminho do
`ai-provider` **não grava consumo nenhum**, então o custo real das 19 functions não aparece em `budgets`.
→ Etapas **101–104**

### PERF-04 · Média · CONFIRMADO · Hooks / Custo

**O estimador de custo chama o backend uma vez por tecla digitada.**
`src/hooks/useCostEstimate.ts:118` não faz debounce de `input.systemPrompt`/`input.userInput`, e `:63`
invoca a edge `cost-calculator`. O hook é consumido por 5 arquivos.
Impacto: escrever um prompt de 500 caracteres dispara ~500 invocações de função.
→ Etapa **226**

---

## CAUSA RAIZ D — "dado inventado entra na mesma tabela do dado real"

### DATA-01 · Crítica · CONFIRMADO · Regra de negócio / Integridade

**Um botão na tela grava 50 medições falsas em produção, e elas liberam uma decisão real.**

A cadeia completa, lida linha a linha:

1. `src/pages/PromptExperimentsPage.tsx:364-365` — botão comum da página (`onClick={() => simulate.mutate()}`),
   sem flag de ambiente, sem permissão.
2. `:282-303` — laço de 50 iterações sorteando variante (`Math.random() < 0.5`), `latency_ms` (`:292`),
   `cost_cents` (`:294`), `quality_score` (`:297`) e `success` (`:299`), **com vantagem embutida para a
   variante B** (`+80ms`, `+0.1`, `+0.08`, `0.92` vs `0.85`). Comentário da `:284`: "Simula 50 runs para demo".
3. `src/services/promptExperimentService.ts:127-141` — `recordRun` termina em
   `fromTable('prompt_experiment_runs').insert(input)`. **É INSERT na tabela**, não estado local.
4. `src/pages/PromptExperimentsPage.tsx:313-329` — `guardrailsOk` lê as estatísticas dessas mesmas linhas e
   exige `winner.runs >= 50 && loser.runs >= 50` — exatamente o que a simulação entrega — e com isso libera
   `promote` (`:272-280`) → `promptExperimentService.promoteWinner(...)`, que troca a versão de prompt em uso.

Causa raiz: um atalho de demonstração que escreve na tabela de produção, e uma regra de negócio que confia
na contagem de linhas dessa tabela sem distinguir origem — `recordRun` **não tem** campo de origem
(`:127-139`).

Impacto: qualquer usuário com acesso à tela polui a base de métricas e, em seguida, promove uma versão de
prompt "vencedora" com base em números inventados. **Depois disso não há como separar, na tabela, medição real
de medição simulada.**

Agravante específico deste repositório: `AGENTS.md` já proíbe isso em letra — "Nunca gere dado sintético em
tabela de produção para 'mostrar a tela' (já aconteceu: `src/pages/PromptExperimentsPage.tsx`)". A regra
existe, aponta este arquivo, **e o código continua lá**.

Existência das linhas falsas no banco: **NÃO VERIFICADO** (sem acesso ao banco). Não cliquei o botão.
→ Etapas **105–107**

### UI-MOCK-01 · Alta · CONFIRMADO · Interface

**Telas inteiras mostram número inventado como se fosse medição do sistema.**

- `src/pages/KnowledgePage.tsx` monta **4 painéis 100 % falsos na mesma tela**: `VectorSearchResults`
  (`:555`), `IngestionLogsPanel` (`:496`), `RealtimeVectorCharts` (`:497`), `RagVersionControl` (`:560`).
- `src/components/agent-builder/modules/MemoryModule.tsx:318-320` e
  `PromptABTestDialog.tsx:44-61` exibem métrica gerada por `Math.random()` **dentro do fluxo de configuração
  de agente de produção**.
- Ao todo, **10 componentes** com dado mock/hardcoded confirmado, **4 deles montados em página viva**.
- `src/components/datahub/HibernatedDatabasesPanel.tsx:33` fixa o `project_ref` de outro sistema no front.
- `Math.random` aparece em 17 arquivos de `src/pages` + `src/components`; vários são legítimos (id de sessão,
  jitter, skeleton — ex.: `DashboardSkeleton.tsx`, `ui/sidebar.tsx`). Os que precisam de triagem individual
  por mostrarem número de negócio estão listados na etapa.
  Impacto: o dono toma decisão olhando gráfico que não mede nada.
  → Etapas **108–118**

---

## CAUSA RAIZ E — "a operação falha e o sistema diz que deu certo"

Doze achados com a mesma forma: o resultado de uma escrita não é verificado, ou o erro é capturado e
descartado. O padrão correto existe no próprio repositório, muitas vezes no arquivo vizinho — por exemplo
`src/services/approvalService.ts:18-31`, onde `approveWorkflowRun` faz `if (error) throw error` enquanto a
função de rejeitar, 4 linhas abaixo, não faz.

### WF-LOSS-01 · Crítica · CONFIRMADO · Hooks / Perda de dado

**Salvar um workflow apaga todas as etapas antes de regravá-las, e se a regravação falhar o usuário vê "Canvas salvo!".**

`src/hooks/use-workflow-persistence.ts`, função `syncSteps` (`:80-105`):

- `:82` — `await supabaseExternal.from('workflow_steps').delete().eq('workflow_id', wfId)` — apaga **todas**
  as etapas. **O erro do próprio delete não é verificado.**
- `:99-104` — faz o `insert` das etapas novas e, se `stepErr`, apenas
  `logger.error('Failed to sync workflow_steps', …)`. **Não lança, não avisa, não desfaz.**
- `:121` — `toast.success('Canvas salvo!')` roda incondicionalmente depois de `syncSteps`.

Causa raiz: um "apaga tudo e reinsere" feito como duas chamadas independentes do cliente, sem transação e sem
verificação da segunda — então a janela entre as duas é um estado com zero etapas, e a falha da segunda é
permanente.

Impacto: **o usuário perde o workflow que acabou de desenhar e o sistema diz que salvou.** Basta a RLS negar,
uma constraint falhar ou a rede cair entre as duas chamadas. Não há como recuperar: as etapas antigas já
foram apagadas.
→ Etapas **063–065**

### SRV-ERR-01 · Alta · CONFIRMADO · Services

**56 chamadas ao banco não verificam se deram erro; outras 51 descartam o resultado.**
Medido pelo inventário da camada (171 arquivos revisados): **56 chamadas sem checagem de `.error`** e
**51 com resultado descartado**. Caso exemplar, com o contraste no mesmo arquivo:
`src/services/approvalService.ts:35-39` (`rejectWorkflowRun`) faz `update` em `workflow_runs` **sem checar
`.error` e sem retorno**, enquanto `approveWorkflowRun` (`:18-31`) checa e lança.
Impacto: ações que o usuário acha que executou (rejeitar uma aprovação, por exemplo) podem não ter
acontecido, sem nenhum sinal.
→ Etapas **186–200**

### UI-STATE-01 · Alta · CONFIRMADO · Interface

**59 de 83 telas que buscam dado não têm o que mostrar quando a busca falha.**
Dos 83 componentes com `useQuery`: **59 sem estado de erro**, **13 sem loading**, **17 sem estado vazio**
(varredura automatizada sobre os 557 arquivos de `src/components/`, 0 não revisados). Casos de alto impacto
apontados: `src/components/super-cerebro/KnowledgeAreasTab.tsx:39`,
`src/components/security/AuditLogSection.tsx:10`, `src/components/admin/AuditTrailPanel.tsx`.
Confirmado em execução no caso público equivalente: **UI-LOAD-01** (abaixo).
→ Etapas **201–215**

### UI-LOAD-01 · Média · EXECUTADO · Interface

**Página pública fica em "Carregando..." para sempre quando o backend não responde.**
Com o Supabase inalcançável, `/help/primeiros-passos` renderizou apenas **"Carregando..."** em 390 px e em
768 px, com dois `Failed to load resource: net::ERR_TUNNEL_CONNECTION_FAILED` no console — sem mensagem de
erro, sem botão de tentar de novo, sem estado vazio. As outras 4 rotas públicas renderizaram normalmente, o
que isola o problema no tratamento de falha dessa página, não no ambiente.
Qual hook/consulta falta tratar: **NÃO VERIFICADO** (não localizei a linha exata).
→ Etapa **216**

### HK-OPT-01 · Alta · CONFIRMADO · Stores

**Excluir um agente remove da tela antes de confirmar, e não devolve se o banco negar.**
`src/stores/agentBuilderStore.ts:311-316` faz exclusão otimista **sem rollback** no erro.
Impacto: o agente desaparece da lista, continua existindo no banco, e o usuário acha que excluiu.
→ Etapa **217**

### HK-VER-01 · Alta · CONFIRMADO · Stores

**O número de versão do agente pode andar para trás depois de um conflito.**
`src/stores/agentBuilderStore.ts:181` usa `agent.version + 1` (valor **local**, possivelmente velho) em vez
de `current.version + 1`; o erro de versão duplicada é engolido (`:165-171` pergunta via `window.confirm`).
→ Etapa **218**

### HK-SAVE-01 · Alta · CONFIRMADO · Stores

**O autosave do builder pode gravar sobre outro agente.**
`src/stores/agentBuilderStore.ts:60` e `:99-105` — o timer global lê `get()` **no momento do disparo**, não
no momento do agendamento. Sair do builder e abrir outro agente antes do timer disparar grava no agente errado.
→ Etapa **219**

### HK-LOOP-01 · Alta · CONFIRMADO · Hooks / Performance

**O canvas de workflow entra em laço de gravação a cada 3 segundos.**
`src/components/workflows/WorkflowCanvasTab.tsx:50` passa `watchValue` **literal** (novo objeto a cada
render); `src/hooks/useWorkflowAutosave.ts:63` tem deps `[watchValue, enabled]`; e
`src/hooks/use-workflow-persistence.ts:121-123` mostra toast e refaz `fetchWorkflows()`, que atualiza o
estado — fechando o ciclo.
Impacto: gravação contínua no banco enquanto a tela está aberta, com toast repetido.
→ Etapa **220**

### ORA-RETRY-01 · Alta · CONFIRMADO · Stores / Robustez

**Quando o Oráculo está fora do ar, o sistema tenta de novo a cada 3 segundos, para sempre.**
`src/stores/oracleStore.ts:277-286` reagenda `submitQuery` a cada 3 s **sem limite de tentativas e sem
backoff**, enquanto a mensagem de erro casar com `fetch`/`network`/`502`/`503`.
Impacto: uma indisponibilidade do serviço vira uma enxurrada de requisições — exatamente o que piora a
indisponibilidade, e com custo de LLM a cada tentativa que passe.
→ Etapa **221**

### ORA-SSE-01 · Média · CONFIRMADO · Stores

**A resposta em tempo real do Oráculo corta no meio quando o pacote de rede quebra em lugar errado.**
`src/stores/oracleStore.ts:210-215` não mantém buffer entre chunks. A implementação **correta existe no
próprio repositório**: `src/hooks/useStreamingResponse.ts:167,182-184`.
→ Etapa **222**

### STR-ERR-01 · Média · CONFIRMADO · Hooks

**Quando o backend devolve erro, o texto do erro aparece como se fosse a resposta do agente.**
`src/hooks/useStreamingResponse.ts:265-277` trata falha de `JSON.parse` como token bruto, e a condição de
`:266-270` só repropaga mensagens específicas.
→ Etapa **223**

### HK-GUARD-01 · Alta · CONFIRMADO · Hooks / Segurança

**O guardrail de conteúdo libera a passagem quando ele mesmo falha.**
`src/hooks/useGuardrails.ts:14` e `:27` retornam **`true`** em qualquer exceção, **sem log**.
Impacto: se algum fluxo usa `validateInput`/`validateOutput` como única barreira, uma falha do guardrail
vira aprovação automática. Quais fluxos dependem só dele: **NÃO VERIFICADO**.
→ Etapa **224**

### HK-CACHE-01 · Média · CONFIRMADO · Hooks / Estado

**Depois de salvar um agente, a lista continua mostrando o estado antigo.**
Nenhuma invalidação de `['agents']`, `['agent', id]` ou `['agent-versions', agentId]` parte do store
(`src/stores/agentBuilderStore.ts:183,210,273`) nem do layout
(`src/components/agent-builder/AgentBuilderLayout.tsx:64,151`).
→ Etapa **225**

### HK-UPSERT-01 · Média · CONFIRMADO · Hooks / Banco

**Vincular a mesma ferramenta duas vezes cria linha duplicada.**
`src/stores/agentBuilderStore.ts:248-268` usa `tool_integration_id: null` com
`onConflict: 'agent_id,tool_integration_id'` — em Postgres, `NULL` **não casa** em `ON CONFLICT`, então o
upsert insere de novo. Mesmo padrão em `src/hooks/useSlackConfig.ts:107-109,238-240,307-309` (o caso correto,
para comparação, está em `:389`).
→ Etapas **119–122**

### SRV-RACE-01 · Alta · CONFIRMADO · Services / Auth

**As primeiras consultas depois do login podem sair sem credencial.**
`syncExternalAuth()` **não é aguardada** em `src/contexts/AuthContext.tsx:38` e `:47`, e `setLoading(false)`
roda em `:36` **antes** dela; o client externo tem `persistSession: false`
(`src/integrations/supabase/externalClient.ts:43`). Como esse client faz **todos** os `from()`/RPC (ADR-006),
a janela entre "a tela liberou" e "o token chegou ao client" é uma janela de consultas sem autenticação.
Impacto: telas que carregam logo após o login podem vir vazias ou com erro, de forma intermitente — o tipo de
defeito que o usuário relata como "às vezes não carrega".
→ Etapas **066–067**

### HK-RACE-01 · Média · CONFIRMADO · Hooks

**Trocar de usuário rapidamente deixa estado do usuário anterior na tela.**
`src/hooks/use2FA.ts:24-28` é um IIFE async **sem guard de cancelamento** e descarta o `error`. E `:48` gera
códigos de backup de 2FA com **`Math.random()`** — gerador não criptográfico para um segredo de segurança.
→ Etapas **123–124**

---

## CAUSA RAIZ F — "gerador de número aleatório comum usado onde precisa ser imprevisível"

### SEC-11 · Alta · CONFIRMADO · Hooks / Segurança

**Os códigos de recuperação do segundo fator são previsíveis.**
`src/hooks/use2FA.ts:48`:

```js
const backupCodes = Array.from({ length: 8 }, () =>
  Math.random().toString(36).slice(2, 10).toUpperCase(),
);
```

e `:50-53` grava os 8 em `user_2fa.backup_codes`.

Três problemas na mesma linha:

1. **`Math.random()` não é criptográfico.** O gerador do V8 (xorshift128+) tem estado recuperável a partir de
   algumas saídas — e os **8 códigos são gerados em sequência do mesmo estado**, então quem obtiver um
   consegue derivar os outros.
2. **O comprimento é variável.** `Math.random().toString(36)` produz string de tamanho variável; `.slice(2,10)`
   pode devolver **menos de 8 caracteres**, gerando códigos mais curtos que o pretendido.
3. Entropia máxima ~41 bits, e na prática menor pelo item 1.

Causa raiz: uso do gerador de conveniência onde o requisito é imprevisibilidade. A API correta
(`crypto.getRandomValues`) está disponível no navegador e no Deno.

Impacto: **o código que serve para entrar na conta quando o usuário perde o celular pode ser adivinhado** —
é exatamente a credencial que contorna o segundo fator.

Observação de escopo: as outras ocorrências de `Math.random()` que a varredura encontrou em `src/` são
geração de id de lista e de teste (`QuickCreateWizard.tsx:273`, `RealTimeCostStream.tsx:63`,
`savedTestRunsStore.ts:47`, e arquivos de `src/test/`) — essas **não** são defeito de segurança e estão
registradas na §9.

Nota: a mesma linha `:49` usa `supabase as unknown as {…}` para escrever em `user_2fa` — o client de **auth**
fazendo `from()`, que é violação do ADR-006 (ver ADR-01), com o tipo contornado por cast.
→ Etapa **046**

---

## CAUSA RAIZ G — "a regra de arquitetura do projeto é violada em escala, e o guard não cobre a regra principal"

### ADR-01 · Alta · CONFIRMADO · Services / Arquitetura

**220 violações da regra que separa o banco de autenticação do banco de dados.**
O ADR-006 (`docs/adr/006-dual-client-architecture.md`) determina:
`src/integrations/supabase/client.ts` **só** para `auth`; `externalClient.ts` para **todos** os `from()` e
RPC. Medição do inventário da camada (171 arquivos revisados): **220 violações em 34 arquivos**.
Bloco inteiro fora da regra: todas as RPCs de governança/GRC saem pelo client de auth —
`riskService.ts:114,131,141,146`, `vendorRiskService.ts:126,153,166,203`, `sbomService.ts:95,146,151`,
`secretsRotationService.ts:103,112,132,142,163`, `pentestService.ts` e outros.
Caso irônico: `src/services/workspaceContextService.ts` foi criado para **centralizar** um padrão duplicado
("estava duplicado em 7 páginas P3 chamando `supabase.from('workspaces')` diretamente", docstring `:5-10`) e
centralizou mantendo o desvio — faz `from()` no client errado.
E o guard de CI **não cobre a regra principal** (medido pelo inventário da camada, §1.2).
Impacto: com dois bancos apontando hoje para o mesmo projeto, o sintoma está latente; no dia em que o Datahub
voltar a ser um projeto separado (é o que `.env.example:16-21` prevê), **220 consultas passam a ler o banco
errado**.
→ Etapas **125–140**

### SRV-DEAD-01 · Alta · CONFIRMADO · Services / Funcionalidade

**A funcionalidade A2A / agent card está morta: grava numa tabela que não existe.**
As 4 funções de storage de `src/services/agentCardService.ts:222,238,261,280` acessam **`agent_configs`**, que
**não existe em nenhuma migration** (EXECUTADO: `grep -rn "CREATE TABLE[^;]*agent_configs" supabase/migrations/`
→ 0 arquivos; e 0 ocorrências em `types.ts`). O consumidor `src/components/agents/A2ARegistry.tsx:11` usa
`listAgentCards`.
Causa raiz: o `docs/adr/004-dynamic-table-access.md` **autoriza por escrito** escrever service contra tabela
que ainda não existe ("Use `(supabase as any).from('table')` para tabelas planejadas"), listando
`agent_configs` como "Medium priority". A tabela nunca foi criada e o ADR nunca foi revisitado.
Impacto: uma tela do produto que parece pronta falha em runtime, sempre.
→ Etapas **141–144**

### SRV-TYPE-01 · Média · CONFIRMADO · Services / Banco

**14 tabelas usadas pelo código não existem no arquivo de tipos do banco.**
O inventário mediu 117 tabelas via `.from()` literal + 56 via `fromTable()` (1 inexistente), 59 RPCs via
`.rpc()` + 7 via `rpcCall()` (todas presentes em migration), e **14 tabelas usadas e ausentes de
`src/integrations/supabase/types.ts`**. O `types.ts` tem 15.459 linhas e 377 declarações.
Impacto: para essas 14, o TypeScript não valida nada — é o que os **267 `as unknown as`** (LINT-01) sustentam.
→ Etapas **145–148**

---

## CAUSA RAIZ H — "código e telas entregues pela metade"

| ID               | Sev   | Conf       | Achado e evidência                                                                                                                                                                                                                                                                                                                                                                                    | Etapas  |
| ---------------- | ----- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **UI-DEAD-01**   | Média | CONFIRMADO | **9 botões com clique morto** (sem `onClick`), confirmados na varredura dos 557 componentes; 0 formulários sem `onSubmit`. Casos: `src/components/shared/NotificationBell.tsx:102` (botão "marcar como lida" só renderiza quando `isUnread`, e não tem handler) e `src/components/integrations/MCPServerManager.tsx:109` (botão `RefreshCw` sem `onClick`, ao lado de um remover funcional em `:112`) | 251–259 |
| **UI-ORPH-01**   | Média | CONFIRMADO | **17 rotas sem nenhuma porta de entrada** (não estão na sidebar, nem no CommandPalette, nem referenciadas por `navigate`/`Link`). Duas são editores completos: `/observability/postmortems/:id` (`src/App.tsx:1298` → `PostmortemEditorPage`) e `/observability/game-days/:id/live` (`:1256` → `GameDayLivePage`)                                                                                     | 260–266 |
| **UI-ORPH-02**   | Baixa | CONFIRMADO | **43 componentes órfãos** (25 órfãos de produto reais, **3.741 linhas mortas**, 14 primitivos `ui`, 4 testes), com **5 pares "antiga × nova"** — ex.: `SLOPanel.tsx` vs `InteractiveSLOPanel.tsx`. Antes de apagar, conferir qual das duas tem o comportamento correto                                                                                                                                | 291–296 |
| **UI-ORPH-03**   | Baixa | CONFIRMADO | `src/pages/Index.tsx` (5 linhas, redirect para `/`) não é referenciado por nenhum import — única página órfã das 141                                                                                                                                                                                                                                                                                  | 297     |
| **UI-ORPH-04**   | Baixa | CONFIRMADO | **18 de 69 chaves de `src/lib/routePrefetch.ts` apontam para rotas que não existem mais** — prefetch de rota morta                                                                                                                                                                                                                                                                                    | 298     |
| **GUARD-01**     | Média | CONFIRMADO | **Duas implementações de guarda de rota**, e só uma roda: `src/components/layout/AuthGuard.tsx` (órfão, nunca importado) e `AuthGuardLayout()` em `src/App.tsx:200`. E `src/contexts/AuthContext.tsx:151` ainda afirma "Real auth-gated routes use AuthGuard"                                                                                                                                         | 267     |
| **SRV-ORPH-01**  | Baixa | CONFIRMADO | `src/services/riskService.ts` é órfão total (0 importadores) e duplica o acesso a `risk_register` que `src/pages/RiskRegisterPage.tsx:9` faz direto. Mais 3 services vivos só pelo barril `src/services/index.ts`: `agentEvolutionService.ts`, `fineTuningService.ts`, `middlewarePipelineService.ts`                                                                                                 | 299     |
| **EDGE-DEAD-01** | Baixa | CONFIRMADO | **10 edge functions sem chamador em `src/`** (3 classificadas como mortas). `geo-code` (328 linhas) e `pg-net-smoke-test` (137 linhas) não têm chamador em `src/`, `scripts/` nem migrations. `slack-agent-notify` afirma em `:3-4` ser chamada por `pg_net` de trigger — a confirmar no banco. **0 chamadas do front para function inexistente**                                                     | 300     |
| **RAG-01**       | Média | HIPÓTESE   | `supabase/functions/rag-embed-backfill/index.ts:3` diz "cron a cada 5 min", e **não há agendamento correspondente em `supabase/migrations/`**. Se não roda, os embeddings de `agent_memories_v2` e `chunks` nunca são preenchidos e a busca semântica devolve vazio. **NÃO VERIFICADO**: faltou ler `cron.job` no banco                                                                               | 149–150 |

---

## CAUSA RAIZ I — "listagem sem limite"

### PERF-03 · Alta · CONFIRMADO · Services / Performance

**A camada de services faz 120 consultas sem limite e 162 `select('*')`.**
Medição do inventário (171 arquivos). O caso mais provável de travar a tela é a observabilidade:
`src/services/monitoringService.ts:17,51,65,84,148,170` faz `select('*')` **sem limite** em `agent_traces`,
`session_traces`, `trace_events` e `alerts` — tabelas de volume por natureza.
Impacto: hoje o sintoma está latente porque as tabelas têm pouco dado; no primeiro workspace com uso real, a
tela de observabilidade baixa a tabela inteira para o navegador.
→ Etapas **227–240**

| ID          | Sev   | Conf       | Achado                                                                                                                                                                                                                                             | Etapas  |
| ----------- | ----- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **PERF-01** | Média | EXECUTADO  | `vendor-B5bnu-b3.js` com **2.246,66 KB** (gzip 670 KB), acima do limite de 900 KB do Vite (aviso no build)                                                                                                                                         | 241–244 |
| **PERF-02** | Média | EXECUTADO  | Orçamento de bundle em **96 %** (2.501,2 / 2.600 KB): qualquer dependência nova estoura o gate                                                                                                                                                     | 245     |
| **PERF-05** | Média | CONFIRMADO | `src/contexts/AuthContext.tsx:35` cria um novo objeto `user` a cada `onAuthStateChange` e `:128` recria o `value` a cada render → re-render global. Consumidores afetados: `src/hooks/useSLOAlerts.ts:70`, `src/hooks/use-workflow-persistence.ts` | 246–248 |
| **PERF-06** | Média | CONFIRMADO | 6 "Mounters" montam fora do `<BrowserRouter>` (`src/App.tsx:226-231`) e 4 abrem canal de realtime global; se o polling continua na tela de login é **NÃO VERIFICADO**                                                                              | 249–250 |

---

## CAUSA RAIZ J — "a documentação afirma o contrário do que foi medido"

### DOC-01 · Alta · CONFIRMADO · Documentação

**Os documentos que orientam os agentes contradizem a realidade em pontos críticos** — e, como cada agente
começa lendo esses arquivos, o erro se propaga a cada sessão.

| Documento                                            | Afirma                                                           | Medido                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                                          | repositório "**privado**"                                        | `"private": false`, `"visibility": "public"`                                                                       |
| `docs/agentes/deploy.md:14-16`                       | Vercel é o caminho oficial, projeto `fator-x-v2` no time `juca1` | time `juca1` tem **0 projetos**; produção viva é o Lovable                                                         |
| `ESTADO-ATUAL.md` §4.2                               | `user_roles` com RLS desligado + `anon` com INSERT/UPDATE/DELETE | **fechado**: drift check de 2026-11-21 → `RLS: 221/221`, zero escrita anon                                         |
| `ESTADO-ATUAL.md` §4.3                               | 176 de 215 tabelas sem RLS                                       | **fechado** quanto ao RLS (221/221). Ressalva: o script não checa `SELECT` para `anon` nem o conteúdo das policies |
| `ESTADO-ATUAL.md` §3                                 | drift real (migration registrada ≠ aplicada)                     | **não se reproduz**: `repo=338 banco=338, faltam no banco=0 faltam no repo=0`                                      |
| `ESTADO-ATUAL.md` §4.6                               | triggers postando para `fqdohnmgmtaycfwsioik`                    | **fechado** por `20261120162913_fix_exfil_trigger_urls.sql`                                                        |
| `supabase/deployment-manifest.json`                  | `verify_jwt_true: 80`                                            | deploy usa `--no-verify-jwt` nas 89                                                                                |
| `e2e/security.spec.ts` (5 testes)                    | cabeçalhos de segurança presentes                                | 3 dos 4 **não funcionam** via `<meta>` (SEC-HDR-01)                                                                |
| `supabase/functions/bitrix24-webhook/index.ts:30-31` | "Mismatched tokens … still recorded" (sugere aceitar)            | o código devolve **401** corretamente (`:273-287`)                                                                 |
| `docs/adr/004-dynamic-table-access.md`               | autoriza service contra tabela inexistente                       | produziu SRV-DEAD-01                                                                                               |

Impacto: **o próximo agente a trabalhar neste repositório vai consertar o que já está consertado e ignorar o
que está aberto** — foi o que esta auditoria quase fez. É a causa raiz de maior alcance, porque multiplica o
custo de todas as outras.
→ Etapas **060–062, 068**

### SEC-EXEC-01 · Crítica · **HIPÓTESE — NÃO VERIFICADO** · Banco

**A função que executa SQL arbitrário pode ainda estar acessível. É o item mais importante não coberto.**
`ESTADO-ATUAL.md` §4.1 mediu, em 2026-08-16, que `public.exec_sql(query text)` existia em produção como
`SECURITY DEFINER` com `EXECUTE` para `anon` — SQL arbitrário com privilégio de owner, ignorando toda a RLS.
Há correção escrita: `supabase/migrations/20260905140000_security_hotfix_validation.sql:21-27` faz
`REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM PUBLIC, anon, authenticated` e
`GRANT … TO service_role`, **condicionado** a `to_regprocedure('public.exec_sql(text)') IS NOT NULL`. E o
drift check indica as 338 migrations registradas no banco.
**Mas nada disso confirma o estado atual dos grants**, e **não houve acesso ao banco nesta sessão**
(`01-INVENTARIO.md` §6). Faltou: `SELECT has_function_privilege('anon', 'public.exec_sql(text)', 'EXECUTE')`.
**É a primeira ação do executor.**
→ Etapa **053**

---

## CAUSA RAIZ K — achados isolados (sem causa compartilhada)

| ID              | Sev   | Conf                                      | Achado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Etapas  |
| --------------- | ----- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **SEC-HDR-01**  | Alta  | EXECUTADO                                 | `index.html:8,9,10` declaram `X-Frame-Options`, `X-Content-Type-Options` e `Permissions-Policy` como `<meta http-equiv>` — **os três são ignorados pelo navegador nessa forma**. Capturado em 10 de 10 carregamentos: `X-Frame-Options may only be set via an HTTP header… It may not be set inside <meta>`. A CSP (`:12`) vale em meta, **mas não tem `frame-ancestors`**, e `frame-ancestors` é ignorado em meta. **Logo não existe proteção contra clickjacking.** E `e2e/security.spec.ts:13-19,29-36` só verifica que a meta tag existe com o texto certo — nunca que o cabeçalho está em vigor; os 5 testes passam. Correção exige configuração no host (não há `vercel.json`; produção é Lovable) | 047–052 |
| **CI-01**       | Alta  | EXECUTADO                                 | O gate `Security Audit` é `npm audit --audit-level=critical --omit=dev` (`ci.yml:30`). No log do job 136961936065: `npm audit` completo = **23 (15 moderadas, 6 altas, 2 críticas)**; o comando do gate = **4 (3 moderadas, 1 alta)** → exit 0. Dependabot: **19 abertos** = 2 críticos (`tinypool`, dev), 2 altos (`vite` dev e **`zod` runtime**), 14 médios, 1 baixo. A alta de runtime (`zod`: exaustão de memória) **passa pelo gate**                                                                                                                                                                                                                                                              | 054–057 |
| **CI-02**       | Média | EXECUTADO                                 | `scripts/db-drift-check.mjs:27-30` sai **0** com `::warning::` quando falta `DB_MCP_URL`. No CI o secret existe e o guard roda de verdade — mas qualquer ambiente sem o secret tem um check obrigatório que passa sem verificar nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 058     |
| **CI-03**       | Média | EXECUTADO                                 | `required_pull_request_reviews` **ausente** na proteção da `main` → merge com **zero** aprovação. `required_conversation_resolution: false`. CODEOWNERS inerte (não verificado nesta sessão)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 059     |
| **SLACK-01**    | Média | EXECUTADO                                 | `ci.yml:4` e o job `notify-failure` (`:291-322`) dependem de `SLACK_WEBHOOK_URL`, que **não está** entre os 15 secrets do repositório → falha de CI só emite `::warning::`. Idem `HERMES_API_KEY`, `HERMES_BASE_URL`, `OPENCLAW_WEBHOOK_SECRET`, aplicados por `edge-deploy.yml:56-58` e ausentes da lista                                                                                                                                                                                                                                                                                                                                                                                               | 081–083 |
| **E2E-01**      | Média | EXECUTADO                                 | `E2E Tests`, `Lighthouse CI`, `Load Test (k6)` e `Edge Function Contract Tests` **não são checks obrigatórios** e têm `if: pull_request` (4 jobs `skipped` no run da `main`). Além disso `playwright.config.ts` usa `video: 'retain-on-failure'` e o CI instala o browser sem ffmpeg (`ci.yml:151`): medido — **26 de 26 testes falharam** com erro de ffmpeg mascarando a asserção real; após `npx playwright install ffmpeg`, **31 passaram**                                                                                                                                                                                                                                                          | 084–087 |
| **WH-ORDER-01** | Média | CONFIRMADO                                | `supabase/functions/bitrix24-webhook/index.ts`: a consulta de dedupe (~`:256-270`) roda **antes** da rejeição por assinatura (`:273-287`). Chamador anônimo que acerte `auth[domain]` + `data[FIELDS][ID]` recebe `200 {"ok":true,"deduped":true}` sem validação — oráculo de quais eventos já foram processados                                                                                                                                                                                                                                                                                                                                                                                         | 088     |
| **WH-PUB-01**   | Média | CONFIRMADO                                | `webhook-receiver/index.ts:167-182`: quando `auth_type` não casa com `hmac_sha256`/`bearer`/`api_key`, só rejeita se `!webhook.is_public`. Uma linha com `is_public = true` aceita payload de qualquer origem. Quantas linhas estão assim: **NÃO VERIFICADO**                                                                                                                                                                                                                                                                                                                                                                                                                                            | 089     |
| **SEC-07**      | Média | CONFIRMADO                                | `_shared/validation.ts:30-36` limita o tamanho do corpo lendo **só** `content-length`; `Transfer-Encoding: chunked` passa sem limite. `parseBody` é usado por **29** functions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 090     |
| **SEC-08**      | Média | CONFIRMADO                                | `_shared/cors.ts:14-22` tem curinga de subdomínio: `/.*\.lovable\.app$/`, `/.*\.lovable\.dev$/`, `/.*\.supabase\.co$/`, `/.*\.vercel\.app$/` — qualquer pessoa publica nesses domínios. **Severidade calibrada para Média após verificação**: não existe `Access-Control-Allow-Credentials` em nenhuma function (EXECUTADO), e o token fica em `localStorage`, que outra origem não lê — então **não** há roubo de sessão por esta via; o que há é superfície ampliada                                                                                                                                                                                                                                   | 091     |
| **SEC-09**      | Média | CONFIRMADO (código) / HIPÓTESE (produção) | `_shared/cors.ts:63-70`: se `isDevelopment()`, devolve `Access-Control-Allow-Origin: origin \|\| '*'`; e `isDevelopment()` (`:52-60`) só lê `ENVIRONMENT`/`DENO_ENV` **sem nenhuma guarda** que impeça esses valores em produção. Se estão definidos hoje: **NÃO VERIFICADO** (sem acesso aos secrets de runtime das edges)                                                                                                                                                                                                                                                                                                                                                                              | 092     |
| **RATE-01**     | Média | CONFIRMADO                                | `_shared/rate-limiter.ts:40` guarda o estado em `new Map()` **na memória do isolate** — não é limite global, reinicia a cada isolate, e `_shared/mod.ts:11` documenta o helper como se fosse. 83 das 89 functions dependem dele                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 093–094 |
| **CRON-01**     | Alta  | CONFIRMADO                                | 3 migrations leem `current_setting('app.settings.service_role_key', true)` (ex.: `20260722115149_…sql:19`) e **0 migrations definem o GUC** (EXECUTADO). Com ele indefinido o header vai `Bearer ` vazio: **os jobs agendados só funcionam porque o JWT está desligado em todas as edges**. Religar o JWT antes de resolver isso derruba os jobs **em silêncio** (não há tratamento de erro no `http_post`)                                                                                                                                                                                                                                                                                              | 006     |
| **CRON-02**     | Média | CONFIRMADO                                | `20261120162913_fix_exfil_trigger_urls.sql:28` embute a chave `anon` em literal dentro de `internal.dispatch_security_alert_to_slack`, que é `SECURITY DEFINER` (`:9`). A `anon` é publicável, então não é vazamento — o problema é operacional: ao rotacioná-la, os alertas de segurança param de chegar no Slack **sem aviso**                                                                                                                                                                                                                                                                                                                                                                         | 095     |
| **STOR-01**     | Média | CONFIRMADO (lacuna) / HIPÓTESE (impacto)  | `src/services/documentIngestionService.ts:157-162` faz upload com `upsert: true`; as policies do bucket (`20261120150626_…sql:38-51`) cobrem **SELECT, INSERT e DELETE** — **não há UPDATE**. Em fluxo normal o caminho inclui `ingestion.id` (único), então a colisão só ocorre em reenvio da mesma ingestão. Faltou: confirmar se existe caminho de retry que reutiliza o `ingestion.id`, e testar o upload com sessão autenticada                                                                                                                                                                                                                                                                     | 096     |
| **DEBUG-01**    | Baixa | CONFIRMADO                                | `src/App.tsx:235` monta `<SignedUrlCacheDebugPanel />` sempre; o componente se protege (`:27,36`) mas em produção abre com `?debugSignedUrls=1`. Expõe caminhos de storage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 268     |
| **MKT-01**      | Média | EXECUTADO                                 | `src/components/auth/AuthBrandingPanel.tsx:146` imprime para todo visitante `🔒 Criptografia ponta-a-ponta · SOC 2 · LGPD Compliant`, e `:130,138,139` traz depoimento com nome e cargo ("Marcos Costa, Head de Operações, TechBR") e métrica ("Reduzimos 60 %") **sem nenhuma fonte no repositório**. Confirmado no ar: texto capturado da página de produção. Alegar certificação SOC 2 sem auditoria é risco jurídico, não estético                                                                                                                                                                                                                                                                   | 269–271 |
| **A11Y-01**     | Baixa | EXECUTADO/CONFIRMADO                      | `/auth` passa no axe sem violação crítica ou séria (EXECUTADO). Mas há **31 `jsx-a11y/label-has-associated-control`** e 18 outras de a11y **suprimidas** por `eslint-disable` em `src/` — a11y da área logada não foi medida (sem credencial)                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 272–280 |
| **DOM-01**      | Baixa | CONFIRMADO                                | `src/components/super-cerebro/DocumentViewerDialog.tsx:69` usa DOMPurify com `USE_PROFILES` genérico em vez do `src/lib/sanitize.ts` do projeto, que proíbe `iframe`/`object`/`embed`/`form`/`input` e handlers (`:26-27`). Os 3 usos de `dangerouslySetInnerHTML` do repositório **estão sanitizados**; a divergência é de perfil                                                                                                                                                                                                                                                                                                                                                                       | 273     |
| **KEY-01**      | Baixa | CONFIRMADO                                | `src/hooks/use-keyboard-shortcuts.ts:25-29` ignora `alt`, e teclas nuas `g`/`a` registradas em `src/components/layout/AppLayout.tsx:90-91,93` disparam navegação sem modificador — inclusive Backspace navegando para trás                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 274     |

---

## §9. Verificações que deram "SEM DEFEITO" — registradas para não gastar etapa

1. **Os 5 webhooks de entrada verificam assinatura HMAC e devolvem 401.** `openclaw-webhook:86-112`,
   `slack-events-webhook:72-74`, `bitrix24-webhook:238,273-287`, `whatsapp-webhook:30,151-152`,
   `webhook-receiver:99-183`. O símbolo é `verifyHmac`/`verifyHmacSignature`/`verifySlackSignature` — não
   existe `verifyWebhookSignature`, e procurar por esse nome dá falso negativo.
2. **Todas as 13 subscriptions de realtime têm cleanup** (`removeChannel`/`unsubscribe`). Sem vazamento.
3. **Os 6 Mounters fora do Router não usam hooks de rota** — a posição não quebra nada hoje. Armadilha: se
   alguém adicionar `useNavigate` a um deles, erro em runtime na raiz da aplicação.
4. **Responsividade das rotas públicas está OK**: 10 combinações (5 rotas × 390 px e 768 px), `overflowH = nao`
   e zero elemento estourando a viewport.
5. **O 404 funciona** (localmente): `/rota-inexistente-qa` renderiza "404 Página não encontrada".
6. **O bucket `knowledge-uploads` está bem configurado**: privado, 50 MB, 12 mime types, policies restritas a
   `(storage.foldername(name))[1] = auth.uid()::text`.
7. **O banco está sincronizado com o repositório** e com RLS em 100 % das tabelas, medido pelo CI em
   2026-11-21: `repo=338 banco=338`, `RLS: 221/221`, zero escrita `anon`.
8. **0 chamadas do frontend para edge function inexistente**; **0 paths de rota duplicados**; **0 rotas
   apontando para componente inexistente**; **0 formulários sem `onSubmit`**.
9. **`workspace_admin` liberar tudo em `useRBAC.ts:105` é por desenho** (ADR-005: o guard de rota é UX, a
   fronteira é a RLS). Não é defeito — mas depende de a RLS estar correta, o que **não foi verificado**.

---

# ADENDO — Achados das camadas fechadas depois da consolidação

## CAUSA RAIZ L — "RLS ligado com policy que não restringe nada"

Esta causa raiz é a prova concreta da ressalva que a auditoria fez sobre o drift check: ele mede
`RLS: 221/221 tabelas com RLS` e **não lê o conteúdo das policies**. Ter RLS ligado com
`USING (auth.uid() IS NOT NULL)` é o mesmo que não ter RLS entre inquilinos — qualquer pessoa logada vê
tudo de todos.

### INT-01 · **Crítica** · CONFIRMADO · Banco + Edge + Interface

**Qualquer usuário logado lê, em uma tela do produto, as credenciais de entrada das integrações de todos os outros clientes.**

A cadeia completa, verificada arquivo por arquivo:

1. **A edge guarda todos os cabeçalhos da requisição.**
   `supabase/functions/webhook-receiver/index.ts:74-77`:
   ```ts
   const headers: Record<string, string> = {};
   req.headers.forEach((v, k) => {
     headers[k] = v;
   });
   ```
   Sem allowlist, sem redação. E `_shared/cors.ts:23-42` admite explicitamente `authorization`,
   `x-api-key`, `x-hub-signature-256`, `x-signature` e `x-twilio-signature` — exatamente os que carregam
   credencial.
2. **E grava no banco.** `:198-204` → `supabase.from('webhook_events').insert({ … headers, … })`.
   O mesmo acontece nos caminhos de **rejeição** (`logEvent`, `:248-258`, chamado em `:83-93`, `:102-112`,
   `:121-131`, `:138-…`): até a tentativa recusada tem seus cabeçalhos persistidos.
3. **A policy não separa inquilino.**
   `supabase/migrations/20260405220001_automation_services.sql:118`:
   `CREATE POLICY "webhook_events_all" ON public.webhook_events FOR ALL USING (auth.uid() IS NOT NULL);`
   **`FOR ALL`** — SELECT, INSERT, UPDATE e DELETE — para **qualquer** usuário autenticado, de **qualquer**
   workspace. EXECUTADO: só essa migration menciona a policy; nenhuma posterior a substitui ou remove.
4. **A tela lê sem filtro e mostra.**
   `src/pages/WebhookEventsPage.tsx:69-73` → `.from("webhook_events" as never).select("*")`, **sem filtro de
   workspace** (e com `as never` contornando o tipo); `:363` → `{JSON.stringify(selectedEvent.headers ?? {}, null, 2)}`
   renderizado na tela.

E o mesmo padrão na tabela das configurações:
`:86` → `CREATE POLICY "webhooks_all" ON public.webhook_endpoints FOR ALL USING (auth.uid() IS NOT NULL);`
com `:63` → `secret TEXT NOT NULL` — **o segredo HMAC do webhook guardado em texto claro**, legível e
**alterável** por qualquer usuário logado.

Causa raiz: duas policies escritas como "basta estar logado" numa aplicação multi-inquilino, somadas a uma
edge que persiste cabeçalho sem filtrar e a uma tela que lê sem escopo. Nenhuma das três, isolada, seria
crítica; juntas entregam credencial de terceiro na tela.

Impacto: **um cliente vê e pode trocar o segredo de integração de outro cliente.** Com o segredo, forja
chamadas de webhook em nome dele; com os cabeçalhos guardados, obtém tokens de API dos provedores externos.

Por que o guard de CI não viu: o `DB Drift Check` valida três invariantes (migrations, RLS ligada, zero
escrita `anon`) e **as três passam** aqui — a RLS está ligada e a escrita permitida é para `authenticated`,
não para `anon`.
→ Etapas de Onda 1 (a serem acrescentadas na faixa de aprovação humana — DDL em produção)

### INT-02 · Alta · CONFIRMADO · Services / Segurança

**O segredo HMAC e o endereço do webhook são gerados com gerador de número aleatório comum.**
`src/services/webhookTriggerService.ts:49-57` (`generateWebhookSecret`) e `:39-47` (`generateWebhookPath`)
usam `Math.random()` — **no mesmo arquivo que usa `crypto.subtle` em `:62-77`** para assinar. Ou seja: a
assinatura é criptográfica e a chave que a sustenta é previsível.
Mesma causa raiz de **SEC-11** (códigos de 2FA com `Math.random()`): o gerador de conveniência usado onde o
requisito é imprevisibilidade.
Impacto: quem adivinhar o segredo forja requisições de webhook válidas; quem adivinhar o path encontra
endpoints de outros clientes.

### INT-03 · Média · CONFIRMADO · Integrações / Robustez

**O webhook do Slack espera a resposta da IA antes de confirmar o recebimento.**
`supabase/functions/slack-events-webhook/index.ts:182` faz `await callLlmGateway(...)` **antes** de responder
(`:203`), e `callLlmGateway` (`:41-62`) usa `fetch` **sem `AbortController`, sem `fetchWithTimeout`, sem
`withRetry` e sem circuit breaker** — embora os três helpers existam em `_shared/`
(`retry.ts` é importado por 35 functions).
Impacto: o Slack corta em 3 segundos e **reenvia** o evento. Cada reenvio dispara outra chamada de LLM: a
lentidão da IA virou duplicação de resposta e multiplicação de custo.

### INT-04 · Média · CONFIRMADO · Banco / Integrações

**A proteção contra evento duplicado não é atômica em duas das três filas de webhook.**
Só `openclaw-webhook/index.ts:135-161` faz dedupe atômico (INSERT + tratamento do erro `23505`), apoiado no
índice `idx_webhook_events_source_ext (source, external_event_id)`. Já
`whatsapp_webhook_events` e `bitrix24_webhook_events` **não têm índice único** — os únicos índices são os
não-únicos `idx_whatsapp_received` e `idx_bitrix_received`
(`supabase/migrations/20260726210258_4f29d314-f420-4fba-…sql`). O dedupe desses dois é "consulta e depois
insere", que duas entregas simultâneas atravessam.

### INT-05 · Média · CONFIRMADO · Integrações

**A detecção de evento duplicado do Slack interpreta a resposta do banco ao contrário.**
`supabase/functions/_shared/slack.ts:253-266` (`isDuplicateEvent`) envia
`Prefer: resolution=ignore-duplicates,return=minimal` e trata **201 como "novo"** e **409 como duplicata**.
Mas `ignore-duplicates` faz `ON CONFLICT DO NOTHING`, e o PostgREST responde **201 também quando ignorou** —
nunca 409. Resultado: todo evento é classificado como novo, e o dedupe não acontece.

### INT-06 · Média · CONFIRMADO · Integrações / Robustez

**Só 3 de 16 integrações externas têm disjuntor; o helper existe e não é usado.**
`_shared/circuitBreaker.ts` é importado por **2** functions (e `retry.ts` por 35). O inventário mediu
**3 edges com circuit breaker contra 13 sem**, entre 44 integrações de terceiro (8 COMPLETA, 33 PARCIAL,
3 SÓ DECLARADA), 21 hosts externos.
Impacto: quando um provedor cai, o sistema insiste em vez de abrir o circuito — e nas 7 functions públicas
que gastam LLM (COST-01) cada insistência é dinheiro.

### INT-07 · Média · CONFIRMADO · Infraestrutura / Segredos

**Dos ~25 segredos que as edge functions leem, o CI aplica 6.**
`.github/workflows/edge-deploy.yml:48-60` aplica `OPENROUTER_API_KEY`, `HERMES_API_KEY`, `HERMES_BASE_URL`,
`OPENCLAW_WEBHOOK_SECRET`, `GOOGLE_MAPS_API_KEY`, `MAPBOX_ACCESS_TOKEN`. O inventário contou **54 variáveis
de ambiente** lidas nas edges. E três dos seis (`HERMES_API_KEY`, `HERMES_BASE_URL`,
`OPENCLAW_WEBHOOK_SECRET`) **não existem** na lista de 15 secrets do repositório (EXECUTADO,
`github_list_actions_secrets`) — e `apply_secret` só age quando o valor não é vazio, então são ignorados em
silêncio.
Impacto: integrações que dependem desses segredos falham em produção sem nenhum erro de deploy.

### SRV-ADR-01 · Correção de escopo do achado ADR-01 (não é achado novo)

O inventário da camada de services esclareceu dois pontos do **ADR-01** que mudam a correção:

- `src/lib/supabaseExtended.ts:23,29,47-49` ancora `fromTable`/`rpcCall` no client **externo**
  (`looseClient = supabaseExternal`). Portanto os services que usam `fromTable` **não** violam o ADR por esse
  caminho, mesmo importando `client.ts`. As 220 violações são as chamadas `supabase.from()`/`supabase.rpc()`
  diretas.
- A maior concentração é `src/services/knowledgeManagementService.ts`: **28 ocorrências** (import em `:1`;
  chamadas em `:5,15,35,41,52,61,74,86,96,106,128,138,149,158,166,176,187,204,210,230,240,252,…`).
- Quatro services de notebook usam **os dois clients no mesmo arquivo**, mandando o dado ao externo e a
  auditoria ao de auth: `notesService.ts:6,7` → `:277` `rpc('log_audit_entry')`; `notebooksService.ts:6,7` →
  `:142`; `noteTemplatesService.ts`; e o quarto. **Efeito prático: o registro de auditoria vai para um banco
  diferente do dado auditado** — no dia em que os dois projetos se separarem, a trilha de auditoria fica
  órfã do dado.
- O guard que deveria cobrir isso existe e não cobre: `src/test/architecture-dual-client.test.ts` tem 4
  testes (`:45-53` `fromTable`, `:55-61` `rpcCall`, `:63-74` `isUserLockedOut`, `:76-89` `syncExternalAuth`)
  e **nenhuma asserção contra `supabase.from(`**.
- O ADR-006 ainda está com status **`Proposed`** (`docs/adr/006-dual-client-architecture.md:3-4`), embora
  seja tratado como regra.

### Confirmações adicionais (sem defeito novo, registradas)

- As **59 RPCs** chamadas via `.rpc()` e as **7** via `rpcCall()` estão **todas** declaradas em
  `supabase/migrations/` (184 `CREATE [OR REPLACE] FUNCTION` distintas) — RASTREADO. Declarada ≠ aplicada,
  mas o drift check de 2026-11-21 indica as 338 migrations registradas.
- As **117 tabelas** usadas via `.from('literal')` existem todas em `supabase/migrations/`
  (237 `CREATE TABLE` + 22 `CREATE VIEW`/`MATERIALIZED VIEW`) — RASTREADO.
- `agent_configs` é a **única** tabela referenciada e inexistente: `grep -rn agent_configs supabase/` → zero
  resultados (confirma **SRV-DEAD-01**).
- Os 5 webhooks receptores verificam assinatura com comparação em tempo constante (confirma a §9).

---

## CAUSA RAIZ M — "variável de ambiente que o código lê e ninguém define"

### ENV-01 · **Alta** · EXECUTADO · Infraestrutura / Front-end

**Cinco telas enviam `apikey: undefined` ao backend, e o build fica verde.**

`VITE_SUPABASE_ANON_KEY` é lida em **5 lugares** de `src/`:
`src/stores/oracleStore.ts:167` · `src/components/knowledge/KnowledgeBaseDetail.tsx:129` ·
`src/services/codeInterpreterService.ts:59` · `src/lib/otel-genai.ts:91` ·
`src/pages/ComputerUsePage.tsx:46`.

E ela **não existe em nenhum dos dois lugares que a definiriam**:

- `.env.example` **não a declara** (EXECUTADO: `grep -n "VITE_SUPABASE_ANON_KEY" .env.example` → nada). O
  template declara `VITE_SUPABASE_PUBLISHABLE_KEY` (`:11`) e `VITE_EXTERNAL_SUPABASE_ANON_KEY` (`:20`), que
  são outros nomes.
- O job **`Build`**, que é check obrigatório, injeta só duas variáveis (`.github/workflows/ci.yml:205-208`):
  `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
  (O secret `VITE_SUPABASE_ANON_KEY` **existe** no repositório desde 2026-11-13 — e nenhum job o usa.)

**A prova está no bundle que eu gerei nesta sessão** (mesmo comando do CI, `npx vite build`):

```
dist/assets/CodeInterpreterPage-BbXteBEF.js : apikey:void 0}
dist/assets/ComputerUsePage-BD9wb91Y.js     : apikey:void 0}
dist/assets/AgentBuilder-DUSYTlOQ.js        : apikey:void 0}
```

`void 0` é `undefined` minificado. O Vite substitui `import.meta.env.VITE_*` em tempo de build; sem a
variável, o valor substituído é literalmente `undefined`.

Causa raiz: o nome da variável divergiu (`ANON_KEY` × `PUBLISHABLE_KEY`) e nada no projeto cruza "o que o
código lê" com "o que o build injeta". O build não falha por variável ausente, porque `import.meta.env` de
variável inexistente é um valor válido (`undefined`), não um erro.

Impacto: **Interpretador de Código, Computer Use, Agent Builder, Oráculo e detalhe de Base de Conhecimento
mandam requisição sem credencial** e falham — em produção, para o usuário final. Os 6.226 testes passam
porque nenhum deles exercita esses cinco caminhos de rede.

Agravante: `src/lib/otel-genai.ts:91-97` monta `Authorization: Bearer` com essa variável, em vez de usar o
token de sessão como as outras chamadas do projeto — então mesmo definindo a variável, esse caminho usaria a
credencial errada.

**Como verificar a correção:**

```bash
npx vite build && grep -c "apikey:void 0" dist/assets/*.js
```

Esperado hoje: ≥ 3 arquivos. Esperado depois: **0**.
→ Etapas (Onda 2, dentro da faixa 063-100)

### ENV-02 · Média · CONFIRMADO · Infraestrutura

**Cinco segredos referenciados por workflow não existem no repositório.**
`SLACK_WEBHOOK_URL`, `HERMES_API_KEY`, `HERMES_BASE_URL`, `OPENCLAW_WEBHOOK_SECRET` e `SUPABASE_DB_URL` são
citados em workflows e **não estão** entre os 15 secrets (EXECUTADO, `github_list_actions_secrets`).
Consequências medidas: o job `notify-failure` (`ci.yml:293-322`) sempre cai no ramo do `::warning::`; e
`edge-deploy.yml:48-60` aplica `apply_secret` apenas quando o valor não é vazio, então `HERMES_*` e
`OPENCLAW_WEBHOOK_SECRET` são **ignorados em silêncio** — integrações que dependem deles falham em produção
sem erro de deploy.
Além disso `BITRIX24_APP_TOKEN`, que `supabase/functions/bitrix24-webhook/index.ts:94` exige com `requireEnv`
para validar a assinatura do webhook, **não está no `.env.example` nem em nenhum script de provisionamento**.

### ENV-03 · Média · CONFIRMADO · Infraestrutura

**O deploy de edge functions roda mesmo quando o passo de segredos desistiu.**
`.github/workflows/edge-deploy.yml:44-47` faz `exit 0` no passo "Aplica secrets" quando
`SUPABASE_ACCESS_TOKEN` está ausente — mas o passo seguinte (`:61-62`) **não tem condição** e executa
`bash scripts/deploy-edge-functions.sh` de qualquer forma. Com o token ausente, o `supabase link` do script
(`:11`) falha e o `set -euo pipefail` (`:6`) encerra — então o job fica **vermelho** em vez de "pulado",
poluindo o sinal. O desenho pretendido era claramente pular.

### ENV-04 · Baixa · CONFIRMADO · Infraestrutura

**Três versões de Node em cinco workflows, sem `.nvmrc` nem `engines`.**
Node **22** em `ci.yml`, `guards.yml`, `edge-deploy.yml`; **24** em `automation-local.yml:35`; **20** em
`contexto.yml:133` e `inventario-estado-semanal.yml:54`. Não existe `.nvmrc` nem campo `engines` em
`package.json` (EXECUTADO). O `AGENTS.md` afirma que "o CI roda Node 20 e o Vercel builda com 24.x" — o CI
roda **22**.

### ENV-05 · Baixa · CONFIRMADO · Infraestrutura

**9 das 24 variáveis do `.env.example` nunca são lidas por nenhum código**, e uma delas é um segredo de
servidor com prefixo de navegador: `VITE_LANGFUSE_SECRET_KEY` (`.env.example:43`, modelo `sk_REPLACE_ME`).
Qualquer variável `VITE_*` **vai para o bundle do navegador**. Hoje ela não é lida por código algum, então
não há vazamento — mas o template instrui o dono a preenchê-la, e preencher significa publicar o segredo.
As outras 8 não lidas: `ANTHROPIC_API_KEY` (`:25`), `TWILIO_AUTH_TOKEN` (`:34`),
`VITE_LANGFUSE_PUBLIC_KEY` (`:42`), `VITE_LANGFUSE_HOST` (`:44`), `VITE_OTEL_EXPORTER_OTLP_ENDPOINT` e mais.

### ENV-06 · Baixa · CONFIRMADO · Infraestrutura

**Três lockfiles no repositório, um em uso.** O CI usa exclusivamente `npm ci` com `package-lock.json`
(10 passos: `ci.yml` ×6, `guards.yml` ×3, `edge-deploy.yml` ×1). `bun.lock` (435 KB) e `bun.lockb` (247 KB)
não são referenciados por nenhum workflow ou script. Remover é seguro — mas **`package.json`/lock têm fila
permanente do Dependabot** (`AGENTS.md`), então mexer nesses dois arquivos exige falar com o dono.

### Verificações que NÃO se confirmaram (registradas para não gastar etapa)

1. **`whatsapp-webhook` com segredo vazio NÃO aceita assinatura inválida.** A suspeita era que
   `WHATSAPP_TWILIO_AUTH_TOKEN` com fallback `?? ''` (`supabase/functions/whatsapp-webhook/index.ts:271`)
   fizesse o HMAC passar trivialmente. Verifiquei: a linha seguinte (`:272`) é `if (!authToken) return false;`
   — **falha fechado**. E `_shared/webhookSignature.ts:38-41` também: `if (!receivedSignature || !secret) return false;`.
   Os dois níveis rejeitam. **Sem defeito.**
2. **O `PROJECT_ID` do script de deploy está correto**: `scripts/deploy-edge-functions.sh:8` usa
   `qdlnzopxrlsoljcrcmzv`, igual a `supabase/config.toml:1`.

---

## CAUSA RAIZ N — "as regras de acesso foram criadas em massa por um laço, e o laço errou a condição"

A migration `supabase/migrations/20260905120000_rls_complete_reconciliation.sql` liga RLS e cria quatro
policies genéricas (`_member_select`, `_member_insert`, `_member_update`, `_member_delete`) para **todas** as
tabelas, por um laço `DO $$ ... FOR r IN ... LOOP`. É o que produziu o número `RLS: 221/221` que o CI
reporta. Duas das quatro policies têm a condição errada, e o erro foi aplicado a todas as tabelas de uma vez.

### TEN-01 · **Crítica** · CONFIRMADO · Banco (RLS) / Multi-inquilino

**Um usuário consegue mover o próprio registro para dentro do workspace de outro cliente.**

`supabase/migrations/20260905120000_rls_complete_reconciliation.sql:202-204`:

```sql
CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR user_id = auth.uid())
```

O `WITH CHECK` tem **`OR user_id = auth.uid()`**. Em Postgres, `WITH CHECK` valida a linha **depois** do
UPDATE. Então: o usuário passa no `USING` porque a linha é dele (`user_id = auth.uid()`), e passa no
`WITH CHECK` **pelo mesmo ramo**, com `workspace_id` valendo **qualquer coisa** — inclusive o workspace de
outro cliente.

Causa raiz: o `OR user_id = auth.uid()` foi escrito para permitir que o dono edite a própria linha, e acabou
desativando a verificação de inquilino no único ponto onde ela importa — a validação do valor **novo**.

Impacto: **escrita entre clientes.** Um usuário injeta registros seus dentro dos dados de outro cliente —
em qualquer tabela que o laço cobriu.

### TEN-02 · **Crítica** · CONFIRMADO · Banco (RLS) / Integridade de auditoria

**Qualquer membro grava linhas em nome de outro usuário.**
`:200-201` — a policy de INSERT valida **só** `workspace_id IN (SELECT get_user_workspace_ids(auth.uid()))`.
**Não valida `user_id = auth.uid()`.**
Impacto: um membro comum insere linha com o `user_id` de outra pessoa. Em tabelas de log, de aprovação e de
execução, isso é **forjar autoria**: a trilha de auditoria passa a poder ser escrita por quem ela deveria
auditar. Toda decisão tomada a partir de `audit_log`, aprovações e `*_runs` perde valor probatório.

### TEN-03 · Alta · CONFIRMADO · Banco / Edge

**Três funções de servidor leem dados por id com a chave do sistema, sem conferir de quem é o dado.**

- `supabase/functions/graph-execute/index.ts:102,132-140,153-164` — autentica o usuário e **depois** lê
  `agent_graphs` **por id, com `SERVICE_KEY`**, sem conferir inquilino; grava `graph_executions` no
  `workspace_id` do grafo alheio.
- `supabase/functions/agent-eval-runner/index.ts:170-195` — mesmo padrão com `agent_eval_datasets` e `agents`.
- `supabase/functions/llm-gateway/index.ts:750-756` — `workspaceId = member?.workspace_id || workspace_id`:
  sem linha em `workspace_members`, o inquilino vem do **corpo da requisição**.
  (Mitigado para segredos: o client é anon+JWT do usuário em `:702-706`, então a RLS de `workspace_secrets`
  ainda barra — `20260522143137_…sql:62-72`.)
  Causa raiz: autenticar ("quem é você") foi confundido com autorizar ("este dado é seu"). O `service_role`
  usado logo depois apaga a diferença.

### TEN-04 · Alta · CONFIRMADO · Edge / Integrações

**Uma função sem autenticação posta mensagem no Slack do cliente com texto escolhido por quem chamar.**
`supabase/functions/slack-alert-dispatcher/index.ts:36-44,55-84,100-125`: nenhuma autenticação em código,
`workspace_id` vem do corpo, lê `slack_channel_routes` com `service_role` e posta no Slack do inquilino com
`title`, `description` e **`action_url`** controlados pelo chamador. Não está em `supabase/config.toml`.
Impacto: canal de **phishing para dentro do Slack do cliente**, com a aparência de alerta legítimo do produto.

### TEN-05 · Alta · CONFIRMADO · Banco / Funções

**A variante global de `is_workspace_admin` deixa admin de um cliente escrever no catálogo de todos.**
`supabase/functions/skill-harvester/index.ts:132-140` usa a variante de **1 argumento**
(`is_workspace_admin(auth.uid())`), que não recebe workspace: admin de qualquer inquilino passa o guard de
uma função que escreve no **catálogo global de skills** (`20260721222207_…sql:26-37`).
O mesmo em `openclaw_agent_templates`, cujas policies de escrita usam a variante de 1 argumento
(`20260721222207_…sql:43-51`): admin de um inquilino edita os templates de todos.

### RBAC-05 · **Crítica** · CONFIRMADO · RBAC / Fluxo principal

**Não existe caminho no produto para atribuir um papel. As 38 rotas com permissão ficam inacessíveis.**

- `assignRole` e `removeRole` (`src/services/rbacService.ts:170-200`) **não têm nenhum chamador**
  (EXECUTADO: grep em `src/`).
- `updateMemberRole` (`src/services/teamsService.ts:90`) é referenciada **apenas** por um teste de fumaça
  que verifica `typeof === 'function'` (`src/test/extended-services.test.ts:145`).
- As três telas de RBAC — `RolesPage.tsx`, `RolePermissionsPage.tsx`, `PermissionsPage.tsx`
  (114/145/122 linhas) — só têm `useState` + listagem: **nenhum insert, update ou upsert**.

Logo `user_roles` nunca recebe linha pela interface → `useRBAC` devolve `role = null` → `can()` é falso para
tudo → **as 38 rotas protegidas por `ProtectedRoute` não abrem para ninguém**.

A única coisa que faz o sistema funcionar hoje é um gatilho: `trg_auto_assign_admin`
(`…000002:232-251`) dá `workspace_admin` ao **primeiro** membro inserido em qualquer workspace, quando não há
nenhum admin em `user_roles`. Ou seja: o primeiro usuário vira admin e `useRBAC.ts:105`
(`if (role === 'workspace_admin') return true`) libera tudo para ele; **o segundo usuário em diante não tem
papel nenhum e não acessa as 38 rotas**.

Impacto: o controle de permissões do produto não é operável. Ou a pessoa é o primeiro membro e pode tudo, ou
não pode nada — não existe meio-termo, e não há tela para mudar isso.

### RBAC-06 · Alta · CONFIRMADO · RBAC / Modelo de dados

**Existem dois modelos de papel, com vocabulários que não se cruzam.**

| Modelo | Onde                     | Valores escritos                        | Quem lê                                                                             |
| ------ | ------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------- |
| RBAC   | `user_roles.role_key`    | **ninguém escreve** (RBAC-05)           | `useRBAC.ts:67-68`, `is_workspace_admin`, `AuthContext.tsx:93-99`                   |
| Equipe | `workspace_members.role` | `admin`, `editor`, `viewer`, `operator` | `is_workspace_admin` (ramo `role IN ('owner','admin')`), RLS de `workspace_secrets` |

Os conjuntos **não se intersectam**: `agent_editor` × `editor`, `agent_viewer` × `viewer`,
`workspace_admin` × `admin`. Duas fontes de verdade sobre a mesma pergunta, lidas por caminhos diferentes.

### RBAC-07 · Alta · CONFIRMADO · Banco / Escalada de privilégio

**A função de convite aceita qualquer texto como papel, e qualquer usuário como convidado.**
`invite_workspace_member` (`20260418174123_…sql:58,79-83`):

- `p_role text` **sem `CHECK` nem validação** → um admin grava `role = 'owner'`, aceito por
  `is_workspace_admin` no ramo `workspace_members.role IN ('owner','admin')`
  (`20260905120000_…sql:62-64`);
- aceita `p_user_id` vindo do chamador → um admin insere uma linha de `workspace_members` para o UUID de um
  usuário **de outro inquilino**, que passa a ter esse workspace em `get_user_workspace_ids`.

### RBAC-08 · Média · CONFIRMADO · RBAC / Banco

**Remover um membro não remove o privilégio dele.**
`src/services/teamsService.ts:65-73` (`removeMember`) apaga só de `workspace_members`; a linha de
`user_roles` sobrevive, e `is_workspace_admin(uid, ws)` continua verdadeiro pelo ramo de `user_roles`
(`20260905120000_…sql:65-68`). **Privilégio residual depois da remoção.**

### RBAC-09 · Média · CONFIRMADO · Banco

**Policies permissivas se somam, e a mais frouxa vence.**
`"Admins can manage user roles"` (`FOR ALL USING …`, **sem `WITH CHECK`**, `…000002:98-107`) coexiste com
`user_roles_admin_manage` (`20260905120000_…sql:243-246`). Em Postgres, policies permissivas são combinadas
com **OR** — a mais frouxa define o acesso efetivo.
E `user_has_permission` é `SECURITY DEFINER` **sem `SET search_path`** (`…000002:213-229`); a correção de
`search_path` aplicada em `20260522151827_…sql:14-35` **não a inclui**.

### TEN-06 · Alta · **HIPÓTESE — tensão com medição ao vivo** · Banco

**O laço que criou as policies pode ter deixado tabelas sem RLS.**
`20260905120000_rls_complete_reconciliation.sql:176-218` roda `ENABLE ROW LEVEL SECURITY` + os quatro
`CREATE POLICY` dentro de um bloco com `EXCEPTION WHEN OTHERS` (`:211-213`). Em Postgres, o handler de
exceção cria uma subtransação: se o `CREATE POLICY` falhar numa tabela sem coluna `workspace_id`/`user_id`,
**o `ENABLE ROW LEVEL SECURITY` é revertido junto** — a tabela fica sem RLS, e o cabeçalho da própria
migration (`:16-18`) afirma "RLS em 216/216 tabelas".
**Tensão a resolver antes de agir:** o `DB Drift Check` de 2026-11-21 mediu **`RLS: 221/221`** ao vivo. Ou o
problema não ocorreu, ou foi corrigido depois. **NÃO VERIFICADO** — faltou consultar
`SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;`
O executor deve rodar essa consulta **antes** de qualquer correção; se vier vazia, feche como não confirmado.

### DATA-02 · Alta · CONFIRMADO · Services / Multi-inquilino

**Agente salvo sem workspace vira registro órfão, invisível a qualquer regra de acesso.**
`src/lib/agentService.ts:111-121` (`saveAgent`) engole a falha de `getWorkspaceId()` e grava
`workspace_id: null`. Uma linha com `workspace_id` nulo não casa com nenhuma policy baseada em
`workspace_id IN (…)` — nem para ler, nem para apagar. O agente some da interface e permanece no banco.

### TEN-07 · Média · CONFIRMADO · Edge

**Um guard de administrador chama a função com o nome de argumento errado e nunca funciona.**
`supabase/functions/slack-dlq-discard/index.ts:70-71` chama `is_workspace_admin` com `p_workspace_id` e
**sem** o id do usuário, usando client `service_role` (portanto sem `auth.uid()`), e descarta o erro
(`const { data: isAdmin }`). Nenhuma das assinaturas existentes aceita `p_workspace_id`
(`src/integrations/supabase/types.ts:14888-14893`) → a RPC falha, `isAdmin` fica `null`, e a função responde
**403 sempre**. Falha fechada — mas o guard não funciona e a função está inutilizável.

### RBAC-10 · Média · CONFIRMADO · Interface

**O botão de convidar membro não tem guard de permissão.**
`src/pages/TeamPage.tsx:63` não é envolvido por `AccessControl`, enquanto a remoção, 60 linhas abaixo
(`:122`), é. Só a RPC barra. Pelo ADR-005 isso é UX, não fronteira — mas a inconsistência dentro da mesma
tela indica que o guard foi esquecido, não decidido.

### RBAC-11 · Média · CONFIRMADO · Regra de negócio

**Só administradores conseguem usar a chave de IA do próprio cliente.**
`workspace_secrets` só é legível por `workspace_members.role IN ('admin','owner')`
(`20260522143137_…sql:62-72`), e é de lá que o `llm-gateway` lê a chave do inquilino
(`index.ts:515-551`). Resultado: `operator`, `editor` e `viewer` **caem silenciosamente nas chaves de
ambiente** — ou seja, consomem o crédito do dono da plataforma em vez do crédito do cliente.
