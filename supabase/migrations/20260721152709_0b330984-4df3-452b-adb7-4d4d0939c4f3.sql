
CREATE TABLE IF NOT EXISTS public.openclaw_deployments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  openclaw_agent_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','deployed','failed','rolled_back')),
  manifest JSONB NOT NULL DEFAULT '{}'::JSONB,
  error TEXT,
  deployed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_openclaw_deployments_agent ON public.openclaw_deployments(agent_id);
CREATE INDEX idx_openclaw_deployments_workspace ON public.openclaw_deployments(workspace_id);
CREATE INDEX idx_openclaw_deployments_status ON public.openclaw_deployments(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.openclaw_deployments TO authenticated;
GRANT ALL ON public.openclaw_deployments TO service_role;

ALTER TABLE public.openclaw_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read openclaw deployments"
ON public.openclaw_deployments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = openclaw_deployments.workspace_id
      AND wm.user_id = auth.uid()
  )
);

CREATE POLICY "Workspace members insert openclaw deployments"
ON public.openclaw_deployments FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = openclaw_deployments.workspace_id
      AND wm.user_id = auth.uid()
  )
);

CREATE POLICY "Workspace members update openclaw deployments"
ON public.openclaw_deployments FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = openclaw_deployments.workspace_id
      AND wm.user_id = auth.uid()
  )
);

CREATE TRIGGER update_openclaw_deployments_updated_at
BEFORE UPDATE ON public.openclaw_deployments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
