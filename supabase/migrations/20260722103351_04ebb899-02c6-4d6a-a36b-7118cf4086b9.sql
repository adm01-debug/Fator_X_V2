
-- Blindagem SECURITY DEFINER — remove anon universal, restringe callbacks internos ao service_role.

-- 1) Funções chamadas pelo frontend autenticado (mantêm authenticated, removem anon)
REVOKE EXECUTE ON FUNCTION public.get_embedding_coverage(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_knowledge_graph_health(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hybrid_memory_search(uuid, text, integer, text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hybrid_memory_search(uuid, text, extensions.vector, integer, text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_embedding_dead_letter(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_memory(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.memory_relevance(uuid) FROM anon, PUBLIC;

-- 2) is_workspace_admin: usado por policies RLS. Deve rodar como authenticated (via RLS) e service_role,
--    nunca anon/public.
REVOKE EXECUTE ON FUNCTION public.is_workspace_admin(uuid) FROM anon, PUBLIC;

-- 3) Funções internas (triggers/cron/refresh) — só service_role e postgres devem invocar
REVOKE EXECUTE ON FUNCTION public.recompute_memory_tier() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_knowledge_graph_health() FROM anon, authenticated, PUBLIC;

-- Garantir service_role em todas
GRANT EXECUTE ON FUNCTION public.get_embedding_coverage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_knowledge_graph_health(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.hybrid_memory_search(uuid, text, integer, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.hybrid_memory_search(uuid, text, extensions.vector, integer, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_embedding_dead_letter(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_memory(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.memory_relevance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_memory_tier() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_knowledge_graph_health() TO service_role;
