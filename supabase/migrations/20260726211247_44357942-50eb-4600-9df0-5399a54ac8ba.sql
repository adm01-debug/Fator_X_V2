-- ═══════════════════════════════════════════════════════════════════════════
-- Busca vetorial para chunks: coluna, proveniência de modelo, índices e RPC.
--
-- Contexto: `semantic-search` chamava `match_documents`, que nunca existiu,
-- porque não havia coluna vetorial em `chunks`. O circuit breaker mascarava a
-- ausência e a busca degradava silenciosamente para ILIKE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Coluna vetorial + proveniência ──────────────────────────────────────
-- 1536 dims: casa com a coluna já existente em agent_memories_v2, mantendo uma
-- única dimensão canônica no sistema inteiro. Abaixo de 2000, logo indexável
-- por HNSW (o limite do pgvector para índices).
ALTER TABLE public.chunks
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

-- Proveniência do modelo é requisito de CORREÇÃO, não metadado opcional:
-- a distância cosseno entre vetores de modelos diferentes é ruído. Sem esta
-- coluna não há como impedir a comparação cruzada.
COMMENT ON COLUMN public.chunks.embedding_model IS
  'Modelo que gerou o embedding. Comparar vetores de modelos distintos produz resultado sem significado; match_documents filtra por este campo.';

-- Coerência: ou os três campos estão preenchidos, ou nenhum está.
-- Trigger em vez de CHECK não é necessário aqui — a regra é imutável.
ALTER TABLE public.chunks
  DROP CONSTRAINT IF EXISTS chunks_embedding_provenance_ck;
ALTER TABLE public.chunks
  ADD CONSTRAINT chunks_embedding_provenance_ck CHECK (
    (embedding IS NULL AND embedding_model IS NULL AND embedded_at IS NULL)
    OR (embedding IS NOT NULL AND embedding_model IS NOT NULL AND embedded_at IS NOT NULL)
  );

ALTER TABLE public.agent_memories_v2
  ADD COLUMN IF NOT EXISTS embedding_model text;

-- ── 2. Índices HNSW ────────────────────────────────────────────────────────
-- Parciais: a maioria das linhas fica sem embedding por longos períodos
-- (o backfill é assíncrono) e indexar NULL só desperdiça espaço.
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
  ON public.chunks USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_memories_v2_embedding_hnsw
  ON public.agent_memories_v2 USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- Fila do backfill de chunks: mesmo padrão já usado em agent_memories_v2.
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_pending
  ON public.chunks (created_at)
  WHERE embedding IS NULL AND is_active = true;

-- ── 3. RPC match_documents ─────────────────────────────────────────────────
-- SECURITY INVOKER de propósito: a RLS de `chunks` já resolve o isolamento por
-- workspace via documents → collections → knowledge_bases. Um SECURITY DEFINER
-- aqui reintroduziria o risco de IDOR que já corrigimos em touch_memory.
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding extensions.vector(1536),
  match_threshold double precision DEFAULT 0.4,
  match_count integer DEFAULT 10,
  p_knowledge_base_id uuid DEFAULT NULL,
  p_embedding_model text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT
    c.id,
    c.document_id,
    c.content,
    -- Operador <=> devolve distância cosseno em [0,2]; similaridade é o
    -- complemento. Calculada uma vez e reaproveitada no filtro via subquery
    -- externa seria mais limpo, mas o planner já elimina a duplicação.
    1 - (c.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity
  FROM public.chunks c
  JOIN public.documents d ON d.id = c.document_id
  JOIN public.collections col ON col.id = d.collection_id
  WHERE c.embedding IS NOT NULL
    AND c.is_active = true
    -- Comparar entre modelos diferentes é ruído: quando o chamador informa o
    -- modelo da consulta, só trechos do mesmo modelo entram no resultado.
    AND (p_embedding_model IS NULL OR c.embedding_model = p_embedding_model)
    AND (p_knowledge_base_id IS NULL OR col.knowledge_base_id = p_knowledge_base_id)
    AND 1 - (c.embedding OPERATOR(extensions.<=>) query_embedding) > match_threshold
  ORDER BY c.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 100);
$$;

COMMENT ON FUNCTION public.match_documents IS
  'Busca por similaridade em chunks. SECURITY INVOKER: o isolamento por workspace vem da RLS de chunks/documents/collections.';

REVOKE ALL ON FUNCTION public.match_documents(extensions.vector, double precision, integer, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_documents(extensions.vector, double precision, integer, uuid, text) TO authenticated, service_role;

-- ── 4. Cobertura de embeddings de chunks (observabilidade) ─────────────────
CREATE OR REPLACE FUNCTION public.get_chunk_embedding_coverage(_workspace_id uuid)
RETURNS TABLE (
  total_chunks bigint,
  embedded_chunks bigint,
  pending_chunks bigint,
  coverage_pct numeric,
  distinct_models bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint,
    count(c.embedding)::bigint,
    (count(*) - count(c.embedding))::bigint,
    CASE WHEN count(*) = 0 THEN 0
         ELSE round((count(c.embedding)::numeric / count(*)::numeric) * 100, 2)
    END,
    count(DISTINCT c.embedding_model)::bigint
  FROM public.chunks c
  JOIN public.documents d ON d.id = c.document_id
  JOIN public.collections col ON col.id = d.collection_id
  JOIN public.knowledge_bases kb ON kb.id = col.knowledge_base_id
  WHERE kb.workspace_id = _workspace_id
    AND c.is_active = true;
$$;

REVOKE ALL ON FUNCTION public.get_chunk_embedding_coverage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chunk_embedding_coverage(uuid) TO authenticated, service_role;