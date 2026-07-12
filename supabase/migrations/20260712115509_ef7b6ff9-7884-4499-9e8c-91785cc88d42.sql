
-- Autovacuum agressivo por partição folha
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.oid::regclass::text AS tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND (c.relname LIKE 'agent_traces_v2_%'
        OR c.relname LIKE 'audit_log_v2_%'
        OR c.relname LIKE 'trace_events_v2_%'
        OR c.relname LIKE 'agent_traces_2%')
  LOOP
    EXECUTE format($f$
      ALTER TABLE %s SET (
        autovacuum_vacuum_scale_factor = 0.02,
        autovacuum_analyze_scale_factor = 0.01,
        autovacuum_vacuum_threshold = 1000,
        autovacuum_analyze_threshold = 500,
        autovacuum_vacuum_cost_limit = 2000,
        autovacuum_vacuum_insert_scale_factor = 0.05,
        autovacuum_vacuum_insert_threshold = 5000,
        fillfactor = 95
      )
    $f$, r.tbl);
  END LOOP;
END $$;

-- Tabelas simples (não particionadas)
ALTER TABLE public.audit_events SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_insert_scale_factor = 0.05
);
ALTER TABLE public.security_alerts SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
ALTER TABLE public.sessions SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- Índices parciais (cascateiam em tabelas particionadas)
CREATE INDEX IF NOT EXISTS idx_agent_traces_errors_recent
  ON public.agent_traces (agent_id, created_at DESC)
  WHERE level IN ('error', 'critical');

CREATE INDEX IF NOT EXISTS idx_security_alerts_unresolved
  ON public.security_alerts (workspace_id, severity, created_at DESC)
  WHERE is_resolved = false;

CREATE INDEX IF NOT EXISTS idx_audit_log_v2_failures
  ON public.audit_log_v2 (workspace_id, created_at DESC)
  WHERE status IN ('failed', 'denied', 'error');

CREATE INDEX IF NOT EXISTS idx_sessions_active
  ON public.sessions (agent_id, started_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_trace_events_v2_failed
  ON public.trace_events_v2 (agent_id, created_at DESC)
  WHERE status = 'failed';

ANALYZE public.audit_events;
ANALYZE public.security_alerts;
ANALYZE public.sessions;
