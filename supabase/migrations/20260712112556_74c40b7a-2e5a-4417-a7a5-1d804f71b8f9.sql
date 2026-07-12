
CREATE STATISTICS IF NOT EXISTS stat_agent_traces_agent_level
  (dependencies, ndistinct, mcv) ON agent_id, level FROM public.agent_traces;

CREATE STATISTICS IF NOT EXISTS stat_agent_traces_agent_event
  (dependencies, ndistinct) ON agent_id, event FROM public.agent_traces;

CREATE STATISTICS IF NOT EXISTS stat_audit_log_v2_ws_action
  (dependencies, ndistinct, mcv) ON workspace_id, action FROM public.audit_log_v2;

CREATE STATISTICS IF NOT EXISTS stat_audit_log_v2_ws_resource
  (dependencies, ndistinct) ON workspace_id, resource_type FROM public.audit_log_v2;

CREATE STATISTICS IF NOT EXISTS stat_trace_events_v2_ws_type
  (dependencies, ndistinct) ON workspace_id, event_type FROM public.trace_events_v2;

CREATE STATISTICS IF NOT EXISTS stat_trace_events_v2_agent_type
  (dependencies, ndistinct) ON agent_id, event_type FROM public.trace_events_v2;

CREATE STATISTICS IF NOT EXISTS stat_audit_events_ws_type
  (dependencies, ndistinct, mcv) ON workspace_id, event_type FROM public.audit_events;

CREATE STATISTICS IF NOT EXISTS stat_audit_events_ws_action
  (dependencies, ndistinct) ON workspace_id, action FROM public.audit_events;

CREATE STATISTICS IF NOT EXISTS stat_sessions_agent_status
  (dependencies, ndistinct) ON agent_id, status FROM public.sessions;

CREATE STATISTICS IF NOT EXISTS stat_sessions_user_status
  (dependencies, ndistinct) ON user_id, status FROM public.sessions;

CREATE STATISTICS IF NOT EXISTS stat_agents_ws_status
  (dependencies, ndistinct, mcv) ON workspace_id, status FROM public.agents;

CREATE STATISTICS IF NOT EXISTS stat_security_alerts_ws_sev
  (dependencies, ndistinct, mcv) ON workspace_id, severity FROM public.security_alerts;

ANALYZE public.agent_traces;
ANALYZE public.audit_log_v2;
ANALYZE public.trace_events_v2;
ANALYZE public.audit_events;
ANALYZE public.sessions;
ANALYZE public.agents;
ANALYZE public.security_alerts;
