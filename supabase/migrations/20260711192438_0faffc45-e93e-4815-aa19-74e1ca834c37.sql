CREATE OR REPLACE FUNCTION internal.ensure_monthly_partitions()
RETURNS TABLE(created_partition text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal, pg_temp
AS $$
DECLARE
  v_parent text;
  v_prefix text;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_partition_name text;
  v_offset int;
  v_parents text[] := ARRAY['agent_traces','audit_log_v2','trace_events_v2'];
BEGIN
  FOREACH v_parent IN ARRAY v_parents LOOP
    -- Prefixo respeitando padrão histórico das partições existentes:
    --   agent_traces      -> agent_traces_v2_YYYY_MM
    --   audit_log_v2      -> audit_log_v2_YYYY_MM
    --   trace_events_v2   -> trace_events_v2_YYYY_MM
    v_prefix := CASE v_parent
      WHEN 'agent_traces' THEN 'agent_traces_v2'
      ELSE v_parent
    END;

    FOR v_offset IN -3..3 LOOP
      v_month_start := date_trunc('month', now() + make_interval(months => v_offset));
      v_month_end   := v_month_start + interval '1 month';
      v_partition_name := format('%s_%s', v_prefix, to_char(v_month_start, 'YYYY_MM'));

      IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=v_partition_name
      ) THEN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
          v_partition_name, v_parent, v_month_start, v_month_end
        );

        EXECUTE format(
          'ALTER TABLE public.%I SET (
             autovacuum_vacuum_scale_factor = 0.05,
             autovacuum_analyze_scale_factor = 0.01,
             autovacuum_vacuum_insert_scale_factor = 0.05,
             fillfactor = 100
           )',
          v_partition_name
        );

        created_partition := v_partition_name;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION internal.ensure_monthly_partitions() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.ensure_monthly_partitions() TO service_role;

-- Executa agora — tapa o buraco de junho/julho/agosto/setembro/outubro 2026.
SELECT * FROM internal.ensure_monthly_partitions();

-- Agenda mensal (dia 25, 03:00 UTC — ~5 dias de folga antes da virada).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ensure-monthly-partitions') THEN
      PERFORM cron.unschedule('ensure-monthly-partitions');
    END IF;
    PERFORM cron.schedule(
      'ensure-monthly-partitions',
      '0 3 25 * *',
      'SELECT internal.ensure_monthly_partitions();'
    );
  END IF;
END;
$$;