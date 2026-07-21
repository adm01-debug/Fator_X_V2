
-- Overload de hybrid_memory_search com embedding (cosine similarity via pgvector).
-- Mantém a versão existente (sem embedding) para compatibilidade.
CREATE OR REPLACE FUNCTION public.hybrid_memory_search(
  p_agent_id uuid,
  p_query text,
  p_query_embedding extensions.vector,
  p_limit integer DEFAULT 5,
  p_tiers text[] DEFAULT ARRAY['core','active','warm']
)
RETURNS TABLE (
  id uuid,
  content text,
  memory_type text,
  memory_tier text,
  relevance numeric,
  text_rank real,
  cosine_similarity real,
  hybrid_score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      m.id,
      m.content,
      m.memory_type,
      m.memory_tier,
      public.memory_relevance(m.id) AS relevance,
      ts_rank_cd(
        to_tsvector('portuguese', coalesce(m.content, '')),
        plainto_tsquery('portuguese', p_query)
      ) AS text_rank,
      CASE
        WHEN m.embedding IS NULL THEN 0::real
        ELSE (1 - (m.embedding <=> p_query_embedding))::real
      END AS cosine_similarity
    FROM public.agent_memories_v2 m
    WHERE m.agent_id = p_agent_id
      AND m.memory_tier = ANY (p_tiers)
  )
  SELECT
    s.id,
    s.content,
    s.memory_type,
    s.memory_tier,
    s.relevance,
    s.text_rank,
    s.cosine_similarity,
    (
      0.5 * GREATEST(s.cosine_similarity, 0)::numeric
      + 0.3 * LEAST(s.text_rank, 1.0)::numeric
      + 0.2 * LEAST(s.relevance / 5.0, 1.0)
    ) AS hybrid_score
  FROM scored s
  ORDER BY hybrid_score DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.hybrid_memory_search(uuid, text, extensions.vector, integer, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hybrid_memory_search(uuid, text, extensions.vector, integer, text[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.hybrid_memory_search(uuid, text, extensions.vector, integer, text[]) IS
'Retrieval híbrido v2 — score = 0.5*cosine + 0.3*text + 0.2*ebbinghaus. Autograph Memory Layer.';
