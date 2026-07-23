
REVOKE EXECUTE ON FUNCTION public.get_slow_query_alerts_history(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_slow_query_alerts_history(integer) TO authenticated, service_role;
