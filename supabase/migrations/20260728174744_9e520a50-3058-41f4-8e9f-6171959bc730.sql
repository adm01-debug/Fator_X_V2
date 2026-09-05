-- ============================================================================
-- Procedência humana nas decisões de reclassificação
-- ----------------------------------------------------------------------------
-- Contexto: skill_registry ganhou department_source/department_confidence para
-- distinguir rótulo curado de palpite heurístico (confiança média medida: 0.14).
-- A RPC de decisão, porém, ainda escrevia só `department`, deixando a
-- procedência congelada em 'heuristic'. Consequência prática: uma skill
-- corrigida à mão continuava exibindo o selo "Rever depto." e voltava para a
-- fila indefinidamente — a curadoria não tinha efeito observável.
--
-- Decisões de projeto:
--  1. APROVAR  -> source='human', confidence=1.0. A pessoa escolheu o destino.
--  2. REJEITAR -> source='human', confidence=1.0 SOMENTE se já existe um
--     departamento atual. Rejeitar a proposta é afirmar "o rótulo atual está
--     certo", o que é curadoria humana legítima. Mas se a skill não tem
--     departamento algum, rejeitar não afirma nada: preservamos a procedência
--     original para que ela continue sinalizada.
--  3. O audit_log passa a guardar o par (source, confidence) ANTES da decisão.
--     Sem isso é impossível responder depois "o classificador estava errado ou
--     apenas inseguro?" — a evidência some no UPDATE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decide_skill_reclassification(
  _review_id UUID,
  _approve BOOLEAN,
  _reason TEXT DEFAULT ''
)
RETURNS public.skill_reclassification_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_review public.skill_reclassification_reviews;
  v_current TEXT;
  v_prev_source TEXT;
  v_prev_conf NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_workspace_admin(v_uid) THEN
    RAISE EXCEPTION 'Apenas administradores podem decidir reclassificacoes' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE: dois admins clicando ao mesmo tempo serializam aqui em vez de
  -- aplicarem a mesma troca duas vezes.
  SELECT * INTO v_review
  FROM public.skill_reclassification_reviews
  WHERE id = _review_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revisao nao encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_review.status <> 'pendente' THEN
    RAISE EXCEPTION 'Revisao ja decidida (%).', v_review.status USING ERRCODE = '55000';
  END IF;

  -- Trava a skill e captura a procedência anterior ANTES de qualquer escrita.
  -- Também roda no caminho de rejeição: precisamos do estado atual para
  -- decidir se a rejeição pode ou não ser tratada como confirmação humana.
  SELECT department, department_source, department_confidence
    INTO v_current, v_prev_source, v_prev_conf
  FROM public.skill_registry
  WHERE id = v_review.skill_id
  FOR UPDATE;

  IF _approve THEN
    -- Guarda de concorrência: o "antes" registrado precisa continuar valendo,
    -- senão estaríamos sobrescrevendo uma curadoria mais recente às cegas.
    IF v_current IS DISTINCT FROM v_review.department_from THEN
      RAISE EXCEPTION 'Conflito: departamento atual (%) difere do analisado (%).',
        COALESCE(v_current, 'sem departamento'),
        COALESCE(v_review.department_from, 'sem departamento')
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.skill_registry
    SET department = v_review.department_to,
        department_source = 'human',
        department_confidence = 1.0,
        curated_by = v_uid,
        curated_at = now(),
        updated_at = now()
    WHERE id = v_review.skill_id;

  ELSIF v_current IS NOT NULL THEN
    -- Rejeição com departamento vigente = confirmação explícita do rótulo
    -- atual. Sem isto, a skill reentraria na fila para sempre, e o custo do
    -- trabalho de revisão seria pago repetidamente sem nunca convergir.
    -- Não mexemos em `department` de propósito: nada mudou, só a procedência.
    UPDATE public.skill_registry
    SET department_source = 'human',
        department_confidence = 1.0,
        curated_by = v_uid,
        curated_at = now(),
        updated_at = now()
    WHERE id = v_review.skill_id
      AND department IS NOT NULL;
  END IF;

  UPDATE public.skill_reclassification_reviews
  SET status = CASE WHEN _approve THEN 'aprovado' ELSE 'rejeitado' END,
      decision_reason = COALESCE(LEFT(_reason, 1000), ''),
      reviewed_by = v_uid,
      reviewed_at = now()
  WHERE id = _review_id
  RETURNING * INTO v_review;

  PERFORM public.log_audit_entry(
    CASE WHEN _approve THEN 'skill_reclassification.approved'
         ELSE 'skill_reclassification.rejected' END,
    'skill_registry',
    v_review.skill_id::TEXT,
    jsonb_build_object(
      'review_id', v_review.id,
      'slug', v_review.skill_slug,
      'department_from', v_review.department_from,
      'department_to', v_review.department_to,
      'confidence', v_review.confidence,
      'margin', v_review.margin,
      'source', v_review.source,
      -- Procedência anterior: distingue "classificador errou" de
      -- "classificador acertou mas com confianca baixa".
      'previous_department_source', COALESCE(v_prev_source, 'unknown'),
      'previous_department_confidence', COALESCE(v_prev_conf, 0),
      'registry_touched', (_approve OR v_current IS NOT NULL),
      'rationale', LEFT(v_review.rationale, 500),
      'decision_reason', v_review.decision_reason
    )
  );

  RETURN v_review;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_skill_reclassification(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_skill_reclassification(UUID, BOOLEAN, TEXT) TO authenticated;