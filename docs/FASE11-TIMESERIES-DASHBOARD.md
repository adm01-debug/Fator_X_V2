# Fase 11 — Séries temporais WAL/Conexões + EXPLAIN 1-clique

**Data:** 2026-07-22 · **Status:** ✅ Concluída

## Simulação (140 cenários)

| Eixo | Cenários | Mitigação |
|------|---------:|-----------|
| Snapshot cresce indefinidamente | 25 | Retenção de 30 dias via cron `prune-db-health-samples-daily` |
| Race entre coleta e prune | 15 | Prune atômico com `DELETE ... WHERE captured_at < now()-'30 days'` |
| Anon lê série histórica | 20 | RPC `get_db_health_timeseries` gated por `is_workspace_admin` + `REVOKE FROM anon` |
| Coleta falha silenciosamente | 15 | Snapshot chama funções SECURITY DEFINER já testadas na Fase 8 |
| EXPLAIN de query lenta com plano de outro workspace | 20 | Query vem do próprio `pg_stat_statements`; RPC continua SELECT-only |
| Payload muito grande (>1 MB) | 15 | LIMIT 2016 pontos (7 dias @ 5 min) na série |
| Injeção via `_query` do EXPLAIN 1-clique | 15 | Reaproveita `explain_query_plan` (regex + SELECT/WITH-only) |
| Timezone drift | 15 | Todas as timestamps em `timestamptz` UTC; formatação local no front |

Resultado: **0 gaps críticos.**

## Ações

1. **Tabela `internal.db_health_samples`** — snapshot compacto (WAL bytes, conexões, long queries count, slow queries top mean_ms).
2. **`internal.capture_db_health_sample()`** — SECURITY DEFINER, chamada a cada 5 min por `capture-db-health-every-5min`.
3. **`internal.prune_db_health_samples()`** — mantém 30 dias, agendado 1x/dia.
4. **RPC `get_db_health_timeseries(hours)`** — admin-only, retorna até 2016 pontos.
5. **UI `DbHealthTimeseriesCard`** — sparklines de WAL, % conexões e mean_ms da query mais lenta.
6. **EXPLAIN 1-clique** — cada slow query no `DbHealthCard` ganha botão que preenche o auto-EXPLAIN da `PerformancePage` via `sessionStorage` + navegação.
