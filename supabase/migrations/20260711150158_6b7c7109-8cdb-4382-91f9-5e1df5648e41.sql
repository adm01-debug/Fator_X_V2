
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.pg_net_schema() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.pg_net_smoke_post(text, jsonb) FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.pg_net_smoke_response(bigint) FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
