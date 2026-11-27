-- ============================================================
-- Religar o subsistema de segurança de autenticação
-- ============================================================
-- Causa: `check_auth_security`, `record_auth_attempt` e
-- `is_user_locked_out` existem como SECURITY DEFINER, mas o ACL
-- em produção só concede EXECUTE a postgres/service_role. O fluxo
-- de login roda como `anon` (pré-JWT), portanto todas as três
-- falhavam com "permission denied" — e o front nem as chamava,
-- gravando auth_attempts direto (bloqueado pelo RLS, pois a
-- policy de INSERT exige user_id = auth.uid(), impossível antes
-- do login). Resultado medido: auth_attempts = 0 linhas,
-- account_lockouts = 0, ip_rate_limits = 0. O lockout, o rate
-- limit por IP e o captcha nunca saíram do papel.
--
-- Correção:
--   1. GRANT EXECUTE a anon/authenticated nas três funções.
--   2. record_auth_attempt gravava em `captcha_token`, coluna que
--      não existe (a tabela tem `captcha_token_hash`). Corrigido,
--      e o token passa a ser gravado como SHA-256 (nunca em claro).
--   3. Registrar eventos de falha de login na trilha de auditoria.
-- ============================================================

GRANT EXECUTE ON FUNCTION public.check_auth_security(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_locked_out(TEXT) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_auth_attempt(TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_auth_attempt(TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_auth_attempt(
    p_email TEXT,
    p_success BOOLEAN,
    p_ip_address TEXT DEFAULT NULL,
    p_requires_captcha BOOLEAN DEFAULT false,
    p_captcha_token TEXT DEFAULT NULL,
    p_lockout_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_new_id UUID;
BEGIN
    INSERT INTO public.auth_attempts (
        email, ip_address, success,
        requires_captcha, captcha_token_hash, lockout_id
    ) VALUES (
        p_email, p_ip_address, p_success,
        p_requires_captcha,
        -- Token de captcha nunca em claro: só o digest.
        CASE WHEN p_captcha_token IS NULL THEN NULL
             ELSE encode(digest(p_captcha_token, 'sha256'), 'hex') END,
        p_lockout_id
    ) RETURNING id INTO v_new_id;

    IF p_success = false AND p_ip_address IS NOT NULL THEN
        INSERT INTO public.ip_rate_limits (ip_address, action, attempt_count, last_attempt_at)
        VALUES (p_ip_address, 'login', 1, now())
        ON CONFLICT (ip_address, action)
        DO UPDATE SET
            attempt_count = ip_rate_limits.attempt_count + 1,
            last_attempt_at = now();
    END IF;

    RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.record_auth_attempt(TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, UUID) IS
  'Registra tentativa de login (SECURITY DEFINER, executável por anon pois roda pré-JWT). Hash SHA-256 do captcha, nunca o token em claro.';