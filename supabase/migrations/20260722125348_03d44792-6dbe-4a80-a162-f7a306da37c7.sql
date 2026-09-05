
INSERT INTO public.workspaces(id, name, owner_id)
VALUES ('00000000-0000-0000-0000-0000f8000000','test_fase8_ws',NULL)
ON CONFLICT (id) DO NOTHING;

-- Ensure the unique constraint exists (it was declared inside CREATE TABLE IF NOT EXISTS
-- in 20260405000002 which was a no-op because the table already existed)
DO $$ BEGIN
  ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_workspace_uq UNIQUE (user_id, workspace_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO public.user_roles(user_id, role_key, workspace_id)
VALUES ('00000000-0000-0000-0000-00000000f801','workspace_admin','00000000-0000-0000-0000-0000f8000000')
ON CONFLICT (user_id, workspace_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public._fase8_snapshot_as(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(_uid::text,''), true);
  BEGIN
    v := public.get_db_health_snapshot();
    RETURN v;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('__error__', SQLERRM);
  END;
END;
$$;
REVOKE ALL ON FUNCTION public._fase8_snapshot_as(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fase8_snapshot_as(uuid) TO postgres;
