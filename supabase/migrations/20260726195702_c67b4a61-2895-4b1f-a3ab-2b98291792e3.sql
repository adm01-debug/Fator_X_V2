-- ═══ CRM CORE (Fase 1 — Sales Automation) ═══

CREATE TABLE public.crm_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  size_band TEXT CHECK (size_band IN ('micro','small','medium','large','enterprise')),
  country TEXT,
  icp_score NUMERIC(5,2),
  enrichment_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  external_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX crm_companies_ws_external_ref_key ON public.crm_companies (workspace_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX crm_companies_workspace_idx ON public.crm_companies (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX crm_companies_domain_idx ON public.crm_companies (workspace_id, domain);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_companies TO authenticated;
GRANT ALL ON public.crm_companies TO service_role;
ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_companies_member_access" ON public.crm_companies FOR ALL TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))));

CREATE TABLE public.crm_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  job_title TEXT,
  opted_out BOOLEAN NOT NULL DEFAULT false,
  enrichment_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  external_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX crm_contacts_ws_external_ref_key ON public.crm_contacts (workspace_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX crm_contacts_workspace_idx ON public.crm_contacts (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX crm_contacts_company_idx ON public.crm_contacts (company_id);
CREATE INDEX crm_contacts_email_idx ON public.crm_contacts (workspace_id, email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contacts TO authenticated;
GRANT ALL ON public.crm_contacts TO service_role;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_contacts_member_access" ON public.crm_contacts FOR ALL TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))));

CREATE TABLE public.crm_pipelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  external_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX crm_pipelines_workspace_idx ON public.crm_pipelines (workspace_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipelines TO authenticated;
GRANT ALL ON public.crm_pipelines TO service_role;
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_pipelines_member_access" ON public.crm_pipelines FOR ALL TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))));

CREATE TABLE public.crm_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  pipeline_id UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  win_probability NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (win_probability >= 0 AND win_probability <= 100),
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  external_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX crm_stages_pipeline_idx ON public.crm_stages (pipeline_id, position);
CREATE INDEX crm_stages_workspace_idx ON public.crm_stages (workspace_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_stages TO authenticated;
GRANT ALL ON public.crm_stages TO service_role;
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_stages_member_access" ON public.crm_stages FOR ALL TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))));

CREATE TABLE public.crm_deals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES public.crm_stages(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  owner_id UUID,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  lead_score NUMERIC(5,2),
  score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_close_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  external_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX crm_deals_ws_external_ref_key ON public.crm_deals (workspace_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX crm_deals_workspace_idx ON public.crm_deals (workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX crm_deals_stage_idx ON public.crm_deals (stage_id);
CREATE INDEX crm_deals_pipeline_idx ON public.crm_deals (pipeline_id);
CREATE INDEX crm_deals_company_idx ON public.crm_deals (company_id);
CREATE INDEX crm_deals_contact_idx ON public.crm_deals (contact_id);
CREATE INDEX crm_deals_last_activity_idx ON public.crm_deals (workspace_id, last_activity_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_deals TO authenticated;
GRANT ALL ON public.crm_deals TO service_role;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_deals_member_access" ON public.crm_deals FOR ALL TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))));

CREATE TABLE public.crm_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  deal_id UUID REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('note','email','call','message','stage_change','task','system')),
  source TEXT NOT NULL DEFAULT 'nexus',
  body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID,
  trace_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX crm_activities_workspace_idx ON public.crm_activities (workspace_id, occurred_at DESC);
CREATE INDEX crm_activities_deal_idx ON public.crm_activities (deal_id, occurred_at DESC);
CREATE INDEX crm_activities_contact_idx ON public.crm_activities (contact_id);
CREATE INDEX crm_activities_company_idx ON public.crm_activities (company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_activities TO service_role;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_activities_member_access" ON public.crm_activities FOR ALL TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids((SELECT auth.uid()))));

-- updated_at triggers
CREATE TRIGGER update_crm_companies_updated_at BEFORE UPDATE ON public.crm_companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_crm_contacts_updated_at BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_crm_pipelines_updated_at BEFORE UPDATE ON public.crm_pipelines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_crm_stages_updated_at BEFORE UPDATE ON public.crm_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_crm_deals_updated_at BEFORE UPDATE ON public.crm_deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_crm_activities_updated_at BEFORE UPDATE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();