# P2 · Tbl-001 — webhook_events nao existe no banco de producao

**Regra**: RN-15/RN-16 · **Status**: pendente · **Tipo**: DDL · **Regra 8**: SIM (DDL banco prod)

## Problema
Verificado no banco (2026-11-20): `to_regclass('public.webhook_events')` = NULL. Mas o codigo usa:
- `src/services/webhookTriggerService.ts:215,230` -> `.from('webhook_events')` (logWebhookEvent, getWebhookEvents)
Migrations que criam a tabela existem (`20260521103753`, `20260721153331` citam webhook_events) mas NAO aplicaram em prod (334/334 migrations aplicadas, entao a tabela nao foi criada por nenhuma delas ou foi dropada depois).

## Impacto
- `logWebhookEvent` e `getWebhookEvents` quebram (erro de tabela inexistente).
- WebhookTriggerService: increment_webhook_counter RPC tambem ausente.

## Solucao
Migration corretiva: `CREATE TABLE IF NOT EXISTS public.webhook_events (...)` + RLS + `increment_webhook_counter` RPC + policy, espelhando a intencao das migrations citadas.

## Validacao
- to_regclass != NULL apos aplicar.
- WebhookTriggerService log + list ok.