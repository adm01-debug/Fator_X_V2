-- 1) Extensão do skill_registry
ALTER TABLE public.skill_registry
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS source_repo TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_license TEXT,
  ADD COLUMN IF NOT EXISTS source_commit TEXT,
  ADD COLUMN IF NOT EXISTS quality_score NUMERIC(5,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_skill_registry_department ON public.skill_registry (department);
CREATE INDEX IF NOT EXISTS idx_skill_registry_source_repo ON public.skill_registry (source_repo);

-- 2) Runs do coletor
CREATE TABLE IF NOT EXISTS public.skill_harvest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by UUID,
  queries TEXT[] NOT NULL DEFAULT '{}',
  departments TEXT[] NOT NULL DEFAULT '{}',
  repos_scanned INTEGER NOT NULL DEFAULT 0,
  candidates_found INTEGER NOT NULL DEFAULT 0,
  candidates_accepted INTEGER NOT NULL DEFAULT 0,
  candidates_rejected INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.skill_harvest_runs TO authenticated;
GRANT ALL ON public.skill_harvest_runs TO service_role;
ALTER TABLE public.skill_harvest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view harvest runs"
  ON public.skill_harvest_runs FOR SELECT TO authenticated
  USING (public.is_workspace_admin((SELECT auth.uid())));

-- 3) Candidatos em staging
CREATE TABLE IF NOT EXISTS public.skill_harvest_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.skill_harvest_runs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '1.0.0',
  author TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'tools',
  department TEXT,
  department_confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',
  source_repo TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_path TEXT,
  source_license TEXT,
  source_commit TEXT,
  stars INTEGER NOT NULL DEFAULT 0,
  last_commit_at TIMESTAMPTZ,
  quality_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  raw_content TEXT,
  skill_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  mcp_server_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reasons TEXT[] NOT NULL DEFAULT '{}',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  promoted_skill_id UUID REFERENCES public.skill_registry(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT skill_harvest_candidates_status_chk
    CHECK (status IN ('pending','accepted','rejected','promoted','auto_rejected')),
  CONSTRAINT skill_harvest_candidates_hash_uniq UNIQUE (content_hash)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.skill_harvest_candidates TO authenticated;
GRANT ALL ON public.skill_harvest_candidates TO service_role;
ALTER TABLE public.skill_harvest_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view harvest candidates"
  ON public.skill_harvest_candidates FOR SELECT TO authenticated
  USING (public.is_workspace_admin((SELECT auth.uid())));

CREATE POLICY "Admins can insert harvest candidates"
  ON public.skill_harvest_candidates FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin((SELECT auth.uid())));

CREATE POLICY "Admins can update harvest candidates"
  ON public.skill_harvest_candidates FOR UPDATE TO authenticated
  USING (public.is_workspace_admin((SELECT auth.uid())))
  WITH CHECK (public.is_workspace_admin((SELECT auth.uid())));

CREATE POLICY "Admins can delete harvest candidates"
  ON public.skill_harvest_candidates FOR DELETE TO authenticated
  USING (public.is_workspace_admin((SELECT auth.uid())));

CREATE INDEX IF NOT EXISTS idx_shc_status ON public.skill_harvest_candidates (status);
CREATE INDEX IF NOT EXISTS idx_shc_department ON public.skill_harvest_candidates (department);
CREATE INDEX IF NOT EXISTS idx_shc_run ON public.skill_harvest_candidates (run_id);
CREATE INDEX IF NOT EXISTS idx_shc_quality ON public.skill_harvest_candidates (quality_score DESC);

CREATE TRIGGER trg_shc_updated_at BEFORE UPDATE ON public.skill_harvest_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_shr_updated_at BEFORE UPDATE ON public.skill_harvest_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();