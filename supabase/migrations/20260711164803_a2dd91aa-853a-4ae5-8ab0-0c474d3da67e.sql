CREATE INDEX IF NOT EXISTS idx_audit_events_created_at 
  ON public.audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_alerts_workspace_triggered_unack 
  ON public.cost_alerts (workspace_id, triggered_at DESC) 
  WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_traces_agent_level_created 
  ON public.agent_traces (agent_id, created_at DESC) 
  WHERE level = 'error';

CREATE INDEX IF NOT EXISTS idx_audit_log_v2_created_at 
  ON public.audit_log_v2 (created_at DESC);