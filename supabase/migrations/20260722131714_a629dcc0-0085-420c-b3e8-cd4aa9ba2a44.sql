
-- Fase 9: Perf tuning & alerting sobre queries lentas
-- 1. Função que detecta queries > 5s no pg_stat_statements e insere alerta em security_alerts
CREATE OR REPLACE FUNCTION public.detect_slow_queries_and_alert()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT
      substring(query, 1, 200) AS query_preview,
      calls,
      round(mean_exec_time::numeric, 2) AS mean_ms,
      round(total_exec_time::numeric / 1000, 2) AS total_sec
    FROM extensions.pg_stat_statements
    WHERE calls >= 5
      AND mean_exec_time > 5000  -- > 5s
      AND query NOT ILIKE '%pg_stat_statements%'
      AND query NOT ILIKE '%pg_stat_activity%'
    ORDER BY mean_exec_time DESC
    LIMIT 10
  LOOP
    -- Deduplica: só cria se não houver alerta ativo do mesmo preview nas últimas 24h
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE category = 'performance.slow_query'
        AND is_resolved = false
        AND metadata->>'query_preview' = r.query_preview
        AND created_at > now() - interval '24 hours'
    ) THEN
      INSERT INTO public.security_alerts (severity, category, message, metadata)
      VALUES (
        CASE WHEN r.mean_ms > 10000 THEN 'critical' ELSE 'high' END,
        'performance.slow_query',
        format('Consulta lenta detectada: %s ms/call (%s chamadas)', r.mean_ms, r.calls),
        jsonb_build_object(
          'query_preview', r.query_preview,
          'mean_ms', r.mean_ms,
          'calls', r.calls,
          'total_sec', r.total_sec,
          'detected_at', now()
        )
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.detect_slow_queries_and_alert() FROM PUBLIC, anon, authenticated;

-- 2. Cron: detecta a cada 15 min
SELECT cron.schedule(
  'detect-slow-queries-every-15min',
  '*/15 * * * *',
  $$ SELECT public.detect_slow_queries_and_alert(); $$
);

-- 3. Cron semanal: reset pg_stat_statements (domingo 04:00 UTC) para evitar crescimento infinito
SELECT cron.schedule(
  'reset-pg-stat-statements-weekly',
  '0 4 * * 0',
  $$ SELECT extensions.pg_stat_statements_reset(); $$
);
