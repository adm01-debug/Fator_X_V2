-- Add user_id to agents stub if missing.
-- The schema_baseline (20260330000001) was deployed to preview branches before
-- this column was added. This migration is a no-op on production (column exists)
-- but repairs preview/CI databases so migration 20260331110518 (workspace backfill)
-- can reference a.user_id without error.
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS user_id UUID;
