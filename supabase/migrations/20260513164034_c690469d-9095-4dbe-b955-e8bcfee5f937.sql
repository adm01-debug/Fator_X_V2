-- Fix Search Path for newly created functions
ALTER FUNCTION public.is_user_locked_out(TEXT) SET search_path = public;
ALTER FUNCTION public.is_mfa_valid_for_role() SET search_path = public;

-- Revoke public execution to satisfy security linter
REVOKE EXECUTE ON FUNCTION public.is_user_locked_out(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_mfa_valid_for_role() FROM PUBLIC;

-- Grant to authenticated users only if necessary (for lockout check during login it might need more nuance, but for now we follow best practices)
GRANT EXECUTE ON FUNCTION public.is_user_locked_out(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_mfa_valid_for_role() TO authenticated, service_role;
