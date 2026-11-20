# P1 · Int-002 — bitrix24-webhook fora do config.toml (401 no gateway)

**Regra**: RN-7 · **Status**: pendente · **Tipo**: fix/base · **Regra 8**: SIM (config edge/infra)

## Problema
`supabase/config.toml` lista `verify_jwt = false` apenas para openclaw-webhook, whatsapp-router, rag-embed-backfill, slack-events-webhook, migrate-helper, widget-proxy. `bitrix24-webhook` NAO esta -> default `verify_jwt=true` -> Bitrix24 (nao emite JWT Supabase) recebe 401 antes de chegar ao codigo.

## Solucao
Adicionar ao `supabase/config.toml`:
```toml
[functions.bitrix24-webhook]
verify_jwt = false
```
E corrigir `.env.example` (Int-005): documentar `BITRIX24_CLIENT_ID/SECRET/DOMAIN/APP_TOKEN`.

## Validacao
- actionlint / deploy da edge.
- POST de teste simulando Bitrix chega ao codigo (sem 401).