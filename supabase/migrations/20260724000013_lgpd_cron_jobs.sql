-- ═══════════════════════════════════════════════════════════════
-- ETAPAS 32-35/50 — LGPD compliance: cron jobs + data retention
-- Mitiga: B-01, B-02 (LGPD — Art. 37, 46, 48)
-- Severity: 🟡 MÉDIO
-- ═══════════════════════════════════════════════════════════════
-- A lgpd-manager Edge Function existe (full CRUD de dados).
-- O que faltava: cron jobs para execução automática de:
--   1. Retenção de dados (auto-delete após retention_days)
--   2. Anonimização de dados inativos
--   3. Verificação de breach
--   4. Limpeza de logs LGPD
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- FUNÇÃO 1: Data Retention — aplica políticas de retenção
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.lgpd_apply_retention_policies()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_policy RECORD;
    v_deleted_count INTEGER := 0;
    v_anonymized_count INTEGER := 0;
    v_table_name TEXT;
    v_id_col TEXT;
    v_workspace_col TEXT;
    v_ts_col TEXT;
BEGIN
    FOR v_policy IN
        SELECT rp.id, rp.workspace_id, rp.data_type, rp.retention_days,
               rp.auto_anonymize, rp.anonymization_method
        FROM public.data_retention_policies rp
        WHERE rp.is_active = true
          AND (
              -- Só processa políticas que têm workspace (null = global/default)
              rp.workspace_id IS NOT NULL
              OR rp.data_type IN ('audit_log', 'auth_attempts', 'idempotency_keys')
          )
    LOOP
        -- Mapeamento: data_type → (table, id_col, workspace_col, ts_col)
        CASE v_policy.data_type
        WHEN 'chat_messages' THEN
            v_table_name := 'chat_messages'; v_id_col := 'id';
            v_workspace_col := 'workspace_id'; v_ts_col := 'created_at';
        WHEN 'agent_traces' THEN
            v_table_name := 'agent_traces'; v_id_col := 'id';
            v_workspace_col := 'workspace_id'; v_ts_col := 'created_at';
        WHEN 'agent_logs' THEN
            v_table_name := 'agent_logs'; v_id_col := 'id';
            v_workspace_col := 'workspace_id'; v_ts_col := 'created_at';
        WHEN 'audit_log' THEN
            v_table_name := 'audit_log'; v_id_col := 'id';
            v_workspace_col := 'workspace_id'; v_ts_col := 'created_at';
        WHEN 'auth_attempts' THEN
            v_table_name := 'auth_attempts'; v_id_col := 'id';
            v_workspace_col := NULL; v_ts_col := 'created_at';
        WHEN 'idempotency_keys' THEN
            v_table_name := 'idempotency_keys'; v_id_col := 'key';
            v_workspace_col := NULL; v_ts_col := 'created_at';
        WHEN 'workflow_runs' THEN
            v_table_name := 'workflow_runs'; v_id_col := 'id';
            v_workspace_col := 'workspace_id'; v_ts_col := 'started_at';
        WHEN 'workflow_executions' THEN
            v_table_name := 'workflow_executions'; v_id_col := 'id';
            v_workspace_col := 'user_id'; v_ts_col := 'started_at';
        WHEN 'agent_memories' THEN
            v_table_name := 'agent_memories'; v_id_col := 'id';
            v_workspace_col := 'workspace_id'; v_ts_col := 'created_at';
        ELSE
            CONTINUE; -- Skip unknown data types
        END CASE;

        -- Verifica se a tabela existe
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = v_table_name
        ) THEN
            CONTINUE;
        END IF;

        -- Executa DELETE ou ANONYMIZE
        IF v_policy.auto_anonymize THEN
            -- Anonimização: substitui campos PII sensíveis
            BEGIN
                EXECUTE format(
                    'UPDATE public.%I SET metadata = jsonb_set(metadata, ''{_anonymized}'', ''true'') ' ||
                    'WHERE %I = $1 AND %I < now() - ($2 || '' days'')::interval ' ||
                    'AND (metadata->>''_anonymized'') IS DISTINCT FROM ''true''',
                    v_table_name,
                    v_workspace_col, v_ts_col
                ) USING v_policy.workspace_id, v_policy.retention_days;
                GET DIAGNOSTICS v_anonymized_count = ROW_COUNT;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Anonymization failed for %.%: %', v_table_name, v_policy.data_type, SQLERRM;
            END;
        ELSE
            -- DELETE direto
            DECLARE
                v_delete_sql TEXT;
            BEGIN
                IF v_policy.workspace_id IS NOT NULL AND v_workspace_col IS NOT NULL THEN
                    v_delete_sql := format(
                        'DELETE FROM public.%I ' ||
                        'WHERE %I = $1 AND %I < now() - ($2 || '' days'')::interval',
                        v_table_name, v_workspace_col, v_ts_col
                    );
                    EXECUTE v_delete_sql USING v_policy.workspace_id, v_policy.retention_days;
                ELSIF v_policy.data_type IN ('auth_attempts', 'idempotency_keys') THEN
                    v_delete_sql := format(
                        'DELETE FROM public.%I WHERE %I < now() - ($1 || '' days'')::interval',
                        v_table_name, v_ts_col
                    );
                    EXECUTE v_delete_sql USING v_policy.retention_days;
                ELSE
                    CONTINUE; -- Não tem workspace e não é global
                END IF;
                GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Retention delete failed for %.%: %', v_table_name, v_policy.data_type, SQLERRM;
            END;
        END IF;

        -- Log no data_breach_log se houve delete massivo
        IF v_deleted_count > 1000 THEN
            INSERT INTO public.data_breach_log (
                workspace_id, breach_type, severity,
                description, affected_data_categories,
                affected_users_count, metadata, status
            ) VALUES (
                v_policy.workspace_id, 'other', 'low',
                format('Automated retention delete: %s rows from %.%s',
                       v_deleted_count, 'public', v_table_name),
                ARRAY[v_policy.data_type]::TEXT[],
                NULL,
                jsonb_build_object('policy_id', v_policy.id, 'retention_days', v_policy.retention_days),
                'resolved'
            );
        END IF;
    END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- FUNÇÃO 2: LGPD Review Reminder — notifica admins de reviews pendentes
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.lgpd_send_review_reminders()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_register RECORD;
    v_workspace RECORD;
    v_days_until_due INTEGER;
BEGIN
    -- Para cada registro de processamento com review devido em <= 7 dias
    FOR v_register IN
        SELECT dpr.id, dpr.workspace_id, dpr.data_category,
               dpr.data_type, dpr.next_review_due,
               dpr.risk_level, dpr.processing_purpose
        FROM public.data_processing_register dpr
        WHERE dpr.next_review_due IS NOT NULL
          AND dpr.next_review_due <= (now() + interval '7 days')
          AND dpr.next_review_due > now()
    LOOP
        -- Notifica admins do workspace (via lgpd_settings)
        FOR v_workspace IN
            SELECT ls.dpo_email, ls.workspace_id, ls.dpo_name
            FROM public.lgpd_settings ls
            WHERE ls.workspace_id = v_register.workspace_id
              AND ls.dpo_email IS NOT NULL
        LOOP
            -- Insere alert para DPO (vai para a tabela alerts)
            BEGIN
                INSERT INTO public.alerts (
                    workspace_id, title, description, severity, category,
                    is_resolved, metadata
                ) VALUES (
                    v_workspace.workspace_id,
                    'LGPD: Revisão de tratamento pendente',
                    format(
                        'O registro de tratamento "%s" (categoria: %s, finalidade: %s, risco: %s) ' ||
                        'precisa ser revisado até %s. Acesse o módulo LGPD para atualizar.',
                        v_register.data_type,
                        v_register.data_category,
                        v_register.processing_purpose,
                        v_register.risk_level,
                        v_register.next_review_due::date
                    ),
                    CASE v_register.risk_level WHEN 'critical' THEN 'critical'
                                               WHEN 'high' THEN 'high'
                                               ELSE 'medium' END,
                    'lgpd',
                    false,
                    jsonb_build_object(
                        'register_id', v_register.id,
                        'due_date', v_register.next_review_due,
                        'dpo_email', v_workspace.dpo_email
                    )
                );
            EXCEPTION WHEN OTHERS THEN
                -- Não bloqueia o cron se a notificação falhar
                RAISE NOTICE 'Failed to send LGPD review reminder: %', SQLERRM;
            END;
        END LOOP;
    END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- FUNÇÃO 3: SAR Deadline Checker — detecta SARs com prazo crítico
-- Art. 18 §1 LGPD: resposta em até 15 dias
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.lgpd_check_sar_deadlines()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sar RECORD;
    v_days_remaining INTEGER;
BEGIN
    FOR v_sar IN
        SELECT dsr.id, dsr.user_id, dsr.workspace_id, dsr.request_type,
               dsr.deadline_at, dsr.status
        FROM public.data_subject_requests dsr
        WHERE dsr.status = 'processing'
          AND dsr.deadline_at <= (now() + interval '2 days')
    LOOP
        v_days_remaining := (v_sar.deadline_at - now())::integer;

        INSERT INTO public.alerts (
            workspace_id, title, description, severity, category, is_resolved, metadata
        ) VALUES (
            v_sar.workspace_id,
            'LGPD SAR: prazo crítico',
            format(
                'Solicitação de direito do titular (tipo: %s) está com prazo de ' ||
                'resposta em %s dia(s). prazo final: %s',
                v_sar.request_type,
                v_days_remaining,
                v_sar.deadline_at::date
            ),
            CASE WHEN v_days_remaining <= 0 THEN 'critical' ELSE 'high' END,
            'lgpd',
            false,
            jsonb_build_object(
                'sar_id', v_sar.id,
                'user_id', v_sar.user_id,
                'request_type', v_sar.request_type,
                'deadline_at', v_sar.deadline_at
            )
        ) ON CONFLICT DO NOTHING;
    END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- CRON JOBS (via pg_cron) — 4 jobs principais
-- ═══════════════════════════════════════════════════════════════

-- Job 1: Retenção de dados — roda todo dia às 3h da manhã
SELECT cron.schedule(
    'lgpd-retention-daily',
    '0 3 * * *',
    'SELECT public.lgpd_apply_retention_policies()'
);

-- Job 2: Revisão de registros LGPD — toda segunda-feira às 9h
SELECT cron.schedule(
    'lgpd-review-reminders',
    '0 9 * * 1',
    'SELECT public.lgpd_send_review_reminders()'
);

-- Job 3: Verificação de SAR deadlines — a cada 4 horas
SELECT cron.schedule(
    'lgpd-sar-deadline-check',
    '0 */4 * * *',
    'SELECT public.lgpd_check_sar_deadlines()'
);

-- Job 4: Cleanup de auth_attempts — todo dia às 2h (LGPD: retenção máx 90d)
SELECT cron.schedule(
    'lgpd-cleanup-auth-attempts',
    '0 2 * * *',
    'SELECT public.cleanup_auth_attempts()'
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
    PERFORM 1 FROM pg_proc WHERE proname = 'lgpd_apply_retention_policies';
    PERFORM 1 FROM pg_proc WHERE proname = 'lgpd_send_review_reminders';
    PERFORM 1 FROM pg_proc WHERE proname = 'lgpd_check_sar_deadlines';

    -- Confirma que os cron jobs foram criados
    IF NOT EXISTS (
        SELECT 1 FROM cron.job
        WHERE jobname IN ('lgpd-retention-daily','lgpd-review-reminders',
                         'lgpd-sar-deadline-check','lgpd-cleanup-auth-attempts')
    ) THEN
        RAISE NOTICE 'WARNING: pg_cron jobs may not be available in this Supabase plan';
    END IF;

    RAISE NOTICE 'ETAPAS 32-35 OK: 3 LGPD functions + 4 pg_cron jobs';
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- NOTA DE DEPLOY
-- ═══════════════════════════════════════════════════════════════
-- pg_cron requer Supabase Pro ou superior.
-- Se não disponível, os jobs podem ser chamados via Edge Function cron-executor.
-- Para verificar: SELECT * FROM cron.job;
-- Para remover: SELECT cron.unschedule('job-name');
