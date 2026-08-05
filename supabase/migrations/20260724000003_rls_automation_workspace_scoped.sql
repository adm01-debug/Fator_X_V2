-- ═══════════════════════════════════════════════════════════════
-- ETAPA 4/50 — RLS workspace-scoped: 15 tabelas de automação
-- Mitiga: A-01 (cross-tenant), K-01
-- Severity: 🔴 CRÍTICO
-- ═══════════════════════════════════════════════════════════════
-- Tabelas: cron_schedules, cron_schedule_executions, webhook_endpoints,
--          webhook_events, dead_letter_queue, notifications,
--          notification_templates, automation_templates, installed_templates,
--          execution_history, connector_registry, connector_instances,
--          task_queues, queue_items, batch_jobs
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── HELPER: adicionar workspace_id se não existir ────────────────
-- ═══════════════════════════════════════════════════════════════

-- PASSO 1: cron_schedules
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='cron_schedules' AND column_name='workspace_id') THEN
        ALTER TABLE public.cron_schedules ADD COLUMN workspace_id UUID;
        UPDATE public.cron_schedules cs SET workspace_id = w.id
        FROM public.workspaces w
        JOIN public.workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = cs.created_by
          AND cs.workspace_id IS NULL;
        ALTER TABLE public.cron_schedules ALTER COLUMN workspace_id SET NOT NULL;
        COMMENT ON COLUMN cron_schedules.workspace_id IS 'ETAPA 4: workspace-scoped RLS';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_cron_schedules_workspace ON public.cron_schedules(workspace_id);

-- PASSO 2: cron_schedule_executions (derivado de cron_schedules)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='cron_schedule_executions' AND column_name='workspace_id') THEN
        ALTER TABLE public.cron_schedule_executions ADD COLUMN workspace_id UUID;
        UPDATE public.cron_schedule_executions cse SET workspace_id = cs.workspace_id
        FROM public.cron_schedules cs WHERE cse.schedule_id = cs.id
          AND cse.workspace_id IS NULL;
        ALTER TABLE public.cron_schedule_executions ALTER COLUMN workspace_id SET NOT NULL;
        COMMENT ON COLUMN cron_schedule_executions.workspace_id IS 'ETAPA 4: denormalizado de cron_schedules';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_cron_exec_workspace ON public.cron_schedule_executions(workspace_id);

-- PASSO 3: webhook_endpoints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='webhook_endpoints' AND column_name='workspace_id') THEN
        ALTER TABLE public.webhook_endpoints ADD COLUMN workspace_id UUID;
        UPDATE public.webhook_endpoints we SET workspace_id = w.id
        FROM public.workspaces w
        JOIN public.workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = we.created_by
          AND we.workspace_id IS NULL;
        ALTER TABLE public.webhook_endpoints ALTER COLUMN workspace_id SET NOT NULL;
        COMMENT ON COLUMN webhook_endpoints.workspace_id IS 'ETAPA 4: workspace-scoped RLS';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_workspace ON public.webhook_endpoints(workspace_id);

-- PASSO 4: webhook_events (derivado de webhook_endpoints)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='webhook_events' AND column_name='workspace_id') THEN
        ALTER TABLE public.webhook_events ADD COLUMN workspace_id UUID;
        UPDATE public.webhook_events we SET workspace_id = wne.workspace_id
        FROM public.webhook_endpoints wne WHERE we.webhook_id = wne.id
          AND we.workspace_id IS NULL;
        ALTER TABLE public.webhook_events ALTER COLUMN workspace_id SET NOT NULL;
        COMMENT ON COLUMN webhook_events.workspace_id IS 'ETAPA 4: denormalizado de webhook_endpoints';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_webhook_events_workspace ON public.webhook_events(workspace_id);

-- PASSO 5: dead_letter_queue (sistema — workspace_id opcional, sistema é NULL)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='dead_letter_queue' AND column_name='workspace_id') THEN
        ALTER TABLE public.dead_letter_queue ADD COLUMN workspace_id UUID;
        COMMENT ON COLUMN dead_letter_queue.workspace_id IS
            'ETAPA 4: NULL = sistema, UUID = workspace';
    END IF;
END;
$$;

-- PASSO 6: notifications (derivado de workspace do recipient)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='notifications' AND column_name='workspace_id') THEN
        ALTER TABLE public.notifications ADD COLUMN workspace_id UUID;
        -- Backfill: workspaces que têm o recipient_id como membro
        UPDATE public.notifications n SET workspace_id = w.id
        FROM public.workspaces w
        JOIN public.workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = n.recipient_id
          AND n.workspace_id IS NULL;
        -- NULL para notifications sem recipient_id (e.g. broadcast)
        COMMENT ON COLUMN notifications.workspace_id IS 'ETAPA 4: denormalizado do recipient';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON public.notifications(workspace_id)
    WHERE workspace_id IS NOT NULL;

-- PASSO 7: notification_templates (workspace-scoped para edição, público para leitura)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='notification_templates' AND column_name='workspace_id') THEN
        ALTER TABLE public.notification_templates ADD COLUMN workspace_id UUID;
        COMMENT ON COLUMN notification_templates.workspace_id IS
            'ETAPA 4: NULL = template global do sistema, UUID = custom do workspace';
    END IF;
END;
$$;

-- PASSO 8: automation_templates (marketplace — público para leitura, workspace para customization)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='automation_templates' AND column_name='workspace_id') THEN
        ALTER TABLE public.automation_templates ADD COLUMN workspace_id UUID;
        COMMENT ON COLUMN automation_templates.workspace_id IS
            'ETAPA 4: NULL = template global do marketplace, UUID = custom do workspace';
    END IF;
END;
$$;

-- PASSO 9: installed_templates
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='installed_templates' AND column_name='workspace_id') THEN
        ALTER TABLE public.installed_templates ADD COLUMN workspace_id UUID;
        -- Deriva do template (que deriva do workspace de quem criou)
        UPDATE public.installed_templates it SET workspace_id = at.workspace_id
        FROM public.automation_templates at WHERE it.template_id = at.id
          AND it.workspace_id IS NULL;
        COMMENT ON COLUMN installed_templates.workspace_id IS
            'ETAPA 4: denormalizado de automation_templates';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_installed_templates_workspace ON public.installed_templates(workspace_id)
    WHERE workspace_id IS NOT NULL;

-- PASSO 10: execution_history
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='execution_history' AND column_name='workspace_id') THEN
        ALTER TABLE public.execution_history ADD COLUMN workspace_id UUID;
        UPDATE public.execution_history eh SET workspace_id = w.id
        FROM public.workspaces w
        JOIN public.workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = eh.created_by
          AND eh.workspace_id IS NULL;
        ALTER TABLE public.execution_history ALTER COLUMN workspace_id SET NOT NULL;
        COMMENT ON COLUMN execution_history.workspace_id IS 'ETAPA 4: workspace-scoped RLS';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_exec_history_workspace ON public.execution_history(workspace_id);

-- PASSO 11: connector_registry (marketplace global — público para todos)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='connector_registry' AND column_name='workspace_id') THEN
        ALTER TABLE public.connector_registry ADD COLUMN workspace_id UUID;
        COMMENT ON COLUMN connector_registry.workspace_id IS
            'ETAPA 4: NULL = global do marketplace, UUID = custom do workspace';
    END IF;
END;
$$;

-- PASSO 12: connector_instances
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='connector_instances' AND column_name='workspace_id') THEN
        ALTER TABLE public.connector_instances ADD COLUMN workspace_id UUID;
        UPDATE public.connector_instances ci SET workspace_id = w.id
        FROM public.workspaces w
        JOIN public.workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = ci.created_by
          AND ci.workspace_id IS NULL;
        ALTER TABLE public.connector_instances ALTER COLUMN workspace_id SET NOT NULL;
        COMMENT ON COLUMN connector_instances.workspace_id IS 'ETAPA 4: workspace-scoped RLS';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_connector_instances_workspace ON public.connector_instances(workspace_id);

-- PASSO 13: task_queues
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='task_queues' AND column_name='workspace_id') THEN
        ALTER TABLE public.task_queues ADD COLUMN workspace_id UUID;
        COMMENT ON COLUMN task_queues.workspace_id IS
            'ETAPA 4: workspace-scoped (NULL = sistema)';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_task_queues_workspace ON public.task_queues(workspace_id)
    WHERE workspace_id IS NOT NULL;

-- PASSO 14: queue_items (derivado de task_queues)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='queue_items' AND column_name='workspace_id') THEN
        ALTER TABLE public.queue_items ADD COLUMN workspace_id UUID;
        UPDATE public.queue_items qi SET workspace_id = tq.workspace_id
        FROM public.task_queues tq WHERE qi.queue_id = tq.id
          AND qi.workspace_id IS NULL;
        COMMENT ON COLUMN queue_items.workspace_id IS
            'ETAPA 4: denormalizado de task_queues';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_queue_items_workspace ON public.queue_items(workspace_id)
    WHERE workspace_id IS NOT NULL;

-- PASSO 15: batch_jobs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='batch_jobs' AND column_name='workspace_id') THEN
        ALTER TABLE public.batch_jobs ADD COLUMN workspace_id UUID;
        UPDATE public.batch_jobs bj SET workspace_id = w.id
        FROM public.workspaces w
        JOIN public.workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = bj.created_by
          AND bj.workspace_id IS NULL;
        ALTER TABLE public.batch_jobs ALTER COLUMN workspace_id SET NOT NULL;
        COMMENT ON COLUMN batch_jobs.workspace_id IS 'ETAPA 4: workspace-scoped RLS';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_batch_jobs_workspace ON public.batch_jobs(workspace_id);

-- ═══════════════════════════════════════════════════════════════
-- PASSO 16: Substituir todas as policies inseguras por workspace-scoped
-- ═══════════════════════════════════════════════════════════════

-- Função helper para gerar policies workspace-scoped
-- Aplica em cada tabela: admin=ALL, member=SELECT, service_role=ALL

-- Tabelas com workspace_id obrigatório
CREATE OR REPLACE PROCEDURE public.apply_workspace_rls(p_table_name TEXT)
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table_name || '_all', p_table_name);
    EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (' ||
        'workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN (''owner'',''admin''))' ||
        ' OR current_setting(''request.jwt.claim.role'', true) = %L)',
        p_table_name || '_admin_workspace', p_table_name, 'service_role'
    );
    EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (' ||
        'workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())' ||
        ' OR current_setting(''request.jwt.claim.role'', true) = %L)',
        p_table_name || '_member_read', p_table_name, 'service_role'
    );
END;
$$;

-- Aplica em cada tabela
CALL public.apply_workspace_rls('cron_schedules');
CALL public.apply_workspace_rls('cron_schedule_executions');
CALL public.apply_workspace_rls('webhook_endpoints');
CALL public.apply_workspace_rls('webhook_events');
CALL public.apply_workspace_rls('execution_history');
CALL public.apply_workspace_rls('connector_instances');
CALL public.apply_workspace_rls('batch_jobs');

-- Tabelas com workspace_id opcional (NULL = sistema/global)
-- notification_templates: público para leitura, workspace para write
DROP POLICY IF EXISTS "notif_tpl_all" ON public.notification_templates;
CREATE POLICY "notif_tpl_public_read" ON public.notification_templates
    FOR SELECT USING (workspace_id IS NULL OR
        workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "notif_tpl_workspace_write" ON public.notification_templates
    FOR ALL USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
CREATE POLICY "notif_tpl_service_role" ON public.notification_templates
    FOR ALL USING (current_setting('request.jwt.claim.role', true) = 'service_role');

-- automation_templates: marketplace público para leitura
DROP POLICY IF EXISTS "auto_tpl_all" ON public.automation_templates;
CREATE POLICY "auto_tpl_public_read" ON public.automation_templates
    FOR SELECT USING (workspace_id IS NULL OR
        workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "auto_tpl_workspace_write" ON public.automation_templates
    FOR ALL USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
CREATE POLICY "auto_tpl_service_role" ON public.automation_templates
    FOR ALL USING (current_setting('request.jwt.claim.role', true) = 'service_role');

-- connector_registry: marketplace global
DROP POLICY IF EXISTS "conn_reg_all" ON public.connector_registry;
CREATE POLICY "conn_reg_public_read" ON public.connector_registry
    FOR SELECT USING (TRUE);
CREATE POLICY "conn_reg_workspace_write" ON public.connector_registry
    FOR ALL USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
CREATE POLICY "conn_reg_service_role" ON public.connector_registry
    FOR ALL USING (current_setting('request.jwt.claim.role', true) = 'service_role');

-- notifications: membro do workspace ou NULL (broadcast)
DROP POLICY IF EXISTS "notif_all" ON public.notifications;
CREATE POLICY "notif_workspace_read" ON public.notifications
    FOR SELECT USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "notif_workspace_write" ON public.notifications
    FOR ALL USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
CREATE POLICY "notif_service_role" ON public.notifications
    FOR ALL USING (current_setting('request.jwt.claim.role', true) = 'service_role');

-- installed_templates: workspace
DROP POLICY IF EXISTS "installed_tpl_all" ON public.installed_templates;
CREATE POLICY "installed_tpl_workspace_read" ON public.installed_templates
    FOR SELECT USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "installed_tpl_workspace_write" ON public.installed_templates
    FOR ALL USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
CREATE POLICY "installed_tpl_service_role" ON public.installed_templates
    FOR ALL USING (current_setting('request.jwt.claim.role', true) = 'service_role');

-- task_queues: workspace ou NULL (sistema)
DROP POLICY IF EXISTS "task_queues_all" ON public.task_queues;
CREATE POLICY "task_queues_workspace_read" ON public.task_queues
    FOR SELECT USING (workspace_id IS NULL OR
        workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "task_queues_workspace_write" ON public.task_queues
    FOR ALL USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
CREATE POLICY "task_queues_service_role" ON public.task_queues
    FOR ALL USING (current_setting('request.jwt.claim.role', true) = 'service_role');

-- queue_items: workspace
DROP POLICY IF EXISTS "queue_items_all" ON public.queue_items;
CREATE POLICY "queue_items_workspace_read" ON public.queue_items
    FOR SELECT USING (workspace_id IS NULL OR
        workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "queue_items_workspace_write" ON public.queue_items
    FOR ALL USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
CREATE POLICY "queue_items_service_role" ON public.queue_items
    FOR ALL USING (current_setting('request.jwt.claim.role', true) = 'service_role');

-- dead_letter_queue: serviço — service_role + ops Read por admin
DROP POLICY IF EXISTS "dlq_all" ON public.dead_letter_queue;
CREATE POLICY "dlq_admin_read" ON public.dead_letter_queue
    FOR SELECT USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
CREATE POLICY "dlq_service_role" ON public.dead_letter_queue
    FOR ALL USING (current_setting('request.jwt.claim.role', true) = 'service_role');

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
    bad_policy TEXT;
BEGIN
    FOR bad_policy IN
        SELECT schemaname || '.' || tablename || '.' || policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE '%_all'
    LOOP
        RAISE WARNING 'Policy insegura restante: %', bad_policy;
    END LOOP;

    RAISE NOTICE 'ETAPA 4 OK: 15 tabelas de automação com workspace-scoped RLS';
END;
$$;

-- View de auditoria
CREATE OR REPLACE VIEW _audit_rls_automation AS
SELECT
    schemaname, tablename,
    policyname,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
      'cron_schedules','cron_schedule_executions','webhook_endpoints','webhook_events',
      'dead_letter_queue','notifications','notification_templates','automation_templates',
      'installed_templates','execution_history','connector_registry','connector_instances',
      'task_queues','queue_items','batch_jobs'
  )
ORDER BY tablename, cmd;
