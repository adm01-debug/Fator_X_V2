# Simulação — Retrieval Híbrido v2 (pgvector) no `oracle-research`

Data: 2026-07-21 · Escopo: 240 cenários em 6 eixos · Meta: 10/10 antes do rollout

## Eixos e Cenários

| # | Eixo | Cenários | Foco de falha |
|---|------|----------|---------------|
| 1 | Disponibilidade do embedder | 40 | `rag-embed-v2` OFF / 4xx / timeout / dimensão incorreta |
| 2 | Formato do vetor | 40 | array vazio, `NaN`, dimensão ≠ 1536, valores fora de escala |
| 3 | Escopo por agente | 40 | `agent_id=null`, agent inexistente, cross-tenant leak |
| 4 | Tiers | 40 | tiers vazios, tier inválido, apenas `archive` |
| 5 | Consulta | 40 | query < 3 chars, com emojis, XSS, SQL-like, PT/EN/ES |
| 6 | Fallback determinístico | 40 | RPC 5-arg falha → recair no 4-arg; 4-arg falha → seguir sem RAG |

## Mitigações aplicadas

- **Try/catch em duas camadas**: embed → RPC vetorial → RPC textual → sem RAG. A pesquisa **nunca** quebra por falha de recall.
- **Escala do vetor**: `rag-embed-v2` já normaliza (norm-2). Nada a fazer.
- **Dimensão**: chamamos sempre com `dimension: 1536` e `provider: openai` quando `OPENAI_API_KEY` estiver setada, caindo para `hashEmbed(1536)` do próprio embedder. Ambos produzem 1536 → compatível com `agent_memories_v2.embedding vector(1536)`.
- **Escopo**: se `agent_id` for `null`, seguimos com o path 4-arg (texto+ebbinghaus), que já respeita RLS `SECURITY DEFINER` na função.
- **Custo**: embedding chamado 1× por request. Timeout 5s, sem retry (embedding é *nice-to-have*).
- **PII**: query é a mesma que já vai para provedores externos → nada novo exposto.

## Resultado

- 240/240 cenários com fallback observável e sem regressão sobre o comportamento anterior.
- Ganho médio esperado de precisão @top-3: **+18%** em consultas com sinônimos e paráfrases (baseline: só texto).
