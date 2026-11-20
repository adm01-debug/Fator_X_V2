# P1 · Int-005 — .env.example documenta segredo que nenhuma linha le

**Regra**: RN-6 · **Status**: pendente · **Tipo**: docs/config · **Regra 8**: nao

## Problema
`.env.example:29` documenta `BITRIX24_WEBHOOK_TOKEN`, variavel que NENHUMA linha de codigo le. Os 4 secrets Bitrix reais (`BITRIX24_CLIENT_ID`, `BITRIX24_CLIENT_SECRET`, `BITRIX24_DOMAIN`, `BITRIX24_APP_TOKEN`) estao ausentes do example.

## Solucao
Atualizar `.env.example`: remover/`deprecated` para `BITRIX24_WEBHOOK_TOKEN` e adicionar os 4 secrets reais + DEEPSEEK/OPENCLAW documentados.

## Validacao
- grep dos 4 nomes em codigo encontra uso.
- Nenhuma var documento fantasmas.