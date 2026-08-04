
CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM public, anon, authenticated;
GRANT USAGE ON SCHEMA internal TO service_role;

-- Recreate MV inside internal schema
DROP MATERIALIZED VIEW IF EXISTS public.agent_daily_metrics;

DROP MATERIALIZED VIEW IF EXISTS internal.agent_daily_metrics;

CREATE MATERIALIZED VIEW internal.agent_daily_metrics AS
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

CREATE UNIQUE INDEX IF NOT EXISTS agent_daily_metrics_pk
  ON internal.agent_daily_metrics (agent_id, day);
CREATE INDEX IF NOT EXISTS agent_daily_metrics_day_idx
  ON internal.agent_daily_metrics (day DESC);

GRANT SELECT ON internal.agent_daily_metrics TO service_role;

-- Public-facing security_invoker view; RLS on agent_traces still applies via the underlying MV owner (service_role),
-- so we filter here by workspace membership through agents table.
CREATE OR REPLACE VIEW public.agent_daily_metrics
WITH (security_invoker = true) AS
SELECT m.*
FROM internal.agent_daily_metrics m
WHERE EXISTS (
  SELECT 1
  FROM public.agents a
  WHERE a.id = m.agent_id
);

GRANT SELECT ON public.agent_daily_metrics TO authenticated, service_role;

-- Refresh function: revoke from all roles except service_role
CREATE OR REPLACE FUNCTION public.refresh_agent_daily_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY internal.agent_daily_metrics;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_agent_daily_metrics() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_agent_daily_metrics() TO service_role;
