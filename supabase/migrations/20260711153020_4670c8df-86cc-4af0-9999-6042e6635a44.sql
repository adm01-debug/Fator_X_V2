
-- S7: Trigger de validação de consistência workspace_id em oncall_schedule
CREATE OR REPLACE FUNCTION public.validate_oncall_workspace_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = NEW.workspace_id
      AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'User % is not a member of workspace %', NEW.user_id, NEW.workspace_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = NEW.workspace_id
      AND user_id = NEW.created_by
  ) THEN
    RAISE EXCEPTION 'Creator % is not a member of workspace %', NEW.created_by, NEW.workspace_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_oncall_workspace ON public.oncall_schedule;
CREATE TRIGGER trg_validate_oncall_workspace
  BEFORE INSERT OR UPDATE ON public.oncall_schedule
  FOR EACH ROW EXECUTE FUNCTION public.validate_oncall_workspace_consistency();

-- S6: View SECURITY INVOKER para workspace_members omitindo PII de convites
CREATE OR REPLACE VIEW public.workspace_members_public
WITH (security_invoker = true) AS
SELECT id, workspace_id, user_id, role, name
FROM public.workspace_members;

GRANT SELECT ON public.workspace_members_public TO authenticated;
COMMENT ON VIEW public.workspace_members_public IS
  'Projeção pública de workspace_members sem timestamps de convite (PII). security_invoker respeita RLS do chamador.';

-- Column-level security para custos
CREATE OR REPLACE VIEW public.usage_records_cost_safe
WITH (security_invoker = true) AS
SELECT
  ur.id,
  ur.workspace_id,
  ur.agent_id,
  ur.record_type,
  ur.tokens,
  ur.created_at,
  CASE
    WHEN public.is_workspace_admin(auth.uid(), ur.workspace_id) THEN ur.cost_usd
    ELSE NULL
  END AS cost_usd,
  CASE
    WHEN public.is_workspace_admin(auth.uid(), ur.workspace_id) THEN ur.metadata
    ELSE '{}'::jsonb
  END AS metadata
FROM public.usage_records ur;

GRANT SELECT ON public.usage_records_cost_safe TO authenticated;
COMMENT ON VIEW public.usage_records_cost_safe IS
  'Column-level security: cost_usd e metadata só revelados a admins do workspace.';
