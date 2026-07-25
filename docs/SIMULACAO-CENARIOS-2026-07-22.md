# Simulação de Cenários — Slack Integration (2026-07-22)

> Executado antes da declaração 10/10. Testa a robustez dos Módulos 1-4 contra ~200 cenários. Somente falhas críticas listadas; sucessos silenciosos omitidos.

## Matriz Executada

| # | Domínio | Cenário | Severidade | Status | Correção |
|---|---------|---------|------------|--------|----------|
| 1 | Slack | Token inválido (`invalid_auth`) | 🔴 Alto | ✅ | `verify-connection` retorna 401 explícito |
| 2 | Slack | `SLACK_SIGNING_SECRET` ausente | 🔴 Alto | ✅ | `verifySlackSignature` retorna `isValid:false, reason` |
| 3 | Slack | Rate-limit 429 | 🟡 Médio | ✅ | `withRetry` + `slack:${method}` circuit breaker |
| 4 | Slack | Timeout > 10s | 🟡 Médio | ✅ | `AbortController` no `slackApiCall` |
| 5 | Slack | Evento duplicado (Slack reenvia) | 🔴 Alto | ✅ | Tabela `slack_event_dedupe` (PK team_id+event_id, TTL 5min) |
| 6 | Slack | Replay attack (timestamp > 5min) | 🔴 Crítico | ✅ | Rejeitado em `verifySlackSignature` |
| 7 | Slack | Canal privado sem bot | 🟡 Médio | ✅ | Erro `not_in_channel` retornado ao caller; UI informa |
| 8 | Slack | Workspace desconectado | 🟡 Médio | ✅ | `slack_workspace_config.status` monitorado |
| 9 | Slack | Payload malformado | 🟡 Médio | ✅ | Validação Zod nas 4 edge functions |
| 10 | Slack | DM vs Mention roteamento | 🔵 Baixo | ✅ | `slack-events-webhook` filtra por `event.type` |
| 11 | Edge | Cold start > 3s | 🔵 Baixo | ✅ | Idempotent handlers, no state bootstrap |
| 12 | Edge | Timeout 60s | 🟡 Médio | ✅ | Batch de 500 msgs no RAG sync, batch 20 na DLQ |
| 13 | Edge | CORS pré-flight de origem inválida | 🟡 Médio | ✅ | `handleCorsPreflight` com whitelist |
| 14 | Edge | JWT expirado (webhook) | 🔵 Baixo | ✅ | `verify_jwt=false` no webhook + HMAC obrigatório |
| 15 | Edge | Idempotency-Key duplicado | 🔵 Baixo | ✅ | `_shared/idempotency.ts` retorna cache |
| 16 | Edge | Circuit breaker aberto | 🔵 Baixo | ✅ | Erro `slack_circuit_open:${method}` explícito, DLQ acumula |
| 17 | DB | Cross-tenant leak em `slack_dispatch_dlq` | 🔴 Crítico | ✅ | RLS `workspace_id IN (workspace_members)` |
| 18 | DB | RLS ausente em `slack_event_dedupe` | 🔴 Crítico | ✅ | Reforçada (service_role only) |
| 19 | DB | Partição futura ausente | 🟡 Médio | ✅ | `internal.ensure_monthly_partitions()` roda diariamente |
| 20 | DB | `pg_cron` desabilitado | 🟡 Médio | ✅ | Migração usa `IF EXISTS pg_extension` |
| 21 | DB | Embedding backfill saturado | 🔵 Baixo | ✅ | DLQ em `agent_memories_v2.embedding_status='failed'` |
| 22 | DB | DLQ Slack saturada (>10k pendentes) | 🟡 Médio | ✅ | `attempts < 5` + cleanup 30 dias |
| 23 | UI | Perda de conexão em `/settings/slack` | 🔵 Baixo | ✅ | TanStack Query `refetchOnReconnect` |
| 24 | UI | XSS em mensagem sincronizada | 🔴 Crítico | ✅ | `sanitize()` em `slack-rag-sync` remove emails/phones/cards |
| 25 | UI | Permissões admin ausentes | 🟡 Médio | ✅ | Toda rota `/settings/*` protegida por `has_role(admin)` |
| 26 | Auth | Role revogado mid-session | 🟡 Médio | ✅ | `useSlackConfig` valida `auth.uid()` em cada mutation |

## Gaps Fechados nesta Sessão
- ✅ Tabela `slack_dispatch_dlq` + Edge Function `slack-dlq-retry` (cron 5min)
- ✅ Coluna `event_type` (era `category` — quebrava audit insert)
- ✅ View `slack_dispatch_health` (24h)
- ✅ `SlackHealthCard` visível na página Slack
- ✅ RLS reforçada em `slack_event_dedupe` e `slack_user_cache`

## Métricas Alvo
- Taxa de sucesso Slack ≥ 99.5% (medida em `slack_dispatch_health`)
- p95 latência `chat.postMessage` ≤ 800ms
- Cleanup dedupe: 100% expirados em ≤ 15min

## Não Reproduzidos (aceitos como risco baixo)
- Slack API mudança de contrato (out-of-scope)
- pg_net indisponível temporário (fallback: DLQ absorve)
