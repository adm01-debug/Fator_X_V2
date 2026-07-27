-- Expurgo definitivo dos vínculos removidos há mais de N dias.
CREATE OR REPLACE FUNCTION public.purge_removed_template_skill_links(_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removidos integer := 0;
BEGIN
  IF _days IS NULL OR _days < 1 THEN
    RAISE EXCEPTION 'janela de retenção inválida: %', _days;
  END IF;

  WITH apagados AS (
    DELETE FROM public.template_skill_links
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - make_interval(days => _days)
    RETURNING 1
  )
  SELECT count(*)::int INTO removidos FROM apagados;

  RETURN removidos;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_removed_template_skill_links(integer) FROM PUBLIC, anon, authenticated;

-- Wrapper monitorado: mesma trilha de auditoria usada pela retenção de traces.
CREATE OR REPLACE FUNCTION public.run_purge_template_skill_links_monitored(_days integer DEFAULT 90)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run_id uuid;
  started timestamptz := clock_timestamp();
  removidos integer := 0;
BEGIN
  INSERT INTO public.retention_job_runs (job_name, started_at, status)
  VALUES ('purge_template_skill_links', started, 'running')
  RETURNING id INTO run_id;

  BEGIN
    SELECT public.purge_removed_template_skill_links(_days) INTO removidos;

    UPDATE public.retention_job_runs
       SET finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - started)) * 1000)::int,
           partitions_dropped = removidos,
           details = jsonb_build_object('rows_deleted', removidos, 'days', _days),
           status = 'success'
     WHERE id = run_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.retention_job_runs
       SET finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - started)) * 1000)::int,
           status = 'failed',
           error_message = SQLERRM
     WHERE id = run_id;

    INSERT INTO public.security_alerts (severity, category, title, description, metadata)
    VALUES (
      'medium', 'retention_job',
      'Falha no expurgo de vínculos removidos (90d)',
      format('purge_removed_template_skill_links falhou: %s', SQLERRM),
      jsonb_build_object('run_id', run_id, 'days', _days)
    );
    RAISE;
  END;

  RETURN run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.run_purge_template_skill_links_monitored(integer) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('purge-template-skill-links-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-template-skill-links-daily');

SELECT cron.schedule(
  'purge-template-skill-links-daily',
  '20 3 * * *',
  $$SELECT public.run_purge_template_skill_links_monitored(90);$$
);