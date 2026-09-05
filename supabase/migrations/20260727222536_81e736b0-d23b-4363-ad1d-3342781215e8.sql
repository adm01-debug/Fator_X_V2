ALTER TABLE public.template_skill_links
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_tsl_removed_recent
  ON public.template_skill_links (updated_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tsl_active_template
  ON public.template_skill_links (template_id, is_strong_match, score DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.template_skill_links_set_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSE
    NEW.updated_by := COALESCE(auth.uid(), OLD.updated_by);
    -- Marca/limpa o autor da remoção reversível de forma consistente.
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      NEW.deleted_by := COALESCE(auth.uid(), NEW.deleted_by);
    ELSIF NEW.deleted_at IS NULL THEN
      NEW.deleted_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;