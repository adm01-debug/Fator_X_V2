# P2 · Tbl-002 — game_day_events nao existe no banco de producao

**Regra**: RN-16 · **Status**: pendente · **Tipo**: DDL · **Regra 8**: SIM (DDL banco prod)

## Problema
Verificado no banco (2026-11-20): `to_regclass('public.game_day_events')` = NULL. Codigo usa:
- `src/services/gameDayService.ts:129` -> `.from('game_day_events')`
RPCs ausentes: `start_game_day`, `record_game_day_event`, `complete_game_day` (todos com throw).
Tabelas `game_days` e `game_day_scorecards` EXISTEM. Migration `20260418104142` cria game_day_events mas nao aplicou/prod perdeu.

## Impacto
O ciclo de vida do exercicio Game Day (caos engineering) esta inteiro quebrado — so listar/criar/apagar game day funciona. Page `GameDayLivePage.tsx:18` nao mostra eventos ao vivo.

## Solucao
Migration corretiva: CREATE TABLE IF NOT EXISTS `game_day_events` + 3 RPCs (start/record/complete) + RLS/policies.

## Validacao
- to_regclass != NULL.
- GameDayLivePage: iniciar exercicio, registrar evento, completar.