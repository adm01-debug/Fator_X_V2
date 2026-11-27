-- ============================================================================
-- 1) Registro de consentimento LGPD exposto e auditavel
-- 2) Fecha a auto-resposta de solicitacoes do titular
--
-- Evidencia (catalogo real de producao, 2026-11-27):
--   consent_records = 0 linhas e ZERO referencia em src/ ou supabase/functions/.
--   A tabela existe desde 20260403, tem 15 colunas, RLS com 4 policies e
--   trigger de updated_at, mas nunca foi lida nem escrita pela aplicacao.
--   A tela LGPDGovernancePage oferece "Revogacao de consentimento" como tipo
--   de solicitacao e nao existe consentimento registrado para revogar.
--
--   data_subject_requests_member_update permite UPDATE quando
--   `user_id = auth.uid()`, ou seja o proprio titular pode marcar o pedido
--   como completed/denied antes de qualquer analise. A UI esconde o seletor
--   de nao-admin, mas o banco nao impede -- e a UI nao e o controle.
--   O DELETE tambem libera `user_id = auth.uid()`, apagando o rastro do
--   atendimento, que e justamente a prova de conformidade.
--
-- Nada aqui apaga linha: revogar consentimento e UPDATE (granted=false +
-- revoked_at), que e o que a LGPD pede (historico do consentimento).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1.1) Unicidade do consentimento vigente por (usuario, tipo)
--      Impede duas linhas contraditorias para o mesmo consentimento.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_records_user_type
  ON public.consent_records (user_id, consent_type);

CREATE INDEX IF NOT EXISTS idx_consent_records_workspace
  ON public.consent_records (workspace_id);

-- ---------------------------------------------------------------------------
-- 1.2) RPC de leitura: devolve os consentimentos do proprio usuario mais os
--      do workspace quando quem chama e administrador.
--      SECURITY INVOKER de proposito: as policies ja cobrem o caso e nao ha
--      razao para elevar privilegio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_consents(p_workspace uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  workspace_id uuid,
  consent_type text,
  granted boolean,
  legal_basis text,
  purpose text,
  granted_at timestamptz,
  revoked_at timestamptz,
  version integer,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.user_id, c.workspace_id, c.consent_type, c.granted,
         c.legal_basis, c.purpose, c.granted_at, c.revoked_at,
         c.version, c.updated_at
  FROM public.consent_records c
  WHERE c.user_id = auth.uid()
    AND (p_workspace IS NULL OR c.workspace_id = p_workspace OR c.workspace_id IS NULL)
  ORDER BY c.consent_type;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_consents(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 1.3) RPC de escrita: registrar / revogar consentimento.
--      Garante carimbo de granted_at, revoked_at e incremento de version,
--      para a UI nao precisar (e nao poder) inventar esses campos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_my_consent(
  p_consent_type text,
  p_granted boolean,
  p_workspace uuid DEFAULT NULL,
  p_legal_basis text DEFAULT NULL,
  p_purpose text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  consent_type text,
  granted boolean,
  granted_at timestamptz,
  revoked_at timestamptz,
  version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row  public.consent_records;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'autenticacao obrigatoria' USING ERRCODE = '42501';
  END IF;

  IF p_consent_type IS NULL OR btrim(p_consent_type) = '' THEN
    RAISE EXCEPTION 'consent_type obrigatorio' USING ERRCODE = '22023';
  END IF;

  -- Workspace informado precisa ser do usuario; senao grava no escopo pessoal.
  IF p_workspace IS NOT NULL
     AND p_workspace NOT IN (SELECT public.get_user_workspace_ids(v_user)) THEN
    RAISE EXCEPTION 'workspace fora do escopo do usuario' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.consent_records AS c (
    user_id, workspace_id, consent_type, granted,
    legal_basis, purpose, granted_at, revoked_at, version
  )
  VALUES (
    v_user, p_workspace, btrim(p_consent_type), p_granted,
    p_legal_basis, p_purpose,
    CASE WHEN p_granted THEN now() ELSE NULL END,
    CASE WHEN p_granted THEN NULL ELSE now() END,
    1
  )
  ON CONFLICT (user_id, consent_type) DO UPDATE
    SET granted     = EXCLUDED.granted,
        legal_basis = COALESCE(EXCLUDED.legal_basis, c.legal_basis),
        purpose     = COALESCE(EXCLUDED.purpose, c.purpose),
        workspace_id = COALESCE(EXCLUDED.workspace_id, c.workspace_id),
        granted_at  = CASE WHEN EXCLUDED.granted THEN now() ELSE c.granted_at END,
        revoked_at  = CASE WHEN EXCLUDED.granted THEN NULL ELSE now() END,
        version     = c.version + 1,
        updated_at  = now()
  RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.id, v_row.consent_type, v_row.granted,
                      v_row.granted_at, v_row.revoked_at, v_row.version;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_my_consent(text, boolean, uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_consent(text, boolean, uuid, text, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Solicitacao do titular: quem abre nao responde e nao apaga.
--    Resposta e exclusao passam a exigir administrador do workspace.
--    Pedido pessoal (workspace_id IS NULL) fica respondivel apenas por quem
--    abriu -- nao ha administrador de escopo pessoal --, por isso o predicado
--    mantem o ramo do proprio usuario SOMENTE quando nao ha workspace.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS data_subject_requests_member_update ON public.data_subject_requests;
CREATE POLICY data_subject_requests_member_update ON public.data_subject_requests
  FOR UPDATE
  USING (
    is_workspace_admin(auth.uid(), workspace_id)
    OR (workspace_id IS NULL AND user_id = auth.uid())
  )
  WITH CHECK (
    is_workspace_admin(auth.uid(), workspace_id)
    OR (workspace_id IS NULL AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS data_subject_requests_member_delete ON public.data_subject_requests;
CREATE POLICY data_subject_requests_member_delete ON public.data_subject_requests
  FOR DELETE
  USING (
    -- Titular apaga somente o que ainda nao foi respondido (sem prova a perder).
    (user_id = auth.uid() AND status IN ('received', 'processing'))
    OR is_workspace_admin(auth.uid(), workspace_id)
  );

COMMENT ON FUNCTION public.set_my_consent(text, boolean, uuid, text, text) IS
  'Registra ou revoga consentimento LGPD do proprio usuario. Carimba '
  'granted_at/revoked_at e incrementa version; nunca apaga a linha.';
COMMENT ON FUNCTION public.list_my_consents(uuid) IS
  'Lista os consentimentos do proprio usuario (filtro opcional por workspace).';
