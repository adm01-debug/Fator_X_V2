
-- Enable RLS on all tables that don't have it
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    END LOOP;
END $$;

-- Fix search_path for SECURITY DEFINER functions
ALTER FUNCTION public.increment_webhook_counter(webhook_uuid uuid) SET search_path = public;
ALTER FUNCTION public.create_partition_if_not_exists(t_name text, p_date timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.is_user_locked_out(target_email text) SET search_path = public;
ALTER FUNCTION public.cleanup_old_auth_attempts() SET search_path = public;

-- Revoke execute from public/anon/authenticated for sensitive internal functions
REVOKE EXECUTE ON FUNCTION public.create_partition_if_not_exists(text, timestamp with time zone) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_auth_attempts() FROM public, anon, authenticated;

-- Create security_alerts table
CREATE TABLE IF NOT EXISTS public.security_alerts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID REFERENCES public.workspaces(id),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    category TEXT NOT NULL, -- 'auth', 'rls', 'rbac', 'api_key'
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on security_alerts
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view security alerts"
ON public.security_alerts
FOR SELECT
USING (
    workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Admins can update security alerts"
ON public.security_alerts
FOR UPDATE
USING (
    workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() 
        AND role IN ('admin', 'owner')
    )
);

-- Create a view for sensitive column protection if needed, 
-- but better to just ensure RLS is tight.
-- For workspace_secrets, ensure encrypted_value is never leaked to non-admins.
DROP POLICY IF EXISTS "Workspace members can view secrets" ON public.workspace_secrets;
CREATE POLICY "Admins can view secrets"
ON public.workspace_secrets
FOR SELECT
USING (
    workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() 
        AND role IN ('admin', 'owner')
    )
);

-- Protect API key hashes
DROP POLICY IF EXISTS "Users can view their own API keys" ON public.api_keys;
CREATE POLICY "Users can view their own API keys metadata"
ON public.api_keys
FOR SELECT
USING (auth.uid() = user_id);

-- Ensure key_hash is not returned in common queries if possible, 
-- but Postgres RLS doesn't easily hide columns. 
-- We'll rely on the application layer not selecting it unless needed.
