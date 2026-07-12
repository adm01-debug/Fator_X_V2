
DROP FUNCTION IF EXISTS internal.capture_perf_snapshot();
DROP FUNCTION IF EXISTS internal.set_perf_baseline();
DROP FUNCTION IF EXISTS internal.detect_perf_regressions();

CREATE SCHEMA IF NOT EXISTS internal;

CREATE TABLE IF NOT EXISTS internal.query_perf_baseline (
  queryid           BIGINT PRIMARY KEY,
  query_sample      TEXT NOT NULL,
  calls             BIGINT NOT NULL,
  total_exec_ms     NUMERIC NOT NULL,
  mean_exec_ms      NUMERIC NOT NULL,
  stddev_exec_ms    NUMERIC NOT NULL,
  rows_returned     BIGINT NOT NULL,
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal.query_perf_snapshots (
  id                BIGSERIAL PRIMARY KEY,
  snapshot_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  queryid           BIGINT NOT NULL,
  query_sample      TEXT NOT NULL,
  calls             BIGINT NOT NULL,
  total_exec_ms     NUMERIC NOT NULL,
  mean_exec_ms      NUMERIC NOT NULL,
  stddev_exec_ms    NUMERIC NOT NULL,
  rows_returned     BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_query_perf_snapshots_at
  ON internal.query_perf_snapshots (snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_perf_snapshots_queryid
  ON internal.query_perf_snapshots (queryid, snapshot_at DESC);

CREATE OR REPLACE FUNCTION internal.capture_perf_snapshot()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal, public, extensions
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  INSERT INTO internal.query_perf_snapshots
    (queryid, query_sample, calls, total_exec_ms, mean_exec_ms, stddev_exec_ms, rows_returned)
  SELECT
    s.queryid, LEFT(s.query, 500), s.calls,
    s.total_exec_time, s.mean_exec_time, s.stddev_exec_time, s.rows
  FROM extensions.pg_stat_statements s
  JOIN pg_database d ON d.oid = s.dbid
  WHERE d.datname = current_database()
    AND s.query NOT ILIKE '%pg_stat_statements%'
    AND s.query NOT ILIKE '%internal.%'
    AND s.calls >= 5
  ORDER BY s.total_exec_time DESC
  LIMIT 100;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  DELETE FROM internal.query_perf_snapshots
  WHERE snapshot_at < now() - INTERVAL '30 days';

  RETURN v_inserted;
END $$;

CREATE OR REPLACE FUNCTION internal.set_perf_baseline()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal, public, extensions
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  TRUNCATE internal.query_perf_baseline;

  INSERT INTO internal.query_perf_baseline
    (queryid, query_sample, calls, total_exec_ms, mean_exec_ms, stddev_exec_ms, rows_returned)
  SELECT
    s.queryid, LEFT(s.query, 500), s.calls,
    s.total_exec_time, s.mean_exec_time, s.stddev_exec_time, s.rows
  FROM extensions.pg_stat_statements s
  JOIN pg_database d ON d.oid = s.dbid
  WHERE d.datname = current_database()
    AND s.query NOT ILIKE '%pg_stat_statements%'
    AND s.query NOT ILIKE '%internal.%'
    AND s.calls >= 10
  ORDER BY s.total_exec_time DESC
  LIMIT 200;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION internal.detect_perf_regressions()
RETURNS TABLE(
  queryid           BIGINT,
  query_sample      TEXT,
  baseline_mean_ms  NUMERIC,
  current_mean_ms   NUMERIC,
  slowdown_factor   NUMERIC,
  calls_delta       BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = internal, public, extensions
AS $$
  SELECT
    b.queryid,
    b.query_sample,
    ROUND(b.mean_exec_ms::numeric, 2),
    ROUND(s.mean_exec_time::numeric, 2),
    ROUND((s.mean_exec_time / NULLIF(b.mean_exec_ms, 0))::numeric, 2),
    (s.calls - b.calls)
  FROM internal.query_perf_baseline b
  JOIN extensions.pg_stat_statements s ON s.queryid = b.queryid
  WHERE s.mean_exec_time > b.mean_exec_ms * 2
    AND s.mean_exec_time > 5
    AND s.calls > b.calls + 10
  ORDER BY 5 DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION internal.capture_perf_snapshot() FROM public;
REVOKE ALL ON FUNCTION internal.set_perf_baseline() FROM public;
REVOKE ALL ON FUNCTION internal.detect_perf_regressions() FROM public;
GRANT EXECUTE ON FUNCTION internal.detect_perf_regressions() TO service_role;
GRANT EXECUTE ON FUNCTION internal.capture_perf_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION internal.set_perf_baseline() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job
    WHERE jobname = 'capture-perf-snapshot-daily';

    PERFORM cron.schedule(
      'capture-perf-snapshot-daily',
      '15 3 * * *',
      $cron$ SELECT internal.capture_perf_snapshot(); $cron$
    );
  END IF;
END $$;

SELECT extensions.pg_stat_statements_reset();
