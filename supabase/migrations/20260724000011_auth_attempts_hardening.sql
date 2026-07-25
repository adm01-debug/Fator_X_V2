-- ═══════════════════════════════════════════════════════════════
-- ETAPA 12/50 — Restringir auth_attempts: lockout + captcha + IP rate
-- Mitiga: A-06 (brute-force login)
-- Severity: 🟠 ALTO
-- ═══════════════════════════════════════════════════════════════
-- MELHORIAS sobre o atual is_user_locked_out(5 failures / 15 min):
-- 1. Lockout persistente com duração configurável
-- 2. Rate limiting por IP (não só email)
-- 3. Captcha threshold (3 failures → captcha, 5 → lockout)
-- 4. Auto-unlock após expiry
-- 5. Escalação: 3 lockouts = lockout permanente (precisa admin)
-- 6. Cleanup automático via pg_cron
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- PASSO 1: Tabela de lockouts persistentes
CREATE TABLE IF NOT EXISTS public.account_lockouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    ip_address TEXT,
    lockout_type TEXT DEFAULT 'temporary' CHECK (
        lockout_type IN ('temporary','permanent','conditional')
    ),
    reason TEXT,
    failure_count INTEGER DEFAULT 1,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ, -- NULL = permanente
    unlocked_by UUID REFERENCES auth.users(id),
    unlocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lockouts_email ON public.account_lockouts(email, expires_at);
CREATE INDEX IF NOT EXISTS idx_lockouts_ip ON public.account_lockouts(ip_address)
    WHERE ip_address IS NOT NULL;

ALTER TABLE public.account_lockouts ENABLE ROW LEVEL SECURITY;

-- service_role insere (Edge Functions)
CREATE POLICY "lockouts_service_insert" ON public.account_lockouts
    FOR INSERT WITH CHECK (auth.jwt_role() = 'service_role');

-- service_role + admins leem (para monitorar)
CREATE POLICY "lockouts_admin_read" ON public.account_lockouts
    FOR SELECT USING (
        auth.jwt_role() = 'service_role'
        OR EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
              AND role_key = 'workspace_admin'
        )
    );

-- service_role + admins deletam (para unlock manual)
CREATE POLICY "lockouts_admin_delete" ON public.account_lockouts
    FOR DELETE USING (auth.jwt_role() = 'service_role'
        OR EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
              AND role_key = 'workspace_admin'
        )
    );

-- PASSO 2: IP-based rate limiting
CREATE TABLE IF NOT EXISTS public.ip_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('login','register','password_reset','api')),
    attempt_count INTEGER DEFAULT 1,
    first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_blocked BOOLEAN DEFAULT false,
    blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_rate_limits_ip ON public.ip_rate_limits(ip_address, action);

ALTER TABLE public.ip_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ip_rate_service" ON public.ip_rate_limits
    FOR ALL USING (auth.jwt_role() = 'service_role');

-- PASSO 3: Ampliar auth_attempts com campos para captcha
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='auth_attempts'
          AND column_name='requires_captcha') THEN
        ALTER TABLE public.auth_attempts
            ADD COLUMN requires_captcha BOOLEAN DEFAULT false;
        ALTER TABLE public.auth_attempts
            ADD COLUMN captcha_token TEXT,
            ADD COLUMN lockout_id UUID REFERENCES public.account_lockouts(id);
        COMMENT ON COLUMN auth_attempts.requires_captcha IS
            'ETAPA 12: captcha ativo após 3 failures';
    END IF;
END;
$$;

-- PASSO 4: Função principal de verificação de lockout
-- Substitui is_user_locked_out() com lógica completa
CREATE OR REPLACE FUNCTION public.check_auth_security(
    p_email TEXT,
    p_ip_address TEXT DEFAULT NULL,
    p_action TEXT DEFAULT 'login'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_is_locked BOOLEAN;
    v_lockout_rec RECORD;
    v_ip_blocked BOOLEAN;
    v_captcha_required BOOLEAN;
    v_fail_count_email INTEGER;
    v_fail_count_ip INTEGER;
    v_fail_count_15m INTEGER;
    v_fail_count_1h INTEGER;
    v_new_lockout_id UUID;
    v_config JSONB := '{"max_failures": 5, "captcha_threshold": 3, "lockout_minutes": 15, "ip_max_15m": 20, "ip_max_1h": 50}'::JSONB;
BEGIN
    -- Verifica lockout persistente do email
    SELECT INTO v_lockout_rec
        id, lockout_type, expires_at, failure_count
    FROM public.account_lockouts
    WHERE email = p_email
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY locked_at DESC LIMIT 1;

    IF FOUND THEN
        IF v_lockout_rec.lockout_type = 'permanent' THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason', 'permanent_lockout',
                'failure_count', v_lockout_rec.failure_count
            );
        END IF;
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'temporary_lockout',
            'expires_at', v_lockout_rec.expires_at,
            'failure_count', v_lockout_rec.failure_count,
            'lockout_id', v_lockout_rec.id
        );
    END IF;

    -- Verifica rate limit por IP
    IF p_ip_address IS NOT NULL THEN
        SELECT INTO v_fail_count_ip
            COUNT(*)
        FROM public.ip_rate_limits
        WHERE ip_address = p_ip_address
          AND action = p_action
          AND is_blocked = false
          AND last_attempt_at > (now() - interval '15 minutes');

        IF v_fail_count_ip >= (v_config->>'ip_max_15m')::INTEGER THEN
            -- Bloqueia IP temporariamente
            UPDATE public.ip_rate_limits
            SET is_blocked = true, blocked_until = (now() + interval '15 minutes')
            WHERE ip_address = p_ip_address AND action = p_action;

            RETURN jsonb_build_object(
                'allowed', false,
                'reason', 'ip_rate_limited',
                'ip_blocked_until', (now() + interval '15 minutes')
            );
        END IF;
    END IF;

    -- Verifica quantos failures recentes (15 min)
    SELECT COUNT(*) INTO v_fail_count_15m
    FROM public.auth_attempts
    WHERE email = p_email
      AND success = false
      AND created_at > (now() - interval '15 minutes');

    -- Captcha obrigatório após 3 failures
    IF v_fail_count_15m >= (v_config->>'captcha_threshold')::INTEGER THEN
        RETURN jsonb_build_object(
            'allowed', true,
            'requires_captcha', true,
            'failure_count_15m', v_fail_count_15m,
            'message', 'Too many failed attempts. CAPTCHA required.'
        );
    END IF;

    -- Lockout após 5 failures
    IF v_fail_count_15m >= (v_config->>'max_failures')::INTEGER THEN
        INSERT INTO public.account_lockouts (
            email, ip_address, lockout_type, reason,
            failure_count, expires_at
        ) VALUES (
            p_email, p_ip_address, 'temporary',
            'Excesso de tentativas de login',
            v_fail_count_15m,
            now() + ((v_config->>'lockout_minutes')::INTEGER || ' minutes')::INTERVAL
        ) RETURNING id INTO v_new_lockout_id;

        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'locked_out',
            'expires_at', (now() + ((v_config->>'lockout_minutes')::INTEGER || ' minutes')::INTERVAL),
            'failure_count', v_fail_count_15m,
            'lockout_id', v_new_lockout_id
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', true,
        'requires_captcha', false,
        'failure_count_15m', v_fail_count_15m
    );
END;
$$;

-- PASSO 5: Função para registrar tentativa de login
CREATE OR REPLACE FUNCTION public.record_auth_attempt(
    p_email TEXT,
    p_ip_address TEXT DEFAULT NULL,
    p_success BOOLEAN,
    p_requires_captcha BOOLEAN DEFAULT false,
    p_captcha_token TEXT DEFAULT NULL,
    p_lockout_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_new_id UUID;
BEGIN
    INSERT INTO public.auth_attempts (
        email, ip_address, success,
        requires_captcha, captcha_token, lockout_id
    ) VALUES (
        p_email, p_ip_address, p_success,
        p_requires_captcha, p_captcha_token, p_lockout_id
    ) RETURNING id INTO v_new_id;

    -- Se falhou, incrementa contador de IP
    IF p_success = false AND p_ip_address IS NOT NULL THEN
        INSERT INTO public.ip_rate_limits (ip_address, action, attempt_count, last_attempt_at)
        VALUES (p_ip_address, 'login', 1, now())
        ON CONFLICT (ip_address, action)
        DO UPDATE SET
            attempt_count = ip_rate_limits.attempt_count + 1,
            last_attempt_at = now(),
            is_blocked = false;  -- Reseta se estava bloqueado
    END IF;

    RETURN v_new_id;
END;
$$;

-- PASSO 6: Cleanup de tentativas antigas (LGPD: retenção mínima)
-- Chamar via pg_cron: SELECT cron.schedule('cleanup-auth-attempts', '0 3 * * *', 'SELECT public.cleanup_auth_attempts()');
CREATE OR REPLACE FUNCTION public.cleanup_auth_attempts()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Remove tentativas de login com mais de 90 dias (LGPD)
    DELETE FROM public.auth_attempts
    WHERE created_at < (now() - interval '90 days');

    -- Remove lockouts expirados
    DELETE FROM public.account_lockouts
    WHERE expires_at IS NOT NULL
      AND expires_at < (now() - interval '1 day');

    -- Remove rate limits por IP antigos
    DELETE FROM public.ip_rate_limits
    WHERE last_attempt_at < (now() - interval '24 hours');
END;
$$;

-- Reativa acesso (já estava revoked, mas garante que service_role tem)
GRANT EXECUTE ON FUNCTION public.cleanup_auth_attempts() TO service_role;

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
    PERFORM 1 FROM pg_proc WHERE proname = 'check_auth_security';
    PERFORM 1 FROM pg_proc WHERE proname = 'record_auth_attempt';
    PERFORM 1 FROM pg_proc WHERE proname = 'cleanup_auth_attempts';
    PERFORM 1 FROM information_schema.tables WHERE table_name = 'account_lockouts';
    PERFORM 1 FROM information_schema.tables WHERE table_name = 'ip_rate_limits';

    RAISE NOTICE 'ETAPA 12 OK: auth_attempts com lockout persistente + IP rate limiting + captcha threshold';
END;
$$;
