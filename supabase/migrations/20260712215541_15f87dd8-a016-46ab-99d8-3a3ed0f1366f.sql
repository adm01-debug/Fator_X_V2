
CREATE OR REPLACE FUNCTION public.get_db_rollback_rate()
RETURNS TABLE(commits bigint, rollbacks bigint, rollback_rate_pct numeric, deadlocks bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    xact_commit::bigint AS commits,
    xact_rollback::bigint AS rollbacks,
    CASE WHEN (xact_commit + xact_rollback) > 0
         THEN ROUND((xact_rollback::numeric / (xact_commit + xact_rollback)) * 100, 4)
         ELSE 0 END AS rollback_rate_pct,
    deadlocks::bigint
  FROM pg_stat_database
  WHERE datname = current_database();
$$;

REVOKE ALL ON FUNCTION public.get_db_rollback_rate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_db_rollback_rate() TO authenticated, service_role;
