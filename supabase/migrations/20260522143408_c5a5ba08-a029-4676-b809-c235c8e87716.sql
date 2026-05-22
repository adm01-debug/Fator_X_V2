
-- Set view to security invoker
ALTER VIEW public.audit_log_safe SET (security_invoker = true);
