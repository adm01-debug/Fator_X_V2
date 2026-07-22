# Fase 12 — Alertas Proativos de Tendência

**Data:** 2026-07-22 · **Status:** ✅ Concluída

## Objetivo

Fechar o loop da observabilidade: usar a série temporal criada na Fase 11
(`internal.db_health_samples`) para **detectar tendências ruins antes de virarem incidente**.

## Simulação (150 cenários)

| Eixo | Cenários | Mitigação |
|------|---------:|-----------|
| WAL cresce lento mas contínuo (leak) | 25 | Comparar última amostra vs. amostra de ~1h atrás; alertar se razão ≥ 1.5 **E** delta ≥ 128 MB |
| Pico curto de WAL (checkpoint normal) | 20 | Regra combinada exige tanto razão quanto delta absoluto — picos isolados não passam |
| Conexões saturando | 20 | Exige 3 amostras seguidas com `connections_pct ≥ 80` (≥ 10 min sustentado) |
| Slow query estourando p95 | 20 | Exige 2 amostras seguidas com `top_slow_mean_ms ≥ 5000` |
| Falsos positivos após restart (sem histórico) | 15 | Função retorna `no_samples` quando a série está vazia; janela de 55–75 min tolera lacunas |
| Spam de alerta a cada 15 min | 20 | Dedupe por `category` em janela de 60 min em `security_alerts` |
| Anon/usuário comum dispara função | 15 | `SECURITY DEFINER` em schema `internal` + `REVOKE ALL FROM PUBLIC, anon, authenticated` |
| Retenção de 30 dias quebra janela | 15 | Prune preserva folga; janela usada aqui é de 75 min |

**Resultado: 0 gaps críticos.**

## Ações

1. **`internal.detect_health_trend_and_alert()`** — SECURITY DEFINER, sem `EXECUTE` público.
   Regras:
   - `performance.wal_growth` (warning): razão ≥ 1.5 **e** delta ≥ 128 MB entre a amostra atual e a de ~60 min atrás.
   - `performance.connections_saturation` (critical): últimas 3 amostras com `connections_pct ≥ 80`.
   - `performance.slow_query_spike` (warning): últimas 2 amostras com `top_slow_mean_ms ≥ 5000`.
   Cada regra é dedupada por `category` em 60 min contra `public.security_alerts`.
2. **Cron `detect-health-trend-every-15min`** — executa a função a cada 15 minutos.
3. **UI** — nenhum componente novo. `SecurityMonitoringPanel` já lê `security_alerts` e exibirá as três novas `category`s automaticamente.

## SLOs

| SLO | Meta |
|-----|-----|
| Latência de detecção (evento → alerta) | ≤ 20 min |
| Máximo de alertas por regra em 24h | 24 (dedupe 60 min) |
| Acesso público à função | Bloqueado (REVOKE explícito) |
| Falsos positivos após restart | 0 (janela vazia → no-op) |
