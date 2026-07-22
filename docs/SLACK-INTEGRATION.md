# Integração Slack — Documentação Técnica

## Arquitetura

```text
┌────────────────────┐     HMAC v0      ┌─────────────────────────┐
│  Slack (Events)    │─────────────────▶│ slack-events-webhook    │
└────────────────────┘                  └────────────┬────────────┘
                                                     ▼
                                            ┌────────────────┐
                                            │  llm-gateway   │
                                            └────────────────┘

┌──────────────────┐   AFTER INSERT   ┌──────────────────────────┐
│ security_alerts  │─────────────────▶│ slack-alert-dispatcher   │
└──────────────────┘   (pg_net)       └────────────┬─────────────┘
                                                   │
                                        chat.postMessage
                                                   ▼           falha
                                            ┌──────────┐   ┌───────────────────┐
                                            │  Slack   │   │ slack_dispatch_dlq│
                                            └──────────┘   └────────┬──────────┘
                                                                    │ cron */5
                                                                    ▼
                                                        ┌────────────────────┐
                                                        │  slack-dlq-retry   │
                                                        └────────────────────┘
```

## Módulos

| # | Nome | Edge Function | Trigger |
|---|------|--------------|---------|
| 1 | Alertas de Segurança | `slack-alert-dispatcher` | `AFTER INSERT ON security_alerts` |
| 2 | Notificações de Agentes | `slack-agent-notify` | Chamada explícita ao fim de execução |
| 3 | Bot @Nexus | `slack-events-webhook` | Slack Events API |
| 4 | RAG Sync | `slack-rag-sync` | Cron horário |

## Secrets

- `SLACK_BOT_TOKEN` — `xoxb-...`
- `SLACK_SIGNING_SECRET` — 32 hex chars

## Tabelas

- `slack_workspace_config` — config por workspace
- `slack_channel_routes` — rotas de alertas por categoria/canal
- `slack_agent_notifications` — templates de notificação
- `slack_rag_sources` — canais sincronizados como memória
- `slack_bot_bindings` — vinculação bot ↔ agente
- `slack_event_dedupe` — deduplicação (TTL 5min)
- `slack_user_cache` — cache de `users.info`
- `slack_dispatch_dlq` — reprocesso automático

## Resiliência

| Camada | Mecanismo |
|--------|-----------|
| Retry | `withRetry` (3 tentativas, backoff exponencial 400ms→3s) |
| Circuit Breaker | 5 falhas ⇒ abre 30s (por método) |
| Timeout | 10s por chamada Slack |
| Deduplicação | PK composta `team_id + event_id` |
| DLQ | Reprocesso a cada 5 min, máx 5 tentativas |
| Cleanup | Cron 15min limpa expirados |

## Segurança

- HMAC v0 obrigatório em webhook (Slack signing)
- Janela de replay: 5 minutos
- Sanitização de PII (email, telefone, cartão) no RAG sync
- RLS restrita: `slack_event_dedupe` e `slack_user_cache` só via `service_role`
- Todas as tabelas com `workspace_id` isoladas via `workspace_members`

## Monitoramento

- View `slack_dispatch_health` — sucessos/falhas/latência 24h
- Componente `SlackHealthCard` no `/settings/slack`
- `audit_events` com `event_type='slack_integration'` para rastreamento
- DLQ visível para membros do workspace (SELECT)

## Rotação de Secrets

Recomendada a cada 90 dias:
1. Gerar novo signing secret no https://api.slack.com/apps
2. Atualizar `SLACK_SIGNING_SECRET` via Lovable Secrets
3. Reverificar via botão "Reverificar" na UI
4. Rotacionar `SLACK_BOT_TOKEN` (reinstall app se necessário)
