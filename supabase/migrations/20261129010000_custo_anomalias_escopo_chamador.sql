-- ============================================================================
-- Escopa o detector de anomalias de custo ao workspace do chamador.
--
-- compute_cost_baselines() e detect_cost_anomalies()
-- (20261126230000_recuperar_funcoes_e_triggers.sql:654 e :724) sao
-- SECURITY DEFINER e varrem agent_traces de TODOS os workspaces, gravando em
-- cost_baselines e cost_alerts. Como funcoes de public nascem executaveis por
-- PUBLIC, qualquer usuario autenticado disparava um recalculo global ao clicar
-- no botao da tela (CostBaselinePanel.tsx:90, CostAnomaliesPage.tsx:62).
--
-- As irmas do mesmo arquivo ja escopam:
--   get_current_spend        -> get_user_workspace_ids(auth.uid())
--   acknowledge_cost_alert   -> is_workspace_admin(auth.uid(), v_ws)
--   check_budget             -> guarda de escopo (20261129006000)
--
-- Aqui a regra e: usuario autenticado processa os workspaces dos quais e
-- membro; service_role (auth.uid() NULL) segue processando todos, para cron e
-- operacao. O resto da logica e identico ao original.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_cost_baselines()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
  v_uid UUID := auth.uid();
BEGIN
  -- Workspace-level baselines
  INSERT INTO public.cost_baselines (workspace_id, scope, scope_id, hour_of_day, day_of_week, avg_cost_usd, stddev_cost_usd, sample_count, computed_at)
  SELECT
    a.workspace_id,
    'workspace',
    NULL,
    EXTRACT(HOUR FROM t.created_at)::int,
    EXTRACT(DOW FROM t.created_at)::int,
    COALESCE(AVG(hourly_cost), 0),
    COALESCE(STDDEV(hourly_cost), 0),
    COUNT(*),
    now()
  FROM (
    SELECT
      tt.agent_id,
      date_trunc('hour', tt.created_at) AS hour_bucket,
      tt.created_at,
      SUM(tt.cost_usd) AS hourly_cost
    FROM public.agent_traces tt
    WHERE tt.created_at >= now() - interval '14 days'
      AND tt.cost_usd IS NOT NULL
    GROUP BY tt.agent_id, date_trunc('hour', tt.created_at), tt.created_at
  ) t
  JOIN public.agents a ON a.id = t.agent_id
  WHERE a.workspace_id IS NOT NULL
    AND (v_uid IS NULL OR a.workspace_id IN (SELECT public.get_user_workspace_ids(v_uid)))
  GROUP BY a.workspace_id, EXTRACT(HOUR FROM t.created_at), EXTRACT(DOW FROM t.created_at)
  ON CONFLICT (workspace_id, scope, scope_id, hour_of_day, day_of_week)
  DO UPDATE SET
    avg_cost_usd = EXCLUDED.avg_cost_usd,
    stddev_cost_usd = EXCLUDED.stddev_cost_usd,
    sample_count = EXCLUDED.sample_count,
    computed_at = now();
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Agent-level baselines
  INSERT INTO public.cost_baselines (workspace_id, scope, scope_id, hour_of_day, day_of_week, avg_cost_usd, stddev_cost_usd, sample_count, computed_at)
  SELECT
    a.workspace_id,
    'agent',
    a.id::text,
    EXTRACT(HOUR FROM t.created_at)::int,
    EXTRACT(DOW FROM t.created_at)::int,
    COALESCE(AVG(t.cost_usd), 0),
    COALESCE(STDDEV(t.cost_usd), 0),
    COUNT(*),
    now()
  FROM public.agent_traces t
  JOIN public.agents a ON a.id = t.agent_id
  WHERE t.created_at >= now() - interval '14 days'
    AND t.cost_usd IS NOT NULL
    AND a.workspace_id IS NOT NULL
    AND (v_uid IS NULL OR a.workspace_id IN (SELECT public.get_user_workspace_ids(v_uid)))
  GROUP BY a.workspace_id, a.id, EXTRACT(HOUR FROM t.created_at), EXTRACT(DOW FROM t.created_at)
  ON CONFLICT (workspace_id, scope, scope_id, hour_of_day, day_of_week)
  DO UPDATE SET
    avg_cost_usd = EXCLUDED.avg_cost_usd,
    stddev_cost_usd = EXCLUDED.stddev_cost_usd,
    sample_count = EXCLUDED.sample_count,
    computed_at = now();

  RETURN jsonb_build_object('status', 'ok', 'computed_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.detect_cost_anomalies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerts INTEGER := 0;
  v_hour INTEGER := EXTRACT(HOUR FROM now())::int;
  v_dow INTEGER := EXTRACT(DOW FROM now())::int;
  v_uid UUID := auth.uid();
  r RECORD;
  v_z NUMERIC;
  v_severity TEXT;
BEGIN
  FOR r IN
    SELECT
      a.workspace_id,
      a.id AS agent_id,
      a.name AS agent_name,
      SUM(t.cost_usd) AS observed
    FROM public.agent_traces t
    JOIN public.agents a ON a.id = t.agent_id
    WHERE t.created_at >= now() - interval '1 hour'
      AND t.cost_usd IS NOT NULL
      AND a.workspace_id IS NOT NULL
      AND (v_uid IS NULL OR a.workspace_id IN (SELECT public.get_user_workspace_ids(v_uid)))
    GROUP BY a.workspace_id, a.id, a.name
    HAVING SUM(t.cost_usd) > 0.10
  LOOP
    -- find baseline for this agent
    SELECT
      CASE WHEN cb.stddev_cost_usd > 0
        THEN (r.observed - cb.avg_cost_usd) / cb.stddev_cost_usd
        ELSE 0
      END,
      cb.avg_cost_usd
    INTO v_z, r.observed
    FROM public.cost_baselines cb
    WHERE cb.workspace_id = r.workspace_id
      AND cb.scope = 'agent'
      AND cb.scope_id = r.agent_id::text
      AND cb.hour_of_day = v_hour
      AND cb.day_of_week = v_dow
      AND cb.sample_count >= 3
    LIMIT 1;

    IF v_z IS NULL OR v_z < 2 THEN CONTINUE; END IF;

    v_severity := CASE WHEN v_z >= 3 THEN 'critical' WHEN v_z >= 2 THEN 'warning' ELSE 'info' END;

    -- Avoid duplicate alerts within 1 hour
    IF EXISTS (
      SELECT 1 FROM public.cost_alerts
      WHERE workspace_id = r.workspace_id
        AND scope = 'agent'
        AND scope_id = r.agent_id::text
        AND triggered_at >= now() - interval '1 hour'
    ) THEN CONTINUE; END IF;

    INSERT INTO public.cost_alerts (workspace_id, scope, scope_id, scope_label, observed_cost_usd, baseline_cost_usd, z_score, severity)
    VALUES (r.workspace_id, 'agent', r.agent_id::text, r.agent_name, r.observed,
            (SELECT avg_cost_usd FROM public.cost_baselines WHERE workspace_id = r.workspace_id AND scope='agent' AND scope_id=r.agent_id::text AND hour_of_day=v_hour AND day_of_week=v_dow LIMIT 1),
            v_z, v_severity);
    v_alerts := v_alerts + 1;
  END LOOP;

  RETURN jsonb_build_object('alerts_created', v_alerts, 'checked_at', now());
END;
$$;

COMMENT ON FUNCTION public.compute_cost_baselines() IS
  'Recalcula baselines de custo. Escopado aos workspaces de auth.uid(); service_role (auth.uid() NULL) processa todos.';
COMMENT ON FUNCTION public.detect_cost_anomalies() IS
  'Gera alertas de anomalia de custo. Escopado aos workspaces de auth.uid(); service_role (auth.uid() NULL) processa todos.';