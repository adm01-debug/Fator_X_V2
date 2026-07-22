
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.notebook_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notebook_notes_collection ON public.notebook_notes(collection_id);
CREATE INDEX idx_notebook_notes_workspace ON public.notebook_notes(workspace_id);
CREATE INDEX idx_notebook_notes_title_trgm ON public.notebook_notes USING gin (title public.gin_trgm_ops);
CREATE INDEX idx_notebook_notes_tags ON public.notebook_notes USING gin (tags);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notebook_notes TO authenticated;
GRANT ALL ON public.notebook_notes TO service_role;

ALTER TABLE public.notebook_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notebook_notes select workspace member" ON public.notebook_notes FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));
CREATE POLICY "notebook_notes insert workspace member" ON public.notebook_notes FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));
CREATE POLICY "notebook_notes update workspace member" ON public.notebook_notes FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));
CREATE POLICY "notebook_notes delete workspace member" ON public.notebook_notes FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));

CREATE TRIGGER update_notebook_notes_updated_at
  BEFORE UPDATE ON public.notebook_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.knowledge_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('note','document','entity','chunk')),
  source_id UUID NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('note','document','entity','chunk','tag')),
  target_id UUID,
  target_label TEXT,
  link_kind TEXT NOT NULL DEFAULT 'wikilink' CHECK (link_kind IN ('wikilink','mention','tag','semantic','manual')),
  context TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_links_source ON public.knowledge_links(source_type, source_id);
CREATE INDEX idx_knowledge_links_target ON public.knowledge_links(target_type, target_id);
CREATE INDEX idx_knowledge_links_workspace ON public.knowledge_links(workspace_id);
CREATE INDEX idx_knowledge_links_kind ON public.knowledge_links(link_kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_links TO authenticated;
GRANT ALL ON public.knowledge_links TO service_role;

ALTER TABLE public.knowledge_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_links select workspace member" ON public.knowledge_links FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));
CREATE POLICY "knowledge_links insert workspace member" ON public.knowledge_links FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));
CREATE POLICY "knowledge_links delete workspace member" ON public.knowledge_links FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));
