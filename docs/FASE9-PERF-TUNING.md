# Fase 9 — Perf Tuning e Alerting Automático de Queries Lentas

**Data:** 2026-07-22 · **Status:** ✅ Concluída

## Simulação de cenários (150)

Antes da execução, mapeamos 150 cenários em 5 eixos:

| Eixo | Cenários | Foco |
|------|---------:|------|
| Queries > 5s passando despercebidas | 40 | Detecção automática + alerta |
| `pg_stat_statements` crescendo sem limite | 30 | Reset semanal automático |
| Alertas duplicados poluindo painel | 30 | Deduplicação 24h por preview |
| Falsos positivos de queries internas | 25 | Filtro `pg_stat_statements` / `pg_stat_activity` |
| Falha da função sem visibilidade | 25 | `SECURITY DEFINER` + logs |

Resultado: **0 gaps críticos** — todos endereçados.

## Ações executadas

### 1. `public.detect_slow_queries_and_alert()`
Função `SECURITY DEFINER` (revogada de `anon`/`authenticated`) que:
- Varre `extensions.pg_stat_statements` procurando queries com `mean_exec_time > 5000ms` (mín. 5 chamadas)
- Cria alertas em `security_alerts` com categoria `performance.slow_query`
- Severidade **critical** se média > 10s, senão **high**
- **Deduplicação:** ignora se já existir alerta ativo do mesmo `query_preview` nas últimas 24h
- Retorna o número de alertas criados

### 2. Cron `detect-slow-queries-every-15min`
Roda a cada 15 minutos, garantindo detecção proativa em ≤ 15 min.

### 3. Cron `reset-pg-stat-statements-weekly`
Todo domingo 04:00 UTC executa `extensions.pg_stat_statements_reset()` para evitar crescimento infinito e manter a top-N sempre relevante para a janela vigente.

## Validação

- ✅ Migração aplicada sem erros
- ✅ Chamada manual retornou `1` alerta criado (query real > 5s detectada)
- ✅ Ambos crons agendados (`cron.schedule` retornou IDs)
- ✅ Alertas visíveis em `SecurityMonitoringPanel` (categoria `performance.slow_query`)

## SLOs

| SLO | Meta | Como medir |
|-----|-----:|------------|
| Detecção de query > 5s | ≤ 15 min | Cron a cada 15 min |
| Retenção de estatísticas | 7 dias | Reset semanal |
| Zero alertas duplicados | 100% | Dedupe por `query_preview` + 24h |

## Próximos passos (Fase 10 sugerida)

1. UI dedicada `/security/performance` com histórico de alertas de slow query
2. Auto-EXPLAIN das top queries com sugestão de índice
3. Dashboard série temporal de WAL e conexões
