
DROP POLICY IF EXISTS "Service role can manage webhook endpoints" ON public.webhook_endpoints;
CREATE POLICY "Service role can manage webhook endpoints"
ON public.webhook_endpoints FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage webhook events" ON public.webhook_events;
CREATE POLICY "Service role can manage webhook events"
ON public.webhook_events FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can update security alerts" ON public.security_alerts;
CREATE POLICY "Admins can update security alerts"
ON public.security_alerts FOR UPDATE TO authenticated
USING (public.is_workspace_admin(auth.uid(), security_alerts.workspace_id))
WITH CHECK (public.is_workspace_admin(auth.uid(), security_alerts.workspace_id));

DROP POLICY IF EXISTS "Allow authenticated read on resolution logs" ON public.entity_resolution_logs;
CREATE POLICY "Workspace members read resolution logs"
ON public.entity_resolution_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.knowledge_entities ke
    JOIN public.workspace_members wm ON wm.workspace_id = ke.workspace_id
    WHERE ke.id = entity_resolution_logs.primary_entity_id
      AND wm.user_id = auth.uid()
  )
);
