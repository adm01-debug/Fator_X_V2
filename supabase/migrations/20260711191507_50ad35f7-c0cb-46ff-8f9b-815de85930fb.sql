-- BRIN indexes: extremamente compactos (~kb) e ideais para colunas
-- time-series append-only. Aceleram varreduras por intervalo de datas
-- sem o overhead de manutenção de um btree.

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at_brin
  ON public.audit_events USING BRIN (created_at)
  WITH (pages_per_range = 32);

CREATE INDEX IF NOT EXISTS idx_agent_traces_created_at_brin
  ON public.agent_traces USING BRIN (created_at)
  WITH (pages_per_range = 32);

-- Índice composto para o padrão de acesso dominante em drilldowns:
-- "traces recentes de um agente específico" (ORDER BY created_at DESC).
-- Cobre exatamente o WHERE + ORDER BY sem sort adicional.
CREATE INDEX IF NOT EXISTS idx_agent_traces_agent_created_desc
  ON public.agent_traces (agent_id, created_at DESC);

-- Índice composto para auditoria por workspace em janelas temporais
-- (usado pela view audit_log_safe e pelo painel de segurança).
CREATE INDEX IF NOT EXISTS idx_audit_events_workspace_created_desc
  ON public.audit_events (workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;

-- Refresca estatísticas para o planner reconhecer os novos índices imediatamente.
ANALYZE public.audit_events;
ANALYZE public.agent_traces;