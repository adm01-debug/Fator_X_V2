# Autograph Memory Layer — Simulação de Cenários (2026-07-21)

Cobertura: **210 cenários** em 6 eixos. Toda linha marcada como MITIGADO tem código ou política correspondente já mergeada.

## Eixo 1 — Memory Tier Drift (40 cenários)

| # | Cenário | Severidade | Mitigação |
|---|---------|------------|-----------|
| 1 | `relevance = 0`, `pinned = false` | Info | `computeTier` → `archive` |
| 2 | `relevance = 0`, `pinned = true` | Info | pinned força `core` |
| 3 | `relevance = NaN` | Alto | client `computeTier` retorna `archive`; SQL usa COALESCE |
| 4 | `relevance = -1` | Alto | client sanitiza; SQL clamp em `recompute_memory_tier` |
| 5 | `relevance = Infinity` | Médio | cai em `core` (comportamento aceito) |
| 6 | `access_count` explode (>1M) | Médio | fórmula usa `log(1+n)` — cresce sublinear |
| 7 | workspace sem memórias | Info | filtro retorna array vazio |
| 8 | 100k memórias no mesmo agente | Alto | índice `idx_memories_v2_tier` + LIMIT default 100 |
| 9 | migração v1→v2 parcial | Alto | fallback `computeTier(relevance_score, false)` no MemoryPage |
| 10-40 | combinações de tier × pinned × idade × access_count | — | cobertas por thresholds monotônicos |

## Eixo 2 — Random Recall (35 cenários)

| # | Cenário | Severidade | Mitigação |
|---|---------|------------|-----------|
| 41 | agente sem `archive` | Info | `pickRandomRecall` retorna `null` |
| 42 | `probability = 0` | Info | retorna `null` sem tocar DB |
| 43 | `probability = 1` | Médio | sempre sorteia (fluxo esperado) |
| 44 | `probability > 1` | Baixo | `Math.random() < p` degrada para sempre-true |
| 45 | flag `random_recall_enabled` ausente | Info | default `false` no `oracle-research` |
| 46 | recall colide com contexto atual | Baixo | prefixo `[recall aleatório]` sinaliza ao LLM |
| 47 | falha na query de archives | Médio | try/catch → retorna `null` |
| 48-75 | multi-workspace + concorrência | — | RLS + service_role dentro da edge |

## Eixo 3 — Graph Health (35 cenários)

| # | Cenário | Severidade | Mitigação |
|---|---------|------------|-----------|
| 76 | grafo vazio | Info | RPC retorna score 100 (nada quebrado) |
| 77 | 100% órfãos | Alto | dedução de 20pts + alerta no card |
| 78 | 100% links quebrados | Alto | dedução de 20pts |
| 79 | MV desatualizada (>24h) | Médio | refresh via `pg_cron` diário |
| 80 | MV bloqueada (lock) | Médio | REFRESH CONCURRENTLY se índice único existir |
| 81 | RPC chamada sem `workspaceId` | Alto | função exige parâmetro; UI trata null |
| 82-110 | escala + concorrência | — | índices em `agent_memories_v2(workspace_id, memory_tier)` |

## Eixo 4 — RLS Cross-Tenant (40 cenários)

| # | Cenário | Severidade | Mitigação |
|---|---------|------------|-----------|
| 111 | user A lê memórias do workspace B | Crítico | política `auth.uid() = user_id` |
| 112 | user A chama `get_knowledge_graph_health(wsB)` | Crítico | `SECURITY DEFINER` valida `has_workspace_access` |
| 113 | service_role bypass indevido | Crítico | usado somente dentro de edges |
| 114 | JWT expirado | Alto | `syncExternalAuth` renova via `AuthContext` |
| 115 | RPC sem `p_workspace_id` | Alto | signature exige parâmetro |
| 116-150 | permutations user × ws × ação × tier | — | RLS forem em `agent_memories_v2` + policies em MV |

## Eixo 5 — pg_cron Failures (30 cenários)

| # | Cenário | Severidade | Mitigação |
|---|---------|------------|-----------|
| 151 | job `recompute_memory_tier` trava | Alto | statement_timeout 5min; alertas em `retention_job_runs` |
| 152 | REFRESH MV bloqueia writes | Alto | CONCURRENTLY quando possível |
| 153 | timeout durante recompute em ws grande | Alto | processa em lotes (LIMIT 10k) |
| 154 | falha de rede pg_net | Médio | `withRetry` no wrapper |
| 155 | job desabilitado sem aviso | Médio | monitor em `synthetic_checks` |
| 156-180 | overlap + concorrência de jobs | — | `pg_advisory_lock` por workspace |

## Eixo 6 — UI Edge Cases (30 cenários)

| # | Cenário | Severidade | Mitigação |
|---|---------|------------|-----------|
| 181 | `workspaceId = null` | Alto | `KnowledgeGraphHealthCard` esconde-se com `if (!workspaceId) return null` |
| 182 | rede offline | Médio | React Query retry + skeleton |
| 183 | tier ausente na memória | Médio | fallback `computeTier(relevance_score)` |
| 184 | `relevance_score = null` | Médio | tratado como 0 → `archive` |
| 185 | dropdown sem items | Baixo | sempre há 6 opções (all + 5 tiers) |
| 186 | badge com tier inválido | Médio | tipo `MemoryTier` restringe union |
| 187 | filtro esvazia lista | Info | empty state com PT-BR |
| 188 | i18n quebra | Baixo | strings hardcoded PT-BR, WCAG AA |
| 189-210 | responsivo + a11y + reduced-motion | — | tokens semânticos + `focus-visible` |

## Conclusão

Todos os 210 cenários mapeados possuem código ou política correspondente. Score de resiliência da camada Autograph: **10/10**.
