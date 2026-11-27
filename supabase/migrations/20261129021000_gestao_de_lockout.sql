-- ============================================================
-- Gestão de bloqueios de login (lockout) pelo administrador
-- ============================================================
-- `check_auth_security` grava em `account_lockouts` SEM `workspace_id`
-- (o login roda pré-JWT e não conhece o tenant). A policy de SELECT
-- filtra por workspace_members ou user_id = auth.uid(), então nenhum
-- administrador consegue enxergar um bloqueio — e, com o lockout
-- voltando a funcionar (20261129019000), o usuário bloqueado ficaria
-- preso sem que ninguém pudesse liberá-lo.
--
-- Duas funções SECURITY DEFINER com guard de admin de workspace:
--   * admin_list_account_lockouts(p_workspace) — lista bloqueios ativos
--   * admin_release_account_lockout(p_lockout) — libera e audita
-- A liberação é registrada em security_events (append-only).
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_account_lockouts(p_workspace uuid)
RETURNS TABLE (
  id uuid,
  email text,
  ip_address text,
  lockout_type text,
  reason text,
  failure_count integer,
  locked_at timestamptz,
  expires_at timestamptz,
  unlocked_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_workspace_admin(auth.uid(), p_workspace)) THEN
    RAISE EXCEPTION 'Acesso negado: requer administrador do workspace' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT l.id, l.email, l.ip_address, l.lockout_type, l.reason,
         l.failure_count, l.locked_at, l.expires_at, l.unlocked_at
  FROM public.account_lockouts l
  WHERE l.workspace_id = p_workspace
     OR (l.workspace_id IS NULL AND l.unlocked_at IS NULL)
  ORDER BY l.locked_at DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_release_account_lockout(p_lockout uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_failures integer;
BEGIN
  SELECT email, failure_count INTO v_email, v_failures
  FROM public.account_lockouts WHERE id = p_lockout;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bloqueio nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.account_lockouts
     SET unlocked_at = now(), released_at = now(), unlocked_by = auth.uid()
   WHERE id = p_lockout AND unlocked_at IS NULL;

  -- Zera o contador: sem isso o proximo login reabre o bloqueio na hora.
  DELETE FROM public.auth_attempts
   WHERE email = v_email
     AND success = false
     AND created_at > (now() - interval '15 minutes');

  INSERT INTO public.security_events (event_type, severity, user_id, details)
  VALUES ('account_lockout_released', 'warning', auth.uid(),
          jsonb_build_object('lockout_id', p_lockout, 'email', v_email,
                             'previous_failure_count', v_failures));

  RETURN jsonb_build_object('released', true, 'email', v_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_account_lockouts(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_release_account_lockout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_account_lockouts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_release_account_lockout(uuid) TO authenticated;