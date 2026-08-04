-- Fix audit_trigger_fn: replace explicit ::jsonb cast with to_jsonb() for composite type compatibility
-- PostgreSQL has no defined cast from composite row types (e.g. agents, workspace_secrets) to JSONB.
-- to_jsonb() is polymorphic and works for any type including composite row types.
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  ws_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    ws_id := COALESCE((to_jsonb(OLD))->>'workspace_id', NULL)::UUID;
  ELSE
    ws_id := COALESCE((to_jsonb(NEW))->>'workspace_id', NULL)::UUID;
  END IF;

  INSERT INTO public.audit_log (workspace_id, user_id, action, resource_type, resource_id, old_value, new_value)
  VALUES (
    ws_id, auth.uid(),
    TG_OP || '.' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    CASE TG_OP WHEN 'DELETE' THEN (to_jsonb(OLD))->>'id' ELSE (to_jsonb(NEW))->>'id' END,
    CASE TG_OP WHEN 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE TG_OP WHEN 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
