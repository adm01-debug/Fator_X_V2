-- Autorização por JOIN acopla o resultado à cardinalidade da tabela de
-- associação: hoje a UNIQUE(workspace_id, user_id) segura, mas se ela cair
-- as contagens dobram silenciosamente — um bug de dados, não de acesso, e
-- por isso difícil de perceber. EXISTS separa "posso ver?" de "quanto é?".
CREATE OR REPLACE FUNCTION public.get_embedding_coverage(_workspace_id uuid)
RETURNS TABLE(total bigint, embedded bigint, dead_letter bigint, pct numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    count(*)::bigint AS total,
    count(*) FILTER (WHERE m.embedding IS NOT NULL)::bigint AS embedded,
    count(*) FILTER (WHERE m.embedding IS NULL AND m.embed_attempts >= 3)::bigint AS dead_letter,
    CASE WHEN count(*) = 0 THEN 0::numeric
         ELSE round((count(*) FILTER (WHERE m.embedding IS NOT NULL))::numeric * 100.0 / count(*)::numeric, 2)
    END AS pct
  FROM public.agent_memories_v2 m
  JOIN public.agents a ON a.id = m.agent_id
  WHERE a.workspace_id = _workspace_id
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
       WHERE wm.workspace_id = _workspace_id
         AND wm.user_id = auth.uid()
    );
$function$;