-- ═══════════════════════════════════════════════════════════════════════
-- 14 tabelas referenciadas por Edge Functions que nunca existiram.
-- Detectado pelo guard de contrato (src/test/rpc-contract.test.ts, agora
-- estendido a .from()). Todas as escritas eram best-effort e falhavam em
-- silêncio, então o schema abaixo é derivado LITERALMENTE dos campos que o
-- código já grava/lê — nada foi inventado além de id/timestamps.
--
-- Postura de acesso: estas são tabelas de infraestrutura escritas pelo
-- service_role. O padrão é NEGAR tudo a anon/authenticated e conceder leitura
-- apenas onde existe consumidor de UI comprovado.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── 1. Filas de trabalho ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_queues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  -- queue-worker lê max_concurrency/strategy com fallback; explicitar o
  -- default no banco evita divergência entre worker e configuração.
  max_concurrency INTEGER NOT NULL DEFAULT 5 CHECK (max_concurrency > 0),
  strategy TEXT NOT NULL DEFAULT 'fifo' CHECK (strategy IN ('fifo','lifo','priority')),
  current_size INTEGER NOT NULL DEFAULT 0,
  processed_count BIGINT NOT NULL DEFAULT 0,
  failed_count BIGINT NOT NULL DEFAULT 0,
  workspace_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.task_queues TO service_role;
ALTER TABLE public.task_queues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_queues service only" ON public.task_queues
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_task_queues_active ON public.task_queues (is_paused) WHERE is_paused = false;
CREATE TRIGGER trg_task_queues_updated BEFORE UPDATE ON public.task_queues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.queue_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id UUID NOT NULL REFERENCES public.task_queues(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','dead_letter')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  locked_by TEXT,
  locked_until TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.queue_items TO service_role;
ALTER TABLE public.queue_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "queue_items service only" ON public.queue_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- O worker busca por (queue_id, status) e ordena por priority OU created_at.
-- Índices compostos cobrem exatamente esses dois planos de leitura.
CREATE INDEX IF NOT EXISTS idx_queue_items_pending_prio ON public.queue_items (queue_id, priority DESC, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_queue_items_status ON public.queue_items (queue_id, status);
CREATE TRIGGER trg_queue_items_updated BEFORE UPDATE ON public.queue_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 2. Agendamentos ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cron_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','completed','failed')),
  target_type TEXT NOT NULL CHECK (target_type IN ('edge_function','webhook','workflow','agent')),
  target_id TEXT NOT NULL,
  target_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  cron_expression TEXT,
  interval_seconds INTEGER CHECK (interval_seconds IS NULL OR interval_seconds > 0),
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  run_count BIGINT NOT NULL DEFAULT 0,
  max_runs BIGINT,
  workspace_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- O executor precisa de uma das duas formas de recorrência para calcular
  -- next_run_at; sem isso o agendamento roda uma vez e nunca mais.
  CONSTRAINT cron_schedules_has_recurrence
    CHECK (cron_expression IS NOT NULL OR interval_seconds IS NOT NULL)
);
GRANT ALL ON public.cron_schedules TO service_role;
ALTER TABLE public.cron_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cron_schedules service only" ON public.cron_schedules
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cron_schedules_due ON public.cron_schedules (next_run_at)
  WHERE status = 'active';
CREATE TRIGGER trg_cron_schedules_updated BEFORE UPDATE ON public.cron_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.cron_schedule_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES public.cron_schedules(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('success','failed','skipped')),
  error TEXT,
  duration_ms INTEGER,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.cron_schedule_executions TO service_role;
ALTER TABLE public.cron_schedule_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cron_executions service only" ON public.cron_schedule_executions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cron_exec_schedule ON public.cron_schedule_executions (schedule_id, created_at DESC);

-- ─── 3. Telemetria (traces/spans) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.traces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT NOT NULL,
  root_name TEXT NOT NULL,
  user_id UUID,
  agent_id UUID,
  session_id UUID,
  workflow_id UUID,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ok',
  source TEXT,
  span_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.traces TO service_role;
ALTER TABLE public.traces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "traces service only" ON public.traces
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE UNIQUE INDEX IF NOT EXISTS idx_traces_trace_id ON public.traces (trace_id);
CREATE INDEX IF NOT EXISTS idx_traces_created ON public.traces USING BRIN (created_at);

CREATE TABLE IF NOT EXISTS public.spans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  span_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  parent_span_id TEXT,
  name TEXT NOT NULL,
  kind TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_ms INTEGER,
  status TEXT,
  status_message TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.spans TO service_role;
ALTER TABLE public.spans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spans service only" ON public.spans
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Sem FK para traces: spans podem chegar antes do trace raiz (exportação
-- assíncrona) e uma FK transformaria perda de telemetria em erro de escrita.
CREATE INDEX IF NOT EXISTS idx_spans_trace ON public.spans (trace_id, start_time);
CREATE INDEX IF NOT EXISTS idx_spans_created ON public.spans USING BRIN (created_at);

-- ─── 4. Notificações ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp','slack','webhook','sms')),
  subject_template TEXT NOT NULL DEFAULT '',
  body_template TEXT NOT NULL,
  workspace_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.notification_templates TO service_role;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_templates service only" ON public.notification_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_notification_templates_updated BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp','slack','webhook','sms')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  recipient_address TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  template_id UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  template_vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_type TEXT NOT NULL DEFAULT 'system',
  error TEXT,
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  workspace_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications service only" ON public.notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications (status, created_at DESC);

-- ─── 5. Webhooks de entrada e roteamento ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_routing_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('bitrix24','whatsapp','slack','email','api')),
  event_type TEXT NOT NULL,
  agent_id UUID NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Os webhooks resolvem a rota com .maybeSingle(): mais de uma linha ativa
  -- para a mesma chave faria a chamada estourar em runtime.
  CONSTRAINT agent_routing_config_unique UNIQUE (workspace_id, source, event_type)
);
GRANT SELECT ON public.agent_routing_config TO authenticated;
GRANT ALL ON public.agent_routing_config TO service_role;
ALTER TABLE public.agent_routing_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routing readable by workspace admins" ON public.agent_routing_config
  FOR SELECT TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id));
CREATE POLICY "routing service write" ON public.agent_routing_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.bitrix24_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID,
  event_type TEXT NOT NULL,
  bitrix_event_id TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  routed_agent_id UUID,
  routing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (routing_status IN ('pending','routed','no_route','failed','invalid_signature')),
  routing_error TEXT,
  trace_id TEXT,
  processed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bitrix24_webhook_events TO authenticated;
GRANT ALL ON public.bitrix24_webhook_events TO service_role;
ALTER TABLE public.bitrix24_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bitrix events readable by members" ON public.bitrix24_webhook_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = bitrix24_webhook_events.workspace_id
      AND wm.user_id = auth.uid()
  ));
CREATE POLICY "bitrix events service write" ON public.bitrix24_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Deduplicação: o handler consulta (workspace_id, event_type, bitrix_event_id)
-- antes de inserir. O índice único fecha a corrida entre entregas simultâneas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bitrix_dedupe
  ON public.bitrix24_webhook_events (workspace_id, event_type, bitrix_event_id)
  WHERE bitrix_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bitrix_received ON public.bitrix24_webhook_events (received_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID,
  event_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  message_id TEXT,
  from_phone TEXT,
  to_phone TEXT,
  body_preview TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  routed_agent_id UUID,
  routing_status TEXT NOT NULL DEFAULT 'pending',
  routing_error TEXT,
  trace_id TEXT,
  processed_at TIMESTAMPTZ,
  -- O painel de caixa de entrada ordena por received_at; o writer só envia
  -- processed_at, então received_at precisa de default próprio.
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp events readable by members" ON public.whatsapp_webhook_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = whatsapp_webhook_events.workspace_id
      AND wm.user_id = auth.uid()
  ));
CREATE POLICY "whatsapp events service write" ON public.whatsapp_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- O writer trata 23505 como duplicata benigna: este índice é a fonte desse 23505.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_dedupe
  ON public.whatsapp_webhook_events (provider, message_id)
  WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_received ON public.whatsapp_webhook_events (received_at DESC);

CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('delivered','failed')),
  status_code INTEGER,
  duration_ms INTEGER,
  attempts INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  response_body TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.webhook_delivery_logs TO service_role;
ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delivery logs service only" ON public.webhook_delivery_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_endpoint ON public.webhook_delivery_logs (webhook_endpoint_id, created_at DESC);

-- ─── 6. Segurança e avaliação ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high','critical')),
  user_id UUID,
  workspace_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
-- Trilha de auditoria: apenas admins leem, e ninguém além do service_role
-- escreve — permitir UPDATE/DELETE a usuários destruiria o valor probatório.
CREATE POLICY "security events readable by workspace admins" ON public.security_events
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_workspace_admin(auth.uid(), workspace_id));
CREATE POLICY "security events service write" ON public.security_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_security_events_ws ON public.security_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.security_events (severity, created_at DESC)
  WHERE severity IN ('high','critical');

CREATE TABLE IF NOT EXISTS public.eval_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID,
  agent_id UUID,
  metric_type TEXT NOT NULL,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.eval_runs TO authenticated;
GRANT ALL ON public.eval_runs TO service_role;
ALTER TABLE public.eval_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eval runs readable by members" ON public.eval_runs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = eval_runs.workspace_id
      AND wm.user_id = auth.uid()
  ));
CREATE POLICY "eval runs service write" ON public.eval_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_eval_runs_agent ON public.eval_runs (agent_id, created_at DESC);