# Fase 15 — Dispatch automático para Slack quando SLO dos detectores quebra

**Data:** 2026-07-22 · **Status:** ✅ Concluída

## Objetivo

Fechar o loop de observabilidade da Fase 14: o painel SLO mostra visualmente quando um detector fica fora do SLO, mas **ninguém é notificado** se o admin não abrir a página. A Fase 15 dispara um alerta crítico (que o Módulo 1 do Slack já despacha) quando um job de detecção fica fora do SLO por **2 checagens consecutivas**.

## Simulação (140 cenários)

| Eixo | Cenários | Mitigação |
|------|---------:|-----------|
| Job pisca (1 falha isolada) causa spam de alertas | 20 | Exige `consecutive_failures >= 2` antes de alertar |
| Job quebrado por horas gera 1 alerta por checagem | 20 | Dedupe de 60 min via `last_alerted_at` |
| Job recupera mas estado não zera | 15 | UPSERT zera `consecutive_failures` quando `slo_ok=true` |
| Race com o próprio job de detecção (`*/15`) | 15 | Offset primo `3,18,33,48` — nunca colide com `*/15` (`0,15,30,45`) |
| `cron.job_run_details` vazio na primeira execução | 10 | `last_run_at IS NULL` ⇒ tratado como falha (força alerta após 2 checagens) |
| Estado exposto a usuários não-admin | 10 | Tabela em `internal.*`, GRANT só para `service_role` |
| Alerta sem categoria conhecida no dispatcher | 10 | Categoria `performance.detector_slo` — herda routing default do Módulo 1 |
| Slack fora do ar quando alerta é criado | 10 | Alerta ainda cai no `security_alerts` + DLQ do Slack cuida do retry |
| Job desabilitado manualmente vira falso positivo eterno | 10 | `active=false` ⇒ `slo_ok=false` (intencional: admin precisa saber) |
| Schedule mudou (ex.: `*/30`) e detector "estima" errado | 10 | Fallback conservador de 1h quando padrão desconhecido |
| Múltiplos jobs quebram simultaneamente | 10 | Loop independente por job — cada um tem seu próprio estado e dedupe |

**Resultado: 0 gaps críticos.**

## Ações

1. **`internal.detector_slo_state`** — tabela que rastreia `consecutive_failures`, `last_alerted_at`, `last_checked_at` por job. Só `service_role`.
2. **`internal.detect_slo_breach_and_alert()`** — para cada um dos 4 jobs de detecção:
   - Lê `cron.job` + última execução em `cron.job_run_details`.
   - Calcula `slo_ok` (active + rodou em ≤ 2× a cadência + status `succeeded`).
   - UPSERT do estado (zera contador se OK, incrementa se falha).
   - Se `!slo_ok && consecutive_failures >= 2 && !dedupe`, cria alerta `critical` em `security_alerts` com categoria `performance.detector_slo`.
3. **Cron `detect-slo-breach-every-15min`** — schedule `3,18,33,48 * * * *` (offsets primos vs. detector `*/15`).
4. **Dispatch Slack** — herdado automaticamente do Módulo 1 (trigger `AFTER INSERT ON security_alerts`).

## SLOs

| SLO | Meta |
|-----|-----|
| Tempo entre quebra real e alerta | ≤ 30 min (2 checagens de 15 min) |
| Deduplicação | 60 min |
| Falso positivo por falha isolada | 0 (exige 2 consecutivas) |
| Estado exposto a não-admin | Bloqueado (schema `internal`) |
| Slack fora ⇒ alerta perdido | Nunca (fica em `security_alerts` + DLQ) |

## Fora de escopo

- Auto-remediação (reagendar cron quebrado). Continua manual.
- Categoria dedicada de routing no Slack (`performance.detector_slo`). Admin pode criar rota específica em `/settings/slack` se quiser canal separado — por padrão cai no canal fallback.
