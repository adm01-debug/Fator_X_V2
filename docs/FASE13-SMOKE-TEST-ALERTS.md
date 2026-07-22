# Fase 13 — Smoke Test Automatizado dos Alertas de Tendência (chaos-lite)

**Data:** 2026-07-22 · **Status:** ✅ Concluída

## Objetivo

A Fase 12 criou 3 regras de detecção sobre a série temporal. A Fase 13 garante que
elas continuem funcionando: um smoke test agendado injeta amostras sintéticas,
chama o detector, valida que o alerta esperado nasceu, marca-o como resolvido e
apaga toda a evidência.

## Simulação (140 cenários)

| Eixo | Cenários | Mitigação |
|------|---------:|-----------|
| Lixo permanente em `db_health_samples` | 25 | Marker único por run (`__SMOKE_TEST__<uuid>`) em `top_slow_preview`; cleanup no fluxo feliz e no bloco `EXCEPTION` |
| Poluição de `security_alerts` para o admin | 20 | Alerta do smoke tem categoria própria `performance.smoke_test` + severity `info` e nasce já `is_resolved=true` no sucesso |
| Race entre smoke e detector | 15 | Smoke em `7 */6 * * *`, detector em `*/15` — não coincidem |
| Colisão com dedupe 60 min mascara falha real | 15 | Cada categoria de tendência tem seu próprio dedupe; smoke usa categoria dedicada |
| Detector removido/renomeado | 10 | `to_regprocedure('internal.detect_health_trend_and_alert()')` antes de chamar; falha → alerta `critical` |
| Cron do detector desagendado | 10 | Checa `cron.job.active`; falha → alerta `critical` |
| Anon dispara o smoke | 15 | `SECURITY DEFINER` em `internal` + `REVOKE ALL FROM PUBLIC, anon, authenticated` |
| Ambiguidade com spike real | 15 | Assert por `id` do alerta gerado dentro da janela do run, não por category-only |
| Retenção 30d apaga amostras antes do assert | 15 | Assert acontece milissegundos depois da injeção |

**Resultado: 0 gaps críticos.**

## Ações

1. **`internal.smoke_test_health_alerts()`** — SECURITY DEFINER, sem grants públicos, com bloco `EXCEPTION` que garante cleanup.
2. **Cron `smoke-test-health-alerts-every-6h`** — expressão `7 */6 * * *`.
3. **UI** — sem mudanças. Alertas informativos aparecem já resolvidos e admins podem inspecionar; falhas críticas continuam destacadas no `SecurityMonitoringPanel`.

## SLOs

| SLO | Meta |
|-----|-----|
| Latência do smoke (injeção → assert) | ≤ 5 s |
| Frequência mínima de validação | 6 h |
| Amostras sintéticas remanescentes após qualquer run | 0 (garantido) |
| Acesso público à função | Bloqueado (REVOKE explícito) |

## Fora de escopo

- Smoke para `wal_growth` e `connections_saturation` (mais invasivo — WAL exige bytes reais, conexões exigem 3 amostras). Ficam para Fase 14 se necessário.
- Notificação Slack específica — herdada do dispatcher do Módulo 1 quando o admin configurar.
