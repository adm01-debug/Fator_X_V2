# P0 · Exfil-001 — Migrations apontam para Supabase de terceiro

**Regra**: RN-9 · **Status**: pendente · **Tipo**: fix · **Regra 8**: SIM (migration DDL)

## Problema
3 migrations versionadas hardcodam `https://fqdohnmgmtaycfwsioik.supabase.co/functions/v1/*` — projeto que NAO e o de producao (`qdlnzopxrlsoljcrcmzv`):
- `supabase/migrations/20260722112903_e4950969...sql` -> slack-alert-dispatcher (:132)
- `supabase/migrations/20260721155600_72a5ec4e...sql` -> whatsapp-router (:65)
- `supabase/migrations/20260722115149_be884e60...sql` (:4)

## Impacto
Alertas de seguranca e mensagens de WhatsApp do sistema sao POSTados para infra de outro projeto. Se vivo e de terceiro = exfiltracao de dados.

## Solucao
Migration corretiva: UPDATE das URLs para `https://qdlnzopxrlsoljcrcmzv.supabase.co/functions/v1/slack-alert-dispatcher` e `/whatsapp-router`. Mesma migration corrige a anon_key do projeto errado (Exfil-002).

## Validacao
- SELECT nas colunas afetadas apos aplicar -> host correto.
- Testar disparo de alerta -> chega no projeto certo.