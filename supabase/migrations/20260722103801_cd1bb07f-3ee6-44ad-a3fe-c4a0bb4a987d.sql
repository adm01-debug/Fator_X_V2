
CREATE INDEX IF NOT EXISTS idx_openclaw_deployments_deployed_by
  ON public.openclaw_deployments(deployed_by);
CREATE INDEX IF NOT EXISTS idx_openclaw_whatsapp_messages_agent_id
  ON public.openclaw_whatsapp_messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_openclaw_whatsapp_messages_handled_by
  ON public.openclaw_whatsapp_messages(handled_by);
