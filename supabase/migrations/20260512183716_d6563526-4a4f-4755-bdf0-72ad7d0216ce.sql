-- Add context tier columns to chunks
ALTER TABLE public.chunks 
ADD COLUMN IF NOT EXISTS l0_abstract TEXT,
ADD COLUMN IF NOT EXISTS l1_overview TEXT;

-- Simple search function for L0 (can be improved with semantic search if needed)
CREATE OR REPLACE FUNCTION public.search_context_l0(
  p_query TEXT,
  p_collection_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  collection_id UUID,
  l0_abstract TEXT,
  l1_overview TEXT,
  l2_content TEXT,
  token_count INTEGER,
  relevance_score FLOAT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.document_id,
    (c.metadata->>'collection_id')::UUID,
    COALESCE(c.l0_abstract, substring(c.content, 1, 200)),
    COALESCE(c.l1_overview, substring(c.content, 1, 2000)),
    c.content,
    c.token_count,
    ts_rank_cd(to_tsvector('portuguese', c.content), plainto_tsquery('portuguese', p_query))::FLOAT as rank
  FROM public.chunks c
  WHERE (p_collection_id IS NULL OR (c.metadata->>'collection_id')::UUID = p_collection_id)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$;
