-- ============================================================
-- fix(exfil): redireciona triggers/cron para o projeto de producao
-- Depois: qdlnzopxrlsoljcrcmzv (projeto real, config.toml)
-- ============================================================
-- 1) slack-alert-dispatcher: corrige URL + anon_key do trigger
CREATE OR REPLACE FUNCTION internal.dispatch_security_alert_to_slack()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  fn_url TEXT;
  anon_key TEXT;
BEGIN
  -- Evita loop: alertas gerados pela propria integracao Slack nao redisparam
  IF NEW.category = 'slack_integration' THEN
    RETURN NEW;
  END IF;
  -- So dispara se houver ao menos uma rota ativa para o workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.slack_channel_routes
    WHERE workspace_id = NEW.workspace_id AND enabled = TRUE
  ) THEN
    RETURN NEW;
  END IF;
  fn_url := 'https://qdlnzopxrlsoljcrcmzv.supabase.co/functions/v1/slack-alert-dispatcher';
  anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbG56b3B4cmxzb2xqY3JjbXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTEzMjYsImV4cCI6MjEwMDQ2NzMyNn0.ulD_6yJcgkDnkkxk4XeTx36bpZhrrL7x6glT_uxU1rw';
  PERFORM extensions.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', NEW.id,
        'workspace_id', NEW.workspace_id,
        'category', NEW.category,
        'severity', NEW.severity,
        'title', NEW.title,
        'description', NEW.description,
        'metadata', NEW.metadata
      )
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca bloqueia insert do alerta
  RAISE WARNING 'dispatch_security_alert_to_slack failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
-- 2) whatsapp-router: corrige URL do trigger
CREATE OR REPLACE FUNCTION public.trg_openclaw_whatsapp_autoreply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_auto BOOLEAN;
  v_agent UUID;
  v_url TEXT;
  v_token TEXT;
BEGIN
  IF NEW.direction <> 'inbound' THEN
    RETURN NEW;
  END IF;
  SELECT i.auto_reply, i.agent_id
    INTO v_auto, v_agent
  FROM public.openclaw_whatsapp_instances i
  WHERE i.id = NEW.instance_id;
  IF COALESCE(v_auto, false) = false OR v_agent IS NULL THEN
    RETURN NEW;
  END IF;
  v_url := 'https://qdlnzopxrlsoljcrcmzv.supabase.co/functions/v1/whatsapp-router';
  v_token := current_setting('app.whatsapp_router_token', true);
  -- fire-and-forget; token opcional se GUC nao estiver setada (EF valida)
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Router-Token', COALESCE(v_token, '')
    ),
    body := jsonb_build_object('message_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- nunca bloquear insert por falha de rota
  RETURN NEW;
END;
$$;
-- 3) cron slack-dlq-retry: corrige project_url (unschedule + schedule)
DO $$
DECLARE
  project_url text := 'https://qdlnzopxrlsoljcrcmzv.supabase.co';
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