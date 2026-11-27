-- ============================================================
-- Busca hibrida escopada ao notebook (super-cerebro)
--
-- Estado anterior:
--   * `hybrid_memory_search_notebook` e SECURITY DEFINER e NAO aplica isolamento
--     de workspace: filtra apenas `chunks.metadata->>'collection_id'` (coluna
--     `metadata` nem existe no schema real — ver comentario em
--     cerebro-query/index.ts:141). Resultado: retornava chunks de qualquer tenant.
--   * Nenhuma busca textual ou vetorial escopada por notebook era exposta na UI:
--     o `SearchTab` dependia so do LLM e, se ele nao respondesse, a busca ficava vazia.
--
-- Este arquivo:
--   1. Corrige `hybrid_memory_search_notebook` (mesma assinatura, zero quebra de
--      contrato) para escopar por knowledge_base_id e por get_user_workspace_ids.
--   2. Cria `hybrid_search_notebook`, busca hibrida RRF (BM25 + vetor com
--      embedding pre-computado no cliente via rag-embed-v2), tambem escopada e
--      concedida a `authenticated`.
-- ============================================================

-- 1. Correcao do isolamento da funcao existente
CREATE OR REPLACE FUNCTION public.hybrid_memory_search_notebook(
  p_query text,
  p_notebook_id uuid,
  p_limit int DEFAULT 15
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  score float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT c.id, c.document_id, c.content, c.metadata,
         ts_rank(to_tsvector('portuguese', c.content),
                 plainto_tsquery('portuguese', p_query))::float AS score
  FROM public.chunks c
  JOIN public.documents d ON d.id = c.document_id
  JOIN public.collections col ON col.id = d.collection_id
  JOIN public.knowledge_bases kb ON kb.id = col.knowledge_base_id
  WHERE c.embedding_status = 'done'
    -- notebook = knowledge base dona dos chunks (mesmo mapeamento do cerebro-query)
    AND (p_notebook_id IS NULL OR col.knowledge_base_id = p_notebook_id)
    -- isolamento multi-tenant: o chamador so enxerga bases do proprio workspace
    AND kb.workspace_id IN (
      SELECT public.get_user_workspace_ids(auth.uid())
    )
    AND to_tsvector('portuguese', c.content)
        @@ plainto_tsquery('portuguese', p_query)
  ORDER BY score DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.hybrid_memory_search_notebook(text, uuid, int) IS
  'Busca textual escopada a um notebook (knowledge base) e ao workspace do chamador.';

REVOKE ALL ON FUNCTION public.hybrid_memory_search_notebook(text, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hybrid_memory_search_notebook(text, uuid, int) TO authenticated, service_role;

-- 2. Busca hibrida RRF escopada ao notebook
CREATE OR REPLACE FUNCTION public.hybrid_search_notebook(
  p_query text,
  p_notebook_id uuid,
  p_query_embedding extensions.vector(1024) DEFAULT NULL,
  p_limit int DEFAULT 15
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  content text,
  bm25_score float,
  vector_score float,
  rrf_score float,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH k AS (SELECT 60::float AS rrf_k),
  allowed AS (
    SELECT col.id AS collection_id, col.knowledge_base_id
    FROM public.collections col
    JOIN public.knowledge_bases kb ON kb.id = col.knowledge_base_id
    WHERE kb.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
      AND (p_notebook_id IS NULL OR col.knowledge_base_id = p_notebook_id)
  ),
  bm25 AS (
    SELECT c.id AS chunk_id, c.document_id, c.content, c.metadata,
           ts_rank(to_tsvector('portuguese', c.content),
                   plainto_tsquery('portuguese', p_query))::float AS score,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank(to_tsvector('portuguese', c.content),
                              plainto_tsquery('portuguese', p_query)) DESC
           ) AS rn
    FROM public.chunks c
    JOIN public.documents d ON d.id = c.document_id
    JOIN allowed a ON a.collection_id = d.collection_id
    WHERE c.embedding_status = 'done'
      AND to_tsvector('portuguese', c.content)
          @@ plainto_tsquery('portuguese', p_query)
    LIMIT p_limit * 5
  ),
  sem AS (
    SELECT c.id AS chunk_id, c.document_id, c.content, c.metadata,
           (1 - (c.embedding <=> p_query_embedding))::float AS score,
           ROW_NUMBER() OVER (ORDER BY c.embedding <=> p_query_embedding) AS rn
    FROM public.chunks c
    JOIN public.documents d ON d.id = c.document_id
    JOIN allowed a ON a.collection_id = d.collection_id
    WHERE p_query_embedding IS NOT NULL
      AND c.embedding IS NOT NULL
      AND c.embedding_status = 'done'
    LIMIT p_limit * 5
  ),
  fused AS (
    SELECT
      COALESCE(b.chunk_id, s.chunk_id) AS chunk_id,
      COALESCE(b.document_id, s.document_id) AS document_id,
      COALESCE(b.content, s.content) AS content,
      COALESCE(b.metadata, s.metadata) AS metadata,
      COALESCE(b.score, 0)::float AS bm25_score,
      COALESCE(s.score, 0)::float AS vector_score,
      (
        COALESCE(1.0 / (k.rrf_k + b.rn), 0)
        + COALESCE(1.0 / (k.rrf_k + s.rn), 0)
      )::float AS rrf_score
    FROM bm25 b
    FULL OUTER JOIN sem s ON s.chunk_id = b.chunk_id
    CROSS JOIN k
  )
  SELECT f.chunk_id, f.document_id, d.title, f.content,
         f.bm25_score, f.vector_score, f.rrf_score, f.metadata
  FROM fused f
  LEFT JOIN public.documents d ON d.id = f.document_id
  ORDER BY f.rrf_score DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.hybrid_search_notebook(text, uuid, extensions.vector, int) IS
  'Busca hibrida (BM25 + vetor, RRF) escopada a um notebook e ao workspace do chamador.';

REVOKE ALL ON FUNCTION public.hybrid_search_notebook(text, uuid, extensions.vector, int)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hybrid_search_notebook(text, uuid, extensions.vector, int)
  TO authenticated, service_role;