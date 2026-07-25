CREATE OR REPLACE VIEW public.agent_daily_metrics
WITH (security_invoker = true) AS
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

GRANT SELECT ON public.agent_daily_metrics TO authenticated;
GRANT SELECT ON public.agent_daily_metrics TO service_role;

COMMENT ON VIEW public.agent_daily_metrics IS
  'WAVE 4: Rollup diário de execuções, latência (avg/p95), tokens e custo por agente (últimos 90 dias). RLS herdado via security_invoker.';