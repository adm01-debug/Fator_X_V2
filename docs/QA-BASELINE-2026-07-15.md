# QA Baseline — 2026-07-15 (Fase 1 completa)

## Resultados finais desta onda

| Verificação | Resultado |
|---|---|
| `tsgo --noEmit` | ✅ 0 erros |
| `eslint .` | ✅ 0 erros / 0 warnings |
| Supabase Linter | ✅ **No linter issues found** |
| Smoke Playwright (13 rotas públicas) | ✅ 0 pageerror / 0 console.error |
| Vitest (suite completa) | ⏱️ Precisa rodar em shards no CI |
| E2E autenticado | ⏸️ Bloqueado — sandbox `signed_out` |

## Correções aplicadas nesta onda

- **RLS em partições** — 16 avisos INFO ("RLS enabled no policy") em partições mensais de `agent_traces`, `audit_log_v2` e `trace_events_v2` foram resolvidos replicando as políticas da tabela-pai em cada partição (usuário-dono para traces; admin de workspace para auditoria/eventos). Sem isso, queries diretas em partição eram implicitamente negadas.
- **Smoke Playwright** — todas as rotas protegidas redirecionam corretamente para `/auth`, sem erros de console.

## Próximas ondas

1. **Fase 2** — Rodar specs Playwright autenticadas assim que o sandbox estiver `injected` (Auth → Agent Builder → Automations → Knowledge → Oracle → Monitoring → Security → RBAC → Billing → Comms → Public → Admin).
2. **Fase 3** — Ampliar contract tests Zod das Edge Functions e cenários RLS cross-tenant.
3. **Fase 4** — Rodar `vitest --shard` no CI para consolidar cobertura de unidade.
