# Backlog Priorizado (verificado em 2026-11-20)

> Regra de prioridade: impacto no negócio → risco → custo. Cada item vira 1 branch/1 PR (exceto agrupamentos sinalizados). Itens de DDL/CI/infra seguem a regra 8 (PR aberta + chamar dono, sem merge).
> Unidades de trabalho detalhadas: `docs/pendencias/` (arquivos `<ID>-<slug>.md`).

## P0 — Exfiltração de dados / bug crítico em produção
1. **Exfil-001: migrations apontam para Supabase alheio** — `20260722112903_...sql:132`, `20260721155600_...sql:65`, `20260722115149_...sql:4` hardcodam `https://fqdohnmgmtaycfwsioik.supabase.co/functions/v1/*` (slack-alert-dispatcher, whatsapp-router). Alertas/WhatsApp do sistema postam para infra de terceiro. Corrigir para URL do projeto real. ⚠️ Regra 8 (DDL/migration) — PR + chamar dono.
2. **Exfil-002: JWT anon de projeto terceiro hardcoded** — `20260722112903_...sql:133` grava anon_key de `fqdohnmgmt...` em tabela. Corrigir na mesma migration do item 1 (uma PR).

## P1 — Integrações quebradas (fio cortado)
3. **Int-001: `workspace_secrets.key_value` lido por 6 pontos** — migration `20260405225419` removeu a coluna; código não migrou: `llm-gateway/index.ts:518,549,570` (BYO-key OpenAI/Anthropic/Google/OpenRouter sempre vazia), `bitrix24-oauth/index.ts:74,78`, `bitrix24-api/index.ts:20`, `crm-bitrix-sync/index.ts:76` (tudo `throw`/vazio). Requer camada de decrypt de `encrypted_value` **primeiro** (RN-5).
4. **Int-002: `bitrix24-webhook` fora do `config.toml`** — não há `[functions.bitrix24-webhook] verify_jwt = false` (config.toml só lista 6 edges); Bitrix não emite JWT → 401. ⚠️ Infra/config.
5. **Int-003: `notification-sender` mente** — `sendEmail/sendWhatsApp/sendSlack/sendWebhook` retornam `{success:true}` sem entregar (`:209,240,267`); `:124` marca como entregue. Notificação já nasce mentida.
6. **Int-004: credenciais de WhatsApp/Twilio no browser** — `whatsappOutboundService.ts:70-77,116...` faz fetch direto do cliente para `api.twilio.com`/`graph.facebook.com`. Hoje "protegido" só porque a leitura está quebrada (RN-3/RN-8) — reescrever como edge.
7. **Int-005: `.env.example` documenta segredo errado** — documenta `BITRIX24_WEBHOOK_TOKEN`, var que nenhuma linha lê; os 4 secrets Bitrix reais estão ausentes do example (RN-6).

## P2 — Tabelas/RPCs ausentes que quebram features na UI
8. **Tbl-001: `webhook_events` não existe no banco** — `webhookTriggerService.ts:215,230` quebra (`webhook_events` está em migrations mas não aplicou no prod — verificado `to_regclass`=NULL). Migrations que citam a tabela: `20260521103753`, `20260721153331`.
9. **Tbl-002: `game_day_events` não existe no banco** — `gameDayService.ts:129` quebra todo o ciclo de vida do exercício Game Day (tabela criada em `20260418104142` mas ausente no prod; scorecards/days existem).
10. **Tbl-003: RPCs GRC ausentes** — `get_masked_secrets` (`settingsService.ts:41` — quebra a listagem de segredos), `get_synthetic_summary` (`syntheticService.ts:91` — painel uptime), `register_risk`/`review_risk`, `register_vendor`/`assess_vendor`, `check_budget`/`enforce_budget`, `start_game_day`/`record_game_day_event`/`complete_game_day`, `detect_cost_anomalies` — banco tem 41 RPCs, esses não estão entre eles.

## P3 — Melhorias do Roadmap (Sprint +1)
11. **Zod+CORS em 30 edges** (começar por `bitrix24-webhook`, `notification-sender`, `rag-ingest`, `cerebro-brain`, `graph-execute`).
12. **Filtro `is_published` no fórum** (S5).
13. **Denormalizar `workspace_id` em `agent_memories_v2`** (D2).
14. **Índice `idx_agents_updated_at_desc`** (D1).

## P4 — Backlog técnico
15. Retenção 90d em `agent_traces`/`webhook_events` (D3).
16. `model_pricing` com `effective_from/to`.
17. View `edge_function_slo` + dashboard.
18. Reintroduzir CSP via header HTTP.
19. Eliminar 525 warnings `any`.
20. Portabilidade LGPD (export ZIP).
21. Guardrails fail-open (sem `HF_API_TOKEN` executa sem guardrail e não avisa) — registro de alerta.

## Regra 8 (PR aberta + chamar dono, sem merge)
- Exfil-001/002 (migration), Int-002 (config.toml/infra), Tbl-001/002/003 (DDL banco prod).
- Deletar branches `master`/`contexto` (proven relíquias, 0 diff) — deleção precisa de palavra final.
