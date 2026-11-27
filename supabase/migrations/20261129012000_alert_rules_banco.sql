-- ============================================================================
-- alert_rules: completa a tabela para receber as regras que a tela ja edita
--
-- src/pages/AgentAlertsPage.tsx configura regras ricas (metrica, agregacao,
-- janela, severidade, canais, descricao), mas src/services/alertRulesService.ts
-- gravava tudo em window.localStorage (linha 77). A tabela public.alert_rules
-- existe desde 20260401200000:178 com RLS ativa e policy por workspace, e
-- NENHUMA tela a le. Resultado: regra configurada se perde ao trocar de
-- navegador/dispositivo ou limpar o cache, e nao vale para o workspace.
--
-- Esta migration so acrescenta o que falta. Nada e removido e nenhuma policy
-- existente e alterada - "alert_rules_all" ja cobre FOR ALL por workspace.
-- ============================================================================

ALTER TABLE public.alert_rules
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS aggregation TEXT NOT NULL DEFAULT 'avg',
  ADD COLUMN IF NOT EXISTS window_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS channels TEXT[] NOT NULL DEFAULT ARRAY['toast']::TEXT[],
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- A tabela nasceu sem CHECK em aggregation/window_minutes. Os valores validos
-- vem de src/lib/alertMetrics.ts (METRIC_CATALOG / AlertAggregation).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'alert_rules_aggregation_check'
       AND conrelid = 'public.alert_rules'::regclass
  ) THEN
    ALTER TABLE public.alert_rules
      ADD CONSTRAINT alert_rules_aggregation_check
      CHECK (aggregation IN ('avg', 'sum', 'max', 'min', 'p95', 'count'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'alert_rules_window_minutes_check'
       AND conrelid = 'public.alert_rules'::regclass
  ) THEN
    ALTER TABLE public.alert_rules
      ADD CONSTRAINT alert_rules_window_minutes_check
      CHECK (window_minutes IN (5, 15, 60, 1440));
  END IF;
END $$;

-- A policy cobre workspace; este indice evita varredura ao listar por agente.
CREATE INDEX IF NOT EXISTS idx_alert_rules_agent_id
  ON public.alert_rules(agent_id, created_at DESC)
  WHERE agent_id IS NOT NULL;

-- Reaproveita a funcao de trigger que o repo ja mantem para updated_at.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'alert_rules_set_updated_at' AND tgrelid = 'public.alert_rules'::regclass
    ) THEN
      CREATE TRIGGER alert_rules_set_updated_at
        BEFORE UPDATE ON public.alert_rules
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN public.alert_rules.agent_id IS
  'Agente dono da regra. NULL = regra de workspace (todas as telas de agente veem).';
COMMENT ON COLUMN public.alert_rules.aggregation IS
  'Agregacao aplicada na janela: avg|sum|max|min|p95|count. Espelha AlertAggregation.';
COMMENT ON COLUMN public.alert_rules.window_minutes IS
  'Janela de avaliacao em minutos: 5|15|60|1440. Espelha AlertWindowMin.';
COMMENT ON COLUMN public.alert_rules.channels IS
  'Canais de notificacao: toast|email|webhook. Espelha AlertChannel[].';