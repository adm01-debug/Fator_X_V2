
-- Tabela de rastreio de ingestão de documentos
CREATE TABLE public.document_ingestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  pages INTEGER,
  extraction_method TEXT CHECK (extraction_method IN ('text','ocr','hybrid','docx')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','uploading','parsing','ocr','chunking','embedding','ready','error')),
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  storage_path TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_ingestions_user ON public.document_ingestions(user_id, created_at DESC);
CREATE INDEX idx_doc_ingestions_collection ON public.document_ingestions(collection_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_ingestions TO authenticated;
GRANT ALL ON public.document_ingestions TO service_role;

ALTER TABLE public.document_ingestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own ingestions"
  ON public.document_ingestions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_document_ingestions()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_touch_document_ingestions
  BEFORE UPDATE ON public.document_ingestions
  FOR EACH ROW EXECUTE FUNCTION public.touch_document_ingestions();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_ingestions;

-- Storage policies para o bucket knowledge-uploads (path: {user_id}/{document_id}/{filename})
CREATE POLICY "Users read own knowledge uploads"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'knowledge-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users upload own knowledge uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own knowledge uploads"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'knowledge-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
