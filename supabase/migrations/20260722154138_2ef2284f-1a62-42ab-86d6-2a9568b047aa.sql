-- Fase 14 — Smoke coverage estendido (WAL + Connections) + Painel SLO

-- ============================================================
-- 1. Smoke test: WAL growth
-- ============================================================
CREATE OR REPLACE FUNCTION internal.smoke_test_wal_growth()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal, public, pg_catalog
AS $$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_marker text;
  v_now timestamptz := now();
  v_alert_id uuid;
  v_result jsonb;
BEGIN
  v_marker := '__SMOKE_WAL__' || v_run_id::text;

  -- Injeta baseline (t-62min) com WAL baixo e current (agora) com WAL +256MB
  INSERT INTO internal.db_health_samples
    (captured_at, wal_bytes, connections_pct, top_slow_mean_ms, top_slow_preview)
  VALUES
    (v_now - interval '62 minutes', 100 * 1024 * 1024, 10, 0, v_marker),
    (v_now,                          356 * 1024 * 1024, 10, 0, v_marker);

  -- Executa detector
  IF to_regprocedure('internal.detect_health_trend_and_alert()') IS NULL THEN
    RAISE EXCEPTION 'detector ausente';
  END IF;
  PERFORM internal.detect_health_trend_and_alert();

  -- Valida
  SELECT id INTO v_alert_id
  FROM public.security_alerts
  WHERE category = 'performance.wal_growth'
    AND created_at >= v_now - interval '1 minute'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_alert_id IS NULL THEN
    INSERT INTO public.security_alerts (severity, category, message, metadata)
    VALUES ('critical', 'performance.smoke_test',
      'Smoke WAL falhou: detector não gerou wal_growth',
      jsonb_build_object('run_id', v_run_id, 'marker', v_marker));
    v_result := jsonb_build_object('ok', false, 'reason', 'no_alert');
  ELSE
    UPDATE public.security_alerts
    SET is_resolved = true, resolved_at = now(),
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('smoke_run', v_run_id)
    WHERE id = v_alert_id;

    INSERT INTO public.security_alerts (severity, category, message, metadata, is_resolved, resolved_at)
    VALUES ('info', 'performance.smoke_test',
      'Smoke WAL OK',
      jsonb_build_object('run_id', v_run_id, 'validated_alert_id', v_alert_id),
      true, now());
    v_result := jsonb_build_object('ok', true, 'alert_id', v_alert_id);
  END IF;

  DELETE FROM internal.db_health_samples WHERE top_slow_preview = v_marker;
  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  DELETE FROM internal.db_health_samples WHERE top_slow_preview = v_marker;
  INSERT INTO public.security_alerts (severity, category, message, metadata)
  VALUES ('critical', 'performance.smoke_test',
    'Smoke WAL crashou: ' || SQLERRM,
    jsonb_build_object('run_id', v_run_id));
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION internal.smoke_test_wal_growth() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 2. Smoke test: Connections saturation
-- ============================================================
CREATE OR REPLACE FUNCTION internal.smoke_test_connections_saturation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal, public, pg_catalog
AS $$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_marker text;
  v_now timestamptz := now();
  v_alert_id uuid;
  v_result jsonb;
BEGIN
  v_marker := '__SMOKE_CONN__' || v_run_id::text;

  -- 3 amostras consecutivas com conexões acima do threshold
  INSERT INTO internal.db_health_samples
    (captured_at, wal_bytes, connections_pct, top_slow_mean_ms, top_slow_preview)
  VALUES
    (v_now - interval '10 minutes', 50 * 1024 * 1024, 85, 0, v_marker),
    (v_now - interval '5 minutes',  50 * 1024 * 1024, 87, 0, v_marker),
    (v_now,                          50 * 1024 * 1024, 90, 0, v_marker);

  IF to_regprocedure('internal.detect_health_trend_and_alert()') IS NULL THEN
    RAISE EXCEPTION 'detector ausente';
  END IF;
  PERFORM internal.detect_health_trend_and_alert();

  SELECT id INTO v_alert_id
  FROM public.security_alerts
  WHERE category = 'performance.connections_saturation'
    AND created_at >= v_now - interval '1 minute'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_alert_id IS NULL THEN
    INSERT INTO public.security_alerts (severity, category, message, metadata)
    VALUES ('critical', 'performance.smoke_test',
      'Smoke Connections falhou: detector não gerou connections_saturation',
      jsonb_build_object('run_id', v_run_id, 'marker', v_marker));
    v_result := jsonb_build_object('ok', false, 'reason', 'no_alert');
  ELSE
    UPDATE public.security_alerts
    SET is_resolved = true, resolved_at = now(),
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('smoke_run', v_run_id)
    WHERE id = v_alert_id;

    INSERT INTO public.security_alerts (severity, category, message, metadata, is_resolved, resolved_at)
    VALUES ('info', 'performance.smoke_test',
      'Smoke Connections OK',
      jsonb_build_object('run_id', v_run_id, 'validated_alert_id', v_alert_id),
      true, now());
    v_result := jsonb_build_object('ok', true, 'alert_id', v_alert_id);
  END IF;

  DELETE FROM internal.db_health_samples WHERE top_slow_preview = v_marker;
  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  DELETE FROM internal.db_health_samples WHERE top_slow_preview = v_marker;
  INSERT INTO public.security_alerts (severity, category, message, metadata)
  VALUES ('critical', 'performance.smoke_test',
    'Smoke Connections crashou: ' || SQLERRM,
    jsonb_build_object('run_id', v_run_id));
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION internal.smoke_test_connections_saturation() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3. Agendar crons (offsets primos vs detector */15)
-- ============================================================
DO $$
DECLARE
  v_jid bigint;
BEGIN
  SELECT jobid INTO v_jid FROM cron.job WHERE jobname = 'smoke-test-wal-every-6h';
  IF v_jid IS NOT NULL THEN PERFORM cron.unschedule(v_jid); END IF;

  SELECT jobid INTO v_jid FROM cron.job WHERE jobname = 'smoke-test-conn-every-6h';
  IF v_jid IS NOT NULL THEN PERFORM cron.unschedule(v_jid); END IF;
END $$;

SELECT cron.schedule(
  'smoke-test-wal-every-6h',
  '13 */6 * * *',
  $$SELECT internal.smoke_test_wal_growth();$$
);

SELECT cron.schedule(
  'smoke-test-conn-every-6h',
  '19 */6 * * *',
  $$SELECT internal.smoke_test_connections_saturation();$$
);

-- ============================================================
-- 4. RPC pública para painel SLO (admin-only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_detector_slo_status()
RETURNS TABLE(
  job_name text,
  schedule text,
  active boolean,
  last_run_at timestamptz,
  last_status text,
  seconds_since_last_run bigint,
  slo_ok boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, cron, pg_catalog
AS $$
BEGIN
  IF NOT public.is_workspace_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  WITH watched AS (
    SELECT * FROM (VALUES
      ('detect-health-trend-every-15min', 900),      -- SLO: 15min
      ('smoke-test-health-alerts-every-6h', 21600),  -- SLO: 6h
      ('smoke-test-wal-every-6h', 21600),
      ('smoke-test-conn-every-6h', 21600)
    ) AS t(name, slo_sec)
  ),
  latest AS (
    SELECT DISTINCT ON (jrd.jobid)
      jrd.jobid, jrd.start_time, jrd.status
    FROM cron.job_run_details jrd
    ORDER BY jrd.jobid, jrd.start_time DESC
  )
  SELECT
    w.name::text,
    coalesce(j.schedule, 'unscheduled')::text,
    coalesce(j.active, false),
    l.start_time,
    coalesce(l.status, 'unknown')::text,
    CASE WHEN l.start_time IS NULL THEN NULL
         ELSE extract(epoch FROM (now() - l.start_time))::bigint END,
    CASE
      WHEN j.jobid IS NULL OR NOT j.active THEN false
      WHEN l.start_time IS NULL THEN true  -- recém-criado, tolera
      ELSE extract(epoch FROM (now() - l.start_time)) < (w.slo_sec * 2)
    END
  FROM watched w
  LEFT JOIN cron.job j ON j.jobname = w.name
  LEFT JOIN latest l ON l.jobid = j.jobid
  ORDER BY w.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_detector_slo_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_detector_slo_status() TO authenticated;