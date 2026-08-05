
-- State table (internal schema, service_role only)
CREATE TABLE IF NOT EXISTS internal.detector_slo_state (
  job_name TEXT PRIMARY KEY,
  consecutive_failures INT NOT NULL DEFAULT 0,
  last_alerted_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON internal.detector_slo_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON internal.detector_slo_state TO service_role;

-- Detection function
CREATE OR REPLACE FUNCTION internal.detect_slo_breach_and_alert()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
DECLARE
  v_job RECORD;
  v_state RECORD;
  v_alerts_created INT := 0;
  v_jobs_checked INT := 0;
  v_slo_multiplier INT := 2; -- SLO breach = 2x cadence
  v_dedupe_minutes INT := 60;
  v_min_consecutive INT := 2;
  v_expected_interval_secs INT;
  v_slo_ok BOOLEAN;
BEGIN
  FOR v_job IN
    SELECT
      j.jobname AS job_name,
      j.schedule,
      j.active,
      (
        SELECT MAX(d.start_time)
        FROM cron.job_run_details d
        WHERE d.jobid = j.jobid
      ) AS last_run_at,
      (
        SELECT d.status
        FROM cron.job_run_details d
        WHERE d.jobid = j.jobid
        ORDER BY d.start_time DESC
        LIMIT 1
      ) AS last_status
    FROM cron.job j
    WHERE j.jobname IN (
      'detect-health-trend-every-15min',
      'smoke-test-health-alerts-every-6h',
      'smoke-test-wal-every-6h',
      'smoke-test-conn-every-6h'
    )
  LOOP
    v_jobs_checked := v_jobs_checked + 1;

    -- Estimate expected interval from schedule (minutes portion of cron)
    v_expected_interval_secs := CASE
      WHEN v_job.schedule LIKE '%*/15%' THEN 15 * 60
      WHEN v_job.schedule LIKE '%*/6%'  THEN 6 * 3600
      ELSE 3600
    END;

    v_slo_ok := v_job.active
      AND v_job.last_run_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (now() - v_job.last_run_at)) <= v_expected_interval_secs * v_slo_multiplier
      AND COALESCE(v_job.last_status, 'unknown') = 'succeeded';

    -- Upsert state
    INSERT INTO internal.detector_slo_state (job_name, consecutive_failures, last_checked_at, updated_at)
    VALUES (
      v_job.job_name,
      CASE WHEN v_slo_ok THEN 0 ELSE 1 END,
      now(),
      now()
    )
    ON CONFLICT (job_name) DO UPDATE
      SET consecutive_failures = CASE
            WHEN v_slo_ok THEN 0
            ELSE internal.detector_slo_state.consecutive_failures + 1
          END,
          last_checked_at = now(),
          updated_at = now()
    RETURNING * INTO v_state;

    -- Alert if breached
    IF NOT v_slo_ok
       AND v_state.consecutive_failures >= v_min_consecutive
       AND (v_state.last_alerted_at IS NULL
            OR v_state.last_alerted_at < now() - (v_dedupe_minutes || ' minutes')::interval)
    THEN
      INSERT INTO public.security_alerts (
        severity, category, message, metadata, created_at
      )
      VALUES (
        'critical',
        'performance.detector_slo',
        format('Detector "%s" fora do SLO por %s checagens consecutivas',
               v_job.job_name, v_state.consecutive_failures),
        jsonb_build_object(
          'job_name', v_job.job_name,
          'schedule', v_job.schedule,
          'active', v_job.active,
          'last_run_at', v_job.last_run_at,
          'last_status', v_job.last_status,
          'consecutive_failures', v_state.consecutive_failures,
          'expected_interval_secs', v_expected_interval_secs,
          'slo_multiplier', v_slo_multiplier
        ),
        now()
      );

      UPDATE internal.detector_slo_state
      SET last_alerted_at = now()
      WHERE job_name = v_job.job_name;

      v_alerts_created := v_alerts_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'jobs_checked', v_jobs_checked,
    'alerts_created', v_alerts_created,
    'checked_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION internal.detect_slo_breach_and_alert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.detect_slo_breach_and_alert() TO service_role;

-- Schedule
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-slo-breach-every-15min') THEN
      PERFORM cron.unschedule('detect-slo-breach-every-15min');
    END IF;
    PERFORM cron.schedule(
      'detect-slo-breach-every-15min',
      '3,18,33,48 * * * *',
      'SELECT internal.detect_slo_breach_and_alert();'
    );
  END IF;
END;
$$;
