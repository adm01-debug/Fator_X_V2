-- Idempotency Keys table
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    status_code INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON public.idempotency_keys(expires_at);

-- Enable RLS
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Only service role should access this directly for internal logic
DROP POLICY IF EXISTS "Service role only" ON public.idempotency_keys;
CREATE POLICY "Service role only" ON public.idempotency_keys
USING (auth.role() = 'service_role');
