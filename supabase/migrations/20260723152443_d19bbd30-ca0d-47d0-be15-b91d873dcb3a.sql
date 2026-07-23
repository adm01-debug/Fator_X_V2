
-- Snapshot completo de saúde das partições: cobertura futura (runway) por família + tamanhos
CREATE OR REPLACE FUNCTION public.get_partition_health_snapshot()
RETURNS TABLE(
  parent_table text,
  total_partitions int,
  future_runway_months int,
  latest_partition text,
  latest_partition_end timestamptz,
  total_size_bytes bigint,
  total_size_pretty text,
  largest_partition text,
  largest_partition_bytes bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_parents text[] := ARRAY['agent_traces_v2','audit_log_v2','trace_events_v2'];
  v_parent text;
BEGIN
  -- Somente admins podem consultar
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  FOREACH v_parent IN ARRAY v_parents LOOP
    RETURN QUERY
    WITH parts AS (
      SELECT
        c.relname AS name,
        pg_relation_size(format('public.%I', c.relname)::regclass) AS bytes,
        -- extrai YYYY_MM do sufixo
        substring(c.relname from '(\d{4}_\d{2})$') AS ym
      FROM pg_inherits i
      JOIN pg_class p ON p.oid = i.inhparent
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_namespace n ON n.oid = p.relnamespace
      WHERE n.nspname = 'public' AND p.relname = v_parent
    ),
    parsed AS (
      SELECT name, bytes,
        to_timestamp(ym || '_01', 'YYYY_MM_DD') AT TIME ZONE 'UTC' AS start_at
      FROM parts WHERE ym IS NOT NULL
    ),
    agg AS (
      SELECT
        v_parent AS parent_table,
        count(*)::int AS total_partitions,
        greatest(0, (
          extract(year FROM age(max(start_at), date_trunc('month', now())))::int * 12
          + extract(month FROM age(max(start_at), date_trunc('month', now())))::int
        ))::int AS future_runway_months,
        (SELECT name FROM parsed ORDER BY start_at DESC LIMIT 1) AS latest_partition,
        (max(start_at) + interval '1 month')::timestamptz AS latest_partition_end,
        coalesce(sum(bytes),0)::bigint AS total_size_bytes,
        pg_size_pretty(coalesce(sum(bytes),0)) AS total_size_pretty,
        (SELECT name FROM parsed ORDER BY bytes DESC LIMIT 1) AS largest_partition,
        coalesce(max(bytes),0)::bigint AS largest_partition_bytes
      FROM parsed
    )
    SELECT * FROM agg;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_partition_health_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partition_health_snapshot() TO authenticated, service_role;
