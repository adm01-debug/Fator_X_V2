
CREATE OR REPLACE FUNCTION internal.ensure_monthly_partitions()
RETURNS TABLE(created_partition text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'internal', 'pg_temp'
AS $fn$
DECLARE
  v_parent text;
  v_prefix text;
  v_month_start timestamptz;
  v_month_end   timestamptz;
  v_partition_name text;
  v_offset int;
  v_parents text[] := ARRAY['agent_traces','audit_log_v2','trace_events_v2'];
BEGIN
  FOREACH v_parent IN ARRAY v_parents LOOP
    v_prefix := CASE v_parent WHEN 'agent_traces' THEN 'agent_traces_v2' ELSE v_parent END;

    FOR v_offset IN -3..6 LOOP
      v_month_start := date_trunc('month', now() + make_interval(months => v_offset));
      v_month_end   := v_month_start + interval '1 month';
      v_partition_name := format('%s_%s', v_prefix, to_char(v_month_start, 'YYYY_MM'));

      IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
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

      -- Garantir grants + RLS + policies (idempotente; roda mesmo quando a partição já existia)
      EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', v_partition_name);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', v_partition_name);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_partition_name);

      IF v_parent = 'agent_traces' THEN
        EXECUTE format('DROP POLICY IF EXISTS "Users can see their own traces" ON public.%I', v_partition_name);
        EXECUTE format($p$
          CREATE POLICY "Users can see their own traces" ON public.%I FOR SELECT
          USING (user_id = (SELECT auth.uid()))
        $p$, v_partition_name);

        EXECUTE format('DROP POLICY IF EXISTS "Admins only" ON public.%I', v_partition_name);
        EXECUTE format($p$
          CREATE POLICY "Admins only" ON public.%I FOR ALL TO authenticated
          USING (EXISTS (SELECT 1 FROM public.agents a
                         WHERE a.id = %I.agent_id
                           AND public.is_workspace_admin((SELECT auth.uid()), a.workspace_id)))
          WITH CHECK (EXISTS (SELECT 1 FROM public.agents a
                              WHERE a.id = %I.agent_id
                                AND public.is_workspace_admin((SELECT auth.uid()), a.workspace_id)))
        $p$, v_partition_name, v_partition_name, v_partition_name);
      END IF;
    END LOOP;
  END LOOP;
END;
$fn$;

-- Backfill imediato: aplica grants/policies em qualquer partição já existente que esteja sem.
SELECT internal.ensure_monthly_partitions();
