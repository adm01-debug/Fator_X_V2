ALTER FUNCTION public.get_slo_summary(integer) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.get_slo_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_slo_summary(integer) TO authenticated, service_role;