
-- WAVE 4: Consolidate multiple permissive SELECT policies to reduce per-row planner overhead.

-- agents: two overlapping SELECT policies → one
DROP POLICY IF EXISTS "Users can view own agents" ON public.agents;
DROP POLICY IF EXISTS "Authenticated users can view templates" ON public.agents;
CREATE POLICY "Users view own agents or workspace templates"
ON public.agents
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    is_template = true
    AND workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid())))
  )
);

-- workspace_members: three overlapping SELECT policies → one
DROP POLICY IF EXISTS "Members can view own membership" ON public.workspace_members;
DROP POLICY IF EXISTS "Members can view colleagues (no email)" ON public.workspace_members;
DROP POLICY IF EXISTS "Admins can view all workspace members" ON public.workspace_members;
CREATE POLICY "Members view own, colleagues, or admin view all"
ON public.workspace_members
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR is_workspace_admin((SELECT auth.uid()), workspace_id)
  OR workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid())))
);

-- security_alerts: two overlapping SELECT policies → one
DROP POLICY IF EXISTS "Workspace members can view security alerts" ON public.security_alerts;
DROP POLICY IF EXISTS "Admins can view security alerts" ON public.security_alerts;
CREATE POLICY "Workspace members view security alerts"
ON public.security_alerts
AS PERMISSIVE
FOR SELECT
TO public
USING (
  workspace_id IN (
    SELECT wm.workspace_id
    FROM public.workspace_members wm
    WHERE wm.user_id = (SELECT auth.uid())
  )
);
