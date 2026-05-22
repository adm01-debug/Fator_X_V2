
-- Aggressively fix search_path for all functions in public schema
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            n.nspname as schema_name,
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as identity_args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
    ) LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', r.function_name, r.identity_args);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not set search_path for function %', r.function_name;
        END;
    END LOOP;
END $$;

-- Revoke EXECUTE on all SECURITY DEFINER functions from public
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
        WHERE n.nspname = 'public' AND p.prosecdef = true
    ) LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM public, anon, authenticated', r.function_name, r.identity_args);
    END LOOP;
END $$;

-- Re-grant EXECUTE on functions that ARE meant to be public/authenticated
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.increment_webhook_counter(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_user_locked_out(text) TO anon, authenticated, service_role;

-- Add policies for tables that were enabled but had no policy
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename 
        FROM pg_tables t
        WHERE schemaname = 'public' 
        AND rowsecurity = true
        AND NOT EXISTS (
            SELECT 1 FROM pg_policies p 
            WHERE p.schemaname = 'public' 
            AND p.tablename = t.tablename
        )
    ) LOOP
        EXECUTE format('CREATE POLICY "Admins only" ON public.%I FOR ALL USING (
            EXISTS (
                SELECT 1 FROM public.workspace_members 
                WHERE user_id = auth.uid() 
                AND role IN (''admin'', ''owner'')
            )
        )', r.tablename);
    END LOOP;
END $$;
