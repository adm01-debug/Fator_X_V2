# Regras de domínio que o código não deixa óbvio — referência para agentes

Ler quando mexer em RBAC/permissões, guardrails, rate limit, i18n ou em tela que mostra número.
Resumo no `AGENTS.md`.

## RBAC

- 5 papéis e 31 permissões declaradas; o hook é `src/hooks/useRBAC.ts`.
- `can()` tem um atalho: `if (state.role === 'workspace_admin') return true` (`useRBAC.ts:105`) — admin ignora
  a lista de permissões. Qualquer discussão de permissão fina precisa levar isso em conta.
- RBAC é **client-side** (ADR 005): é UX, não autorização. A autorização de verdade é RLS no banco + checagem
  dentro da edge function. Nunca apresente controle de tela como controle de acesso.
- `user_roles` estava sem RLS e com escrita para `anon` quando a auditoria mediu — combinado com o atalho
  acima, é escalação direta a admin (`ESTADO-ATUAL.md` §4.2). Mexer em papel/permissão sem olhar RLS é furo.

## Dados e autenticação (ver também `docs/agentes/banco.md`)

- Dois clients: `client.ts` só auth, `externalClient.ts` todo o acesso a dado. RLS no segundo depende de
  `syncExternalAuth(session.access_token)` ser chamado a cada troca de sessão no `AuthContext`.
- Serviço novo que precisa de dado → use `supabaseExternal`, não `supabase`. Usar o client de auth para
  `from()` funciona em dev (fallback) e quebra quando as duas URLs divergirem.

## Guardrails e rate limit (edge)

- `supabase/functions/guardrails-engine/index.ts`: 4 camadas (`input`, `dialog`, `output`, `runtime`) e 4
  rails (prompt injection, PII, toxicidade, vazamento de segredo), cada um devolvendo
  `action: allow | warn | block` + confiança. Falham em aberto: erro no guardrail libera a chamada.
- `supabase/functions/_shared/rate-limiter.ts` → `RATE_LIMITS`: `standard` 30/min, `llm` 15/min, `heavy` 5/min,
  `auth` 10/5min, `webhook` 60/min, `datahub` 20/min, `oracle` 3/min, mais `light` e `moderate` (criados
  depois porque 8 functions já usavam nomes inexistentes e o acesso resolvia `undefined` → TypeError no
  primeiro request). Preset novo entra **nesse objeto**, nunca inline na function.
- Toda edge nova: CORS da allowlist compartilhada (`_shared/cors.ts`), preset de rate limit, e checagem de
  identidade própria se usar `SERVICE_ROLE_KEY` — não confie só no `verify_jwt` da plataforma.

## Telas que mostram número

Regra: **se a tela exibe métrica, a métrica vem de query real ou a tela mostra estado vazio.** Nunca
`Math.random()`, nunca array hardcoded com badge "Live". Casos registrados (`ESTADO-ATUAL.md` §5), que servem
de contraexemplo e **não** devem ser copiados:

- `src/pages/PromptExperimentsPage.tsx:287-297` — botão "simular" grava 50 execuções geradas com
  `Math.random()`, com viés para a variante B, na tabela de runs de experimento. É dado fabricado em banco real.
- `src/components/knowledge/RealtimeVectorCharts.tsx:22,48` — série hardcoded (`latencyData`) com badge "Live".
- `src/components/knowledge/IngestionLogsPanel.tsx:26` — `mockLogs` com progresso falso.

## i18n

`src/i18n/` com `I18nProvider.tsx` + `translations.ts`, pt-BR e en-US. Texto novo de UI entra nas duas
tabelas; não deixe string solta no componente.

## Design system (gate de CI)

As regras `nexus-design/no-hardcoded-colors`, `no-adhoc-typography` e `no-adhoc-shadows`
(`eslint-plugins/nexus-design.js`) são **erro** e o CI reprova com zero tolerância, junto com
`@typescript-eslint/no-explicit-any`. Cor, tipografia e sombra vêm de token (`tailwind.config.ts`,
`src/index.css`), nunca de valor literal no componente.
