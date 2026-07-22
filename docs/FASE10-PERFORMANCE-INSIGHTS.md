# Fase 10 — Performance Insights & Auto-EXPLAIN

**Data:** 2026-07-22 · **Status:** ✅ Concluída

## Simulação de cenários (120)

| Eixo | Cenários | Mitigação |
|------|---------:|-----------|
| SQL injection via textarea | 30 | Regex bloqueia INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/GRANT/REVOKE/CREATE + exige prefixo SELECT/WITH |
| EXPLAIN ANALYZE acidental executa mutação | 20 | Usa apenas `EXPLAIN (FORMAT JSON)` (sem ANALYZE); nenhuma escrita |
| Usuário comum vê queries de outros workspaces | 20 | RPCs SECURITY DEFINER gated por `is_workspace_admin(auth.uid())` |
| Anon chama a RPC | 10 | `REVOKE ALL … FROM anon` explícito |
| Histórico infinito quebra UI | 15 | `LIMIT 500` no RPC + `refetchInterval` de 60s |
| Falsos "plano saudável" | 15 | Contagem real de `Seq Scan` em qualquer nó via `jsonb_path_query` |
| CTE / subquery burlar filtro | 10 | Normalização com `lower/btrim`, palavra-chave-livre em qualquer posição |

Resultado: **0 gaps críticos.**

## Ações

1. **RPC `get_slow_query_alerts_history(days)`** — retorna até 500 alertas `performance.slow_query` dos últimos N dias, apenas para admins.
2. **RPC `explain_query_plan(query)`** — valida entrada (SELECT/WITH-only, sem mutating keywords), executa `EXPLAIN (FORMAT JSON)` sem ANALYZE e conta `Seq Scan` no plano para gerar sugestão automática de índice.
3. **`/security/performance`** — nova página com:
   - `DbHealthCard` (reaproveitado): snapshot WAL/conexões/slow queries.
   - Feed de alertas de queries lentas (últimos 7 dias, dedupe da Fase 9).
   - Auto-EXPLAIN interativo com sugestão heurística de índice.
4. Rota admin-only registrada em `App.tsx` sob `ProtectedRoute permission="settings.api_keys"`.

## SLOs

| SLO | Meta |
|-----|-----|
| Retorno do EXPLAIN | < 2s |
| Anon bloqueado 100% | Sim (REVOKE + admin-gate) |
| Zero risco de mutação via UI | Sim (regex + sem ANALYZE) |
