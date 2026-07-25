ALTER VIEW public.llm_cost_by_caller SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.get_cron_job_health() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_db_rollback_rate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_rollback_rate_per_min(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_wal_generation_rate(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_cron_job_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_db_rollback_rate() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_rollback_rate_per_min(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_wal_generation_rate(integer) TO service_role;