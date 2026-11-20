# P1 · Int-001 — workspace_secrets.key_value lido por 6 pontos apos remocao da coluna

**Regra**: RN-4/RN-5 · **Status**: pendente · **Tipo**: feat/fix · **Regra 8**: SIM (DDL se criar funcao server-side)

## Problema
Migration `20260405225419` removeu `key_value`; codigo nao migrou. Pontos que leem/escrevem `key_value`:
- `supabase/functions/llm-gateway/index.ts:518,549,570` (BYO-key OpenAI/Anthropic/Google/OpenRouter sempre vazia -> cadeia de fallback so tem HF_API_TOKEN e LOVABLE_API_KEY)
- `supabase/functions/bitrix24-oauth/index.ts:74,78` (callback OAuth nunca grava token)
- `supabase/functions/bitrix24-api/index.ts:20` (erro 42703 -> "Bitrix24 nao conectado")
- `supabase/functions/crm-bitrix-sync/index.ts:76` (sync nunca roda)
- `src/services/whatsappOutboundService.ts` (leitura errada, ver Int-004)

## Requisito
Escrever camada server-side de decrypt de `encrypted_value` ANTES (RN-5). Recriar key_value e PROIBIDO (voltaria texto claro).

## Solucao proposta
1. Nova funcao SQL/edge que descriptografa `encrypted_value` (chave de encriptacao em secret).
2. Migrar as 6 leituras para usar a camada.
3. Bitrix OAuth grava `encrypted_value` (criptografado) em vez de key_value.

## Validacao
- OAuth Bitrix grava token e API le.
- llm-gateway resolve BYO-key.
- crm-bitrix-sync roda.