
-- 1) allow 'cancelled' status
ALTER TABLE public.document_ingestions
  DROP CONSTRAINT IF EXISTS document_ingestions_status_check;
ALTER TABLE public.document_ingestions
  ADD CONSTRAINT document_ingestions_status_check
  CHECK (status = ANY (ARRAY[
    'pending','uploading','parsing','ocr','chunking','embedding','ready','error','cancelled'
  ]));

ALTER TABLE public.document_ingestions
  ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) history table
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
CREATE INDEX IF NOT EXISTS idx_ingestion_events_ingestion
  ON public.document_ingestion_events (ingestion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_events_user
  ON public.document_ingestion_events (user_id, created_at DESC);

GRANT SELECT ON public.document_ingestion_events TO authenticated;
GRANT ALL ON public.document_ingestion_events TO service_role;

ALTER TABLE public.document_ingestion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_ingestion_events" ON public.document_ingestion_events;
CREATE POLICY "users_read_own_ingestion_events"
  ON public.document_ingestion_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 3) trigger to log every status/progress transition
CREATE OR REPLACE FUNCTION public.log_ingestion_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.progress_pct IS DISTINCT FROM OLD.progress_pct
     OR NEW.error_message IS DISTINCT FROM OLD.error_message THEN
    INSERT INTO public.document_ingestion_events
      (ingestion_id, user_id, status, progress_pct, message, metadata)
    VALUES (
      NEW.id,
      NEW.user_id,
      NEW.status,
      COALESCE(NEW.progress_pct, 0),
      NEW.error_message,
      jsonb_build_object(
        'extraction_method', NEW.extraction_method,
        'pages', NEW.pages,
        'cancel_requested', NEW.cancel_requested
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_ingestion_event_ins ON public.document_ingestions;
CREATE TRIGGER trg_log_ingestion_event_ins
  AFTER INSERT ON public.document_ingestions
  FOR EACH ROW EXECUTE FUNCTION public.log_ingestion_event();

DROP TRIGGER IF EXISTS trg_log_ingestion_event_upd ON public.document_ingestions;
CREATE TRIGGER trg_log_ingestion_event_upd
  AFTER UPDATE ON public.document_ingestions
  FOR EACH ROW EXECUTE FUNCTION public.log_ingestion_event();

-- 4) realtime for events
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_ingestion_events;
