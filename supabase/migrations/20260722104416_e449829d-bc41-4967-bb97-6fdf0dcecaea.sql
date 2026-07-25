
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relname ~ '^agent_traces_v2_20[0-9]{2}_[0-9]{2}$'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins only" ON public.%I', p);
    EXECUTE format($f$
      CREATE POLICY "Admins only" ON public.%I FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.agents a
                     WHERE a.id = %I.agent_id
                       AND public.is_workspace_admin((SELECT auth.uid()), a.workspace_id)))
      WITH CHECK (EXISTS (SELECT 1 FROM public.agents a
                          WHERE a.id = %I.agent_id
                            AND public.is_workspace_admin((SELECT auth.uid()), a.workspace_id)))
    $f$, p, p, p);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.agent_traces_v2_2026_11
  PARTITION OF public.agent_traces
  FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS public.agent_traces_v2_2026_12
  PARTITION OF public.agent_traces
  FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS public.agent_traces_v2_2027_01
  PARTITION OF public.agent_traces
  FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');

DO $$
DECLARE p text;
BEGIN
  FOR p IN VALUES ('agent_traces_v2_2026_11'),('agent_traces_v2_2026_12'),('agent_traces_v2_2027_01') LOOP
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', p);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', p);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p);
    EXECUTE format($f$
      CREATE POLICY "Users can see their own traces" ON public.%I FOR SELECT
      USING (user_id = (SELECT auth.uid()))
    $f$, p);
    EXECUTE format($f$
      CREATE POLICY "Admins only" ON public.%I FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.agents a
                     WHERE a.id = %I.agent_id
                       AND public.is_workspace_admin((SELECT auth.uid()), a.workspace_id)))
      WITH CHECK (EXISTS (SELECT 1 FROM public.agents a
                          WHERE a.id = %I.agent_id
                            AND public.is_workspace_admin((SELECT auth.uid()), a.workspace_id)))
    $f$, p, p, p);
  END LOOP;
END $$;
