ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS source TEXT;
UPDATE public.webhook_events SET source = 'legacy' WHERE source IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_source_ext
  ON public.webhook_events (source, external_event_id)
  WHERE source IS NOT NULL AND external_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_events_source_created
  ON public.webhook_events (source, created_at DESC)
  WHERE source IS NOT NULL;