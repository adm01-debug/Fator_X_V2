
-- Snapshot table
CREATE TABLE IF NOT EXISTS internal.wal_snapshots (
  id BIGSERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  wal_lsn pg_lsn NOT NULL,
  wal_bytes_total BIGINT NOT NULL,
  bytes_since_last BIGINT,
  seconds_since_last NUMERIC
);

CREATE INDEX IF NOT EXISTS wal_snapshots_captured_at_idx
  ON internal.wal_snapshots (captured_at DESC);

-- Retention: keep 30 days
CREATE OR REPLACE FUNCTION internal.prune_wal_snapshots()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = internal, public
AS $$
  DELETE FROM internal.wal_snapshots
  WHERE captured_at < now() - INTERVAL '30 days';
$$;

-- Sampler
CREATE OR REPLACE FUNCTION internal.sample_wal_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal, public, pg_catalog
AS $$
DECLARE
  v_current_lsn pg_lsn;
  v_current_bytes BIGINT;
  v_last RECORD;
  v_delta_bytes BIGINT;
  v_delta_seconds NUMERIC;
  v_bytes_per_min NUMERIC;
  v_severity TEXT;
BEGIN
  v_current_lsn := pg_current_wal_lsn();
  v_current_bytes := (v_current_lsn - '0/0'::pg_lsn);

  SELECT captured_at, wal_bytes_total
    INTO v_last
    FROM internal.wal_snapshots
    ORDER BY captured_at DESC
    LIMIT 1;

  IF v_last.captured_at IS NULL THEN
    INSERT INTO internal.wal_snapshots (wal_lsn, wal_bytes_total)
    VALUES (v_current_lsn, v_current_bytes);
    RETURN;
  END IF;

  v_delta_bytes := v_current_bytes - v_last.wal_bytes_total;
  v_delta_seconds := EXTRACT(EPOCH FROM (now() - v_last.captured_at));

  INSERT INTO internal.wal_snapshots
    (wal_lsn, wal_bytes_total, bytes_since_last, seconds_since_last)
  VALUES
    (v_current_lsn, v_current_bytes, v_delta_bytes, v_delta_seconds);

  IF v_delta_seconds > 0 THEN
    v_bytes_per_min := (v_delta_bytes::numeric / v_delta_seconds) * 60;

    v_severity := CASE
      WHEN v_bytes_per_min > 500 * 1024 * 1024 THEN 'critical'
      WHEN v_bytes_per_min > 200 * 1024 * 1024 THEN 'high'
      WHEN v_bytes_per_min >  50 * 1024 * 1024 THEN 'medium'
      ELSE NULL
    END;

    IF v_severity IS NOT NULL THEN
      INSERT INTO public.security_alerts (severity, category, title, description, metadata, resolved)
      VALUES (
        v_severity,
        'database_health',
        'Alta geração de WAL detectada',
        format('Geração de WAL em %s MB/min excede limite %s.',
          round(v_bytes_per_min / (1024*1024), 2),
          v_severity),
        jsonb_build_object(
          'bytes_per_min', v_bytes_per_min,
          'delta_bytes', v_delta_bytes,
          'delta_seconds', v_delta_seconds,
          'current_lsn', v_current_lsn::text
        ),
        false
      );
    END IF;
  END IF;
END;
$$;

-- Public read API (admin only)
CREATE OR REPLACE FUNCTION public.get_wal_generation_rate(_minutes INT DEFAULT 60)
RETURNS TABLE (
  captured_at TIMESTAMPTZ,
  bytes_per_min NUMERIC,
  mb_per_min NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, internal
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  SELECT
    s.captured_at,
    CASE
      WHEN s.seconds_since_last > 0
        THEN (s.bytes_since_last::numeric / s.seconds_since_last) * 60
      ELSE 0
    END AS bytes_per_min,
    CASE
      WHEN s.seconds_since_last > 0
        THEN round(((s.bytes_since_last::numeric / s.seconds_since_last) * 60) / (1024*1024), 2)
      ELSE 0
    END AS mb_per_min
  FROM internal.wal_snapshots s
  WHERE s.captured_at > now() - make_interval(mins => _minutes)
    AND s.bytes_since_last IS NOT NULL
  ORDER BY s.captured_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wal_generation_rate(INT) TO authenticated;

-- Schedule sampler every minute + daily prune
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('sample-wal-stats')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sample-wal-stats');
    PERFORM cron.schedule(
      'sample-wal-stats',
      '* * * * *',
      $CRON$SELECT internal.sample_wal_stats();$CRON$
    );

    PERFORM cron.unschedule('prune-wal-snapshots')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='prune-wal-snapshots');
    PERFORM cron.schedule(
      'prune-wal-snapshots',
      '17 3 * * *',
      $CRON$SELECT internal.prune_wal_snapshots();$CRON$
    );
  END IF;
END $$;
