-- agent_usage was created as a stub (id, agent_id, user_id, date only).
-- 20260421183536 INSERTs with requests, tokens_input, tokens_output,
-- total_cost_usd, avg_latency_ms, error_count and uses ON CONFLICT (agent_id, date).
-- Add all missing columns and the required unique index.
ALTER TABLE public.agent_usage
  ADD COLUMN IF NOT EXISTS requests INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_input INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_output INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost_usd NUMERIC(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_latency_ms INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0;

-- ON CONFLICT (agent_id, date) in the data migration requires a unique constraint
-- on exactly (agent_id, date). The existing constraint is on (agent_id, user_id, date)
-- which doesn't satisfy the ON CONFLICT clause.
CREATE UNIQUE INDEX IF NOT EXISTS agent_usage_agent_date_unique
  ON public.agent_usage (agent_id, date);
