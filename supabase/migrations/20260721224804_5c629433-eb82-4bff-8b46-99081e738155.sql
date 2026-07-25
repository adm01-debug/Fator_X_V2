CREATE OR REPLACE FUNCTION public.get_embedding_coverage(_workspace_id uuid)
RETURNS TABLE(total bigint, embedded bigint, pct numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint AS total,
    count(*) FILTER (WHERE m.embedding IS NOT NULL)::bigint AS embedded,
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