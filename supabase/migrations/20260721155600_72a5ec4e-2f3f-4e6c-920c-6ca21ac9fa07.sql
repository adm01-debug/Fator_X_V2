
-- ============================================================
-- P2.2 openclaw_events observability table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.openclaw_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID,
  kind TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  source TEXT NOT NULL DEFAULT 'proxy' CHECK (source IN ('proxy','webhook','router','other')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_openclaw_events_workspace_created
  ON public.openclaw_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_openclaw_events_kind_created
  ON public.openclaw_events (kind, created_at DESC);

GRANT SELECT ON public.openclaw_events TO authenticated;
GRANT ALL ON public.openclaw_events TO service_role;

ALTER TABLE public.openclaw_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own workspace events" ON public.openclaw_events;
CREATE POLICY "Members read own workspace events" ON public.openclaw_events
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = openclaw_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================
-- P1.3 Trigger: auto-route inbound WhatsApp to whatsapp-router EF
-- ============================================================
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

  v_url := 'https://fqdohnmgmtaycfwsioik.supabase.co/functions/v1/whatsapp-router';
  v_token := current_setting('app.whatsapp_router_token', true);

  -- fire-and-forget; token opcional se GUC não estiver setada (EF valida)
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

DROP TRIGGER IF EXISTS openclaw_whatsapp_autoreply_ai ON public.openclaw_whatsapp_messages;
CREATE TRIGGER openclaw_whatsapp_autoreply_ai
AFTER INSERT ON public.openclaw_whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION public.trg_openclaw_whatsapp_autoreply();

-- ============================================================
-- P2.1 Retenção 90d whatsapp messages + openclaw_events
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'openclaw_whatsapp_retention_90d') THEN
      PERFORM cron.schedule(
        'openclaw_whatsapp_retention_90d',
        '17 3 * * *',
        $cron$DELETE FROM public.openclaw_whatsapp_messages WHERE created_at < now() - interval '90 days';$cron$
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'openclaw_events_retention_30d') THEN
      PERFORM cron.schedule(
        'openclaw_events_retention_30d',
        '22 3 * * *',
        $cron$DELETE FROM public.openclaw_events WHERE created_at < now() - interval '30 days';$cron$
      );
    END IF;
  END IF;
END $$;
