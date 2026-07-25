
-- Final cleanup for SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.increment_webhook_counter(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_webhook_counter(uuid) TO service_role;

-- Check if any other SD functions are still executable by authenticated
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as identity_args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
        AND p.prosecdef = true
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) LOOP
        -- Skip is_user_locked_out as it might be needed for some flows, 
        -- but usually authenticated users don't need it.
        IF r.function_name != 'is_user_locked_out' THEN
            EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', r.function_name, r.identity_args);
        END IF;
    END LOOP;
END $$;
