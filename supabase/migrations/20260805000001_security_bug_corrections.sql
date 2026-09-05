-- ═══════════════════════════════════════════════════════════════
-- Corrective migration: 5 critical security/correctness bugs
-- Identified by exhaustive validation pass on 2026-08-05
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- BUG 1 (LGPD / Data integrity):
--   data_subject_requests.user_id is declared NOT NULL but the FK has
--   ON DELETE SET NULL. Postgres would attempt to set user_id = NULL
--   when the referenced auth.users row is deleted, which violates the
--   NOT NULL constraint and raises a FK violation error — blocking
--   LGPD Art. 17 right-to-erasure for any user who submitted a DSR.
--
--   Fix: Drop the contradictory FK, re-add it with ON DELETE RESTRICT.
--   A user may not be deleted while they have open DSRs; the DSR must
--   be completed (status='completed'/'denied') and the user_id column
--   can be nullified manually in a controlled erasure workflow before
--   the account row is deleted.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.data_subject_requests
    DROP CONSTRAINT IF EXISTS data_subject_requests_user_id_fkey;

ALTER TABLE public.data_subject_requests
    ADD CONSTRAINT data_subject_requests_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES auth.users(id)
        ON DELETE RESTRICT;


-- ─────────────────────────────────────────────────────────────────
-- BUG 2 (Auth bypass — brute-force):
--   In check_auth_security(), the CAPTCHA gate (>= captcha_threshold = 3)
--   fires BEFORE the lockout gate (>= max_failures = 5).  Because 5 >= 3,
--   any request with 5+ failures always hits the captcha branch first
--   and returns {allowed: true, requires_captcha: true}, completely
--   bypassing lockout and allowing unlimited password attempts.
--
--   Fix: Rewrite the function so the lockout check (>= max_failures)
--   executes before the captcha check (>= captcha_threshold).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_auth_security(
    p_email TEXT,
    p_ip_address TEXT DEFAULT NULL,
    p_action TEXT DEFAULT 'login'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_config           jsonb;
    v_lockout          RECORD;
    v_fail_count_15m   INTEGER;
    v_fail_count_ip    INTEGER;
    v_new_lockout_id   UUID;
BEGIN
    -- Lê configuração de segurança
    SELECT config_value INTO v_config
    FROM public.security_config
    WHERE config_key = 'auth_hardening'
    LIMIT 1;

    IF v_config IS NULL THEN
        v_config := '{"max_failures":5,"lockout_minutes":15,"captcha_threshold":3,"ip_max_15m":10}'::jsonb;
    END IF;

    -- Verifica lockout ativo para o e-mail
    SELECT * INTO v_lockout
    FROM public.account_lockouts
    WHERE email = p_email
      AND (expires_at IS NULL OR expires_at > now())
      AND released_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'locked_out',
            'expires_at', v_lockout.expires_at,
            'lockout_id', v_lockout.id
        );
    END IF;

    -- Verifica rate-limit por IP
    IF p_ip_address IS NOT NULL THEN
        SELECT attempt_count INTO v_fail_count_ip
        FROM public.ip_rate_limits
        WHERE ip_address = p_ip_address
          AND action = p_action
          AND last_attempt_at > (now() - interval '15 minutes');

        IF v_fail_count_ip >= (v_config->>'ip_max_15m')::INTEGER THEN
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

    -- Conta failures recentes (15 min)
    SELECT COUNT(*) INTO v_fail_count_15m
    FROM public.auth_attempts
    WHERE email = p_email
      AND success = false
      AND created_at > (now() - interval '15 minutes');

    -- LOCKOUT CHECK FIRST (>= max_failures = 5) ← ordem corrigida
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

    -- CAPTCHA CHECK SECOND (>= captcha_threshold = 3) ← ordem corrigida
    IF v_fail_count_15m >= (v_config->>'captcha_threshold')::INTEGER THEN
        RETURN jsonb_build_object(
            'allowed', true,
            'requires_captcha', true,
            'failure_count_15m', v_fail_count_15m,
            'message', 'Too many failed attempts. CAPTCHA required.'
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', true,
        'requires_captcha', false,
        'failure_count_15m', v_fail_count_15m
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────
-- BUG 3 (Auth bypass — IP block reset):
--   record_auth_attempt() ON CONFLICT clause includes `is_blocked = false`,
--   meaning every failed login attempt from a blocked IP silently clears
--   the block. An attacker just needs to keep trying to stay unblocked.
--
--   Fix: Remove `is_blocked = false` from the ON CONFLICT DO UPDATE.
--   The block must only be cleared via explicit administrative action or
--   the cleanup function after the block window expires.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_auth_attempt(
    p_email TEXT,
    p_success BOOLEAN,
    p_ip_address TEXT DEFAULT NULL,
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

    -- Se falhou, incrementa contador de IP (sem resetar is_blocked)
    IF p_success = false AND p_ip_address IS NOT NULL THEN
        INSERT INTO public.ip_rate_limits (ip_address, action, attempt_count, last_attempt_at)
        VALUES (p_ip_address, 'login', 1, now())
        ON CONFLICT (ip_address, action)
        DO UPDATE SET
            attempt_count = ip_rate_limits.attempt_count + 1,
            last_attempt_at = now();
        -- NOTE: is_blocked intentionally omitted — blocks must be
        -- cleared only by cleanup_auth_attempts() or explicit admin action.
    END IF;

    RETURN v_new_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────
-- BUG 4 (SQL injection — allowlist bypass):
--   validate_table_names_for_drill() falls through to
--   `v_validated := p_target_tables` when p_allowed_tables is NULL or
--   empty, silently accepting any table name including injected SQL
--   identifiers. The allowlist is the sole injection barrier.
--
--   Fix: Treat an empty or NULL allowlist as a configuration error;
--   raise an exception so callers get a hard failure rather than silent
--   allowance of arbitrary table names.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_table_names_for_drill(
    p_target_tables TEXT[],
    p_allowed_tables TEXT[]
)
RETURNS TEXT[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_table TEXT;
    v_validated TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Guard: empty allowlist is a misconfiguration, not a pass-through
    IF p_allowed_tables IS NULL OR array_length(p_allowed_tables, 1) IS NULL THEN
        RAISE EXCEPTION 'allowed_tables list is empty — all tables rejected. '
            'Provide an explicit allowlist to validate_table_names_for_drill().';
    END IF;

    FOREACH v_table IN ARRAY p_target_tables LOOP
        IF NOT v_table = ANY(p_allowed_tables) THEN
            RAISE EXCEPTION 'Table "%" is not in allowed drill target list', v_table;
        END IF;
        -- Validate identifier format (alphanumeric + underscore only)
        IF v_table !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
            RAISE EXCEPTION 'Invalid table name format: "%"', v_table;
        END IF;
        v_validated := array_append(v_validated, v_table);
    END LOOP;

    RETURN v_validated;
END;
$$;


-- ─────────────────────────────────────────────────────────────────
-- BUG 5 (RLS non-idempotency):
--   apply_workspace_rls() drops the policy named `<table>_all` but
--   creates policies named `<table>_admin_workspace` and
--   `<table>_member_read`. On a second invocation the DROP is a no-op
--   (the `_all` policy no longer exists) and the CREATE fails with
--   "policy already exists", making the procedure non-idempotent and
--   breaking any re-run or migration retry.
--
--   Fix: Drop the two policy names that the procedure actually creates
--   before re-creating them (using DROP IF EXISTS to stay idempotent).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE PROCEDURE public.apply_workspace_rls(p_table_name TEXT)
LANGUAGE plpgsql AS $$
BEGIN
    -- Drop both policies that this procedure creates (idempotent)
    EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        p_table_name || '_admin_workspace', p_table_name
    );
    EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        p_table_name || '_member_read', p_table_name
    );

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

COMMIT;
