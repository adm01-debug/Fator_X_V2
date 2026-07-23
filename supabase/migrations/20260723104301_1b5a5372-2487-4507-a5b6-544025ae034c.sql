-- Canvas freeform (whiteboard estilo Obsidian Canvas)
CREATE TABLE IF NOT EXISTS public.notebook_canvases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notebook_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Novo canvas',
  description TEXT,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  viewport JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notebook_canvases_notebook ON public.notebook_canvases(notebook_id);
CREATE INDEX IF NOT EXISTS idx_notebook_canvases_workspace ON public.notebook_canvases(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notebook_canvases TO authenticated;
GRANT ALL ON public.notebook_canvases TO service_role;

ALTER TABLE public.notebook_canvases ENABLE ROW LEVEL SECURITY;

-- SELECT: membros do workspace
CREATE POLICY "canvases_select_members" ON public.notebook_canvases
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = notebook_canvases.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT: criador precisa ser membro do workspace
CREATE POLICY "canvases_insert_members" ON public.notebook_canvases
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = notebook_canvases.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- UPDATE: criador ou membro do workspace
CREATE POLICY "canvases_update_members" ON public.notebook_canvases
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = notebook_canvases.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = notebook_canvases.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: apenas criador
CREATE POLICY "canvases_delete_owner" ON public.notebook_canvases
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_notebook_canvases_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notebook_canvases_updated_at ON public.notebook_canvases;
CREATE TRIGGER trg_notebook_canvases_updated_at
  BEFORE UPDATE ON public.notebook_canvases
  FOR EACH ROW EXECUTE FUNCTION public.tg_notebook_canvases_updated_at();