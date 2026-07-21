# Autograph Memory Layer — Guia Técnico

Camada de memória inspirada em `smixs/agent-second-brain` (motor `autograph`), adaptada à arquitetura multi-tenant do Fator X.

## Componentes

| Camada | Arquivo | Papel |
|--------|---------|-------|
| DB | `agent_memories_v2.memory_tier`, `pinned`, `access_count`, `last_accessed_at` | Estado por memória |
| DB | `public.memory_relevance(id)` | Fórmula de relevância |
| DB | `public.recompute_memory_tier()` | Job diário reclassifica todos os tiers |
| DB | `public.touch_memory(p_id)` | Incrementa access_count + last_accessed_at (atômico) |
| MV | `knowledge_graph_health` | Snapshot da saúde do grafo por workspace |
| RPC | `get_knowledge_graph_health(p_workspace_id)` | `SECURITY DEFINER` + escopo workspace |
| Edge | `_shared/memory-tiers.ts` | `computeTier`, `touchMemory`, `pickRandomRecall` |
| Client | `src/lib/memory/tiers.ts` | Espelho do `computeTier` para UI |
| UI | `MemoryTierBadge`, `KnowledgeGraphHealthCard` | Visualização |

## Tiers

| Tier | Threshold (relevance) | Semântica |
|------|-----------------------|-----------|
| `core` | `≥ 3.0` ou `pinned=true` | Núcleo da identidade do agente |
| `active` | `≥ 1.5` | Frequente e recente |
| `warm` | `≥ 0.5` | Ativa nos últimos dias |
| `cold` | `≥ 0.1` | Adormecida |
| `archive` | `< 0.1` | Elegível para random recall |

## Fórmula de relevância (Ebbinghaus adaptado)

```
relevance = base_score
          + ln(1 + access_count) * 0.5      -- reforço logarítmico
          * exp(-Δt_dias / 30)               -- decay temporal
          + (pinned ? 10 : 0)                -- pin overrides
```

- **Δt_dias**: dias desde `last_accessed_at`.
- Half-life ≈ 30 dias (memória não tocada perde metade da relevância a cada mês).
- Pinned garante permanência em `core` independentemente do decay.

## Random Recall (serendipidade)

Ativação: `agents.config.random_recall_enabled = true`.

Fluxo no `oracle-research`:
1. Se flag ativa, chama `pickRandomRecall(client, agentId, 0.05)` (5% de chance).
2. Se sorteado, injeta uma memória `archive` como turno extra prefixado com `[recall aleatório]`.
3. `touchMemory` é chamado no item sorteado — recall gradualmente promove memórias esquecidas.

## Jobs `pg_cron`

- `autograph_recompute_tier_daily` — 04:15 UTC diariamente.
- `autograph_refresh_graph_health_daily` — 04:30 UTC diariamente.
- Ambos monitorados por `retention_job_runs` + alertas em `security_alerts`.

## RLS & segurança

- `agent_memories_v2`: policy `auth.uid() = user_id`.
- `get_knowledge_graph_health`: `SECURITY DEFINER` valida `has_workspace_access(auth.uid(), p_workspace_id)` antes de retornar.
- MV `knowledge_graph_health`: acessível somente via RPC (não exposta ao PostgREST).

## Simulação

Ver [`AUTOGRAPH-SIMULATION-2026-07-21.md`](./AUTOGRAPH-SIMULATION-2026-07-21.md) — 210 cenários cobertos.
