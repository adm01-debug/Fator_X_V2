CREATE TABLE IF NOT EXISTS public.skill_harvest_checkpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  -- Chave canônica do conjunto de repositórios (slugs minúsculos, ordenados, unidos por '|').
  repo_key TEXT NOT NULL,
  repos TEXT[] NOT NULL DEFAULT '{}'::text[],
  file_offset INTEGER NOT NULL DEFAULT 0,
  total_files INTEGER NOT NULL DEFAULT 0,
  inserted_total INTEGER NOT NULL DEFAULT 0,
  last_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT skill_harvest_checkpoints_repo_key_not_blank CHECK (length(btrim(repo_key)) > 0),
  CONSTRAINT skill_harvest_checkpoints_offset_non_negative CHECK (file_offset >= 0),
  CONSTRAINT skill_harvest_checkpoints_totals_non_negative CHECK (total_files >= 0 AND inserted_total >= 0),
  CONSTRAINT skill_harvest_checkpoints_unique_per_user UNIQUE (user_id, repo_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.skill_harvest_checkpoints TO authenticated;
GRANT ALL ON public.skill_harvest_checkpoints TO service_role;

ALTER TABLE public.skill_harvest_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Curadores gerenciam os proprios checkpoints"
  ON public.skill_harvest_checkpoints
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Retomada consulta sempre pelo par (dono, chave); o índice único já cobre,
-- mas a limpeza por idade precisa de acesso ordenado por updated_at.
CREATE INDEX IF NOT EXISTS idx_skill_harvest_checkpoints_stale
  ON public.skill_harvest_checkpoints (updated_at DESC);

CREATE TRIGGER update_skill_harvest_checkpoints_updated_at
  BEFORE UPDATE ON public.skill_harvest_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();