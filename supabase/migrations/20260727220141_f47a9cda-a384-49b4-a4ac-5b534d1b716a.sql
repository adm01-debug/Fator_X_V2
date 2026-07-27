CREATE TABLE public.template_skill_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id TEXT NOT NULL,
  skill_id UUID NOT NULL REFERENCES public.skill_registry(id) ON DELETE CASCADE,
  score NUMERIC(6,3) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  is_strong_match BOOLEAN NOT NULL DEFAULT false,
  department_match BOOLEAN NOT NULL DEFAULT false,
  matched_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
  origin TEXT NOT NULL DEFAULT 'auto' CHECK (origin IN ('auto','manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT template_skill_links_unique UNIQUE (template_id, skill_id)
);

GRANT SELECT ON public.template_skill_links TO authenticated;
GRANT ALL ON public.template_skill_links TO service_role;

ALTER TABLE public.template_skill_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read template skill links"
ON public.template_skill_links FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage template skill links"
ON public.template_skill_links FOR ALL TO authenticated
USING (public.is_workspace_admin((SELECT auth.uid())))
WITH CHECK (public.is_workspace_admin((SELECT auth.uid())));

CREATE INDEX idx_tsl_template ON public.template_skill_links (template_id);
CREATE INDEX idx_tsl_skill ON public.template_skill_links (skill_id);
CREATE INDEX idx_tsl_strong ON public.template_skill_links (template_id, is_strong_match, score DESC);

CREATE TRIGGER update_template_skill_links_updated_at
BEFORE UPDATE ON public.template_skill_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();