
REVOKE EXECUTE ON FUNCTION public.pg_net_schema() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pg_net_smoke_post(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pg_net_smoke_response(bigint) FROM anon, authenticated;
