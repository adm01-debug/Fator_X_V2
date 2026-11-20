# P2 · Tbl-003 — RPCs GRC ausentes no banco (61 no total)

**Regra**: RN-16 · **Status**: pendente · **Tipo**: DDL · **Regra 8**: SIM (DDL banco prod)

## Problema
Banco tem 41 RPCs (verificado pg_proc). Services chamam RPCs que nao existem e dao throw em runtime (ref `docs/auditoria-estado-2026-08/02-services.md:27`). Criticos verificados:
- `get_masked_secrets` (`settingsService.ts:41` -> quebra a LISTAGEM de segredos, e leitura)
- `get_synthetic_summary` (`syntheticService.ts:91` -> painel uptime/latencia quebra)
- GRC: `register_risk`, `review_risk`, `register_vendor`, `assess_vendor`, `check_budget`, `enforce_budget`, `detect_cost_anomalies`
- Game Day: `start_game_day`, `record_game_day_event`, `complete_game_day` (Tbl-002)

## Impacto
Paginas de Risco, Fornecedores, Orcamento, Custos, Segredos e Monitoramento Sintetico quebram na UI onde dependem desses RPCs.

## Solucao
Criar os RPCs ausentes (espelhando a logica pretendida nos services):
1. `get_masked_secrets(workspace_id)` -> retorna mask dos secrets (admin/owner) — P1 (e leitura).
2. Demais RPCs GRC por pagina, uma migration por cluster.

## Validacao
- Cada pagina lista/grava sem throw.
- Auditoria: pg_proc contem os RPCs.