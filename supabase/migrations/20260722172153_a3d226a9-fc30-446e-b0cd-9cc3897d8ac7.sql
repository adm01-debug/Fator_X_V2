
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS chunk_size INT NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS chunk_overlap INT NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS chunk_strategy TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS chunk_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parsed_text TEXT;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_chunk_strategy_check;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_chunk_strategy_check
  CHECK (chunk_strategy IN ('fixed','paragraph','sentence'));

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_chunk_size_check;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_chunk_size_check
  CHECK (chunk_size BETWEEN 200 AND 4000 AND chunk_overlap >= 0 AND chunk_overlap < chunk_size);

ALTER TABLE public.chunks
  ADD COLUMN IF NOT EXISTS chunk_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_chunks_active_doc
  ON public.chunks (document_id, chunk_version) WHERE is_active;
