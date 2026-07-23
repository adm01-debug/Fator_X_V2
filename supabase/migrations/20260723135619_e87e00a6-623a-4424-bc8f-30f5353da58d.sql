
-- Hardening: revoke EXECUTE em SECURITY DEFINER functions internas
REVOKE EXECUTE ON FUNCTION public.collections_fill_workspace() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.explain_query_plan(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_ingestion_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_note_version() FROM PUBLIC, anon, authenticated;

-- Garantir que service_role mantém acesso (triggers/edge functions)
GRANT EXECUTE ON FUNCTION public.collections_fill_workspace() TO service_role;
GRANT EXECUTE ON FUNCTION public.explain_query_plan(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.log_ingestion_event() TO service_role;
GRANT EXECUTE ON FUNCTION public.snapshot_note_version() TO service_role;
