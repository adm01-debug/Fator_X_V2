-- agent_versions was created by 20260402100000 without name/persona/mission columns.
-- 20260403112635 tried to add them via CREATE TABLE IF NOT EXISTS but was skipped.
-- Add the missing columns so subsequent INSERTs can reference them.
ALTER TABLE public.agent_versions
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS persona TEXT,
  ADD COLUMN IF NOT EXISTS mission TEXT,
  ADD COLUMN IF NOT EXISTS system_prompt TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'development',
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;
