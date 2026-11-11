# scripts/ci — guards portados do Zapp Web V2

Guards e ratchets rodados por `.github/workflows/guards.yml`. Cada `*.mjs` tem o `*.unit.mjs` ao
lado; `node --test scripts/ci/*.unit.mjs` roda a suíte inteira (230 testes).

## Ratchets — não exigem repo limpo, exigem que não piore

| Script | Baseline | Medido aqui em 2026-11-08 | Como apertar |
|---|---|---|---|
| `lint-ratchet.mjs` | `eslint-baseline.json` | 24 ocorrências | corrija e `--update-baseline` |
| `typecheck-ratchet.mjs` | `typecheck-baseline.json` | 14 erros de tipo | idem |
| `implicit-any-ratchet.mjs` | `implicit-any-baseline.json` | 0 | já está em zero: qualquer novo quebra |
| `a11y-button-name-ratchet.mjs` | `a11y-button-name-baseline.json` | 280 violações | idem |

O ratchet falha só quando aparece ocorrência **nova**. Baixar o número é bem-vindo: rode com
`--update-baseline` no mesmo PR que corrige.

## Guards que passam limpos hoje (bloqueiam no CI)

| Script | O que barra |
|---|---|
| `check-bundle-secrets.mjs` | JWT de `service_role` no `dist/` e `.env.production` com chave que não é anon |
| `check-e2e-artifact-secrets.mjs` | workflow que publica report do Playwright junto das credenciais de E2E |
| `check-edge-error-exposure.mjs` | edge function devolvendo `error.message`/`.stack` em resposta 5xx (vazamento de detalhe interno) |
| `commit-msg-lint.mjs` | mensagem de commit fora do Conventional Commits (hook `.husky/commit-msg`) |
| `gerar-matriz-edge-tabela.mjs --check` | `docs/migration/MATRIZ_EDGE_TABELA.md` fora de sincronia com `.from()` das edges |

`check-edge-error-exposure.mjs` só ficou bloqueante em 2026-11-09, depois de corrigir um buraco
real no próprio guard: a assinatura deste repo é `errorResponse(req, message, status, details?)`
(req primeiro — `_shared/cors.ts`), mas o regex original só detectava a ordem `errorResponse(err.message,
status, req)` do repo de origem do script (Zapp Web V2). A chamada na ordem certa deste repo
(`errorResponse(req, err.message, 500)`) não batia em nenhum padrão e ficava invisível. Corrigido com
checagem agnóstica de posição de argumento (varre todos os args do `errorResponse`, não assume
onde está `.message`/`.stack` nem o status) — revelou e permitiu corrigir 32 vazamentos reais em
produção que o guard original nunca tinha visto.

## Guards informativos — dívida herdada da main (não bloqueiam)

Rodam no job `achados-herdados` com `continue-on-error`. Números medidos em 2026-11-09:

| Script | Achados | O que é |
|---|---|---|
| `check-supabase-url-import-meta.mjs` | 52 | `src/` lendo `VITE_SUPABASE_URL`/`PUBLISHABLE_KEY` direto do `import.meta.env` em vez da fonte canônica |
| `check-pr-workflow-secrets.mjs` | 8 | secret privilegiado referenciado em workflow de PR ou push irrestrito (`ci.yml`, `release-drafter.yml`) |

Quando o número de um deles chegar a zero, mova o passo para um job bloqueante.

## Inventário

`inventario-*.unit.mjs` testam `scripts/inventario/` (ver `inventario/estado/README.md`).

## Manifesto de edge functions

`scripts/edge-deploy/generate-manifest.mjs` lê `supabase/config.toml` + `supabase/functions/` e
grava `supabase/deployment-manifest.json` (87 funções, 124 arquivos, sha256 por função e do
manifesto inteiro). `--check` falha se o commitado não bater com a árvore — é o que detecta edge
alterada sem o manifesto atualizado. Rodado no job `artefatos-gerados`.

Do pipeline de deploy do Zapp (`collect-remote`, `deploy-plan`, `verify-remote`, `stable-inventory`,
`secrets-scope`, `health-check`, `smoke-functions`) só o manifesto foi portado: o resto exige
`SUPABASE_ACCESS_TOKEN` e o workflow `deploy-functions.yml`, que este repo não tem.
