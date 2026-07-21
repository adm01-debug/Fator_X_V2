
CREATE TABLE IF NOT EXISTS public.openclaw_agent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_pt text NOT NULL,
  description_pt text NOT NULL,
  category text NOT NULL CHECK (category IN ('vendas','atendimento','produtividade','observabilidade','conteudo','pessoal')),
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
  source_url text,
  soul_md text,
  agents_md text,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  cron_schedule text,
  required_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  origin text NOT NULL DEFAULT 'native' CHECK (origin IN ('awesome-openclaw-zh','native')),
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.openclaw_agent_templates TO authenticated;
GRANT ALL ON public.openclaw_agent_templates TO service_role;

ALTER TABLE public.openclaw_agent_templates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role_key = 'workspace_admin'
  );
$$;

CREATE POLICY "templates_select_authenticated"
  ON public.openclaw_agent_templates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "templates_admin_insert"
  ON public.openclaw_agent_templates FOR INSERT
  TO authenticated WITH CHECK (public.is_workspace_admin(auth.uid()));

CREATE POLICY "templates_admin_update"
  ON public.openclaw_agent_templates FOR UPDATE
  TO authenticated
  USING (public.is_workspace_admin(auth.uid()))
  WITH CHECK (public.is_workspace_admin(auth.uid()));

CREATE POLICY "templates_admin_delete"
  ON public.openclaw_agent_templates FOR DELETE
  TO authenticated USING (public.is_workspace_admin(auth.uid()));

CREATE TRIGGER update_openclaw_agent_templates_updated_at
  BEFORE UPDATE ON public.openclaw_agent_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_openclaw_templates_category ON public.openclaw_agent_templates(category) WHERE is_available;
