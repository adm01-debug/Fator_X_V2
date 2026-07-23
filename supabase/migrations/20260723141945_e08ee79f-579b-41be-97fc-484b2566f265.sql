CREATE OR REPLACE FUNCTION internal.ensure_monthly_partitions(p_months_ahead int DEFAULT 12)
RETURNS TABLE(created_partition text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','internal','pg_temp'
AS $function$
DECLARE
  v_parent text;
  v_prefix text;
  v_month_start timestamptz;
  v_month_end   timestamptz;
  v_partition_name text;
  v_offset int;
  v_parents text[] := ARRAY['agent_traces','audit_log_v2','trace_events_v2'];
  v_has_workspace boolean;
  v_has_agent boolean;
  v_has_user boolean;
BEGIN
  FOREACH v_parent IN ARRAY v_parents LOOP
    v_prefix := CASE v_parent WHEN 'agent_traces' THEN 'agent_traces_v2' ELSE v_parent END;

    FOR v_offset IN -3..GREATEST(p_months_ahead, 6) LOOP
      v_month_start := date_trunc('month', now() + make_interval(months => v_offset));
      v_month_end   := v_month_start + interval '1 month';
      v_partition_name := format('%s_%s', v_prefix, to_char(v_month_start, 'YYYY_MM'));

      IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
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
             fillfactor = 100)',
          v_partition_name
        );
        created_partition := v_partition_name;
        RETURN NEXT;
      END IF;

      EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', v_partition_name);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', v_partition_name);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_partition_name);

      SELECT
        bool_or(column_name='workspace_id'),
        bool_or(column_name='agent_id'),
        bool_or(column_name='user_id')
      INTO v_has_workspace, v_has_agent, v_has_user
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=v_partition_name;

      IF v_parent='agent_traces' AND v_has_user AND v_has_agent THEN
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
      ELSIF v_parent IN ('audit_log_v2','trace_events_v2') AND v_has_workspace THEN
        EXECUTE format('DROP POLICY IF EXISTS "Admins only" ON public.%I', v_partition_name);
        EXECUTE format($p$
          CREATE POLICY "Admins only" ON public.%I FOR ALL TO authenticated
          USING (public.is_workspace_admin((SELECT auth.uid()), workspace_id))
          WITH CHECK (public.is_workspace_admin((SELECT auth.uid()), workspace_id))
        $p$, v_partition_name);
      END IF;
    END LOOP;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION internal.ensure_monthly_partitions(int) FROM PUBLIC, anon, authenticated;

SELECT internal.ensure_monthly_partitions(12);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ensure-monthly-partitions') THEN
    PERFORM cron.unschedule('ensure-monthly-partitions');
  END IF;
  PERFORM cron.schedule(
    'ensure-monthly-partitions',
    '0 3 1 * *',
    $job$ SELECT internal.ensure_monthly_partitions(12); $job$
  );
EXCEPTION WHEN undefined_function OR undefined_table THEN
  NULL;
END $$;