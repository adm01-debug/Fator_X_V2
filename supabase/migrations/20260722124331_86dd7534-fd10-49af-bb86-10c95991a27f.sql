
CREATE OR REPLACE FUNCTION public.get_db_health_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_wal_bytes BIGINT;
  v_conn_used INT;
  v_conn_max INT;
  v_long_queries JSONB;
  v_bloated JSONB;
  v_slow_queries JSONB;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT COALESCE(SUM(size), 0) INTO v_wal_bytes
  FROM pg_ls_waldir();

  SELECT count(*) INTO v_conn_used FROM pg_stat_activity;
  SELECT setting::int INTO v_conn_max FROM pg_settings WHERE name='max_connections';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'pid', pid,
    'duration_sec', EXTRACT(EPOCH FROM (now() - query_start))::int,
    'state', state,
    'query_preview', LEFT(query, 200)
  )), '[]'::jsonb)
  INTO v_long_queries
  FROM pg_stat_activity
  WHERE state != 'idle'
    AND query_start < now() - interval '5 minutes'
    AND pid != pg_backend_pid();

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', schemaname || '.' || relname,
    'dead_tuples', n_dead_tup,
    'live_tuples', n_live_tup,
    'dead_ratio', ROUND((n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)) * 100, 1)
  )), '[]'::jsonb)
  INTO v_bloated
  FROM pg_stat_user_tables
  WHERE n_dead_tup > 1000
    AND (n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)) > 0.2
  ORDER BY n_dead_tup DESC
  LIMIT 20;

  BEGIN
    SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'mean_ms')::numeric DESC), '[]'::jsonb)
    INTO v_slow_queries
    FROM (
      SELECT jsonb_build_object(
        'mean_ms', ROUND(mean_exec_time::numeric, 1),
        'calls', calls,
        'total_sec', ROUND((total_exec_time/1000)::numeric, 1),
        'query_preview', LEFT(query, 200)
      ) AS row_data
      FROM extensions.pg_stat_statements
      WHERE query NOT ILIKE '%pg_stat_statements%'
        AND query NOT ILIKE '%pg_stat_activity%'
        AND calls > 5
      ORDER BY mean_exec_time DESC
      LIMIT 10
    ) sub;
  EXCEPTION WHEN OTHERS THEN
    v_slow_queries := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'captured_at', now(),
    'wal_bytes', v_wal_bytes,
    'connections_used', v_conn_used,
    'connections_max', v_conn_max,
    'connections_pct', ROUND((v_conn_used::numeric / v_conn_max) * 100, 1),
    'long_running_queries', v_long_queries,
    'bloated_tables', v_bloated,
    'slow_queries', v_slow_queries
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_db_health_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_db_health_snapshot() TO authenticated;
