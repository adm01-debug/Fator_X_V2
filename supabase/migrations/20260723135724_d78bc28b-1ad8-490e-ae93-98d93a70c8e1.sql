
-- Server-only helpers: chamadas apenas por Edge Functions (service_role) ou triggers
REVOKE EXECUTE ON FUNCTION public.is_workspace_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hybrid_memory_search(uuid, text, extensions.vector, integer, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hybrid_memory_search(uuid, text, integer, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hybrid_memory_search_notebook(text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_memory(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.memory_relevance(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.hybrid_memory_search(uuid, text, extensions.vector, integer, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.hybrid_memory_search(uuid, text, integer, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.hybrid_memory_search_notebook(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_memory(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.memory_relevance(uuid) TO service_role;
