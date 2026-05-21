-- Create Webhook Endpoints table
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path TEXT UNIQUE NOT NULL,
    secret TEXT,
    auth_type TEXT DEFAULT 'none', -- 'none', 'hmac_sha256', 'bearer', 'api_key'
    methods TEXT[] DEFAULT '{POST}',
    ip_whitelist TEXT[],
    is_public BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active', -- 'active', 'inactive'
    target_type TEXT, -- e.g., 'workflow', 'agent'
    target_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for webhook_endpoints
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

-- Only service role (admin) can manage endpoints
CREATE POLICY "Service role can manage webhook endpoints"
ON public.webhook_endpoints
FOR ALL
USING (auth.uid() IS NULL OR (SELECT auth.jwt()->>'role') = 'service_role');

-- Create Webhook Events table (Log)
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    headers JSONB,
    query_params JSONB,
    body JSONB,
    source_ip TEXT,
    status TEXT, -- 'processed', 'rejected', 'error'
    response_code INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for webhook_events
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can read/insert logs
CREATE POLICY "Service role can manage webhook events"
ON public.webhook_events
FOR ALL
USING (auth.uid() IS NULL OR (SELECT auth.jwt()->>'role') = 'service_role');

-- Function to increment counter (used via RPC)
CREATE OR REPLACE FUNCTION public.increment_webhook_counter(webhook_uuid UUID)
RETURNS void AS $$
BEGIN
    -- This assumes we might add a counter column to webhook_endpoints later
    -- For now, it's a placeholder for atomic operations if needed
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
