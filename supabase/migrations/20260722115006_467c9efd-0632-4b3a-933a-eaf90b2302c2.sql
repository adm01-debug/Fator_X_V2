
ALTER TABLE public.slack_event_dedupe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_user_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role only dedupe" ON public.slack_event_dedupe;
CREATE POLICY "service_role only dedupe" ON public.slack_event_dedupe FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role only user_cache" ON public.slack_user_cache;
CREATE POLICY "service_role only user_cache" ON public.slack_user_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.slack_dispatch_dlq (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  alert_id UUID,
  payload JSONB NOT NULL,
  error TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slack_dlq_pending ON public.slack_dispatch_dlq(next_retry_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_slack_dlq_workspace ON public.slack_dispatch_dlq(workspace_id, created_at DESC);

GRANT SELECT ON public.slack_dispatch_dlq TO authenticated;
GRANT ALL ON public.slack_dispatch_dlq TO service_role;
ALTER TABLE public.slack_dispatch_dlq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members read dlq" ON public.slack_dispatch_dlq;
CREATE POLICY "workspace members read dlq" ON public.slack_dispatch_dlq FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "service_role manages dlq" ON public.slack_dispatch_dlq;
CREATE POLICY "service_role manages dlq" ON public.slack_dispatch_dlq FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW public.slack_dispatch_health AS
SELECT
  workspace_id,
  COALESCE(SUM((metadata->>'successes')::int), 0)::bigint AS successes,
  COALESCE(SUM((metadata->>'failures')::int), 0)::bigint AS failures,
  COUNT(*)::bigint AS total_dispatches,
  MAX(created_at) AS last_dispatch_at
FROM public.audit_events
WHERE event_type = 'slack_integration'
  AND action = 'alert_dispatched'
  AND created_at > now() - INTERVAL '24 hours'
GROUP BY workspace_id;

GRANT SELECT ON public.slack_dispatch_health TO authenticated;

CREATE OR REPLACE FUNCTION internal.slack_cleanup_dedupe()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
BEGIN
  DELETE FROM public.slack_event_dedupe WHERE expires_at < now();
  DELETE FROM public.slack_user_cache WHERE expires_at < now() - INTERVAL '7 days';
  DELETE FROM public.slack_dispatch_dlq
    WHERE resolved_at IS NOT NULL AND resolved_at < now() - INTERVAL '30 days';
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'slack-cleanup-dedupe') THEN
      PERFORM cron.unschedule('slack-cleanup-dedupe');
    END IF;
    PERFORM cron.schedule(
      'slack-cleanup-dedupe',
      '*/15 * * * *',
      $sql$ SELECT internal.slack_cleanup_dedupe(); $sql$
    );
  END IF;
END $$;
