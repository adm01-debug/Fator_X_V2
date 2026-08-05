
CREATE OR REPLACE FUNCTION internal.smoke_test_health_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal, public, pg_temp
AS $$
DECLARE
  v_run_id       uuid := gen_random_uuid();
  v_marker       text;
  v_started      timestamptz := clock_timestamp();
  v_detector_ok  boolean;
  v_cron_active  boolean;
  v_alert_id     uuid;
  v_latency_ms   integer;
BEGIN
  v_marker := '__SMOKE_TEST__' || v_run_id::text;

  -- 1) Detector existe?
  v_detector_ok := to_regprocedure('internal.detect_health_trend_and_alert()') IS NOT NULL;
  IF NOT v_detector_ok THEN
    INSERT INTO public.security_alerts (severity, category, message, metadata)
    VALUES ('critical', 'performance.smoke_test',
            'Smoke test falhou: função detect_health_trend_and_alert ausente',
            jsonb_build_object('smoke_run_id', v_run_id, 'reason', 'detector_missing'));
    RETURN jsonb_build_object('status','fail','reason','detector_missing','smoke_run_id',v_run_id);
  END IF;

  -- 2) Cron do detector está ativo?
  SELECT COALESCE(bool_or(active), false)
    INTO v_cron_active
  FROM cron.job
  WHERE jobname = 'detect-health-trend-every-15min';

  IF NOT v_cron_active THEN
    INSERT INTO public.security_alerts (severity, category, message, metadata)
    VALUES ('critical', 'performance.smoke_test',
            'Smoke test falhou: cron detect-health-trend-every-15min inativo ou ausente',
            jsonb_build_object('smoke_run_id', v_run_id, 'reason', 'cron_inactive'));
    RETURN jsonb_build_object('status','fail','reason','cron_inactive','smoke_run_id',v_run_id);
  END IF;

  -- 3) Injeta 2 amostras sintéticas (spike de query lenta)
  --    top_slow_preview carrega o marker para permitir cleanup determinístico.
  INSERT INTO internal.db_health_samples
    (captured_at, wal_bytes, connections_used, connections_max, connections_pct,
     long_running_count, top_slow_mean_ms, top_slow_preview)
  VALUES
    (now() - interval '10 seconds', 0, 0, 100, 0, 0, 9999, v_marker),
    (now(),                          0, 0, 100, 0, 0, 9999, v_marker);

  -- 4) Chama o detector
  PERFORM internal.detect_health_trend_and_alert();

  -- 5) Valida disparo (últimos 30s)
  SELECT id INTO v_alert_id
  FROM public.security_alerts
  WHERE category = 'performance.slow_query_spike'
    AND created_at > v_started - interval '2 seconds'
  ORDER BY created_at DESC
  LIMIT 1;

  v_latency_ms := extract(milliseconds FROM (clock_timestamp() - v_started))::integer;

  IF v_alert_id IS NULL THEN
    -- Regra não disparou — pode ser dedupe de 60 min OU bug real
    INSERT INTO public.security_alerts (severity, category, message, metadata)
    VALUES ('critical', 'performance.smoke_test',
            format('Smoke test: regra slow_query_spike não disparou (latency %s ms)', v_latency_ms),
            jsonb_build_object(
              'smoke_run_id', v_run_id,
              'reason', 'no_alert',
              'latency_ms', v_latency_ms,
              'hint', 'pode ser dedupe de 60min contra alerta real recente'
            ));
  ELSE
    -- Sucesso: registra info e marca o alerta como resolvido pra não poluir a lista
    INSERT INTO public.security_alerts (severity, category, message, metadata,
                                        is_resolved, resolved_at)
    VALUES ('info', 'performance.smoke_test',
            format('Smoke test OK: alerta gerado em %s ms', v_latency_ms),
            jsonb_build_object(
              'smoke_run_id', v_run_id,
              'latency_ms', v_latency_ms,
              'validated_alert_id', v_alert_id
            ),
            true, now());

    UPDATE public.security_alerts
    SET is_resolved = true,
        resolved_at = now(),
        metadata = COALESCE(metadata, '{}'::jsonb)
                   || jsonb_build_object('smoke_run_id', v_run_id, 'auto_resolved_by', 'smoke_test')
    WHERE id = v_alert_id;
  END IF;

  -- 6) Cleanup determinístico
  DELETE FROM internal.db_health_samples WHERE top_slow_preview = v_marker;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_alert_id IS NULL THEN 'fail' ELSE 'ok' END,
    'smoke_run_id', v_run_id,
    'latency_ms', v_latency_ms,
    'alert_id', v_alert_id
  );

EXCEPTION WHEN OTHERS THEN
  -- Cleanup best-effort e alerta crítico com o erro
  BEGIN
    DELETE FROM internal.db_health_samples WHERE top_slow_preview = v_marker;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  INSERT INTO public.security_alerts (severity, category, message, metadata)
  VALUES ('critical', 'performance.smoke_test',
          'Smoke test falhou com exceção: ' || SQLERRM,
          jsonb_build_object('smoke_run_id', v_run_id, 'sqlstate', SQLSTATE));

  RETURN jsonb_build_object('status','error','smoke_run_id',v_run_id,'error',SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION internal.smoke_test_health_alerts() FROM PUBLIC, anon, authenticated;

-- Agendamento a cada 6h em minuto deslocado (evita colidir com detector em */15)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('smoke-test-health-alerts-every-6h');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'smoke-test-health-alerts-every-6h',
      '7 */6 * * *',
      'SELECT internal.smoke_test_health_alerts();'
    );
  END IF;
END;
$$;
