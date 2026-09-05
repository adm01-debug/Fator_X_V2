-- Fix audit_trigger_fn for two issues:
-- 1. SQLSTATE 42846: (NEW::jsonb) / (OLD::jsonb) fail for composite row types.
--    Fix: use to_jsonb() which is polymorphic and works for any type.
-- 2. SQLSTATE 42703: columns workspace_id, resource_type, resource_id, old_value,
--    new_value don't exist in audit_log (created by 20260401001008 with schema:
--    id, user_id, action, entity_type, entity_id, metadata, ip_address, created_at).
--    Fix: use the actual column names and pack extra fields into metadata.
-- 3. NULL auth.uid() during migrations: user_id is NOT NULL in early schema.
--    Fix: return early when no authenticated session (migration context).
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  ws_id UUID;
  row_id TEXT;
BEGIN
  -- No-op during migrations: auth.uid() is NULL, and user_id is NOT NULL in audit_log.
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    ws_id := COALESCE((to_jsonb(OLD))->>'workspace_id', NULL)::UUID;
    row_id := (to_jsonb(OLD))->>'id';
  ELSE
    ws_id := COALESCE((to_jsonb(NEW))->>'workspace_id', NULL)::UUID;
    row_id := (to_jsonb(NEW))->>'id';
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    TG_OP || '.' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    row_id,
    jsonb_build_object(
      'workspace_id', ws_id,
      'old_value', CASE TG_OP WHEN 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
      'new_value', CASE TG_OP WHEN 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
