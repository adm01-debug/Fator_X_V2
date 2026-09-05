CREATE TABLE IF NOT EXISTS public.crm_icp_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  -- Pesos somam livremente; a normalização acontece no serviço para permitir
  -- que o usuário ajuste um critério sem rebalancear todos os outros.
  weight_industry NUMERIC NOT NULL DEFAULT 25 CHECK (weight_industry >= 0 AND weight_industry <= 100),
  weight_company_size NUMERIC NOT NULL DEFAULT 25 CHECK (weight_company_size >= 0 AND weight_company_size <= 100),
  weight_job_title NUMERIC NOT NULL DEFAULT 25 CHECK (weight_job_title >= 0 AND weight_job_title <= 100),
  weight_engagement NUMERIC NOT NULL DEFAULT 25 CHECK (weight_engagement >= 0 AND weight_engagement <= 100),
  target_industries TEXT[] NOT NULL DEFAULT '{}',
  target_job_titles TEXT[] NOT NULL DEFAULT '{}',
  min_company_size INTEGER,
  max_company_size INTEGER,
  qualified_threshold NUMERIC NOT NULL DEFAULT 70 CHECK (qualified_threshold >= 0 AND qualified_threshold <= 100),
  hot_threshold NUMERIC NOT NULL DEFAULT 85 CHECK (hot_threshold >= 0 AND hot_threshold <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT crm_icp_size_range CHECK (
    min_company_size IS NULL OR max_company_size IS NULL OR min_company_size <= max_company_size
  ),
  CONSTRAINT crm_icp_threshold_order CHECK (hot_threshold >= qualified_threshold)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_icp_profiles TO authenticated;
GRANT ALL ON public.crm_icp_profiles TO service_role;

ALTER TABLE public.crm_icp_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "icp_select_own_workspace" ON public.crm_icp_profiles
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "icp_insert_own_workspace" ON public.crm_icp_profiles
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "icp_update_own_workspace" ON public.crm_icp_profiles
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "icp_delete_own_workspace" ON public.crm_icp_profiles
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = (SELECT auth.uid())));

CREATE INDEX IF NOT EXISTS idx_crm_icp_workspace ON public.crm_icp_profiles (workspace_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_icp_one_default ON public.crm_icp_profiles (workspace_id) WHERE is_default AND deleted_at IS NULL;

CREATE TRIGGER trg_crm_icp_updated_at
  BEFORE UPDATE ON public.crm_icp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.crm_deals
  ADD COLUMN IF NOT EXISTS score_reason JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS icp_profile_id UUID REFERENCES public.crm_icp_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

ALTER TABLE public.crm_companies
  ADD COLUMN IF NOT EXISTS score_reason JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS icp_profile_id UUID REFERENCES public.crm_icp_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_deals_icp_profile ON public.crm_deals (icp_profile_id);
CREATE INDEX IF NOT EXISTS idx_crm_companies_icp_profile ON public.crm_companies (icp_profile_id);