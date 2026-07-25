
CREATE OR REPLACE FUNCTION public.touch_memory(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agent_memories_v2 m
     SET access_count = access_count + 1,
         last_accessed_at = now()
    FROM public.agents a
   WHERE m.id = p_id
     AND m.agent_id = a.id
     AND EXISTS (
       SELECT 1 FROM public.workspace_members wm
       WHERE wm.workspace_id = a.workspace_id
         AND wm.user_id = auth.uid()
     );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_memory(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_memory(uuid) TO authenticated, service_role;
