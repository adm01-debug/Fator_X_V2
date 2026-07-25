DO $$
DECLARE r record;
BEGIN
  -- agent_traces partitions: policy by user_id
  FOR r IN SELECT n.nspname AS s, c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           JOIN pg_inherits i ON i.inhrelid=c.oid JOIN pg_class p ON p.oid=i.inhparent
           WHERE n.nspname='public' AND p.relname='agent_traces' AND c.relkind='r' LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.s, r.t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can see their own traces" ON %I.%I', r.s, r.t);
    EXECUTE format('CREATE POLICY "Users can see their own traces" ON %I.%I FOR SELECT USING ((SELECT auth.uid()) = user_id)', r.s, r.t);
  END LOOP;
  -- audit_log_v2 partitions: admin only
  FOR r IN SELECT n.nspname AS s, c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           JOIN pg_inherits i ON i.inhrelid=c.oid JOIN pg_class p ON p.oid=i.inhparent
           WHERE n.nspname='public' AND p.relname='audit_log_v2' AND c.relkind='r' LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.s, r.t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins only" ON %I.%I', r.s, r.t);
    EXECUTE format('CREATE POLICY "Admins only" ON %I.%I FOR ALL TO authenticated USING (public.is_workspace_admin((SELECT auth.uid()), workspace_id)) WITH CHECK (public.is_workspace_admin((SELECT auth.uid()), workspace_id))', r.s, r.t);
  END LOOP;
  -- trace_events_v2 partitions: admin only
  FOR r IN SELECT n.nspname AS s, c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           JOIN pg_inherits i ON i.inhrelid=c.oid JOIN pg_class p ON p.oid=i.inhparent
           WHERE n.nspname='public' AND p.relname='trace_events_v2' AND c.relkind='r' LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.s, r.t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins only" ON %I.%I', r.s, r.t);
    EXECUTE format('CREATE POLICY "Admins only" ON %I.%I FOR ALL TO authenticated USING (public.is_workspace_admin((SELECT auth.uid()), workspace_id)) WITH CHECK (public.is_workspace_admin((SELECT auth.uid()), workspace_id))', r.s, r.t);
  END LOOP;
END$$;