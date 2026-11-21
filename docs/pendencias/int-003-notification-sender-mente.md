# P1 · Int-003 — notification-sender retorna success sem entregar

**Regra**: RN-18 · **Status**: pendente · **Tipo**: fix · **Regra 8**: nao

## Problema
`supabase/functions/notification-sender/index.ts`:
- `sendEmail` sessao (:186-213) retorna `{success:true}` sem enviar nada.
- `sendWhatsApp` (:240), `sendSlack` (:267) idem.
- :118/:124 marcam notificacao como entregue mesmo assim.
Alerta critico de compliance/incidente fica registrado como "enviado" tendo desaparecido.

## Solucao
Integrar provedor real (Resend/Postmark/SMTP) ou retornar `{success:false, reason:"no provider"}` com status "pendente" e log. Nunca mentir.