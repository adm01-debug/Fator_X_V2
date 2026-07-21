ALTER TABLE public.agent_memories_v2
  ADD COLUMN IF NOT EXISTS embed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embed_last_error text,
  ADD COLUMN IF NOT EXISTS embed_last_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_agent_memories_v2_backfill_ready
  ON public.agent_memories_v2 (created_at)
  WHERE embedding IS NULL AND embed_attempts < 3;

DROP FUNCTION IF EXISTS public.get_embedding_coverage(uuid);

CREATE FUNCTION public.get_embedding_coverage(_workspace_id uuid)
RETURNS TABLE(total bigint, embedded bigint, dead_letter bigint, pct numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint AS total,
    count(*) FILTER (WHERE m.embedding IS NOT NULL)::bigint AS embedded,
    count(*) FILTER (WHERE m.embedding IS NULL AND m.embed_attempts >= 3)::bigint AS dead_letter,
    CASE WHEN count(*) = 0 THEN 0::numeric
         ELSE round((count(*) FILTER (WHERE m.embedding IS NOT NULL))::numeric * 100.0 / count(*)::numeric, 2)
    END AS pct
  FROM public.agent_memories_v2 m
  JOIN public.agents a ON a.id = m.agent_id
  JOIN public.workspace_members wm ON wm.workspace_id = a.workspace_id
  WHERE a.workspace_id = _workspace_id
    AND wm.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_embedding_coverage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_embedding_coverage(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_embedding_dead_letter(_workspace_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = auth.uid()
      AND role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.agent_memories_v2 m
  SET embed_attempts = 0, embed_last_error = NULL
  FROM public.agents a
  WHERE m.agent_id = a.id
    AND a.workspace_id = _workspace_id
    AND m.embedding IS NULL
    AND m.embed_attempts >= 3;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_embedding_dead_letter(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_embedding_dead_letter(uuid) TO authenticated;