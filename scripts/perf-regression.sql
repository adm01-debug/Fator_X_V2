-- ═══════════════════════════════════════════════════════════════════
-- Nexus — Teste de regressão de performance
-- ═══════════════════════════════════════════════════════════════════
-- Roda EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) nas consultas críticas
-- e valida contra um baseline persistido em internal.perf_regression_baseline.
--
-- Uso:
--   psql -f scripts/perf-regression.sql            # roda e imprime resultado
--   psql -v UPDATE_BASELINE=1 -f scripts/...       # atualiza baseline
--
-- CI: chame via workflow após qualquer migração que toque índices/schema.
-- ═══════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\timing off

-- Cria tabela de baseline se necessário
CREATE TABLE IF NOT EXISTS internal.perf_regression_baseline (
  query_name       TEXT PRIMARY KEY,
  baseline_ms      NUMERIC NOT NULL,
  baseline_buffers BIGINT  NOT NULL,
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal.perf_regression_runs (
  id           BIGSERIAL PRIMARY KEY,
  run_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  query_name   TEXT NOT NULL,
  duration_ms  NUMERIC NOT NULL,
  shared_hit   BIGINT NOT NULL,
  shared_read  BIGINT NOT NULL,
  regressed    BOOLEAN NOT NULL,
  plan_json    JSONB
);

-- Função que roda EXPLAIN e persiste o resultado
CREATE OR REPLACE FUNCTION internal.run_perf_check(p_name TEXT, p_sql TEXT)
RETURNS TABLE(query_name TEXT, duration_ms NUMERIC, buffers BIGINT, regressed BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan JSONB;
  v_ms   NUMERIC;
  v_hit  BIGINT;
  v_read BIGINT;
  v_baseline_ms NUMERIC;
  v_baseline_buf BIGINT;
  v_regressed BOOLEAN := false;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON, TIMING true) ' || p_sql INTO v_plan;
  v_ms   := (v_plan->0->>'Execution Time')::numeric;
  v_hit  := COALESCE((v_plan->0->'Plan'->>'Shared Hit Blocks')::bigint, 0);
  v_read := COALESCE((v_plan->0->'Plan'->>'Shared Read Blocks')::bigint, 0);

  SELECT baseline_ms, baseline_buffers INTO v_baseline_ms, v_baseline_buf
  FROM internal.perf_regression_baseline WHERE query_name = p_name;

  IF v_baseline_ms IS NOT NULL THEN
    -- Regressão: >2x mais lento OU >2x mais buffers lidos
    v_regressed := v_ms > v_baseline_ms * 2 OR (v_hit + v_read) > v_baseline_buf * 2;
  END IF;

  INSERT INTO internal.perf_regression_runs
    (query_name, duration_ms, shared_hit, shared_read, regressed, plan_json)
  VALUES (p_name, v_ms, v_hit, v_read, v_regressed, v_plan);

  RETURN QUERY SELECT p_name, v_ms, v_hit + v_read, v_regressed;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Consultas críticas monitoradas
-- ═══════════════════════════════════════════════════════════════════
SELECT * FROM internal.run_perf_check(
  'agent_traces_recent_by_agent',
  $q$ SELECT id, event, level, created_at
        FROM public.agent_traces
        WHERE created_at > now() - interval '24 hours'
        ORDER BY created_at DESC LIMIT 100 $q$
);

SELECT * FROM internal.run_perf_check(
  'audit_events_recent',
  $q$ SELECT id, event_type, created_at
        FROM public.audit_events
        WHERE created_at > now() - interval '7 days'
        ORDER BY created_at DESC LIMIT 100 $q$
);

SELECT * FROM internal.run_perf_check(
  'audit_log_v2_by_workspace',
  $q$ SELECT id, action, created_at
        FROM public.audit_log_v2
        WHERE created_at > now() - interval '30 days'
        ORDER BY created_at DESC LIMIT 100 $q$
);

SELECT * FROM internal.run_perf_check(
  'trace_events_v2_recent',
  $q$ SELECT id, event_type, created_at
        FROM public.trace_events_v2
        WHERE created_at > now() - interval '7 days'
        ORDER BY created_at DESC LIMIT 100 $q$
);

SELECT * FROM internal.run_perf_check(
  'sessions_by_user',
  $q$ SELECT id, agent_id, status, started_at
        FROM public.sessions
        ORDER BY started_at DESC LIMIT 50 $q$
);

-- Relatório final
\echo ''
\echo '═══ Últimos resultados de regressão ═══'
SELECT query_name,
       round(duration_ms::numeric, 2) AS ms,
       (shared_hit + shared_read) AS buffers,
       CASE WHEN regressed THEN '❌ REGRESSÃO' ELSE '✅ OK' END AS status
FROM internal.perf_regression_runs
WHERE run_at > now() - interval '5 minutes'
ORDER BY run_at DESC;

-- Falha CI se detectar regressão
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM internal.perf_regression_runs
  WHERE regressed = true AND run_at > now() - interval '5 minutes';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'REGRESSÃO DE PERFORMANCE DETECTADA em % consulta(s). Ver internal.perf_regression_runs.', v_count;
  END IF;
END $$;

-- Atualiza baseline quando explicitamente pedido
\if :{?UPDATE_BASELINE}
  \echo 'Atualizando baseline...'
  INSERT INTO internal.perf_regression_baseline (query_name, baseline_ms, baseline_buffers, captured_at)
  SELECT query_name, duration_ms, shared_hit + shared_read, now()
  FROM internal.perf_regression_runs
  WHERE run_at > now() - interval '5 minutes'
  ON CONFLICT (query_name) DO UPDATE
    SET baseline_ms = EXCLUDED.baseline_ms,
        baseline_buffers = EXCLUDED.baseline_buffers,
        captured_at = EXCLUDED.captured_at;
  \echo 'Baseline atualizado.'
\endif
