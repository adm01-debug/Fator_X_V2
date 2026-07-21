
CREATE OR REPLACE FUNCTION public.hybrid_memory_search(
  p_agent_id UUID,
  p_query TEXT,
  p_limit INT DEFAULT 5,
  p_tiers TEXT[] DEFAULT ARRAY['core','active','warm']
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  memory_tier TEXT,
  relevance NUMERIC,
  text_rank REAL,
  hybrid_score NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('simple', COALESCE(p_query, '')) AS tsq
  )
  SELECT
    m.id,
    m.content,
    m.memory_type,
    m.memory_tier,
    public.memory_relevance(m.id) AS relevance,
    ts_rank(to_tsvector('simple', m.content), q.tsq) AS text_rank,
    (ts_rank(to_tsvector('simple', m.content), q.tsq)::NUMERIC * 0.6
     + public.memory_relevance(m.id) * 0.4) AS hybrid_score
  FROM public.agent_memories_v2 m, q
  WHERE (p_agent_id IS NULL OR m.agent_id = p_agent_id)
    AND m.memory_tier = ANY(p_tiers)
    AND (q.tsq = ''::tsquery OR to_tsvector('simple', m.content) @@ q.tsq)
  ORDER BY hybrid_score DESC
  LIMIT GREATEST(p_limit, 1)
$$;

REVOKE EXECUTE ON FUNCTION public.hybrid_memory_search(UUID, TEXT, INT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hybrid_memory_search(UUID, TEXT, INT, TEXT[]) TO authenticated, service_role;
