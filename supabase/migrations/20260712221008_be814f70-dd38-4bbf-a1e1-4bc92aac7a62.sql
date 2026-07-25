
-- audit_log_v2 (tem workspace_id)
DROP POLICY IF EXISTS "Admins only" ON public.audit_log_v2;
CREATE POLICY "Admins only" ON public.audit_log_v2
  FOR ALL TO authenticated
  USING (public.is_workspace_admin((SELECT auth.uid()), workspace_id))
  WITH CHECK (public.is_workspace_admin((SELECT auth.uid()), workspace_id));

-- audit_log_v2_2026_06 (tem workspace_id)
DROP POLICY IF EXISTS "Admins only" ON public.audit_log_v2_2026_06;
CREATE POLICY "Admins only" ON public.audit_log_v2_2026_06
  FOR ALL TO authenticated
  USING (public.is_workspace_admin((SELECT auth.uid()), workspace_id))
  WITH CHECK (public.is_workspace_admin((SELECT auth.uid()), workspace_id));

-- audit_log_v2_2026_05 (schema legado sem workspace_id) — fail-closed p/ authenticated
DROP POLICY IF EXISTS "Admins only" ON public.audit_log_v2_2026_05;
CREATE POLICY "Service role only" ON public.audit_log_v2_2026_05
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- trace_events_v2 (parent + partitions)
DROP POLICY IF EXISTS "Admins only" ON public.trace_events_v2;
CREATE POLICY "Admins only" ON public.trace_events_v2
  FOR ALL TO authenticated
  USING (public.is_workspace_admin((SELECT auth.uid()), workspace_id))
  WITH CHECK (public.is_workspace_admin((SELECT auth.uid()), workspace_id));

DROP POLICY IF EXISTS "Admins only" ON public.trace_events_v2_2026_05;
CREATE POLICY "Admins only" ON public.trace_events_v2_2026_05
  FOR ALL TO authenticated
  USING (public.is_workspace_admin((SELECT auth.uid()), workspace_id))
  WITH CHECK (public.is_workspace_admin((SELECT auth.uid()), workspace_id));

DROP POLICY IF EXISTS "Admins only" ON public.trace_events_v2_2026_06;
CREATE POLICY "Admins only" ON public.trace_events_v2_2026_06
  FOR ALL TO authenticated
  USING (public.is_workspace_admin((SELECT auth.uid()), workspace_id))
  WITH CHECK (public.is_workspace_admin((SELECT auth.uid()), workspace_id));

-- agent_traces_v2_2026_05 (workspace via agents.workspace_id)
DROP POLICY IF EXISTS "Admins only" ON public.agent_traces_v2_2026_05;
CREATE POLICY "Admins only" ON public.agent_traces_v2_2026_05
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agents a
      WHERE a.id = agent_traces_v2_2026_05.agent_id
        AND public.is_workspace_admin((SELECT auth.uid()), a.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.agents a
      WHERE a.id = agent_traces_v2_2026_05.agent_id
        AND public.is_workspace_admin((SELECT auth.uid()), a.workspace_id)
    )
  );
