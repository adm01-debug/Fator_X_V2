-- ═══════════════════════════════════════════════════════════════
-- ETAPA 11/50 — Criar tabelas LGPD obrigatórias (Art. 37 LGPD)
-- Mitiga: B-01, B-02 (LGPD compliance)
-- Severity: 🟡 MÉDIO (compliance, não segurança direta)
-- ═══════════════════════════════════════════════════════════════
-- Tabelas que faltam para LGPD plena:
-- 1. data_subject_requests (SAR — Art. 18 LGPD)
-- 2. data_processing_register (Art. 37 LGPD)
-- 3. personal_data_inventory (inventário de dados por workspace)
-- 4. data_breach_log (incidentes de segurança)
-- 5. lgpd_settings (configurações por workspace)
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. DATA SUBJECT REQUESTS (SAR) — Art. 18 LGPD ──────────────
-- Solicitações: acesso, retificação, eliminação, informação,
-- portabilidade, revogação de consentimento
CREATE TABLE IF NOT EXISTS public.data_subject_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
    request_type TEXT NOT NULL CHECK (
        request_type IN (
            'access',           -- Art. 18 I: confirmação de existência de tratamento
            'rectification',    -- Art. 18 II: correção de dados incompletos
            'deletion',         -- Art. 18 VI: eliminação de dados
            'portability',      -- Art. 18 V: portabilidade
            'information',       -- Art. 18 I: informações sobre compartilhamento
            'consent_revocation',-- Art. 18 IX: revogação de consentimento
            'objection'         -- Art. 18 VI: oposição a tratamento
        )
    ),
    status TEXT NOT NULL DEFAULT 'received' CHECK (
        status IN ('received','processing','completed','denied','partial')
    ),
    description TEXT,
    response_data JSONB,
    deadline_at TIMESTAMPTZ NOT NULL, -- Art. 18 §1: resposta em 15 dias
    responded_at TIMESTAMPTZ,
    denied_reason TEXT,
    ip_address TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsr_user ON public.data_subject_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dsr_workspace ON public.data_subject_requests(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dsr_status_deadline ON public.data_subject_requests(status, deadline_at);

ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;

-- Usuário vê suas próprias solicitações
CREATE POLICY "dsr_user_read" ON public.data_subject_requests
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "dsr_user_insert" ON public.data_subject_requests
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Admins do workspace veem e respondem
CREATE POLICY "dsr_workspace_admin" ON public.data_subject_requests
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE TRIGGER update_data_subject_requests_at
    BEFORE UPDATE ON public.data_subject_requests
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. DATA PROCESSING REGISTER — Art. 37 LGPD ──────────────────
-- Registro obrigatório de TODAS as operações de tratamento de dados
CREATE TABLE IF NOT EXISTS public.data_processing_register (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    data_category TEXT NOT NULL CHECK (
        data_category IN ('personal','sensitive','children','anonymized')
    ),
    data_type TEXT NOT NULL, -- e.g. 'email', 'cpf', 'phone', 'purchase_history'
    processing_purpose TEXT NOT NULL, -- e.g. 'agent_training', 'analytics', 'marketing'
    legal_basis TEXT NOT NULL CHECK (
        legal_basis IN (
            'consent',           -- Art. 7 I
            'legitimate_interest',-- Art. 7 IX
            'contract',          -- Art. 7 V
            'legal_obligation',  -- Art. 7 II
            'public_interest',    -- Art. 7 III
            'defense_claim'       -- Art. 7 IX (proteção ao crédito)
        )
    ),
    data_sources TEXT[] DEFAULT '{}', -- 'direct_collection','third_party','public_sources'
    recipients TEXT[] DEFAULT '{}',   -- terceiros que recebem os dados
    retention_period TEXT, -- e.g. '90_days', '5_years', 'indefinite'
    security_measures TEXT[] DEFAULT '{}',
    has_international_transfer BOOLEAN DEFAULT false,
    transfer_countries TEXT[],
    last_reviewed_at TIMESTAMPTZ,
    next_review_due TIMESTAMPTZ,
    risk_level TEXT DEFAULT 'medium' CHECK (
        risk_level IN ('low', 'medium', 'high', 'critical')
    ),
    description TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dpr_workspace ON public.data_processing_register(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dpr_risk ON public.data_processing_register(risk_level, next_review_due)
    WHERE next_review_due IS NOT NULL;

ALTER TABLE public.data_processing_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dpr_public_read" ON public.data_processing_register
    FOR SELECT USING (TRUE); -- Art. 37: deve ser público

CREATE POLICY "dpr_workspace_write" ON public.data_processing_register
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE TRIGGER update_dpr_at
    BEFORE UPDATE ON public.data_processing_register
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 3. PERSONAL DATA INVENTORY ──────────────────────────────────
-- Inventário de campos que contêm dados pessoais por tabela
CREATE TABLE IF NOT EXISTS public.personal_data_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    data_category TEXT NOT NULL CHECK (
        data_category IN ('name','email','phone','cpf','address',
                         'financial','health','biometric','location','behavioral')
    ),
    is_pii BOOLEAN DEFAULT true,
    is_sensitive BOOLEAN DEFAULT false, -- Art. 5 II LGPD: dados sensíveis
    sensitivity_level TEXT DEFAULT 'medium' CHECK (
        sensitivity_level IN ('low', 'medium', 'high', 'critical')
    ),
    retention_days INTEGER, -- NULL = indefinido
    encryption_at_rest BOOLEAN DEFAULT false,
    encryption_in_transit BOOLEAN DEFAULT true,
    anonymization_method TEXT, -- e.g. 'k_anonymity', 'pseudonymization', 'aggregation'
    purpose TEXT, -- finalidade do tratamento
    legal_basis TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workspace_id, table_name, column_name)
);

CREATE INDEX IF NOT EXISTS idx_pdi_workspace ON public.personal_data_inventory(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pdi_sensitivity ON public.personal_data_inventory(is_sensitive, sensitivity_level);

ALTER TABLE public.personal_data_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdi_workspace_read" ON public.personal_data_inventory
    FOR SELECT USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE POLICY "pdi_workspace_write" ON public.personal_data_inventory
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE TRIGGER update_pdi_at
    BEFORE UPDATE ON public.personal_data_inventory
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 4. DATA BREACH LOG ──────────────────────────────────────────
-- Registro de incidentes de segurança (Art. 48 LGPD: notificação em 2 dias)
CREATE TABLE IF NOT EXISTS public.data_breach_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
    breach_type TEXT NOT NULL CHECK (
        breach_type IN ('unauthorized_access','data_leak','system_compromise',
                        'insider_threat','phishing','ransomware','lost_device','other')
    ),
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (
        severity IN ('low', 'medium', 'high', 'critical')
    ),
    affected_users_count INTEGER,
    affected_data_categories TEXT[],
    description TEXT NOT NULL,
    detection_method TEXT,
    detection_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    containment_at TIMESTAMPTZ,
    notification_to_authority_at TIMESTAMPTZ, -- ANPD: Art. 48 §2
    notification_to_users_at TIMESTAMPTZ,     -- Usuários: Art. 48
    resolved_at TIMESTAMPTZ,
    status TEXT DEFAULT 'investigating' CHECK (
        status IN ('investigating','contained','resolved','open')
    ),
    mitigation_steps JSONB DEFAULT '[]',
    affected_tables TEXT[],
    reported_by UUID REFERENCES auth.users(id),
    anpd_incident_id TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dbl_workspace ON public.data_breach_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dbl_severity ON public.data_breach_log(severity, status);

ALTER TABLE public.data_breach_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dbl_admin_read" ON public.data_breach_log
    FOR SELECT USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE POLICY "dbl_service_write" ON public.data_breach_log
    FOR INSERT TO service_role WITH CHECK (TRUE);

CREATE TRIGGER update_dbl_at
    BEFORE UPDATE ON public.data_breach_log
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 5. LGPD SETTINGS ──────────────────────────────────────────────
-- Configurações de privacy por workspace
CREATE TABLE IF NOT EXISTS public.lgpd_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
    -- Consentimento
    require_explicit_consent BOOLEAN DEFAULT true, -- Art. 7 caput
    consent_version TEXT DEFAULT '1.0',
    privacy_policy_url TEXT,
    terms_url TEXT,
    -- Retenção
    default_retention_days INTEGER DEFAULT 1825, -- 5 anos
    auto_delete_inactive_days INTEGER DEFAULT 1095, -- 3 anos
    -- Anonimização
    anonymize_after_days INTEGER DEFAULT 365,
    -- Compartilhamento
    allow_third_party_sharing BOOLEAN DEFAULT false,
    require_dpa BOOLEAN DEFAULT true, -- Data Processing Agreement
    -- Notificações
    notify_anpd_on_breach BOOLEAN DEFAULT true, -- Art. 48
    breach_notification_days INTEGER DEFAULT 2, -- Art. 48 §1: 2 dias úteis
    -- Data Protection Officer
    dpo_name TEXT,
    dpo_email TEXT,
    dpo_phone TEXT,
    -- Art. 10
    has_risk_assessment BOOLEAN DEFAULT false,
    last_risk_assessment TIMESTAMPTZ,
    -- LGPD
    lgpd_accepted_at TIMESTAMPTZ,
    lgpd_accepted_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lgpd_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lgpd_settings_public_read" ON public.lgpd_settings
    FOR SELECT USING (TRUE);

CREATE POLICY "lgpd_settings_admin_write" ON public.lgpd_settings
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE TRIGGER update_lgpd_settings_at
    BEFORE UPDATE ON public.lgpd_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 6. DATA RETENTION POLICY ─────────────────────────────────────
-- Políticas de retenção por tipo de dado
CREATE TABLE IF NOT EXISTS public.data_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    data_type TEXT NOT NULL, -- e.g. 'chat_messages', 'agent_logs', 'audit_log'
    retention_days INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    auto_anonymize BOOLEAN DEFAULT false, -- anonimiza ao invés de deletar
    anonymization_method TEXT DEFAULT 'pseudonymization',
    escalation_before_delete BOOLEAN DEFAULT true, -- notifica admins antes de delete
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workspace_id, data_type)
);

ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drp_workspace_read" ON public.data_retention_policies
    FOR SELECT USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE POLICY "drp_workspace_write" ON public.data_retention_policies
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE TRIGGER update_drp_at
    BEFORE UPDATE ON public.data_retention_policies
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'data_subject_requests',
        'data_processing_register',
        'personal_data_inventory',
        'data_breach_log',
        'lgpd_settings',
        'data_retention_policies'
    ] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema='public' AND table_name=tbl
        ) THEN
            RAISE EXCEPTION 'Tabela LGPD % não foi criada', tbl;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname='public' AND tablename=tbl
        ) THEN
            RAISE WARNING 'Tabela % não tem policies RLS', tbl;
        END IF;
    END LOOP;

    RAISE NOTICE 'ETAPA 11 OK: 6 tabelas LGPD criadas (Art. 37, 18, 48)';
END;
$$;
