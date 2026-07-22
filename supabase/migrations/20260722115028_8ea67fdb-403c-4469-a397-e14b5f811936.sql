
ALTER VIEW public.slack_dispatch_health SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION internal.slack_cleanup_dedupe() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION internal.slack_cleanup_dedupe() TO service_role;
