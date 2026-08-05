
-- ═══════════════════════════════════════════════════════════════════
-- WAVE 4 — Observabilidade de índices, queries, bloat e write amp
-- ═══════════════════════════════════════════════════════════════════

-- Snapshot diário de pg_stat_user_indexes
CREATE TABLE IF NOT EXISTS internal.index_usage_snapshots (
  id           BIGSERIAL PRIMARY KEY,
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  schemaname   TEXT NOT NULL,
  relname      TEXT NOT NULL,
  indexrelname TEXT NOT NULL,
  idx_scan     BIGINT NOT NULL,
  idx_tup_read BIGINT NOT NULL,
  idx_tup_fetch BIGINT NOT NULL,
  index_size_bytes BIGINT NOT NULL,
  table_size_bytes BIGINT NOT NULL,
  is_unique    BOOLEAN NOT NULL,
  is_primary   BOOLEAN NOT NULL,
  is_partial   BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_index_usage_snap_captured ON internal.index_usage_snapshots(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_index_usage_snap_rel ON internal.index_usage_snapshots(relname, indexrelname, captured_at DESC);

-- Snapshot de pg_stat_statements (top queries)
CREATE TABLE IF NOT EXISTS internal.query_stats_snapshots (
  id            BIGSERIAL PRIMARY KEY,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  queryid       BIGINT NOT NULL,
  query_sample  TEXT NOT NULL,
  calls         BIGINT NOT NULL,
  total_exec_ms NUMERIC NOT NULL,
  mean_exec_ms  NUMERIC NOT NULL,
  max_exec_ms   NUMERIC NOT NULL,
  rows_returned BIGINT NOT NULL,
  shared_blks_hit BIGINT NOT NULL,
  shared_blks_read BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_query_stats_snap_captured ON internal.query_stats_snapshots(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_stats_snap_queryid ON internal.query_stats_snapshots(queryid, captured_at DESC);

-- Snapshot de tamanho/write-activity por tabela
CREATE TABLE IF NOT EXISTS internal.table_activity_snapshots (
  id           BIGSERIAL PRIMARY KEY,
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  schemaname   TEXT NOT NULL,
  relname      TEXT NOT NULL,
  n_tup_ins    BIGINT NOT NULL,
  n_tup_upd    BIGINT NOT NULL,
  n_tup_del    BIGINT NOT NULL,
  n_tup_hot_upd BIGINT NOT NULL,
  n_live_tup   BIGINT NOT NULL,
  n_dead_tup   BIGINT NOT NULL,
  table_size_bytes BIGINT NOT NULL,
  indexes_size_bytes BIGINT NOT NULL,
  last_autovacuum TIMESTAMPTZ,
  last_autoanalyze TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_table_activity_snap ON internal.table_activity_snapshots(relname, captured_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- Função de captura consolidada
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION internal.capture_perf_snapshot()
RETURNS TABLE(kind TEXT, rows_captured BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal, public, extensions, pg_catalog
AS $$
DECLARE
  v_idx BIGINT;
  v_q   BIGINT;
  v_t   BIGINT;
BEGIN
  -- Índices
  INSERT INTO internal.index_usage_snapshots
    (schemaname, relname, indexrelname, idx_scan, idx_tup_read, idx_tup_fetch,
     index_size_bytes, table_size_bytes, is_unique, is_primary, is_partial)
  SELECT s.schemaname, s.relname, s.indexrelname, s.idx_scan, s.idx_tup_read, s.idx_tup_fetch,
         pg_relation_size(s.indexrelid),
         pg_relation_size(s.relid),
         i.indisunique, i.indisprimary,
         (i.indpred IS NOT NULL)
  FROM pg_stat_user_indexes s
  JOIN pg_index i ON i.indexrelid = s.indexrelid
  WHERE s.schemaname = 'public';
  GET DIAGNOSTICS v_idx = ROW_COUNT;

  -- Queries (top 100 por total_exec_time)
  INSERT INTO internal.query_stats_snapshots
    (queryid, query_sample, calls, total_exec_ms, mean_exec_ms, max_exec_ms,
     rows_returned, shared_blks_hit, shared_blks_read)
  SELECT queryid, substring(query, 1, 500), calls, total_exec_time, mean_exec_time,
         max_exec_time, rows, shared_blks_hit, shared_blks_read
  FROM pg_stat_statements
  WHERE queryid IS NOT NULL
  ORDER BY total_exec_time DESC
  LIMIT 100;
  GET DIAGNOSTICS v_q = ROW_COUNT;

  -- Tabelas
  INSERT INTO internal.table_activity_snapshots
    (schemaname, relname, n_tup_ins, n_tup_upd, n_tup_del, n_tup_hot_upd,
     n_live_tup, n_dead_tup, table_size_bytes, indexes_size_bytes,
     last_autovacuum, last_autoanalyze)
  SELECT s.schemaname, s.relname, s.n_tup_ins, s.n_tup_upd, s.n_tup_del, s.n_tup_hot_upd,
         s.n_live_tup, s.n_dead_tup,
         pg_relation_size(s.relid),
         pg_indexes_size(s.relid),
         s.last_autovacuum, s.last_autoanalyze
  FROM pg_stat_user_tables s
  WHERE s.schemaname = 'public';
  GET DIAGNOSTICS v_t = ROW_COUNT;

  RETURN QUERY VALUES ('indexes', v_idx), ('queries', v_q), ('tables', v_t);
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- View: candidatos a remoção (unused indexes)
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW internal.index_audit_report AS
WITH latest AS (
  SELECT DISTINCT ON (schemaname, relname, indexrelname) *
  FROM internal.index_usage_snapshots
  ORDER BY schemaname, relname, indexrelname, captured_at DESC
),
first_seen AS (
  SELECT schemaname, relname, indexrelname, min(captured_at) AS first_captured
  FROM internal.index_usage_snapshots
  GROUP BY schemaname, relname, indexrelname
)
SELECT
  l.schemaname, l.relname, l.indexrelname,
  l.idx_scan,
  pg_size_pretty(l.index_size_bytes) AS index_size,
  l.index_size_bytes,
  l.is_unique, l.is_primary, l.is_partial,
  f.first_captured,
  EXTRACT(day FROM (now() - f.first_captured))::int AS days_observed,
  CASE
    WHEN l.is_primary OR l.is_unique THEN 'KEEP: constraint'
    WHEN l.is_partial THEN 'REVIEW: partial index (may be intentional)'
    WHEN l.idx_scan = 0 AND EXTRACT(day FROM (now() - f.first_captured)) >= 30 THEN 'DROP CANDIDATE: unused >=30d'
    WHEN l.idx_scan < 10 AND EXTRACT(day FROM (now() - f.first_captured)) >= 30 THEN 'REVIEW: rarely used'
    ELSE 'KEEP: active'
  END AS recommendation
FROM latest l
JOIN first_seen f USING (schemaname, relname, indexrelname);

-- ═══════════════════════════════════════════════════════════════════
-- View: write amplification (índices grandes em tabelas com muito INSERT)
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW internal.write_amplification_report AS
WITH latest_tbl AS (
  SELECT DISTINCT ON (schemaname, relname) *
  FROM internal.table_activity_snapshots
  ORDER BY schemaname, relname, captured_at DESC
),
prev_tbl AS (
  SELECT DISTINCT ON (schemaname, relname) *
  FROM internal.table_activity_snapshots
  WHERE captured_at < now() - interval '20 hours'
  ORDER BY schemaname, relname, captured_at DESC
)
SELECT
  l.relname,
  (l.n_tup_ins + l.n_tup_upd + l.n_tup_del)
    - COALESCE(p.n_tup_ins + p.n_tup_upd + p.n_tup_del, 0) AS writes_last_24h,
  pg_size_pretty(l.indexes_size_bytes) AS indexes_size,
  pg_size_pretty(l.table_size_bytes) AS table_size,
  ROUND(l.indexes_size_bytes::numeric / NULLIF(l.table_size_bytes, 0), 2) AS index_to_table_ratio,
  l.n_dead_tup,
  ROUND(l.n_dead_tup::numeric / NULLIF(l.n_live_tup, 0), 3) AS dead_ratio,
  CASE
    WHEN l.n_dead_tup::numeric / NULLIF(l.n_live_tup, 0) > 0.2 THEN 'BLOAT WARNING'
    WHEN l.indexes_size_bytes > l.table_size_bytes * 2 THEN 'INDEX-HEAVY'
    ELSE 'OK'
  END AS status
FROM latest_tbl l
LEFT JOIN prev_tbl p USING (schemaname, relname);

-- ═══════════════════════════════════════════════════════════════════
-- Função de alerta: emite security_alert se detectar bloat/write-amp
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION internal.check_bloat_and_alert()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal, public, pg_catalog
AS $$
DECLARE
  r RECORD;
  v_alerts INTEGER := 0;
BEGIN
  FOR r IN
    SELECT * FROM internal.write_amplification_report
    WHERE status IN ('BLOAT WARNING', 'INDEX-HEAVY')
  LOOP
    -- Deduplica: só cria alerta se não houver um aberto pra mesma tabela nas últimas 24h
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE category = 'db_bloat'
        AND metadata->>'relname' = r.relname
        AND is_resolved = false
        AND created_at > now() - interval '24 hours'
    ) THEN
      INSERT INTO public.security_alerts (severity, category, message, metadata)
      VALUES (
        CASE WHEN r.status = 'BLOAT WARNING' THEN 'warning' ELSE 'info' END,
        'db_bloat',
        format('Tabela %s: %s (dead_ratio=%s, index/table=%s)',
               r.relname, r.status, r.dead_ratio, r.index_to_table_ratio),
        jsonb_build_object(
          'relname', r.relname,
          'status', r.status,
          'dead_ratio', r.dead_ratio,
          'index_to_table_ratio', r.index_to_table_ratio,
          'writes_last_24h', r.writes_last_24h,
          'indexes_size', r.indexes_size,
          'table_size', r.table_size
        )
      );
      v_alerts := v_alerts + 1;
    END IF;
  END LOOP;
  RETURN v_alerts;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Retenção: 90 dias de snapshots é suficiente
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION internal.prune_perf_snapshots()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = internal, pg_catalog
AS $$
  DELETE FROM internal.index_usage_snapshots WHERE captured_at < now() - interval '90 days';
  DELETE FROM internal.query_stats_snapshots WHERE captured_at < now() - interval '90 days';
  DELETE FROM internal.table_activity_snapshots WHERE captured_at < now() - interval '90 days';
$$;

-- ═══════════════════════════════════════════════════════════════════
-- Agendamento pg_cron: captura diária 03:30 UTC + alerta 03:45 UTC
-- ═══════════════════════════════════════════════════════════════════
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule(jobname) FROM cron.job
        WHERE jobname IN ('capture-perf-snapshot','check-db-bloat','prune-perf-snapshots');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule('capture-perf-snapshot', '30 3 * * *',
      $$SELECT internal.capture_perf_snapshot();$$);
    PERFORM cron.schedule('check-db-bloat', '45 3 * * *',
      $$SELECT internal.check_bloat_and_alert();$$);
    PERFORM cron.schedule('prune-perf-snapshots', '0 4 * * 0',
      $$SELECT internal.prune_perf_snapshots();$$);
  END IF;
END $outer$;

-- Captura inicial (baseline t0)
DO $$ BEGIN
  PERFORM internal.capture_perf_snapshot();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
