-- 1. Tabela de Auditoria Unificada
CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID,
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Política: Apenas administradores podem ver logs
CREATE POLICY "Admins can view workspace audit logs"
ON public.audit_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND workspace_id = audit_events.workspace_id
    AND role_key = 'workspace_admin'
  )
);

-- Política: Sistema pode inserir (sem restrição de UID para permitir chamadas de backend/edge)
CREATE POLICY "System can insert audit logs"
ON public.audit_events
FOR INSERT
WITH CHECK (true);

-- 2. Índices de Performance
CREATE INDEX IF NOT EXISTS idx_agent_traces_v2_2026_05_agent_created ON public.agent_traces_v2_2026_05(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_records_workspace_created ON public.usage_records(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_workspace_event ON public.audit_events(workspace_id, event_type);

-- 3. Restrições de Integridade
ALTER TABLE public.budgets ADD CONSTRAINT budget_limit_positive CHECK (limit_usd > 0);
ALTER TABLE public.agent_usage ADD CONSTRAINT requests_non_negative CHECK (requests >= 0);

-- 4. Função de Agregação de Custos
CREATE OR REPLACE FUNCTION public.get_workspace_daily_usage_v2(p_workspace_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (usage_date DATE, total_tokens BIGINT, total_cost_usd NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    created_at::date as usage_date,
    SUM(tokens) as total_tokens,
    SUM(cost_usd) as total_cost_usd
  FROM public.usage_records
  WHERE workspace_id = p_workspace_id
    AND created_at > now() - (p_days || ' days')::interval
  GROUP BY 1
  ORDER BY 1 DESC;
END;
$$ LANGUAGE plpgsql STABLE;
