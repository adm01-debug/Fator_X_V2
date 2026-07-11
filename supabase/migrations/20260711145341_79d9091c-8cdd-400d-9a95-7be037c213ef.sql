
CREATE TABLE IF NOT EXISTS public.retention_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  partitions_dropped INTEGER NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retention_job_runs_job_started_idx
  ON public.retention_job_runs (job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS retention_job_runs_status_idx
  ON public.retention_job_runs (status, started_at DESC);

GRANT SELECT ON public.retention_job_runs TO authenticated;
GRANT ALL ON public.retention_job_runs TO service_role;

ALTER TABLE public.retention_job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins read retention runs" ON public.retention_job_runs;
CREATE POLICY "platform_admins read retention runs"
  ON public.retention_job_runs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role_key = 'platform_admin'
  ));

CREATE OR REPLACE FUNCTION public.run_prune_traces_retention_monitored(_days integer DEFAULT 90)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run_id uuid;
  started timestamptz := clock_timestamp();
  dropped_rows jsonb := '[]'::jsonb;
  dropped_count int := 0;
BEGIN
  INSERT INTO public.retention_job_runs (job_name, started_at, status)
  VALUES ('prune_traces_retention', started, 'running')
  RETURNING id INTO run_id;

  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb), COUNT(*)::int
      INTO dropped_rows, dropped_count
    FROM public.prune_traces_retention(_days) t;

    UPDATE public.retention_job_runs
       SET finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - started)) * 1000)::int,
           partitions_dropped = dropped_count,
           details = dropped_rows,
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
      'high', 'retention_job',
      'Falha na retenção de traces (90d)',
      format('prune_traces_retention falhou: %s', SQLERRM),
      jsonb_build_object('run_id', run_id, 'days', _days)
    );
    RAISE;
  END;

  RETURN run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.run_prune_traces_retention_monitored(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_prune_traces_retention_monitored(int) TO service_role;

CREATE OR REPLACE FUNCTION public.check_retention_job_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_success timestamptz;
  last_run public.retention_job_runs%ROWTYPE;
BEGIN
  SELECT MAX(finished_at) INTO last_success
    FROM public.retention_job_runs
   WHERE job_name = 'prune_traces_retention'
     AND status = 'success';

  SELECT * INTO last_run
    FROM public.retention_job_runs
   WHERE job_name = 'prune_traces_retention'
   ORDER BY started_at DESC
   LIMIT 1;

  IF last_success IS NULL OR last_success < now() - interval '26 hours' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
       WHERE category = 'retention_job_watchdog'
         AND created_at > now() - interval '1 hour'
    ) THEN
      INSERT INTO public.security_alerts (severity, category, title, description, metadata)
      VALUES (
        'high', 'retention_job_watchdog',
        'Retenção de traces atrasada (>26h sem sucesso)',
        format('Última execução bem-sucedida: %s. Último status: %s.',
               COALESCE(last_success::text, 'nunca'),
               COALESCE(last_run.status, 'nenhum')),
        jsonb_build_object(
          'last_success', last_success,
          'last_run_id', last_run.id,
          'last_run_status', last_run.status,
          'last_run_error', last_run.error_message
        )
      );
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_retention_job_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_retention_job_health() TO service_role;

DO $$
DECLARE j RECORD;
BEGIN
  FOR j IN SELECT jobid FROM cron.job
    WHERE jobname IN ('traces-retention-90d','retention-traces-watchdog')
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'traces-retention-90d',
  '15 3 * * *',
  $$SELECT public.run_prune_traces_retention_monitored(90);$$
);

SELECT cron.schedule(
  'retention-traces-watchdog',
  '5 * * * *',
  $$SELECT public.check_retention_job_health();$$
);
