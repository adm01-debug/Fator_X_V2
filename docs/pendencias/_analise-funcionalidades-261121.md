# Análise exaustiva — funcionalidades planejadas × implementadas

**Data:** 2026-11-21 · **Base:** origin/main `96fbd6fa` · **Método:** docs (plano/correção) × código × CI × migrations × branches/PRs

## Verificação do estado real (evidência)

- **DB Drift Check run 44909373188 (main) → success** — `Migrations: repo=336 banco=336 | faltam no banco=0 faltam no repo=0` · `RLS: 221/221` · `Grants de escrita para anon: 0`. Prova: migrations #130 (exfil) e #132 (entidades) aplicadas em prod; **o drift não valida RPCs (`pg_proc`)**.
- **RPCs GRC (Tbl-003):** migrations `20260405135227` (`get_masked_secrets`), `20260418104142` (`get_synthetic_summary`), `20260418134141` (`register_risk`/`review_risk`/`register_vendor`/`assess_vendor`/`check_budget`/`enforce_budget`/`detect_cost_anomalies`), e `20260522151827` faz `ALTER FUNCTION` neles (prova de existência em maio). Nenhum `DROP FUNCTION` posterior. **Confirmar no banco: `SELECT proname FROM pg_proc JOIN pg_namespace ON oid=pronamespace WHERE nspname='public'`** — canal atual 403.
- **PRs fechadas sem merge:** #94 absorvida (migration em main); #121 superada pela #108 (mesmo fix de contraste, `text-primary/70` → `text-primary`, mergeada); #117 dev-deps já no lock (`@typescript-eslint` 8.73, `eslint-plugin-react-refresh` ^0.5.7); probes #109–113 = diagnóstico sem conteúdo. **Nada perdido.**
- **Branches remotas:** apenas `main` + `contexto` (relíquia 0-diff, deleção requer palavra do dono).

## P1 ABERTAS — fio cortado (arquivo:linha verificado na main)

1. Int-001 `key_value` removida mas lida em 6 pontos: `llm-gateway/index.ts` (BYO-key vazia), `bitrix24-oauth`, `bitrix24-api`, `crm-bitrix-sync`, `rag-rerank-v2:201`, `rag-embed-v2:136`.
2. Int-002 `bitrix24-webhook` fora do `config.toml` (config lista só 6 functions) → 401 de JWT.
3. Int-003 `notification-sender` mente: `{success:true}` sem entregar (`:209,240,267,311`; `:124` marca entregue).
4. Int-004 WhatsApp/Twilio no browser: `whatsappOutboundService.ts:116` fetch direto `api.twilio.com`/`graph.facebook.com`.
5. Int-005 `.env.example:29` documenta `BITRIX24_WEBHOOK_TOKEN` fantasma.

## Entregue (evidência)

- BACKLOG-10-10: 7 WAVEs / 56 itens ✅ (2026-04-09).
- 50-etapas: fases 1–5,7 ✅; fase 6 parcial (CI: audit, tsc, vitest 6231, Playwright, k6, Lighthouse).
- Exfil-001/002 → #130 mergeada; Tbl-001/002 → #132 mergeada (tabelas + RLS member_* + RPCs game day/chaos).
- Anexos chat + bucket `knowledge-uploads` → #126/#127; TipTap → #125; anti-stale → #124.
- 336/336 migrations, RLS 221/221, 0 grants anon.

## Roadmaps de referência (não era promessa do plano não entregue)

- GAP-CLASSE-MUNDIAL: top-10 com roadmap 12m. Traces/Voice/Replay/Computer-use/Code-interpreter existem como esboços ligados (rotas+edges); Marketplace/AB-test/WebGPU **sem rota viva** (vanguarda futura).
- 50-etapas restantes: `requireEnv` em 45/87 edges (42 têm) + "merge para main" já ocorrido.

## Pendências de banco (bloqueadas por permissão 403 do canal)

- Aplicar migration `20261121103000_embed_retry_chunks` em prod (edge `rag-embed-backfill` nova usa `embed_attempts`).
- Confirmar `pg_proc` dos RPCs GRC.
- Secrets LLM (DEEPSEEK/LOVABLE/OPENCLAW vazios no repo) — edge-deploy com `requireEnv` pendente.
