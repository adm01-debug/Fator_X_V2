
CREATE OR REPLACE FUNCTION public.get_cron_job_health()
RETURNS TABLE(
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  last_run_at timestamptz,
  last_status text,
  last_duration_ms int,
  runs_20 int,
  success_20 int,
  failure_20 int,
  success_rate numeric,
  avg_duration_ms numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'access denied';
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
$$;

REVOKE ALL ON FUNCTION public.get_cron_job_health() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_cron_job_health() TO authenticated;
