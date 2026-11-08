# GitHub (perímetro, CI, workflows) — referência para agentes

Ler quando mexer em branch protection, settings do repo, `.github/workflows/`, ou quando um merge/CI der
errado. Resumo no `AGENTS.md`.

## Escrita no GitHub

- Repo: `adm01-debug/Fator_X_V2`, **privado**, default `main`, linguagem TypeScript.
- Escrita (branch, commit, PR, merge): MCP **`GITHUB - MCP - FOREVER`**. `github_push_files` cria a branch
  (`create_branch_from`) e grava `files` + `delete` num único commit — use isso em vez de vários commits.
- `git push`/`gh` só funcionam se o repo estiver autorizado na sessão; o MCP padrão do GitHub devolve 403 em
  escrita.
- Branch: `claude/<fix|feat|chore|ci>-<slug>-<AAMMDD-HHMM>`, sempre a partir de `main` atualizado. Uma tarefa =
  uma branch = uma PR. Só escreva na branch que **você** criou nesta sessão.
- Antes de qualquer push: `github_list_pull_requests` (state=open). PR aberta tocando os mesmos arquivos →
  pare e avise o dono.
- Alternativa do Hermes (quando o agente roda local com vários chats no mesmo clone): worktree isolado
  (`git worktree add "$HOME/hermes-workspaces/<id>" -b <branch>`, cleanup com `git worktree remove --force` +
  `git worktree prune`). É só isolamento de disco — as regras de branch/PR acima continuam valendo.
  Na orquestração do Hermes, worker/editor **não** mexe em git, branch ou PR: só o orquestrador.

## Perímetro do GitHub — estado canônico (medido 2026-11-08)

`main` com branch protection:

| Item                                | Valor                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Checks obrigatórios                 | `Security Audit`, `Lint & Typecheck`, `Unit Tests`, `Build`, `DB Drift Check`                          |
| `strict` (exigir branch atualizada) | **false** — PR atrasada não é barrada; rebase quando o diff da `main` importar                         |
| Histórico linear                    | **true** (merge commit em PR não passa; use squash)                                                    |
| `enforce_admins`                    | **true** — nem o dono empurra direto                                                                   |
| Force-push / deleção de `main`      | bloqueados                                                                                             |
| Review obrigatório                  | **não configurado**                                                                                    |
| Resolução de conversa obrigatória   | não                                                                                                    |
| Merges permitidos no repo           | squash, merge e rebase (use **squash**); `delete_branch_on_merge` = **false** → apague a branch na mão |

**CODEOWNERS está inerte.** `.github/CODEOWNERS` tem 27 entradas para times `@nexus/*` que não existem (o repo
é de uma conta pessoal, não de organização): `github_get_codeowners_errors` devolve "Unknown owner" nas 27.
Nenhum revisor é atribuído automaticamente. Não cite CODEOWNERS como controle.

Outros fatos do perímetro:

- Existem **dois** templates de PR: `.github/PULL_REQUEST_TEMPLATE.md` e `.github/pull_request_template.md`,
  com conteúdos diferentes. Ao mudar o template, mude o que o GitHub está servindo (confira na UI) ou unifique.
- Dependabot e Renovate estão os dois configurados (`.github/dependabot.yml`, `.github/renovate.json`) — daí a
  fila constante de PRs em `package.json`/`package-lock.json`.
- `release-drafter.yml` monta o rascunho de release a partir dos títulos de PR: título de PR ruim vira
  changelog ruim.

## Workflows (`.github/workflows/`)

| Workflow                | Quando                                  | O que faz           |
| ----------------------- | --------------------------------------- | ------------------- |
| `ci.yml` (**Nexus CI**) | push em `main`, PR, `workflow_dispatch` | 10 jobs, abaixo     |
| `codeql.yml`            | análise de código                       | CodeQL              |
| `release-drafter.yml`   | PR/merge                                | rascunho de release |

Jobs do `ci.yml`, na ordem de dependência:

1. `Security Audit` — `npm audit --audit-level=critical --omit=dev`. O nível é `critical` de propósito:
   `react-router` tem advisories HIGH sobrepostos sem versão que limpe os dois (comentário no próprio YAML).
2. `DB Drift Check` — `node scripts/db-drift-check.mjs`; **opt-in** pela secret `DB_MCP_URL` (sem ela:
   warning + exit 0).
3. `Lint & Typecheck` — `npx tsc --noEmit` + `npx eslint src/ --max-warnings 0 --format=json` (o formatter
   `stylish` do ESLint 9.32 quebra; `json` é o estável) + gate de zero regressão em
   `@typescript-eslint/no-explicit-any` e `nexus-design/no-hardcoded-colors|no-adhoc-typography|no-adhoc-shadows`.
4. `Unit Tests` — suíte inteira com cobertura e **orçamento de 300s** (passar de 300s falha o job).
5. `E2E Tests` — só em PR; Playwright chromium, refaz baselines visuais antes de rodar.
6. `Edge Function Contract Tests` — só em PR; Deno contra `supabase/functions/_shared/edge-contract_test.ts`;
   sem `VITE_SUPABASE_URL` sai com warning.
7. `Build` — `npm run build` + `npm run docs:pdf` + `npm run check:bundle` (orçamento em `bundle-budget.json`).
8. `Lighthouse CI` — só em PR, matriz desktop/mobile.
9. `Load Test (k6 — llm-gateway)` — só em PR; smoke sempre, carga cheia só com a label `load-test`.
10. `Notify Slack on Failure` — só em push; sem `SLACK_WEBHOOK_URL` emite warning e fica verde.

Observações que já custaram tempo:

- Vários jobs são **opt-in por secret** (`DB_MCP_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_*`,
  `SLACK_WEBHOOK_URL`): verde não prova cobertura. Leia o passo "status" do job antes de afirmar que passou.
- CI roda **Node 20** e `npm ci`. O Vercel builda com **Node 24.x**. `bun.lock`/`bun.lockb` estão no repo mas
  não são usados por nenhum dos dois.
- Mudar `.github/workflows/`, secrets, CODEOWNERS ou branch protection = **PR aberta + chamar o dono**
  (regra do `AGENTS.md`), nunca merge direto.

## Guards que você pode rodar antes da PR

```bash
node scripts/check-agents-md-integrity.mjs    # instruções de agente não foram esvaziadas
node scripts/db-drift-check.mjs               # precisa de DB_MCP_URL; sem ela, skip
npx tsc --noEmit
npx eslint <arquivos que você tocou>
npx vitest run <caminho do teste>
npm run check:bundle                          # depois de npm run build
```
