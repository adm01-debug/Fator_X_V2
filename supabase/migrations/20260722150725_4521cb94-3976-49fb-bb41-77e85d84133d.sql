
CREATE OR REPLACE FUNCTION internal.detect_health_trend_and_alert()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal, public, pg_temp
AS $$
DECLARE
  v_latest      internal.db_health_samples;
  v_prev_hour   internal.db_health_samples;
  v_last3       internal.db_health_samples[];
  v_last2       internal.db_health_samples[];
  v_alerts_created int := 0;
  v_wal_ratio   numeric;
  v_wal_delta   bigint;
  v_all_high    boolean;
  v_all_slow    boolean;
BEGIN
  SELECT * INTO v_latest
  FROM internal.db_health_samples
  ORDER BY captured_at DESC
  LIMIT 1;

  IF v_latest IS NULL THEN
    RETURN jsonb_build_object('status','no_samples','alerts',0);
  END IF;

  -- ── WAL growth (última vs ~60 min atrás) ───────────────────────
  SELECT * INTO v_prev_hour
  FROM internal.db_health_samples
  WHERE captured_at <= now() - interval '55 minutes'
    AND captured_at >= now() - interval '75 minutes'
  ORDER BY captured_at DESC
  LIMIT 1;

  IF v_prev_hour IS NOT NULL AND v_prev_hour.wal_bytes > 0 THEN
    v_wal_ratio := v_latest.wal_bytes::numeric / v_prev_hour.wal_bytes::numeric;
    v_wal_delta := v_latest.wal_bytes - v_prev_hour.wal_bytes;

    IF v_wal_ratio >= 1.5 AND v_wal_delta >= 128 * 1024 * 1024 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.security_alerts
        WHERE category = 'performance.wal_growth'
          AND created_at > now() - interval '60 minutes'
      ) THEN
        INSERT INTO public.security_alerts (severity, category, message, metadata)
        VALUES (
          'warning',
          'performance.wal_growth',
          format('WAL cresceu %sx em 1h (+%s MB)',
                 round(v_wal_ratio, 2),
                 round(v_wal_delta::numeric / (1024*1024), 1)),
          jsonb_build_object(
            'wal_bytes_now',  v_latest.wal_bytes,
            'wal_bytes_prev', v_prev_hour.wal_bytes,
            'ratio',          round(v_wal_ratio, 3),
            'delta_mb',       round(v_wal_delta::numeric / (1024*1024), 1)
          )
        );
        v_alerts_created := v_alerts_created + 1;
      END IF;
    END IF;
  END IF;

  -- ── Conexões saturando (3 amostras seguidas ≥ 80%) ─────────────
  SELECT array_agg(s ORDER BY s.captured_at DESC) INTO v_last3
  FROM (
    SELECT * FROM internal.db_health_samples
    ORDER BY captured_at DESC
    LIMIT 3
  ) s;

  IF v_last3 IS NOT NULL AND array_length(v_last3, 1) = 3 THEN
    v_all_high := v_last3[1].connections_pct >= 80
              AND v_last3[2].connections_pct >= 80
              AND v_last3[3].connections_pct >= 80;

    IF v_all_high THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.security_alerts
        WHERE category = 'performance.connections_saturation'
          AND created_at > now() - interval '60 minutes'
      ) THEN
        INSERT INTO public.security_alerts (severity, category, message, metadata)
        VALUES (
          'critical',
          'performance.connections_saturation',
          format('Conexões ≥ 80%% em 3 amostras (última: %s%%)', v_last3[1].connections_pct),
          jsonb_build_object(
            'samples_pct', jsonb_build_array(
              v_last3[1].connections_pct,
              v_last3[2].connections_pct,
              v_last3[3].connections_pct
            )
          )
        );
        v_alerts_created := v_alerts_created + 1;
      END IF;
    END IF;
  END IF;

  -- ── Spike de query lenta (2 amostras ≥ 5000 ms) ───────────────
  SELECT array_agg(s ORDER BY s.captured_at DESC) INTO v_last2
  FROM (
    SELECT * FROM internal.db_health_samples
    ORDER BY captured_at DESC
    LIMIT 2
  ) s;

  IF v_last2 IS NOT NULL AND array_length(v_last2, 1) = 2 THEN
    v_all_slow := v_last2[1].top_slow_mean_ms >= 5000
              AND v_last2[2].top_slow_mean_ms >= 5000;

    IF v_all_slow THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.security_alerts
        WHERE category = 'performance.slow_query_spike'
          AND created_at > now() - interval '60 minutes'
      ) THEN
        INSERT INTO public.security_alerts (severity, category, message, metadata)
        VALUES (
          'warning',
          'performance.slow_query_spike',
          format('Query mais lenta em %s ms (2 amostras seguidas)',
                 round(v_last2[1].top_slow_mean_ms)),
          jsonb_build_object(
            'samples_mean_ms', jsonb_build_array(
              v_last2[1].top_slow_mean_ms,
              v_last2[2].top_slow_mean_ms
            )
          )
        );
        v_alerts_created := v_alerts_created + 1;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'alerts_created', v_alerts_created,
    'checked_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION internal.detect_health_trend_and_alert() FROM PUBLIC, anon, authenticated;

-- Agendamento a cada 15 min
DO $$
BEGIN
  PERFORM cron.unschedule('detect-health-trend-every-15min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'detect-health-trend-every-15min',
  '*/15 * * * *',
  $cron$ SELECT internal.detect_health_trend_and_alert(); $cron$
);
