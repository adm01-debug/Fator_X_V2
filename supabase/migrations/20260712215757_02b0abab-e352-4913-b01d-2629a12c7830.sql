
CREATE OR REPLACE VIEW public.llm_cost_by_caller AS
SELECT
  ur.workspace_id,
  COALESCE(NULLIF(ur.metadata->>'caller',''), 'external') AS caller,
  COALESCE(ur.metadata->>'provider', 'unknown') AS provider,
  COALESCE(ur.metadata->>'model', 'unknown') AS model,
  date_trunc('day', ur.created_at) AS day,
  COUNT(*) AS calls,
  SUM(ur.tokens)::bigint AS tokens,
  SUM(ur.cost_usd)::numeric(14,6) AS cost_usd
FROM public.usage_records ur
WHERE ur.record_type = 'llm_call'
GROUP BY 1,2,3,4,5;

GRANT SELECT ON public.llm_cost_by_caller TO authenticated;
GRANT SELECT ON public.llm_cost_by_caller TO service_role;

CREATE INDEX IF NOT EXISTS usage_records_caller_idx
  ON public.usage_records ((metadata->>'caller'))
  WHERE record_type = 'llm_call';
