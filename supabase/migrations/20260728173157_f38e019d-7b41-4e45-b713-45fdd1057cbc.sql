-- Expurgo de checkpoints obsoletos (>24h): o repositório já mudou e retomar
-- de um offset velho produziria varredura inconsistente.
CREATE OR REPLACE FUNCTION public.purge_stale_harvest_checkpoints(_max_age interval DEFAULT interval '24 hours')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted integer := 0;
BEGIN
  DELETE FROM public.skill_harvest_checkpoints
  WHERE updated_at < now() - _max_age;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_stale_harvest_checkpoints(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_stale_harvest_checkpoints(interval) TO service_role;

-- Índice que torna o expurgo um range scan barato.
CREATE INDEX IF NOT EXISTS idx_skill_harvest_checkpoints_updated_at
  ON public.skill_harvest_checkpoints (updated_at);

-- Agendamento horário (idempotente).
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-stale-harvest-checkpoints')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-stale-harvest-checkpoints');
    PERFORM cron.schedule(
      'purge-stale-harvest-checkpoints',
      '17 * * * *',
      $sql$SELECT public.purge_stale_harvest_checkpoints();$sql$
    );
  END IF;
END
$cron$;