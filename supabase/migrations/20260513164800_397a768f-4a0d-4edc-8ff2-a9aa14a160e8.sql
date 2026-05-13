-- Partitioned Audit Log
CREATE TABLE IF NOT EXISTS public.audit_log_v2 (
    id UUID DEFAULT gen_random_uuid(),
    user_id UUID,
    workspace_id UUID,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    resource_name TEXT,
    reason TEXT,
    status TEXT DEFAULT 'success',
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create initial partitions
CREATE TABLE IF NOT EXISTS public.audit_log_v2_2026_05 PARTITION OF public.audit_log_v2 FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS public.audit_log_v2_2026_06 PARTITION OF public.audit_log_v2 FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Partitioned Trace Events
CREATE TABLE IF NOT EXISTS public.trace_events_v2 (
    id UUID DEFAULT gen_random_uuid(),
    trace_id TEXT NOT NULL,
    agent_id UUID,
    workspace_id UUID,
    event_type TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'ok',
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS public.trace_events_v2_2026_05 PARTITION OF public.trace_events_v2 FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS public.trace_events_v2_2026_06 PARTITION OF public.trace_events_v2 FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Migrate data with mapping
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'audit_log' AND schemaname = 'public') THEN
        INSERT INTO public.audit_log_v2 (id, user_id, action, resource_type, resource_id, metadata, ip_address, created_at)
        SELECT id, user_id, action, entity_type, entity_id, metadata, ip_address, created_at
        FROM public.audit_log;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'trace_events' AND schemaname = 'public') THEN
        INSERT INTO public.trace_events_v2 (id, trace_id, event_type, data, created_at)
        SELECT id, session_trace_id::text, event_type, data, created_at
        FROM public.trace_events;
    END IF;
END $$;

-- Enable RLS
ALTER TABLE public.audit_log_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trace_events_v2 ENABLE ROW LEVEL SECURITY;
