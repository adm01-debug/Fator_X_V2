-- Drop the legacy hybrid_search overload (vector(1536), 6 params) introduced in
-- 20260402100000_advanced_features.sql. The canonical overload is the RAG version
-- from 20260405000004_rag_hybrid_search.sql which uses vector(1024) / 5 params.
-- Having two overloads with incompatible signatures creates ambiguity for callers.
DROP FUNCTION IF EXISTS public.hybrid_search(
  TEXT,
  extensions.vector(1536),
  INT,
  FLOAT,
  FLOAT,
  UUID
);
