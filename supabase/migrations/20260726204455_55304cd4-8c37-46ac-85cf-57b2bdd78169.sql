-- Histórico de rodadas é telemetria operacional: útil por semanas, inútil por
-- anos, e cresce a cada 5 minutos. Retenção de 90 dias mantém a tabela pequena
-- o bastante para varreduras rápidas sem exigir particionamento.
CREATE INDEX IF NOT EXISTS idx_crm_cadence_runs_created_at
  ON public.crm_cadence_runs (created_at);

CREATE OR REPLACE FUNCTION internal.purge_crm_cadence_runs(_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.crm_cadence_runs
   WHERE created_at < now() - make_interval(days => GREATEST(_days, 1));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION internal.purge_crm_cadence_runs(integer) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-crm-cadence-runs-daily') THEN
      PERFORM cron.schedule(
        'purge-crm-cadence-runs-daily',
        '17 4 * * *',
        'SELECT internal.purge_crm_cadence_runs(90)'
      );
    END IF;
  END IF;
END;
$$;