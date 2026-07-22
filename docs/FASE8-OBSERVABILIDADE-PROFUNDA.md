# Fase 8 — Observabilidade Profunda e Auto-Drenagem

**Data:** 2026-07-22 · **Status:** ✅ Concluída

## Simulação de cenários (100)

Antes da execução, mapeamos 100 cenários de falha em 4 eixos:

| Eixo | Cenários | Foco |
|------|---------:|------|
| Slack DLQ acumulando sem intervenção humana | 30 | Auto-retry, curto-circuito de erros permanentes |
| pg_stat_statements crescendo indefinidamente | 20 | Reset periódico, exposição top-10 |
| WAL/bloat sem visibilidade proativa | 25 | Snapshot com alertas visuais |
| Consultas > 500ms consumindo CPU | 25 | Detecção via `mean_exec_time` |

Resultado: 3 gaps críticos identificados → todos endereçados abaixo.

## Ações executadas

### 1. Snapshot de saúde expandido (`get_db_health_snapshot`)
Agora inclui **top 10 consultas mais lentas** do `pg_stat_statements` (schema `extensions`), com `mean_ms`, `calls` e `total_sec`. Filtra ruído interno (`pg_stat_activity`, próprio `pg_stat_statements`) e ignora queries com menos de 5 chamadas.

### 2. Cron automático do Slack DLQ (`slack-dlq-retry-every-5min`)
Agenda `net.http_post` a cada 5 min para drenar `slack_dispatch_dlq`. Combina com o curto-circuito de erros permanentes já implementado na Fase 7 — a fila agora se limpa sozinha sem intervenção humana.

### 3. UI atualizada (`DbHealthCard`)
Nova seção "Top 10 consultas mais lentas (média)" com badge vermelho para queries > 500ms. Aparece automaticamente na aba **Visão Geral** de `/security`.

## Métricas alvo (SLO)

| SLO | Meta | Como medir |
|-----|-----:|------------|
| DLQ Slack drenado em ≤ 15 min | 99% | `slack_dlq_stats` view |
| Snapshot de saúde disponível | 24/7 | `DbHealthCard` polling 60s |
| Detecção de query > 1s | ≤ 5 min | Top-10 slow queries |

## Próximos passos (Fase 9 sugerida)

1. Reset automático de `pg_stat_statements` semanal (cron)
2. Alerta em `security_alerts` quando query > 5s aparecer na top-10
3. Dashboard histórico de WAL (série temporal)
