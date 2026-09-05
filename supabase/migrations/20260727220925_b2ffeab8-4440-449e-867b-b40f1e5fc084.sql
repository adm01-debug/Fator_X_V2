GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_skill_links TO authenticated;
GRANT ALL ON public.template_skill_links TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'template_skill_links_origin_check'
  ) THEN
    ALTER TABLE public.template_skill_links
      ADD CONSTRAINT template_skill_links_origin_check
      CHECK (origin IN ('auto', 'manual'));
  END IF;
END $$;