-- 1. Extension Isolation
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
DECLARE current_schema text;
BEGIN
  SELECT extnamespace::regnamespace::text INTO current_schema
  FROM pg_extension WHERE extname = 'vector';
  IF current_schema IS NOT NULL AND current_schema != 'extensions' THEN
    ALTER EXTENSION "vector" SET SCHEMA extensions;
  END IF;
END $$;

-- 2. Security Definer Search Path Hardening (Using OID for precision)
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT p.oid, p.proname, n.nspname 
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE p.prosecdef = true AND n.nspname = 'public'
    LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', func_record.oid::regprocedure);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not set search_path for function % (%)', func_record.proname, func_record.oid;
        END;
    END LOOP;
END $$;

-- 3. Restrict EXECUTE on sensitive functions
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT p.oid, p.proname 
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE p.prosecdef = true AND n.nspname = 'public'
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', func_record.oid::regprocedure);
    END LOOP;
END $$;

-- 4. RLS Policy Hardening
-- auth_attempts
DO $$ BEGIN
  ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN END; $$;

DROP POLICY IF EXISTS "Allow anonymous inserts for auth tracking" ON public.auth_attempts;
DROP POLICY IF EXISTS "Allow authenticated or specific system inserts" ON public.auth_attempts;
CREATE POLICY "Allow authenticated or specific system inserts" 
ON public.auth_attempts 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- audit_events
DO $$ BEGIN
  ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN END; $$;

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_events;
DROP POLICY IF EXISTS "Only service role or authenticated can log events" ON public.audit_events;
CREATE POLICY "Only service role or authenticated can log events" 
ON public.audit_events 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 5. Security Alerts Table Hardening
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view security alerts" ON public.security_alerts;
CREATE POLICY "Admins can view security alerts" 
ON public.security_alerts 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM workspace_members 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
);

DROP POLICY IF EXISTS "Admins can update security alerts" ON public.security_alerts;
CREATE POLICY "Admins can update security alerts" 
ON public.security_alerts 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM workspace_members 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
);
