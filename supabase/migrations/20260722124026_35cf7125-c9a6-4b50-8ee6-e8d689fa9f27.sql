
CREATE OR REPLACE FUNCTION public.get_db_health_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_wal_bytes bigint;
  v_conn_used int;
  v_conn_max int;
  v_long_queries jsonb;
  v_bloat jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id = v_uid AND wm.role IN ('owner','admin')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0')::bigint INTO v_wal_bytes;
  SELECT count(*)::int INTO v_conn_used FROM pg_stat_activity;
  SELECT setting::int INTO v_conn_max FROM pg_settings WHERE name = 'max_connections';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'pid', pid,
    'duration_sec', extract(epoch FROM (now() - query_start))::int,
    'state', state,
    'query_preview', left(query, 200)
  )), '[]'::jsonb)
  INTO v_long_queries
  FROM pg_stat_activity
  WHERE state = 'active'
    AND now() - query_start > interval '5 minutes'
    AND query NOT ILIKE '%pg_stat_activity%';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', schemaname || '.' || relname,
    'dead_tuples', n_dead_tup,
    'live_tuples', n_live_tup,
    'dead_ratio', ROUND((n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)) * 100, 2)
  )), '[]'::jsonb)
  INTO v_bloat
  FROM pg_stat_user_tables
  WHERE n_dead_tup > 10000
    AND (n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)) > 0.20
  ORDER BY 1
  LIMIT 10;

  RETURN jsonb_build_object(
    'captured_at', now(),
    'wal_bytes', v_wal_bytes,
    'connections_used', v_conn_used,
    'connections_max', v_conn_max,
    'connections_pct', ROUND((v_conn_used::numeric / NULLIF(v_conn_max, 0)) * 100, 1),
    'long_running_queries', v_long_queries,
    'bloated_tables', v_bloat
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_db_health_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_db_health_snapshot() TO authenticated;
COMMENT ON FUNCTION public.get_db_health_snapshot() IS
  'Fase 7: snapshot consolidado de saúde do banco (WAL, conexões, long queries, bloat). Admin-only via workspace_members.';
