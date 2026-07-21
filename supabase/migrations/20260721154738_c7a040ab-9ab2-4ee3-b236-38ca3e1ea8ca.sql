
-- P1.1 — Habilitar Realtime para o inbox WhatsApp
ALTER TABLE public.openclaw_whatsapp_messages REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.openclaw_whatsapp_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- P1.3 — Vinculação instance → agent (para roteamento automático de mensagens inbound)
ALTER TABLE public.openclaw_whatsapp_instances
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_reply BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_openclaw_whatsapp_instances_agent
  ON public.openclaw_whatsapp_instances(agent_id) WHERE agent_id IS NOT NULL;
