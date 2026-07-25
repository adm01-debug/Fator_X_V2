
-- ============================================================
-- Módulo 2: slack_agent_notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS public.slack_agent_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  notify_on TEXT NOT NULL DEFAULT 'both' CHECK (notify_on IN ('success','failure','both')),
  template TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, agent_id, channel_id)
);
CREATE INDEX IF NOT EXISTS idx_slack_agent_notif_workspace ON public.slack_agent_notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_slack_agent_notif_agent ON public.slack_agent_notifications(agent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.slack_agent_notifications TO authenticated;
GRANT ALL ON public.slack_agent_notifications TO service_role;

ALTER TABLE public.slack_agent_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slack_agent_notif_admin_all" ON public.slack_agent_notifications
  FOR ALL TO authenticated
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "slack_agent_notif_service" ON public.slack_agent_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_slack_agent_notif_updated
  BEFORE UPDATE ON public.slack_agent_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Módulo 4: slack_rag_sources
-- ============================================================
CREATE TABLE IF NOT EXISTS public.slack_rag_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  oldest_ts TEXT,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel_id)
);
CREATE INDEX IF NOT EXISTS idx_slack_rag_workspace ON public.slack_rag_sources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_slack_rag_enabled ON public.slack_rag_sources(enabled) WHERE enabled;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.slack_rag_sources TO authenticated;
GRANT ALL ON public.slack_rag_sources TO service_role;

ALTER TABLE public.slack_rag_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slack_rag_admin_all" ON public.slack_rag_sources
  FOR ALL TO authenticated
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "slack_rag_service" ON public.slack_rag_sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_slack_rag_updated
  BEFORE UPDATE ON public.slack_rag_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Módulo 3: slack_bot_bindings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.slack_bot_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE,
  default_agent_id UUID,
  channel_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.slack_bot_bindings TO authenticated;
GRANT ALL ON public.slack_bot_bindings TO service_role;

ALTER TABLE public.slack_bot_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slack_bot_admin_all" ON public.slack_bot_bindings
  FOR ALL TO authenticated
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "slack_bot_service" ON public.slack_bot_bindings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_slack_bot_updated
  BEFORE UPDATE ON public.slack_bot_bindings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Trigger: dispatch automático de security_alerts -> Slack
-- ============================================================
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
  -- Evita loop: alertas gerados pela própria integração Slack não redisparam
  IF NEW.category = 'slack_integration' THEN
    RETURN NEW;
  END IF;

  -- Só dispara se houver ao menos uma rota ativa para o workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.slack_channel_routes
    WHERE workspace_id = NEW.workspace_id AND enabled = TRUE
  ) THEN
    RETURN NEW;
  END IF;

  fn_url := 'https://fqdohnmgmtaycfwsioik.supabase.co/functions/v1/slack-alert-dispatcher';
  anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZG9obm1nbXRheWNmd3Npb2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDMzNjAsImV4cCI6MjA5NDA3OTM2MH0.yj2LQHGB0uE4pOams3Uf4taYTMdMJDAJtWCZsaRwVVM';

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

DROP TRIGGER IF EXISTS trg_dispatch_security_alert_to_slack ON public.security_alerts;
CREATE TRIGGER trg_dispatch_security_alert_to_slack
  AFTER INSERT ON public.security_alerts
  FOR EACH ROW EXECUTE FUNCTION internal.dispatch_security_alert_to_slack();
