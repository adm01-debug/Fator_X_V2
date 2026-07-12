
-- Expandir criação de partições para 6 meses à frente + health check diário
CREATE OR REPLACE FUNCTION internal.ensure_monthly_partitions()
RETURNS TABLE(created_partition text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
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

    -- Amplia janela: -3 a +6 meses (margem de segurança)
    FOR v_offset IN -3..6 LOOP
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
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_partition_name);
        created_partition := v_partition_name;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
END;
$function$;

-- Health check: alerta se partição do próximo mês estiver ausente
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
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=v_partition_name
    ) THEN
      -- Auto-heal: tenta criar
      PERFORM internal.ensure_monthly_partitions();
      -- Reverifica e emite se ainda faltar
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=v_partition_name
      ) THEN
        parent_table := v_parent;
        missing_partition := v_partition_name;
        severity := 'critical';
        RETURN NEXT;
        INSERT INTO public.security_alerts(alert_type, severity, title, description, metadata)
        VALUES ('partition_missing', 'critical',
                format('Partição ausente: %s', v_partition_name),
                format('A partição %s do parent %s não pôde ser criada automaticamente.', v_partition_name, v_parent),
                jsonb_build_object('parent', v_parent, 'partition', v_partition_name));
      END IF;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION internal.check_partition_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.check_partition_health() TO service_role;
