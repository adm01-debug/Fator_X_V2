
-- Convert agent_daily_metrics view to materialized view for O(1) reads
-- Refresh every 15 min via pg_cron; concurrent refresh keeps dashboard online.

DROP MATERIALIZED VIEW IF EXISTS public.agent_daily_metrics;

CREATE MATERIALIZED VIEW public.agent_daily_metrics AS
SELECT
  agent_id,
  date_trunc('day', created_at) AS day,
  count(*)::bigint AS executions,
  count(*) FILTER (WHERE level = 'error')::bigint AS errors,
  avg(latency_ms)::numeric(12,2) AS avg_latency_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric(12,2) AS p95_latency_ms,
  sum(tokens_used)::bigint AS total_tokens,
  sum(cost_usd)::numeric(14,6) AS total_cost_usd
FROM public.agent_traces
WHERE created_at > (now() - interval '90 days')
GROUP BY agent_id, date_trunc('day', created_at);

-- Unique index enables REFRESH CONCURRENTLY (no read lock)
CREATE UNIQUE INDEX IF NOT EXISTS agent_daily_metrics_pk
  ON public.agent_daily_metrics (agent_id, day);

CREATE INDEX IF NOT EXISTS agent_daily_metrics_day_idx
  ON public.agent_daily_metrics (day DESC);

GRANT SELECT ON public.agent_daily_metrics TO authenticated, service_role;

-- Refresh function (SECURITY DEFINER so cron job runs it safely)
CREATE OR REPLACE FUNCTION public.refresh_agent_daily_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.agent_daily_metrics;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_agent_daily_metrics() FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_agent_daily_metrics() TO service_role;

-- Schedule refresh every 15 minutes (idempotent unschedule/schedule)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('refresh-agent-daily-metrics')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'refresh-agent-daily-metrics'
      );
    PERFORM cron.schedule(
      'refresh-agent-daily-metrics',
      '*/15 * * * *',
      $cron$SELECT public.refresh_agent_daily_metrics();$cron$
    );
  END IF;
END $$;
