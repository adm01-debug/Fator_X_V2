
CREATE TABLE IF NOT EXISTS public.pg_net_smoke_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  request_id bigint,
  target_url text NOT NULL,
  status_code int,
  error_msg text,
  latency_ms int,
  succeeded boolean NOT NULL DEFAULT false
);

GRANT SELECT ON public.pg_net_smoke_runs TO authenticated;
GRANT ALL ON public.pg_net_smoke_runs TO service_role;

ALTER TABLE public.pg_net_smoke_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read pg_net smoke runs"
  ON public.pg_net_smoke_runs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role_key = 'platform_admin'
  ));

CREATE INDEX IF NOT EXISTS idx_pg_net_smoke_runs_run_at ON public.pg_net_smoke_runs(run_at DESC);

CREATE OR REPLACE FUNCTION public.run_pg_net_smoke_test()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_catalog
AS $$
DECLARE
  req_id bigint;
  started timestamptz := clock_timestamp();
  resp record;
  latency int;
  ok boolean := false;
  target text := 'https://postman-echo.com/post';
BEGIN
  BEGIN
    SELECT net.http_post(
      url := target,
      headers := '{"Content-Type":"application/json","X-Smoke-Test":"pg-net-cron"}'::jsonb,
      body := jsonb_build_object('cron', true, 'ts', now()),
      timeout_milliseconds := 8000
    ) INTO req_id;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.pg_net_smoke_runs(target_url, error_msg, succeeded)
    VALUES (target, 'dispatch_failed: ' || SQLERRM, false);
    INSERT INTO public.security_alerts(severity, category, message, metadata)
    VALUES ('high', 'pg_net_smoke', 'pg_net dispatch failed', jsonb_build_object('error', SQLERRM));
    RETURN;
  END;

  FOR i IN 1..30 LOOP
    PERFORM pg_sleep(0.5);
    SELECT r.status_code, r.error_msg INTO resp
    FROM net._http_response r WHERE r.id = req_id LIMIT 1;
    EXIT WHEN resp.status_code IS NOT NULL OR resp.error_msg IS NOT NULL;
  END LOOP;

  latency := (extract(epoch from (clock_timestamp() - started)) * 1000)::int;
  ok := resp.status_code IS NOT NULL AND resp.status_code BETWEEN 200 AND 399;

  INSERT INTO public.pg_net_smoke_runs(request_id, target_url, status_code, error_msg, latency_ms, succeeded)
  VALUES (req_id, target, resp.status_code, resp.error_msg, latency, ok);

  IF NOT ok THEN
    INSERT INTO public.security_alerts(severity, category, message, metadata)
    VALUES ('high', 'pg_net_smoke',
            format('pg_net smoke test failed: status=%s error=%s', resp.status_code, resp.error_msg),
            jsonb_build_object('request_id', req_id, 'latency_ms', latency, 'target', target));
  ELSIF latency > 5000 THEN
    INSERT INTO public.security_alerts(severity, category, message, metadata)
    VALUES ('medium', 'pg_net_smoke',
            format('pg_net smoke test slow: %sms', latency),
            jsonb_build_object('request_id', req_id, 'latency_ms', latency, 'target', target));
  END IF;

  DELETE FROM public.pg_net_smoke_runs WHERE run_at < now() - interval '30 days';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_pg_net_smoke_test() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_pg_net_smoke_test() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pg-net-smoke-hourly') THEN
    PERFORM cron.unschedule('pg-net-smoke-hourly');
  END IF;
  PERFORM cron.schedule('pg-net-smoke-hourly', '7 * * * *', $c$SELECT public.run_pg_net_smoke_test();$c$);
END $$;
