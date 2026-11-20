-- Reconciliacao do schema documental com o contrato definido pelas migrations
-- registradas como aplicadas mas que nao efetivaram no banco de producao:
--   - 20260722161523 (document_ingestions completa + storage policies)
--   - 20260401103519 (collections/documents/chunks completos)
--   - 20260722172153 (chunk_* + parsed_text + chunk_version/is_active)
--   - 20260722172520 (content_hash + deduped_from + uniq index)
--   - 20260722172758 (status cancelled + cancel_requested + events table/triggers)
-- Idempotente: reexecutavel sem erro. Nao altera policies RLS existentes.

-- ── collections ──────────────────────────────────────────────────────
ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS knowledge_base_id UUID REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ── documents ───────────────────────────────────────────────────────
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES public.collections(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT
    ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS parsed_text TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS chunk_size INT DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS chunk_overlap INT DEFAULT 200,
  ADD COLUMN IF NOT EXISTS chunk_strategy TEXT DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS chunk_version INT DEFAULT 1;

-- constraint de status (docs)
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_status_check
  CHECK (status IN ('pending','processing','indexed','failed'));

-- check de chunk opts
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

-- ── document_ingestions ───────────────────────────────────────────────
ALTER TABLE public.document_ingestions
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS filename TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mime TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pages INTEGER,
  ADD COLUMN IF NOT EXISTS extraction_method TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS deduped_from UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT FALSE;

-- constraint status com 'cancelled' (01172758)
ALTER TABLE public.document_ingestions
  DROP CONSTRAINT IF EXISTS document_ingestions_status_check;
ALTER TABLE public.document_ingestions
  ADD CONSTRAINT document_ingestions_status_check
  CHECK (status IN ('pending','uploading','parsing','ocr','chunking','embedding','ready','error','cancelled'));

ALTER TABLE public.document_ingestions
  DROP CONSTRAINT IF EXISTS document_ingestions_extraction_method_check;
ALTER TABLE public.document_ingestions
  ADD CONSTRAINT document_ingestions_extraction_method_check
  CHECK (extraction_method IN ('text','ocr','hybrid','docx'));

-- ── chunks ───────────────────────────────────────────────────────────
ALTER TABLE public.chunks
  ADD COLUMN IF NOT EXISTS chunk_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ── indices ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_doc_ingestions_user ON public.document_ingestions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_ingestions_collection ON public.document_ingestions(collection_id);
CREATE INDEX IF NOT EXISTS idx_chunks_active_doc ON public.chunks(document_id, chunk_version) WHERE is_active;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_documents_collection_hash ON public.documents(collection_id, content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON public.documents(content_hash) WHERE content_hash IS NOT NULL;

-- ── grants / trigger de updated_at (document_ingestions) ─────────────
CREATE OR REPLACE FUNCTION public.touch_document_ingestions() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_document_ingestions ON public.document_ingestions;
CREATE TRIGGER trg_touch_document_ingestions
  BEFORE UPDATE ON public.document_ingestions
  FOR EACH ROW EXECUTE FUNCTION public.touch_document_ingestions();

-- ── tabela de eventos + trigger de log (01172758) ────────────────────
CREATE TABLE IF NOT EXISTS public.document_ingestion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_id UUID NOT NULL REFERENCES public.document_ingestions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ingestion_events_ingestion ON public.document_ingestion_events(ingestion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_events_user ON public.document_ingestion_events(user_id, created_at DESC);

GRANT SELECT ON public.document_ingestion_events TO authenticated;
GRANT ALL ON public.document_ingestion_events TO service_role;

ALTER TABLE public.document_ingestion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_ingestion_events" ON public.document_ingestion_events;
CREATE POLICY "users_read_own_ingestion_events"
  ON public.document_ingestion_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_ingestion_event() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.progress_pct IS DISTINCT FROM OLD.progress_pct
     OR NEW.error_message IS DISTINCT FROM OLD.error_message THEN
    INSERT INTO public.document_ingestion_events
      (ingestion_id, user_id, status, progress_pct, message, metadata)
    VALUES (
      NEW.id, NEW.user_id, NEW.status, COALESCE(NEW.progress_pct, 0), NEW.error_message,
      jsonb_build_object('extraction_method', NEW.extraction_method, 'pages', NEW.pages, 'cancel_requested', NEW.cancel_requested)
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_log_ingestion_event_ins ON public.document_ingestions;
CREATE TRIGGER trg_log_ingestion_event_ins
  AFTER INSERT ON public.document_ingestions FOR EACH ROW EXECUTE FUNCTION public.log_ingestion_event();

DROP TRIGGER IF EXISTS trg_log_ingestion_event_upd ON public.document_ingestions;
CREATE TRIGGER trg_log_ingestion_event_upd
  AFTER UPDATE ON public.document_ingestions FOR EACH ROW EXECUTE FUNCTION public.log_ingestion_event();

-- ── grants (document_ingestions) ───────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_ingestions TO authenticated;
GRANT ALL ON public.document_ingestions TO service_role;

-- realtime
-- realtime: ALTER PUBLICATION ADD TABLE IF NOT EXISTS é inválido no PG 17;
-- usa bloco DO para adicionar apenas se não estiver presente.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='document_ingestion_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.document_ingestion_events;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='document_ingestions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.document_ingestions;
  END IF;
END $do$;
