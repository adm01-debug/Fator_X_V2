-- WAVE 4 — Autovacuum tuning (aplicado em partições folha + tabelas simples).

-- Partições folha de agent_traces (partitioned)
ALTER TABLE public.agent_traces_v2_2026_05 SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_cost_limit = 2000,
  autovacuum_vacuum_insert_scale_factor = 0.05,
  fillfactor = 95
);

-- Partições folha de audit_log_v2
ALTER TABLE public.audit_log_v2_2026_06 SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_insert_scale_factor = 0.05,
  fillfactor = 100
);
-- audit_log_v2_2026_05 já existe como tabela simples (não é partição)
ALTER TABLE public.audit_log_v2_2026_05 SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_insert_scale_factor = 0.05,
  fillfactor = 100
);

-- Partições folha de trace_events_v2
ALTER TABLE public.trace_events_v2_2026_05 SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_insert_scale_factor = 0.05,
  fillfactor = 100
);
ALTER TABLE public.trace_events_v2_2026_06 SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_insert_scale_factor = 0.05,
  fillfactor = 100
);

-- Tabelas simples (relkind='r')
ALTER TABLE public.audit_events SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_insert_scale_factor = 0.05,
  fillfactor = 100
);

ALTER TABLE public.usage_records SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_insert_scale_factor = 0.1,
  fillfactor = 95
);

ALTER TABLE public.webhook_events SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05,
  fillfactor = 85
);

-- Analyze imediato para o planner incorporar as novas estatísticas.
ANALYZE public.agent_traces;
ANALYZE public.audit_events;
ANALYZE public.audit_log_v2;
ANALYZE public.trace_events_v2;
ANALYZE public.usage_records;
ANALYZE public.webhook_events;