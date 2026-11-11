# AGENTS.md — Fator X V2 (Nexus Agents Studio)

Regras do dono para qualquer agente de IA; vencem `docs/` (histórico). Detalhe em `docs/agentes/<tema>.md`;
divergiu da realidade → corrija no mesmo PR do fix. Responda sempre em PT-BR.

## Postura

- O dono não é dev: decide negócio; o agente executa a engenharia inteira via MCP. Nunca passo manual do
  dono nem pedir que ele revise diff.
- Qualidade + velocidade, mínimo de tokens. Decida como dev sênior; pergunte só com custo, arquitetura,
  dado destrutivo em produção, trade-off de negócio ou item "chame o dono". Para ler, não peça permissão.
- Verdade acima de validação: não sabe → diga; falhou → diga. Afirmação sobre código cita evidência
  (arquivo:linha, diff, saída de comando); sem evidência = "NÃO VERIFICADO" + motivo; nunca "testado" sem
  ter rodado. Branch/commit/PR não provam nada — leia o código.
- Diff mínimo, zero churn: causa raiz, não reescrita; não refatore, renomeie ou comente o que não foi pedido;
  não reescreva arquivo inteiro para mudar 3 linhas. Dependência nova ou bump major só se indispensável (avise na PR).
- `APROVADO` = execute o plano como descrito, sem reconfirmar.
- Uma tarefa por vez, cada uma com sua branch/PR. Outro bug → "Próximos passos". Travou → reporte o erro
  exato e pare; não contorne regra. Releia o pedido antes de concluir.
- Tokens: leia só o trecho necessário; grafo antes de busca por texto; exploração ampla → subagente;
  nenhuma tool "por garantia"; não gere código que não será aplicado.
- Segredos nunca em código, commit ou resposta — só em env/secret do serviço (edge: `npx supabase secrets set`
  ou painel; front: env do Vercel/Lovable, e `VITE_*` é público). PAT exposto em chat → rotacionar na hora.
  Nunca imprima nem commite `.env`, `.env.local`, tokens ou `service_role`.

## Bugs e funcionalidades

- Diagnóstico antes de patch: logs e estado real, ponto exato (arquivo:linha), causa; várias causas → liste
  todas, corrija a pedida.
- Antes da PR: typecheck/lint/testes do que tocou. Só erro seu conta; erro herdado da `main` → "Próximos passos".
- "Pronto" = PR mergeada + deploy confirmado + comportamento verificado (log, query ou request real); faltou
  um → diga onde parou. Neste repo isso é regra dura: a auditoria de estado mediu 210 de 215 tabelas vazias
  (`ESTADO-ATUAL.md` §2.2) — "o código existe" aqui quase nunca significa "funciona".
- Funcionalidade pronta = integrada ponta a ponta (rota, entrada na UI, service/hook chamado, edge invocada,
  tabela com RLS, estados erro/loading/vazio, submit), sem mock, hardcode ou TODO. Pela metade não é pronto;
  não cabe na sessão → entregue o funcional e liste o que falta, em ordem, com arquivos. Nunca deixe código
  morto ou feature "quase" sem dizer. Nunca gere dado sintético em tabela de produção para "mostrar a tela"
  (já aconteceu: `src/pages/PromptExperimentsPage.tsx`, `ESTADO-ATUAL.md` §5.1).

## Comunicação

- Resultado primeiro, só o que muda decisão do dono. Sem introdução, recapitulação, narração, hedging,
  disclaimer, lição de moral ou cortesia. Efeito no negócio; técnica só se perguntarem. Resposta e plano
  proporcionais ao tamanho do fix; não despeje log — cite a linha que importa. Caminhos, comandos e links
  completos. Destrutivo de verdade: uma linha ("isso apaga X, sem volta — confirma?").
- Toda execução fecha com exatamente 3 "Próximos passos" (`N. [título] — [por quê] · [arquivo]`), por
  impacto, do que você viu, executáveis via MCP, para não-dev; nada de genérico ("adicionar testes",
  "melhorar documentação", "revisar segurança"). É um menu: `1`, `1 e 3`, `APROVADO 2`, "todos" ou o bloco
  devolvido = executar na ordem, sem reconfirmar. Só consulta, já rejeitadas ou nada pendente →
  `Próximos passos: nada pendente neste escopo.`

## Fluxo Git — detalhe em `docs/agentes/github-ci.md`

- Repo `adm01-debug/Fator_X_V2`, `main`, **privado**. Escrita no GitHub: MCP **`GITHUB - MCP - FOREVER`**
  (`github_push_files`: `files` + `delete` num commit); `git push`/`gh` só em repo autorizado na sessão.
- Nunca commite em `main` (protegida: histórico linear, sem force-push, `enforce_admins` ligado). Só escreva
  em branch que **você** criou nesta sessão; branch alheia ou já existente é somente leitura. Antes do push,
  confira que o último commit é seu.
- PR aberta nos mesmos arquivos → pare e avise o dono (liste via `github_list_pull_requests`). Há fila
  permanente do Dependabot em `package.json`/`package-lock.json`: não toque nesses dois sem falar com o dono.
- Branch de `main` atualizado: `claude/<fix|feat|chore|ci>-<slug>-<AAMMDD-HHMM>`.
- Commit PT-BR, 1 atômico, Conventional Commits `<tipo>(<escopo>): <assunto sem ponto>`. **Não existe hook
  `commit-msg`** aqui (só `pre-commit` → `npx lint-staged`): a convenção é cobrada na revisão, não pelo git.
- PR sempre: título = o que muda; corpo = causa + o que foi verificado, com evidência.
- Checks obrigatórios na `main`: `Security Audit`, `Lint & Typecheck`, `Unit Tests`, `Build`, `DB Drift Check`
  (`strict=false` — PR atrasada não é barrada; rebase quando o diff da `main` importar). CODEOWNERS está
  **inerte** (27 entradas `@nexus/*`, times inexistentes): não espere revisor automático.
- Mergeie sem aprovação (squash, apague a branch) PR sua pronta: CI verde, sem conflito, escopo comum (front,
  edge, doc, config). **Deixe aberta e chame o dono**: DDL/migration em produção; `.github/workflows/`,
  segredos, CODEOWNERS ou branch protection; `package.json`/lock com PR do Dependabot aberta; deleção de dado,
  arquitetura ou custo; conflito com PR de outro agente.
- Conflito: rebase em `main`; `--force-with-lease` só na sua branch.
- Merge = produção (Vercel, ver `docs/agentes/deploy.md`): confirme o deploy e reporte. CI vermelha → leia o
  resumo da falha antes de qualquer patch; do seu merge → `fix:` em branch nova na mesma sessão.
- Fim: link da PR + estado.

## Banco — ler `docs/agentes/banco.md` antes de SQL, migration ou deploy

- Oficial: Supabase Cloud **`qdlnzopxrlsoljcrcmzv`** (`supabase/config.toml:1`, `.env.example:10`). **Nesta
  sessão pode não haver MCP apontando para ele**: `SUPABASE - GESTÃO DE CLIENTES` é `pgxfvjmuubtbowutlide`
  (CRM) e `SUPABASE - GESTÃO DE PRODUTOS` é `doufsxqlfjyuvxuezpln` (Catálogo) — outros sistemas, **só
  leitura**; `SUPABASE - ZAPP WEB V2 - MCP` é `tnnnlkbymytvtqngbbqh` (outro produto): **não escrever**.
  Sem MCP do projeto, diga que não consegue ler o banco em vez de inferir.
- Dois clients no front (ADR 006): `src/integrations/supabase/client.ts` só auth; `externalClient.ts` todos os
  `from()`/RPC, com URL de `VITE_EXTERNAL_SUPABASE_*` e fallback para `VITE_SUPABASE_*`.
- Código, scripts e fallbacks apontam só para `qdlnzopxrlsoljcrcmzv` (PR #80). Resta `fqdohnmgmtaycfwsioik` em 3
  migrations de trigger já aplicadas (histórico; banco sem referência ativa) — não reaplique em ambiente novo sem corrigir.
- Diagnóstico = produção **só leitura**; teste de comportamento = Postgres descartável. Migration registrada
  ≠ aplicada (drift real, `ESTADO-ATUAL.md` §3); `node scripts/db-drift-check.mjs` é o guard (precisa de
  `DB_MCP_URL`). DDL só pelo fluxo de `banco.md`. Destrutivo, segredos e rotação: só com o dono.

## Serviços

- **Deploy** — ler `docs/agentes/deploy.md` ao confirmar deploy ou mexer em env/domínio. Dois caminhos vivos:
  Vercel (projeto `fator-x-v2`, time `juca1`, SSO ligado) e Lovable (`docs/RUNBOOK.md`). Edge functions **não**
  sobem no merge: `bash scripts/deploy-edge-functions.sh` (confira o PROJECT_ID) ou o painel.
- **Integrações** — ler `docs/agentes/integracoes.md` ao mexer em Slack, Bitrix24, WhatsApp/OpenClaw,
  HuggingFace, LLM gateway, MCP ou A2A. Quase tudo é PARCIAL: confirme o fio antes de prometer.
- **GitHub/CI** — ler `docs/agentes/github-ci.md` ao mexer em settings, branch protection ou workflows.
- **Regras de domínio** — ler `docs/agentes/regras-dominio.md` ao mexer em RBAC/permissões, guardrails,
  rate limit, i18n ou telas que mostram métrica.

## Stack e comandos — detalhe em `docs/agentes/mapa-repo.md`

- Vite + React 18 + TS (`src/`), Supabase (`supabase/functions/` ~90 edges Deno, `supabase/migrations/` 329),
  Vitest (`src/**`, `tests/rls/`), Playwright (`e2e/`), k6 (`tests/load/`), Tailwind + shadcn/ui.
- **npm** (`npm ci`): o CI roda Node 20 e o Vercel builda com 24.x. `bun.lock`/`bun.lockb` existem mas nem o
  CI nem o Vercel os usam — não troque de gerenciador.
- `npx vitest run <caminho>`; `npx tsc --noEmit`; `npx eslint <arquivos>` (as regras `nexus-design/*` e
  `@typescript-eslint/no-explicit-any` são gate de CI com zero tolerância); `npx playwright test <spec>`;
  `node scripts/check-agents-md-integrity.mjs`; `node scripts/db-drift-check.mjs`.
- Antes de qualquer tarefa: `ESTADO-ATUAL.md` (§1 veredito, §4 riscos, §13 mapa dos detalhes) e
  `docs/auditoria-estado-2026-08/` — é lá que está o que de fato está ligado e o que só finge estar.
- Automação em `scripts/` (`.mjs`/`.sh`, sem subpasta exceto `scripts/graphify/` e o kit comum `scripts/maintenance/`); nunca em `supabase/` nem `src/`.

## Grafo de código (graphify)

O grafo não vem no clone: `bash scripts/graphify/setup.sh` instala e gera `graphify-out/` (fora do Git).
Quando `graphify-out/graph.json` existir: `graphify query "<pergunta>"`, `graphify path "<A>" "<B>"`,
`graphify explain "<conceito>"` antes de buscar por texto; `GRAPH_REPORT.md` só para revisão ampla. Alterou
código ou o report não é do HEAD atual → `graphify update .` (só AST). Em nuvem o grafo é gerado em segundo
plano (`.claude/hooks/session-start.sh`) — siga sem ele até terminar.
