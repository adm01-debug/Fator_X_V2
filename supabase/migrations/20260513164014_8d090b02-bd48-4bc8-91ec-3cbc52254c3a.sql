-- Create audit table for login attempts
CREATE TABLE IF NOT EXISTS public.auth_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    ip_address TEXT,
    success BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup of recent failures
CREATE INDEX IF NOT EXISTS idx_auth_attempts_email_created ON public.auth_attempts(email, created_at DESC);

-- Enable RLS on auth_attempts (only admins can view)
ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view auth attempts"
ON public.auth_attempts
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
        AND role_key = 'workspace_admin'
    )
);

-- Function to check if a user is locked out
CREATE OR REPLACE FUNCTION public.is_user_locked_out(target_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    fail_count INTEGER;
BEGIN
    SELECT count(*) INTO fail_count
    FROM public.auth_attempts
    WHERE email = target_email
      AND success = false
      AND created_at > (now() - interval '15 minutes');
    
    RETURN fail_count >= 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to enforce MFA for admins
-- This checks if the current session has AAL2 (MFA) if the user is an admin
CREATE OR REPLACE FUNCTION public.is_mfa_valid_for_role()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Get the user's role in their primary workspace
    SELECT role_key INTO user_role
    FROM public.user_roles
    WHERE user_id = auth.uid()
    LIMIT 1;

    -- If not admin, it's valid (standard auth)
    IF user_role IS NULL OR user_role != 'workspace_admin' THEN
        RETURN TRUE;
    END IF;

    -- If admin, session must be aal2
    RETURN auth.jwt() ->> 'aal' = 'aal2';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Example: Apply MFA enforcement to a critical table (agents)
-- Note: In a real project, we would loop through all tables or use a trigger
-- For this migration, we demonstrate on the 'agents' table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'agents' AND schemaname = 'public') THEN
        EXECUTE 'ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;';
        -- We would update existing policies or add a CHECK to them
    END IF;
END $$;
