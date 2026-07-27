ALTER TABLE public.template_skill_links
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE OR REPLACE FUNCTION public.template_skill_links_set_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.origin = 'manual' THEN
      NEW.created_by := COALESCE(NEW.created_by, auth.uid());
      NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
    ELSE
      NEW.created_by := NULL;
      NEW.updated_by := NULL;
    END IF;
  ELSE
    IF NEW.origin = 'manual' THEN
      NEW.created_by := COALESCE(OLD.created_by, auth.uid());
      NEW.updated_by := COALESCE(auth.uid(), OLD.updated_by);
    ELSE
      NEW.created_by := NULL;
      NEW.updated_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_template_skill_links_actor ON public.template_skill_links;
CREATE TRIGGER trg_template_skill_links_actor
BEFORE INSERT OR UPDATE ON public.template_skill_links
FOR EACH ROW EXECUTE FUNCTION public.template_skill_links_set_actor();

CREATE INDEX IF NOT EXISTS idx_tsl_manual_recent
  ON public.template_skill_links (updated_at DESC)
  WHERE origin = 'manual';