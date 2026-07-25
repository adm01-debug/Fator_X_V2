-- WAVE 4 (Performance DB) — Indexação de foreign keys órfãs
-- FKs sem índice degradam JOINs, ON DELETE CASCADE e verificações de integridade referencial.
-- Cada CREATE INDEX abaixo cobre um FK detectado sem índice de suporte.

CREATE INDEX IF NOT EXISTS idx_entity_resolution_logs_primary_entity_id
  ON public.entity_resolution_logs (primary_entity_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook_id
  ON public.webhook_events (webhook_id);

CREATE INDEX IF NOT EXISTS idx_security_alerts_resolved_by
  ON public.security_alerts (resolved_by)
  WHERE resolved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_alerts_workspace_id
  ON public.security_alerts (workspace_id)
  WHERE workspace_id IS NOT NULL;