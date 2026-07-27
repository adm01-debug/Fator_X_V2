ALTER TABLE public.template_skill_links REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'template_skill_links'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.template_skill_links;
  END IF;
END
$$;