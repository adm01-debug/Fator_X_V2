
-- Revoke anon nas funções (mantém authenticated/service_role)
REVOKE EXECUTE ON FUNCTION public.memory_relevance(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_memory(UUID) FROM PUBLIC;

-- Funções admin: só service_role
REVOKE EXECUTE ON FUNCTION public.recompute_memory_tier() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_knowledge_graph_health() FROM PUBLIC, authenticated;

-- MV: revoga acesso via Data API
DROP VIEW IF EXISTS public.knowledge_graph_health_v;
REVOKE ALL ON public.knowledge_graph_health FROM PUBLIC, anon, authenticated;

-- Wrapper como função SECURITY INVOKER-safe: SECURITY DEFINER escopado por workspace
CREATE OR REPLACE FUNCTION public.get_knowledge_graph_health(p_workspace_id UUID)
RETURNS TABLE (
  workspace_id UUID,
  orphans_score NUMERIC,
  broken_links_score NUMERIC,
  dedup_score NUMERIC,
  freshness_score NUMERIC,
  coverage_score NUMERIC,
  total_score NUMERIC,
  computed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.workspace_id, h.orphans_score, h.broken_links_score, h.dedup_score,
         h.freshness_score, h.coverage_score, h.total_score, h.computed_at
    FROM public.knowledge_graph_health h
   WHERE h.workspace_id = p_workspace_id
     AND EXISTS (
       SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = p_workspace_id
          AND wm.user_id = auth.uid()
     )
$$;

REVOKE EXECUTE ON FUNCTION public.get_knowledge_graph_health(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_knowledge_graph_health(UUID) TO authenticated, service_role;
