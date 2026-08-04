
-- 1) webhook_events: adicionar external_event_id + índice único para idempotência
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS external_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_source_event
  ON public.webhook_events(webhook_id, external_event_id)
  WHERE external_event_id IS NOT NULL;

-- 2) openclaw_whatsapp_instances
CREATE TABLE IF NOT EXISTS public.openclaw_whatsapp_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  instance_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','connected','expired','disconnected','error')),
  phone_number TEXT,
  qr_code TEXT,
  last_seen_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, instance_name)
);

CREATE INDEX idx_openclaw_whatsapp_workspace ON public.openclaw_whatsapp_instances(workspace_id);
CREATE INDEX idx_openclaw_whatsapp_status ON public.openclaw_whatsapp_instances(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.openclaw_whatsapp_instances TO authenticated;
GRANT ALL ON public.openclaw_whatsapp_instances TO service_role;

ALTER TABLE public.openclaw_whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read whatsapp instances"
ON public.openclaw_whatsapp_instances FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_instances.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "Workspace members insert whatsapp instances"
ON public.openclaw_whatsapp_instances FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_instances.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "Workspace members update whatsapp instances"
ON public.openclaw_whatsapp_instances FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_instances.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "Workspace members delete whatsapp instances"
ON public.openclaw_whatsapp_instances FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_instances.workspace_id AND wm.user_id = auth.uid()));

CREATE TRIGGER update_openclaw_whatsapp_instances_updated_at
BEFORE UPDATE ON public.openclaw_whatsapp_instances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) openclaw_whatsapp_messages
CREATE TABLE IF NOT EXISTS public.openclaw_whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  instance_id UUID REFERENCES public.openclaw_whatsapp_instances(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  external_message_id TEXT,
  remote_phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  body TEXT,
  media_url TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','sent','failed','human_takeover')),
  handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_openclaw_whatsapp_msgs_workspace ON public.openclaw_whatsapp_messages(workspace_id, created_at DESC);
CREATE INDEX idx_openclaw_whatsapp_msgs_phone ON public.openclaw_whatsapp_messages(workspace_id, remote_phone, created_at DESC);
CREATE UNIQUE INDEX idx_openclaw_whatsapp_msgs_external ON public.openclaw_whatsapp_messages(instance_id, external_message_id) WHERE external_message_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.openclaw_whatsapp_messages TO authenticated;
GRANT ALL ON public.openclaw_whatsapp_messages TO service_role;

ALTER TABLE public.openclaw_whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read whatsapp messages"
ON public.openclaw_whatsapp_messages FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_messages.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "Workspace members insert whatsapp messages"
ON public.openclaw_whatsapp_messages FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_messages.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "Workspace members update whatsapp messages"
ON public.openclaw_whatsapp_messages FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = openclaw_whatsapp_messages.workspace_id AND wm.user_id = auth.uid()));
