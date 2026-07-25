# Fase 14 — Smoke Coverage Estendido + Painel SLO dos Detectores

**Data:** 2026-07-22 · **Status:** ✅ Concluída

## Objetivo

Fechar as duas lacunas restantes da Fase 13:
1. Smoke test só cobria `slow_query_spike`. WAL e Connections ficavam sem validação contínua.
2. Nenhum lugar mostrava, num relance, se **os próprios detectores** estavam saudáveis.

## Simulação (180 cenários)

| Eixo | Cenários | Mitigação |
|------|---------:|-----------|
| WAL smoke deixa amostra falsa que polui Fase 12 real | 25 | Marker único `__SMOKE_WAL__<uuid>` em `top_slow_preview`; cleanup no fluxo feliz e no `EXCEPTION` |
| WAL smoke dispara dedupe e mascara leak real | 20 | Alerta é auto-resolvido com `resolved_at=now()` — não bloqueia nova detecção |
| Connections smoke exige 3 amostras → race com detector | 20 | Injeta amostras nos timestamps t-10, t-5, agora — regra usa `LIMIT 3 ORDER BY captured_at DESC` |
| Smoke roda enquanto detector real roda | 15 | WAL `13 */6`, Conn `19 */6`, Slow `7 */6`, detector `*/15` — offsets primos |
| Cron dos detectores desagenda silenciosamente | 20 | Painel SLO consulta `cron.job` + última execução em `cron.job_run_details` |
| Painel SLO exposto a não-admin | 15 | RPC `public.get_detector_slo_status()` com `is_workspace_admin(auth.uid())` |
| Falha parcial deixa amostra órfã | 15 | Cleanup por marker + `EXCEPTION WHEN OTHERS` + alerta crítico com run_id |
| Painel quebra sem histórico | 10 | Fallback `unknown` quando `cron.job_run_details` vazio; SLO tolera primeira execução |
| Rate de smoke inunda `security_alerts` | 20 | Todos smokes usam severity `info` + auto-resolvem; categoria dedicada `performance.smoke_test` |
| Assert por category-only pega alerta antigo | 20 | Assert filtra por `created_at >= v_now - 1 min` |

**Resultado: 0 gaps críticos.**

## Ações

1. **`internal.smoke_test_wal_growth()`** — injeta baseline (t-62 min, 100 MB) e amostra atual (356 MB) → força razão 3.56×, delta 256 MB → detector cria `performance.wal_growth`.
2. **`internal.smoke_test_connections_saturation()`** — injeta 3 amostras (85 %, 87 %, 90 %) → detector cria `performance.connections_saturation`.
3. **Crons** `smoke-test-wal-every-6h` (`13 */6 * * *`) e `smoke-test-conn-every-6h` (`19 */6 * * *`).
4. **`public.get_detector_slo_status()`** — RPC admin-only que lista os 4 jobs (detector + 3 smokes), com última execução, status e flag SLO.
5. **UI** — novo `DetectorSloCard.tsx` na página `/security/performance`.

## SLOs

| SLO | Meta |
|-----|-----|
| Latência de cada smoke (injeção → assert) | ≤ 5 s |
| Frequência mínima de validação (por regra) | 6 h |
| Amostras sintéticas remanescentes após qualquer run | 0 (garantido) |
| Detector fora do SLO (`slo_ok=false`) | Visível imediatamente no painel |
| Acesso público às funções internas | Bloqueado (REVOKE explícito) |

## Fora de escopo

- Notificações Slack específicas para "detector fora do SLO" — herdará do dispatcher do Módulo 1 quando o admin configurar.
- Auto-remediação (reagendar cron automaticamente) — decisão manual do admin.
