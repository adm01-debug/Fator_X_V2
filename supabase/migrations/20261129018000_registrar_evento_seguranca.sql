-- security_events e a trilha de auditoria que a tela /security le, mas
-- ninguem conseguia escrever nela: a unica policy de escrita e
-- "security events service write" (TO service_role). O front roda como
-- `authenticated`, e ate hoje o unico ponto de escrita existente era o
-- lgpd-manager (service_role). Resultado: 0 linhas e auditoria morta.
--
-- Permitir INSERT direto a `authenticated` deixaria o cliente forjar
-- eventos de auditoria. A saida e uma funcao SECURITY DEFINER que valida
-- quem chama, exige vinculo com o workspace e carimba o autor, para que o
-- registro nunca seja anonimo nem apontando para workspace alheio.
--
-- Append-only por desenho: nao ha UPDATE nem DELETE.

CREATE OR REPLACE FUNCTION public.registrar_evento_seguranca(
  p_event_type text,
  p_severity   text DEFAULT 'info',
  p_workspace  uuid DEFAULT NULL,
  p_details    jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'registrar_evento_seguranca exige usuario autenticado'
      USING ERRCODE = '28000';
  END IF;

  IF p_event_type IS NULL OR length(btrim(p_event_type)) = 0 THEN
    RAISE EXCEPTION 'event_type obrigatorio' USING ERRCODE = '22023';
  END IF;

  IF p_severity NOT IN ('info', 'low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'severidade invalida: %', p_severity USING ERRCODE = '22023';
  END IF;

  -- Sem workspace explicito, usa o do proprio usuario; com workspace
  -- explicito, exige vinculo -- evita gravar evento em workspace alheio.
  IF p_workspace IS NULL THEN
    SELECT wm.workspace_id INTO p_workspace
      FROM public.workspace_members wm
     WHERE wm.user_id = v_uid
     ORDER BY wm.created_at
     LIMIT 1;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_members wm
       WHERE wm.user_id = v_uid AND wm.workspace_id = p_workspace
    ) THEN
      RAISE EXCEPTION 'usuario nao pertence ao workspace informado'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.security_events (event_type, severity, user_id, workspace_id, details)
  VALUES (
    p_event_type,
    p_severity,
    v_uid,
    p_workspace,
    coalesce(p_details, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_evento_seguranca(text, text, uuid, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.registrar_evento_seguranca(text, text, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_evento_seguranca(text, text, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.registrar_evento_seguranca(text, text, uuid, jsonb) IS
  'Registra evento na trilha de auditoria (append-only). Valida o usuario e o vinculo com o workspace; grava o autor sempre.';
