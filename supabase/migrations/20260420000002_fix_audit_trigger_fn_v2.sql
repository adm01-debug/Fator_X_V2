-- v2: re-apply corrected audit_trigger_fn.
-- 20260420000001 was already applied with wrong column names and cannot be
-- re-applied by modifying it (Supabase only applies new filenames).
-- Fixes:
--   1. to_jsonb() instead of ::jsonb for composite row types
--   2. Correct column names: entity_type, entity_id, metadata
--      (audit_log created by 20260401001008 lacks workspace_id, resource_type, etc.)
--   3. Early return when auth.uid() IS NULL (migration context has no JWT session)
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  ws_id UUID;
  row_id TEXT;
BEGIN
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
