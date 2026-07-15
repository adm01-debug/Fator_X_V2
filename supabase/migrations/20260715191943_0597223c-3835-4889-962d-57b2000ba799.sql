CREATE OR REPLACE FUNCTION internal.check_partition_health()
RETURNS TABLE(parent_table text, missing_partition text, severity text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'internal', 'pg_temp'
AS $$
DECLARE
  v_parent text;
  v_prefix text;
  v_next_month timestamptz;
  v_partition_name text;
  v_parents text[] := ARRAY['agent_traces','audit_log_v2','trace_events_v2'];
BEGIN
  FOREACH v_parent IN ARRAY v_parents LOOP
    v_prefix := CASE v_parent WHEN 'agent_traces' THEN 'agent_traces_v2' ELSE v_parent END;
    v_next_month := date_trunc('month', now() + interval '1 month');
    v_partition_name := format('%s_%s', v_prefix, to_char(v_next_month, 'YYYY_MM'));

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_partition_name
    ) THEN
      PERFORM internal.ensure_monthly_partitions();

      IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = v_partition_name
      ) THEN
        parent_table := v_parent;
        missing_partition := v_partition_name;
        severity := 'critical';

        INSERT INTO public.security_alerts(severity, category, message, metadata)
        VALUES (
          'critical',
          'partition_missing',
          format('A partição %s da tabela %s não pôde ser criada automaticamente.', v_partition_name, v_parent),
          jsonb_build_object('parent', v_parent, 'partition', v_partition_name)
        );

        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION internal.check_partition_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.check_partition_health() TO service_role;

REVOKE ALL ON FUNCTION public.get_slo_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_slo_summary(integer) TO authenticated, service_role;