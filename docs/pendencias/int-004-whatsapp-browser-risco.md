# P1 · Int-004 — Credenciais WhatsApp/Twilio lidas no browser (risco de vazamento)

**Regra**: RN-3/RN-8 · **Status**: pendente · **Tipo**: feat/refactor · **Regra 8**: nao (edge nova, sem DDL)

## Problema
`src/services/whatsappOutboundService.ts:70-77,116,183,216,258` busca credenciais de Twilio/Meta/Z-API/Evolution do banco para dentro do browser e faz fetch direto para `api.twilio.com`, `graph.facebook.com`, `api.z-api.io`.
Hoje nao vaza porque a leitura esta quebrada (encrypted_value ilegivel como string) e CORS bloqueia. Mas o desenho expoe tokens de provedor no cliente.

## Risco real
Se Int-001 for consertado (decrypt server-side) SEM mover a chamada para o servidor, cria-se vazamento real de tokens no browser.

## Solucao
Reescrever como edge function `whatsapp-outbound` (recebe provider+mensagem, resolve credencial server-side, faz a chamada). O service front passa a chamar a edge.

## Validacao
- Nenhuma requisicao do browser referencia token de provedor (network tab).
- Envio via edge funciona com credencial valida.
- Enviar PR ANTES ou junto de Int-001.