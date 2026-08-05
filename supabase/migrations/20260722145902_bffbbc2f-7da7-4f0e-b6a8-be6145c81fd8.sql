
CREATE SCHEMA IF NOT EXISTS internal;

CREATE TABLE IF NOT EXISTS internal.db_health_samples (
  id BIGSERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  wal_bytes BIGINT NOT NULL DEFAULT 0,
  connections_used INT NOT NULL DEFAULT 0,
  connections_max INT NOT NULL DEFAULT 0,
  connections_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  long_running_count INT NOT NULL DEFAULT 0,
  top_slow_mean_ms NUMERIC NOT NULL DEFAULT 0,
  top_slow_preview TEXT
);

CREATE INDEX IF NOT EXISTS db_health_samples_captured_at_idx
  ON internal.db_health_samples (captured_at DESC);

REVOKE ALL ON internal.db_health_samples FROM PUBLIC, anon, authenticated;
GRANT ALL ON internal.db_health_samples TO service_role;

CREATE OR REPLACE FUNCTION internal.capture_db_health_sample()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal, public, pg_catalog
AS $$
DECLARE
  v_wal BIGINT := 0;
  v_used INT := 0;
  v_max INT := 0;
  v_long INT := 0;
  v_mean NUMERIC := 0;
  v_preview TEXT := NULL;
BEGIN
  BEGIN
    SELECT COALESCE(SUM(size), 0) INTO v_wal FROM pg_ls_waldir();
  EXCEPTION WHEN OTHERS THEN v_wal := 0; END;

  SELECT count(*) INTO v_used FROM pg_stat_activity WHERE datname = current_database();
  SELECT setting::int INTO v_max FROM pg_settings WHERE name = 'max_connections';

  SELECT count(*) INTO v_long
  FROM pg_stat_activity
  WHERE state = 'active'
    AND datname = current_database()
    AND now() - query_start > interval '5 minutes';

  BEGIN
    SELECT mean_exec_time, left(query, 200)
      INTO v_mean, v_preview
    FROM pg_stat_statements
    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
    ORDER BY mean_exec_time DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_mean := 0; v_preview := NULL;
  END;

  INSERT INTO internal.db_health_samples(
    wal_bytes, connections_used, connections_max, connections_pct,
    long_running_count, top_slow_mean_ms, top_slow_preview
  ) VALUES (
    v_wal, v_used, COALESCE(v_max, 0),
    CASE WHEN COALESCE(v_max,0) > 0 THEN ROUND((v_used::numeric / v_max) * 100, 2) ELSE 0 END,
    v_long, COALESCE(v_mean, 0), v_preview
  );
END;
$$;

REVOKE ALL ON FUNCTION internal.capture_db_health_sample() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal.prune_db_health_samples()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = internal, pg_catalog
AS $$
  DELETE FROM internal.db_health_samples
  WHERE captured_at < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION internal.prune_db_health_samples() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_db_health_timeseries(_hours INT DEFAULT 24)
RETURNS TABLE (
  captured_at TIMESTAMPTZ,
  wal_bytes BIGINT,
  connections_used INT,
  connections_max INT,
  connections_pct NUMERIC,
  long_running_count INT,
  top_slow_mean_ms NUMERIC,
  top_slow_preview TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, internal, pg_catalog
AS $$
BEGIN
  IF NOT public.is_workspace_admin(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.captured_at, s.wal_bytes, s.connections_used, s.connections_max,
         s.connections_pct, s.long_running_count, s.top_slow_mean_ms, s.top_slow_preview
  FROM internal.db_health_samples s
  WHERE s.captured_at >= now() - make_interval(hours => GREATEST(1, LEAST(_hours, 168)))
  ORDER BY s.captured_at ASC
  LIMIT 2016;
END;
$$;

REVOKE ALL ON FUNCTION public.get_db_health_timeseries(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_db_health_timeseries(INT) TO authenticated;

-- Cron: capture every 5 min + prune daily
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'capture-db-health-every-5min') THEN
      PERFORM cron.unschedule('capture-db-health-every-5min');
    END IF;
    PERFORM cron.schedule(
      'capture-db-health-every-5min',
      '*/5 * * * *',
      'SELECT internal.capture_db_health_sample();'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-db-health-samples-daily') THEN
      PERFORM cron.unschedule('prune-db-health-samples-daily');
    END IF;
    PERFORM cron.schedule(
      'prune-db-health-samples-daily',
      '20 3 * * *',
      'SELECT internal.prune_db_health_samples();'
    );
  END IF;
END;
$$;

-- Seed first sample immediately so UI has data
SELECT internal.capture_db_health_sample();
