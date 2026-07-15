# QA Baseline — 2026-07-15 (Fase 1)

Onda inicial do plano de QA exaustivo. Estado real capturado direto do repositório, sem confiar em memória.

## Resultados

| Verificação | Resultado |
|---|---|
| `tsgo --noEmit` | ✅ 0 erros (saída vazia) |
| `eslint .` | ✅ 0 erros / 0 warnings (saída vazia) |
| `vitest run` | ⏱️ Suite excede timeout de 500s no sandbox; precisa ser executada em CI ou dividida por shards |
| `supabase linter` | ⏳ Não executado nesta onda |
| Contract tests Edge (`_shared/edge-contract_test.ts`) | ⏳ Pendente para próxima onda |
| Playwright E2E por domínio | ⏳ Pendente (Fase 2) |

## Observações imediatas

- Build & type-safety limpos — a base 10/10 se mantém.
- Suite de testes unitários é grande demais para rodar sequencial em um único slot; próximo passo é fragmentar via `vitest --shard` ou mover a auditoria para o pipeline de CI (`.github/workflows/ci.yml`).
- Muitos avisos ruidosos `useI18nContext called outside I18nProvider` em `src/test/design-improvements.test.tsx` — 🔵 baixo impacto, mas polui logs. Fix sugerido: envolver `render()` desses casos com `<I18nProvider>` ou expor um `renderWithProviders` compartilhado em `src/test/setup.ts`.

## Próximas ondas

1. **Fase 1b** — Rodar `vitest` em shards (`--shard=1/4` … `4/4`) e `supabase--linter` para consolidar baseline.
2. **Fase 2** — Iniciar specs Playwright por domínio (Auth → Agent Builder → Automations → Knowledge → Oracle → Monitoring → Security → RBAC → Billing → Comms → Public → Admin), um por vez, com screenshots em `/tmp/browser/qa/**`.
3. **Fase 3** — Ampliar contract tests Zod das Edge Functions e cenários RLS cross-tenant.
4. **Fase 4/5** — Triagem 🔴/🟡/🔵 + guardrails em CI.

## Achado 🔵 desta onda

- **`src/test/design-improvements.test.tsx`** — múltiplos `render()` sem `I18nProvider`, gerando warns repetidos. Não quebra teste, mas dificulta auditoria de logs.
