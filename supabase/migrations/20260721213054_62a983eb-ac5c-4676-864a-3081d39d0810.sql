
DROP VIEW IF EXISTS public.knowledge_graph_health_v;

CREATE VIEW public.knowledge_graph_health_v
WITH (security_invoker = on) AS
SELECT h.*
  FROM public.knowledge_graph_health h
 WHERE EXISTS (
   SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = h.workspace_id
      AND wm.user_id = auth.uid()
 );

GRANT SELECT ON public.knowledge_graph_health_v TO authenticated;
-- Necessário para a view invoker enxergar a MV como quem consulta:
GRANT SELECT ON public.knowledge_graph_health TO authenticated;
