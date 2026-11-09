# Mapa do repositório — referência para agentes

Ler quando precisar saber onde fica algo antes de buscar por texto. Resumo no `AGENTS.md`.

## Onde olhar primeiro

| Pergunta                                        | Arquivo                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| O que está realmente ligado? O que finge estar? | `ESTADO-ATUAL.md` (§1 veredito, §2 contagem, §4 riscos, §5 dado fictício, §13 índice)                                                         |
| Evidência `arquivo:linha` por funcionalidade    | `docs/auditoria-estado-2026-08/01..11` (páginas, services, edges, dados, UI de agentes, componentes, RBAC, integrações, testes/CI, intenções) |
| Como operar (deploy, rollback, incidente, CSP)  | `docs/RUNBOOK.md`                                                                                                                             |
| Decisão de arquitetura                          | `docs/adr/001..006` (Supabase, A2A, edges, acesso dinâmico a tabela, RBAC client-side, dois clients)                                          |
| Contrato de API                                 | `docs/api/openapi.yaml`                                                                                                                       |
| Dicionário de dados                             | `docs/DATA-DICTIONARY.md`                                                                                                                     |
| Runbook de banco                                | `docs/runbooks/db-restore.md`, `docs/runbooks/pg_net-maintenance-window.md`                                                                   |

Os demais `.md` da raiz (`FASE*`, `NEXUS-*`, `SIMULACAO-*`, `HANDOFF-*`, `AUDITORIA*`) são **histórico de
sessões**: úteis como pista, nunca como fonte de verdade. Onde conflitarem com `ESTADO-ATUAL.md` ou com o
código, vale o código.

## Mapa rápido

| Caminho                                      | O que é                                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/pages/`                                 | ~141 rotas/páginas                                                                                                    |
| `src/components/`                            | UI por domínio (`agent-builder/`, `rbac/`, `workflows/`, `super-cerebro/`, `knowledge/`, `security/`, `ui/` = shadcn) |
| `src/services/`                              | ~166 services de domínio — **toda** leitura/escrita de dado passa por aqui                                            |
| `src/integrations/supabase/`                 | `client.ts` (auth), `externalClient.ts` (dados), `types.ts` (gerado)                                                  |
| `src/hooks/`, `src/stores/`, `src/contexts/` | hooks (`useRBAC`), Zustand, `AuthContext`                                                                             |
| `src/lib/`                                   | utilitários, `mcp/`, `sanitize.ts`, `securityGuards.ts`, `logger.ts`                                                  |
| `src/i18n/`                                  | pt-BR / en-US                                                                                                         |
| `supabase/functions/`                        | ~90 edge functions Deno + `_shared/` (cors, auth, rate-limiter, validation, slack, retry, circuitBreaker…)            |
| `supabase/migrations/`                       | 329 migrations                                                                                                        |
| `supabase/config.toml`                       | project_id + `verify_jwt` por função                                                                                  |
| `e2e/`                                       | Playwright (auth, navegação, segurança, agent-builder, visual com `__screenshots__/`)                                 |
| `tests/rls/`                                 | personas de RLS (Vitest, config própria) · `tests/load/`                                                              | k6  |
| `eslint-plugins/nexus-design.js`             | regras de design system cobradas no CI                                                                                |
| `scripts/`                                   | automação (abaixo)                                                                                                    |
| `openclaw/`                                  | gateway self-hosted: config template, workspace, scripts, docs                                                        |
| `.lovable/`                                  | memória/plano do Lovable (gerado pela plataforma, não editar à mão)                                                   |

## Automações (`scripts/`)

| Script                                                            | Para quê                                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `db-drift-check.mjs`                                              | guard repo × banco (migrations, RLS 100%, zero escrita `anon`); precisa de `DB_MCP_URL`        |
| `check-agents-md-integrity.mjs`                                   | garante que `AGENTS.md` + `docs/agentes/` não foram esvaziados                                 |
| `check-bundle-size.mjs`                                           | orçamento de bundle (`bundle-budget.json`)                                                     |
| `generate-audit-pdf.mjs`                                          | PDF da auditoria (roda no job `Build`)                                                         |
| `generate-openapi.ts`                                             | `docs/api/openapi.yaml`                                                                        |
| `deploy-edge-functions.sh`, `set-secrets.sh`, `generate-types.sh` | Supabase CLI — ⚠️ `PROJECT_ID` hoje aponta para `tdprnylgyrogbbhgdoik`, confira antes de rodar |
| `openclaw-remediation.sh`                                         | remediação do gateway OpenClaw                                                                 |
| `db-explain-top-queries.sql`, `perf-regression.sql`               | diagnóstico de performance                                                                     |
| `template-link-coverage.ts`                                       | harness determinístico de cobertura Template↔Skill (G1-G6); roda via `bun`                     |
| `graphify/setup.sh`                                               | instala o graphify e gera o grafo                                                              |

## Comandos

```bash
npm ci                                  # CI usa Node 20; npm, não bun
npm run dev                             # Vite
npx tsc --noEmit                        # typecheck
npx eslint <arquivos>                   # nexus-design/* e no-explicit-any são gate de CI
npx vitest run <caminho>                # só o que você tocou
npm run test:rls                        # personas de RLS (config própria)
npx playwright test <spec>              # e2e; --update-snapshots para baseline visual
npm run build && npm run check:bundle   # build + orçamento de bundle
node scripts/check-agents-md-integrity.mjs
node scripts/db-drift-check.mjs         # precisa de DB_MCP_URL
```

Hook de git: só `.husky/pre-commit` → `npx lint-staged` (eslint --fix + prettier nos arquivos staged).
Não há `commit-msg`: a convenção de commit é responsabilidade sua.

## Grafo de código (graphify) — detalhes

- `bash scripts/graphify/setup.sh` instala o `graphify` (precisa de `uv` ou `pipx`), instala os hooks de
  rebuild e gera `graphify-out/` (fora do Git, ~100 MB).
- Consultas: `graphify query "<pergunta>"`, `graphify path "<A>" "<B>"`, `graphify explain "<conceito>"`.
  `graphify-out/GRAPH_REPORT.md` só para revisão ampla.
- Depois de alterar código: `graphify update .` (só AST, rápido).
- Em sessão de nuvem, `.claude/hooks/session-start.sh` faz isso em segundo plano (log em
  `graphify-out/.session-start.log`); até terminar, trabalhe sem grafo.
- `.graphifyignore` mantém `.env*`, chaves, `dist/`, `coverage/` e relatórios fora do grafo.
