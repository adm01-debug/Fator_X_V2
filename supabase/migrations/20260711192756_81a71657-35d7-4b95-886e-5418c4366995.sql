-- Função de retenção via DROP PARTITION (O(1) em vez de O(n) do DELETE).
CREATE OR REPLACE FUNCTION internal.drop_old_partitions(
  p_retention_days int DEFAULT 90
)
RETURNS TABLE(dropped_partition text, month_end timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal, pg_temp
AS $$
DECLARE
  r record;
  v_cutoff timestamptz := date_trunc('month', now() - make_interval(days => p_retention_days));
  v_bounds text;
  v_end_ts timestamptz;
BEGIN
  FOR r IN
    SELECT nc.nspname AS schema,
           cc.relname AS partition,
           pg_get_expr(cc.relpartbound, cc.oid) AS bounds
    FROM pg_inherits i
    JOIN pg_class parent ON parent.oid=i.inhparent
    JOIN pg_class cc ON cc.oid=i.inhrelid
    JOIN pg_namespace nc ON nc.oid=cc.relnamespace
    WHERE parent.relname IN ('agent_traces','audit_log_v2','trace_events_v2')
  LOOP
    -- Extrai o limite superior "TO ('YYYY-MM-DD ...')" via regex.
    v_bounds := r.bounds;
    v_end_ts := (regexp_match(v_bounds, $re$TO \('([^']+)'\)$re$))[1]::timestamptz;

    IF v_end_ts IS NOT NULL AND v_end_ts <= v_cutoff THEN
      EXECUTE format('DROP TABLE %I.%I', r.schema, r.partition);
      dropped_partition := r.partition;
      month_end := v_end_ts;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION internal.drop_old_partitions(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.drop_old_partitions(int) TO service_role;

-- Agenda dia 2 de cada mês às 04:00 UTC (depois da criação da nova partição no dia 25 do mês anterior).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'drop-old-partitions') THEN
      PERFORM cron.unschedule('drop-old-partitions');
    END IF;
    PERFORM cron.schedule(
      'drop-old-partitions',
      '0 4 2 * *',
      'SELECT internal.drop_old_partitions(90);'
    );
  END IF;
END;
$$;