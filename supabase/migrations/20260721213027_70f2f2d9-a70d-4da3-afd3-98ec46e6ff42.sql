
-- ═══════════════════════════════════════════════════════════════
-- Autograph → Fator X: Ebbinghaus decay + tiers + graph health
-- ═══════════════════════════════════════════════════════════════

-- 1) Colunas novas em agent_memories_v2
ALTER TABLE public.agent_memories_v2
  ADD COLUMN IF NOT EXISTS access_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS half_life_days INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS strength NUMERIC GENERATED ALWAYS AS (1 + ln(1 + access_count)) STORED,
  ADD COLUMN IF NOT EXISTS memory_tier TEXT NOT NULL DEFAULT 'active'
    CHECK (memory_tier IN ('core','active','warm','cold','archive')),
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_agent_memories_v2_tier
  ON public.agent_memories_v2 (agent_id, memory_tier);
CREATE INDEX IF NOT EXISTS idx_agent_memories_v2_pinned
  ON public.agent_memories_v2 (agent_id) WHERE pinned = true;

-- 2) memory_relevance: strength × decaimento exponencial pela idade desde último acesso
CREATE OR REPLACE FUNCTION public.memory_relevance(p_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    m.strength * exp(
      - GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(m.last_accessed_at, m.created_at))) / 86400.0)
      / NULLIF(m.half_life_days, 0)
    ),
    0
  )
  FROM public.agent_memories_v2 m
  WHERE m.id = p_id
$$;

-- 3) touch_memory: registra acesso — usado pelo llm-gateway
CREATE OR REPLACE FUNCTION public.touch_memory(p_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.agent_memories_v2
     SET access_count = access_count + 1,
         last_accessed_at = now()
   WHERE id = p_id
$$;

GRANT EXECUTE ON FUNCTION public.memory_relevance(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_memory(UUID) TO authenticated, service_role;

-- 4) recompute_memory_tier: recalcula tier baseado em relevance + pinned
CREATE OR REPLACE FUNCTION public.recompute_memory_tier()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_updated INT := 0;
BEGIN
  WITH scored AS (
    SELECT
      m.id,
      CASE
        WHEN m.pinned THEN 'core'
        WHEN public.memory_relevance(m.id) >= 3.0 THEN 'core'
        WHEN public.memory_relevance(m.id) >= 1.5 THEN 'active'
        WHEN public.memory_relevance(m.id) >= 0.5 THEN 'warm'
        WHEN public.memory_relevance(m.id) >= 0.1 THEN 'cold'
        ELSE 'archive'
      END AS new_tier
    FROM public.agent_memories_v2 m
  )
  UPDATE public.agent_memories_v2 m
     SET memory_tier = s.new_tier
    FROM scored s
   WHERE m.id = s.id AND m.memory_tier <> s.new_tier;

  GET DIAGNOSTICS n_updated = ROW_COUNT;
  RETURN n_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_memory_tier() TO service_role;

-- 5) Materialized view: knowledge_graph_health (5 sub-scores 0-20 → total 0-100)
DROP MATERIALIZED VIEW IF EXISTS public.knowledge_graph_health CASCADE;
CREATE MATERIALIZED VIEW public.knowledge_graph_health AS
WITH
  ent AS (
    SELECT workspace_id, id, entity_type, updated_at, properties
      FROM public.knowledge_entities
     WHERE workspace_id IS NOT NULL
  ),
  rel AS (
    SELECT ke.workspace_id, kr.source_id, kr.target_id
      FROM public.knowledge_relations kr
      JOIN public.knowledge_entities ke ON ke.id = kr.source_id
     WHERE ke.workspace_id IS NOT NULL
  ),
  orphans AS (
    SELECT e.workspace_id,
           20.0 * (1.0 - COALESCE(
             (SELECT COUNT(*)::numeric FROM ent e2
                WHERE e2.workspace_id = e.workspace_id
                  AND NOT EXISTS (SELECT 1 FROM rel r
                                   WHERE r.workspace_id = e2.workspace_id
                                     AND (r.source_id = e2.id OR r.target_id = e2.id)))
             / NULLIF((SELECT COUNT(*) FROM ent e3 WHERE e3.workspace_id = e.workspace_id), 0),
             0
           )) AS orphans_score
      FROM ent e
     GROUP BY e.workspace_id
  ),
  broken AS (
    SELECT ke.workspace_id,
           20.0 * (1.0 - COALESCE(
             (SELECT COUNT(*)::numeric FROM public.knowledge_relations kr2
                JOIN public.knowledge_entities kes ON kes.id = kr2.source_id
               WHERE kes.workspace_id = ke.workspace_id
                 AND NOT EXISTS (SELECT 1 FROM public.knowledge_entities ket WHERE ket.id = kr2.target_id))
             / NULLIF(
               (SELECT COUNT(*) FROM public.knowledge_relations kr3
                  JOIN public.knowledge_entities kes3 ON kes3.id = kr3.source_id
                 WHERE kes3.workspace_id = ke.workspace_id),
               0
             ),
             0
           )) AS broken_links_score
      FROM ent ke
     GROUP BY ke.workspace_id
  ),
  freshness AS (
    SELECT workspace_id,
           20.0 * COALESCE(
             (COUNT(*) FILTER (WHERE updated_at >= now() - interval '90 days'))::numeric
             / NULLIF(COUNT(*), 0),
             0
           ) AS freshness_score
      FROM ent
     GROUP BY workspace_id
  ),
  coverage AS (
    SELECT workspace_id,
           20.0 * COALESCE(
             (COUNT(*) FILTER (WHERE entity_type IS NOT NULL
                                 AND entity_type <> ''
                                 AND properties ? 'tags'))::numeric
             / NULLIF(COUNT(*), 0),
             0
           ) AS coverage_score
      FROM ent
     GROUP BY workspace_id
  ),
  dedup AS (
    -- Heurística leve: quantos entities compartilham exatamente o mesmo nome+tipo no workspace
    SELECT workspace_id,
           20.0 * (1.0 - COALESCE(
             (SELECT COUNT(*)::numeric - COUNT(DISTINCT lower(name) || '::' || entity_type)::numeric
                FROM public.knowledge_entities e2
               WHERE e2.workspace_id = e.workspace_id)
             / NULLIF((SELECT COUNT(*) FROM public.knowledge_entities e3 WHERE e3.workspace_id = e.workspace_id), 0),
             0
           )) AS dedup_score
      FROM ent e
     GROUP BY e.workspace_id
  )
SELECT
  o.workspace_id,
  ROUND(o.orphans_score::numeric, 1)      AS orphans_score,
  ROUND(b.broken_links_score::numeric, 1) AS broken_links_score,
  ROUND(d.dedup_score::numeric, 1)        AS dedup_score,
  ROUND(f.freshness_score::numeric, 1)    AS freshness_score,
  ROUND(c.coverage_score::numeric, 1)     AS coverage_score,
  ROUND((o.orphans_score + b.broken_links_score + d.dedup_score + f.freshness_score + c.coverage_score)::numeric, 1) AS total_score,
  now() AS computed_at
FROM orphans o
JOIN broken   b USING (workspace_id)
JOIN dedup    d USING (workspace_id)
JOIN freshness f USING (workspace_id)
JOIN coverage c USING (workspace_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_graph_health_ws
  ON public.knowledge_graph_health (workspace_id);

REVOKE ALL ON public.knowledge_graph_health FROM PUBLIC;
GRANT SELECT ON public.knowledge_graph_health TO service_role;

-- 6) Wrapper view com filtro por workspace do usuário (RLS-friendly)
CREATE OR REPLACE VIEW public.knowledge_graph_health_v AS
SELECT h.*
  FROM public.knowledge_graph_health h
 WHERE EXISTS (
   SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = h.workspace_id
      AND wm.user_id = auth.uid()
 );

GRANT SELECT ON public.knowledge_graph_health_v TO authenticated;

-- 7) Função de refresh (chamada por pg_cron via SQL job separado)
CREATE OR REPLACE FUNCTION public.refresh_knowledge_graph_health()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.knowledge_graph_health
$$;

GRANT EXECUTE ON FUNCTION public.refresh_knowledge_graph_health() TO service_role;

COMMENT ON COLUMN public.agent_memories_v2.memory_tier IS 'Autograph tier: core/active/warm/cold/archive (recalc diário via recompute_memory_tier)';
COMMENT ON COLUMN public.agent_memories_v2.strength IS 'Ebbinghaus strength = 1 + ln(1 + access_count)';
COMMENT ON MATERIALIZED VIEW public.knowledge_graph_health IS 'Autograph-style graph health score 0-100 por workspace (refresh diário)';
