-- Mesma causa raiz já corrigida em get_partition_health_snapshot: o guard
-- chamava public.has_role(), que não existe neste banco. Toda chamada abortava
-- com 42883 antes de ler qualquer linha, deixando os dois painéis
-- permanentemente quebrados — e, pior, mascarados como "erro de permissão".
-- Alinha ao guard real do projeto: public.is_workspace_admin(auth.uid()).

CREATE OR REPLACE FUNCTION public.get_cron_job_health()
RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean, last_run_at timestamp with time zone, last_status text, last_duration_ms integer, runs_20 integer, success_20 integer, failure_20 integer, success_rate numeric, avg_duration_ms numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $function$
BEGIN
  IF NOT public.is_workspace_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH recent AS (
    SELECT
      d.jobid,
      d.status,
      d.start_time,
      d.end_time,
      EXTRACT(EPOCH FROM (d.end_time - d.start_time))*1000 AS duration_ms,
      row_number() OVER (PARTITION BY d.jobid ORDER BY d.start_time DESC) AS rn
    FROM cron.job_run_details d
    WHERE d.start_time > now() - interval '7 days'
  ),
  agg AS (
    SELECT
      jobid,
      count(*) FILTER (WHERE rn <= 20) AS runs_20,
      count(*) FILTER (WHERE rn <= 20 AND status = 'succeeded') AS success_20,
      count(*) FILTER (WHERE rn <= 20 AND status <> 'succeeded') AS failure_20,
      avg(duration_ms) FILTER (WHERE rn <= 20) AS avg_ms
    FROM recent
    GROUP BY jobid
  ),
  last_run AS (
    SELECT DISTINCT ON (jobid) jobid, status, start_time, duration_ms
    FROM recent
    ORDER BY jobid, start_time DESC
  )
  SELECT
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    lr.start_time,
    lr.status,
    lr.duration_ms::int,
    COALESCE(a.runs_20, 0)::int,
    COALESCE(a.success_20, 0)::int,
    COALESCE(a.failure_20, 0)::int,
    CASE WHEN COALESCE(a.runs_20,0) = 0 THEN NULL
         ELSE round((a.success_20::numeric / a.runs_20) * 100, 2) END,
    round(a.avg_ms::numeric, 2)
  FROM cron.job j
  LEFT JOIN agg a ON a.jobid = j.jobid
  LEFT JOIN last_run lr ON lr.jobid = j.jobid
  ORDER BY j.jobname;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_wal_generation_rate(_minutes integer DEFAULT 60)
RETURNS TABLE(captured_at timestamp with time zone, bytes_per_min numeric, mb_per_min numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'internal'
AS $function$
BEGIN
  IF NOT public.is_workspace_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
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
$function$;

REVOKE ALL ON FUNCTION public.get_cron_job_health() FROM anon;
REVOKE ALL ON FUNCTION public.get_wal_generation_rate(integer) FROM anon;