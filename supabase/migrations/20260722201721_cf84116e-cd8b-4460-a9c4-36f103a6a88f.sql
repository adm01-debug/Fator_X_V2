CREATE TABLE IF NOT EXISTS public.notebook_podcasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notebook_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Podcast do Notebook',
  script_md TEXT,
  audio_url TEXT,
  audio_path TEXT,
  duration_seconds INTEGER,
  voice TEXT NOT NULL DEFAULT 'alloy',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','generating','ready','failed','canceled')),
  error TEXT,
  cancel_requested BOOLEAN NOT NULL DEFAULT false,
  content_hash TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notebook_podcasts_notebook ON public.notebook_podcasts(notebook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notebook_podcasts_workspace ON public.notebook_podcasts(workspace_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notebook_podcasts_hash
  ON public.notebook_podcasts(notebook_id, content_hash)
  WHERE content_hash IS NOT NULL AND status = 'ready';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notebook_podcasts TO authenticated;
GRANT ALL ON public.notebook_podcasts TO service_role;

ALTER TABLE public.notebook_podcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notebook_podcasts_select_workspace_members"
  ON public.notebook_podcasts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = notebook_podcasts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "notebook_podcasts_insert_workspace_members"
  ON public.notebook_podcasts FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = notebook_podcasts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "notebook_podcasts_update_owner_or_admin"
  ON public.notebook_podcasts FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() OR public.is_workspace_admin(auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid() OR public.is_workspace_admin(auth.uid())
  );

CREATE POLICY "notebook_podcasts_delete_owner_or_admin"
  ON public.notebook_podcasts FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid() OR public.is_workspace_admin(auth.uid())
  );

CREATE TRIGGER trg_notebook_podcasts_updated_at
  BEFORE UPDATE ON public.notebook_podcasts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();