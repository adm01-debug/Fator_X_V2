
DO $$
DECLARE
  project_url text := 'https://fqdohnmgmtaycfwsioik.supabase.co';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'slack-dlq-retry') THEN
      PERFORM cron.unschedule('slack-dlq-retry');
    END IF;
    PERFORM cron.schedule(
      'slack-dlq-retry',
      '*/5 * * * *',
      format($sql$
        SELECT net.http_post(
          url := '%s/functions/v1/slack-dlq-retry',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 30000
        );
      $sql$, project_url)
    );
  END IF;
END $$;
