
REVOKE EXECUTE ON FUNCTION public.prune_traces_retention(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_traces_retention(INT) TO service_role;
