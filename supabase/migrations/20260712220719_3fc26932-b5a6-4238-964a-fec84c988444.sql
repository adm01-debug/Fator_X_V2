
-- Rollback rate monitoring: snapshots + per-minute rate + alerts

CREATE TABLE IF NOT EXISTS internal.rollback_snapshots (
  id BIGSERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  xact_commit BIGINT NOT NULL,
  xact_rollback BIGINT NOT NULL,
  deadlocks BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rollback_snapshots_captured_at
  ON internal.rollback_snapshots (captured_at DESC);

-- Sampler: insert current pg_stat_database values
CREATE OR REPLACE FUNCTION internal.sample_rollback_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal, pg_catalog
AS $$
DECLARE
  v_commit BIGINT;
  v_rollback BIGINT;
  v_deadlocks BIGINT;
  v_prev_rollback BIGINT;
  v_prev_time TIMESTAMPTZ;
  v_delta BIGINT;
  v_minutes NUMERIC;
  v_rate NUMERIC;
BEGIN
  SELECT xact_commit, xact_rollback, deadlocks
    INTO v_commit, v_rollback, v_deadlocks
  FROM pg_stat_database
  WHERE datname = current_database();

  INSERT INTO internal.rollback_snapshots (xact_commit, xact_rollback, deadlocks)
  VALUES (v_commit, v_rollback, v_deadlocks);

  -- Compute rate vs previous snapshot; emit alert if > 10/min
  SELECT xact_rollback, captured_at
    INTO v_prev_rollback, v_prev_time
  FROM internal.rollback_snapshots
  WHERE captured_at < now() - INTERVAL '30 seconds'
  ORDER BY captured_at DESC
  LIMIT 1;

  IF v_prev_rollback IS NOT NULL THEN
    v_delta := v_rollback - v_prev_rollback;
    v_minutes := GREATEST(EXTRACT(EPOCH FROM (now() - v_prev_time)) / 60.0, 0.01);
    v_rate := v_delta / v_minutes;

    IF v_rate > 10 THEN
      INSERT INTO public.security_alerts (severity, category, title, description, metadata)
      VALUES (
        CASE WHEN v_rate > 50 THEN 'critical' WHEN v_rate > 25 THEN 'high' ELSE 'medium' END,
        'database_health',
        'Rollback rate elevado',
        format('Taxa de rollbacks: %.2f/min (delta %s em %.2f min)', v_rate, v_delta, v_minutes),
        jsonb_build_object('rate_per_min', v_rate, 'delta', v_delta, 'window_minutes', v_minutes)
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Retention: keep 7 days of snapshots
  DELETE FROM internal.rollback_snapshots WHERE captured_at < now() - INTERVAL '7 days';
END;
$$;

-- Public read: rollback rate per minute over last N minutes
CREATE OR REPLACE FUNCTION public.get_rollback_rate_per_min(window_minutes INT DEFAULT 60)
RETURNS TABLE (
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  rollback_delta BIGINT,
  minutes NUMERIC,
  rate_per_min NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, internal, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  WITH bounds AS (
    SELECT
      (SELECT MIN(captured_at) FROM internal.rollback_snapshots
        WHERE captured_at >= now() - (window_minutes || ' minutes')::INTERVAL) AS ws,
      (SELECT MAX(captured_at) FROM internal.rollback_snapshots) AS we
  ),
  vals AS (
    SELECT
      (SELECT xact_rollback FROM internal.rollback_snapshots
        WHERE captured_at = (SELECT ws FROM bounds)) AS r_start,
      (SELECT xact_rollback FROM internal.rollback_snapshots
        WHERE captured_at = (SELECT we FROM bounds)) AS r_end,
      (SELECT ws FROM bounds) AS ws,
      (SELECT we FROM bounds) AS we
  )
  SELECT
    v.ws,
    v.we,
    COALESCE(v.r_end - v.r_start, 0)::BIGINT,
    GREATEST(EXTRACT(EPOCH FROM (v.we - v.ws)) / 60.0, 0.01)::NUMERIC,
    (COALESCE(v.r_end - v.r_start, 0) / GREATEST(EXTRACT(EPOCH FROM (v.we - v.ws)) / 60.0, 0.01))::NUMERIC
  FROM vals v
  WHERE v.ws IS NOT NULL AND v.we IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rollback_rate_per_min(INT) TO authenticated, service_role;

-- Schedule sampler every minute
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sample-rollback-stats';
    PERFORM cron.schedule(
      'sample-rollback-stats',
      '* * * * *',
      $cron$SELECT internal.sample_rollback_stats();$cron$
    );
  END IF;
END $$;
