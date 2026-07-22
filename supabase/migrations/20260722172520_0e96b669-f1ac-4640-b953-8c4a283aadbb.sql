
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE public.document_ingestions
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS deduped_from UUID REFERENCES public.documents(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_documents_collection_hash
  ON public.documents (collection_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_content_hash
  ON public.documents (content_hash) WHERE content_hash IS NOT NULL;
