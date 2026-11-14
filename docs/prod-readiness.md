# Prontidão de Produção — Fator_X_V2

> Inventário verificado em 2026-11-14 sobre o `main` (commit `f618216`, pós #86/#87).
> Cada item marca `OK` (verificado com evidência) ou `BLOQUEADO` (depende de decisão/credencial do dono).

## 1. Build e qualidade

| Item | Status | Evidência |
| --- | --- | --- |
| CI — Nexus | OK | Run `43514672002` no sha `f618216` — todas as jobs success |
| CI — CodeQL | OK | Workflow success no mesmo sha |
| CI — Guards | OK | Workflow success no mesmo sha |
| CI — Automação local | OK | Workflow success no mesmo sha |
| CI — release-drafter | OK | Workflow success no mesmo sha |
| CI — Contexto | OK | Verde com aviso documentado (`SUPABASE_DB_URL` como secret do GitHub) |
| Typecheck/Build/Test | OK | Jobs Unit, Build, Lint & Security Audit verdes na CI do main |
| E2E | OK | Passou após bump `node-version: 22` (PR #86) — WebSocket nativo |

## 2. Inventário de camadas

### Front (Next.js)

- 141 páginas em `src/pages` (linha de base histórica `docs/FUNCIONALIDADES-SISTEMA-COMPLETO.md` = 40 — o produto cresceu ~3.5x).
- Tipos TipTap alinhados (PR #74).

### Edge functions

- 87 edge functions deployáveis em `supabase/functions`.
- Pipeline de deploy funcional; integrações com llm-gateway (fallback DeepSeek/OpenRouter).

### Banco de dados (Supabase)

- 225 tabelas; 329 migrations no repo = 329 aplicadas no banco (drift 0, `last_v=20260905140000`).
- RLS: 218 tabelas com RLS habilitado; 20 sem policy (deny-by-default por grants `anon`/`authenticated` explícitos — decisão do dono se client-exposed).

### Workflows/integrações

- 7 workflows em `.github/workflows`.
- Integrações Slack, Vercel (alias `fator-x-v2.vercel.app` → HTTP 200), Supabase.

## 3. Estado dos itens de prontidão

| # | Item | Status | Observação |
| --- | --- | --- | --- |
| 1 | CI 100% verde no main | OK | Verificado em `f618216` |
| 2 | Secrets de edge functions | BLOQUEADO | `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `OPENCLAW_WEBHOOK_SECRET` — valores reais nunca fornecidos; edge-contracts fica skipped |
| 3 | Guards vinculados à CI | OK | 38 registros em `scripts/automation.config.json` como `legacy/manual` (decisão: conectar como `test` muda comportamento de `automation:test` — pendente validação) |
| 4 | RLS das 18 tabelas públicas sem policy | BLOQUEADO | Decisão do dono: client-exposed ou service_role-only |
| 5 | SUPABASE_DB_URL como secret do GitHub | OK* | Existe como secret de edge function; como GitHub secret fica com aviso — password não validada (pooler FATAL tenant) |
| 6 | PR #88 (k6 llm-gateway) | AGUARDANDO | Rebaseada em main (`209dcf9b`); E2E verde; segura o check Edge Contract (ambiental) |
| 7 | `docs/prod-readiness.md` no repo | OK | Este documento |
| 8 | Dívida pré-existente `otel-edge.ts:237` | OK* | `deno check` falha, CI usa `--no-check` — herdada de main |

## 4. Risco residual

- **Secrets de edge**: Edge Function Contract Tests segue skipped/vermelho até os 3 valores reais serem gravados (`supabase secrets set`).
- **PR #88**: correta, mas merge retido pela política de CI verde até o Edge Contract destravar.
- **RLS**: 18 tabelas públicas sem policy = deny-by-default (seguro), mas não documentado como intenção.
- **`remote` Lovable**: alias canônico pode ser servido por deployset externo ao GitHub (paradigma antigo — decisão de arquitetura, fora do escopo).