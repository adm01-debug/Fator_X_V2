
CREATE TABLE public.user_research_configs (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_research_configs TO authenticated;
GRANT ALL ON public.user_research_configs TO service_role;

ALTER TABLE public.user_research_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own research config"
  ON public.user_research_configs
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_user_research_configs_updated_at
  BEFORE UPDATE ON public.user_research_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
