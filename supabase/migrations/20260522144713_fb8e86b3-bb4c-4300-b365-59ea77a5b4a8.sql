-- 1. Revoke EXECUTE from authenticated for all security definer functions in public
-- This addresses the linter warning about signed-in users being able to execute sensitive logic.
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT p.oid
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE p.prosecdef = true AND n.nspname = 'public'
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', func_record.oid::regprocedure);
    END LOOP;
END $$;

-- 2. Grant back only to what is absolutely necessary for the frontend (to be refined)
-- For now, we assume critical frontend features might need these, but we keep them restricted.
-- If any break, we will grant them back explicitly to 'authenticated'.

-- 3. Ensure search_path is also set for any functions in extensions or auth that might be exposed
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT p.oid
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE p.prosecdef = true AND n.nspname IN ('auth', 'storage')
    LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION %s SET search_path = %I, extensions', func_record.oid::regprocedure, func_record.nspname);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not set search_path for internal function %', func_record.oid;
        END;
    END LOOP;
END $$;
