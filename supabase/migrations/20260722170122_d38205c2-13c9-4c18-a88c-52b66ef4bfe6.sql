
-- 1. Extend collections
ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT 'BookOpen',
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'nexus-primary',
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS collections_workspace_idx ON public.collections(workspace_id) WHERE is_archived = false;

-- 2. Auto-fill workspace_id from KB
CREATE OR REPLACE FUNCTION public.collections_fill_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.knowledge_base_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.knowledge_bases WHERE id = NEW.knowledge_base_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collections_fill_workspace_trg ON public.collections;
CREATE TRIGGER collections_fill_workspace_trg
BEFORE INSERT OR UPDATE ON public.collections
FOR EACH ROW EXECUTE FUNCTION public.collections_fill_workspace();

-- 3. GRANTs + RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collections_workspace_select" ON public.collections;
CREATE POLICY "collections_workspace_select" ON public.collections
FOR SELECT TO authenticated
USING (
  workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "collections_workspace_insert" ON public.collections;
CREATE POLICY "collections_workspace_insert" ON public.collections
FOR INSERT TO authenticated
WITH CHECK (
  workspace_id IS NULL
  OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "collections_workspace_update" ON public.collections;
CREATE POLICY "collections_workspace_update" ON public.collections
FOR UPDATE TO authenticated
USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "collections_workspace_delete" ON public.collections;
CREATE POLICY "collections_workspace_delete" ON public.collections
FOR DELETE TO authenticated
USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- 4. Chunks index for notebook filtering
-- Ensure metadata column exists (never explicitly added in prior migrations)
ALTER TABLE public.chunks ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS chunks_notebook_idx
  ON public.chunks ((metadata->>'collection_id'))
  WHERE metadata ? 'collection_id';

-- 5. Notebook-scoped hybrid search
CREATE OR REPLACE FUNCTION public.hybrid_memory_search_notebook(
  p_query text,
  p_notebook_id uuid,
  p_limit int DEFAULT 15
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  score float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.document_id, c.content, c.metadata,
         ts_rank(to_tsvector('portuguese', c.content), plainto_tsquery('portuguese', p_query))::float AS score
  FROM public.chunks c
  WHERE c.embedding_status = 'done'
    AND (p_notebook_id IS NULL OR c.metadata->>'collection_id' = p_notebook_id::text)
    AND to_tsvector('portuguese', c.content) @@ plainto_tsquery('portuguese', p_query)
  ORDER BY score DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.hybrid_memory_search_notebook(text, uuid, int) TO authenticated;
