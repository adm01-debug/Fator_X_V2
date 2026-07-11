-- Habilita RLS em todas as partições folha existentes das 3 tabelas particionadas.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT nc.nspname AS schema, cc.relname AS partition
    FROM pg_inherits i
    JOIN pg_class parent ON parent.oid=i.inhparent
    JOIN pg_class cc ON cc.oid=i.inhrelid
    JOIN pg_namespace nc ON nc.oid=cc.relnamespace
    WHERE parent.relname IN ('agent_traces','audit_log_v2','trace_events_v2')
      AND cc.relrowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schema, r.partition);
  END LOOP;
END $$;

-- Atualiza a função para sempre habilitar RLS nas partições novas.
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
          'CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
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

        -- RLS herda políticas mas não o ENABLE — precisa explícito.
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_partition_name);

        created_partition := v_partition_name;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION internal.ensure_monthly_partitions() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.ensure_monthly_partitions() TO service_role;