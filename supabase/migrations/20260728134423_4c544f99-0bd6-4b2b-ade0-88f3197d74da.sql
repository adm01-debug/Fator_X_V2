-- ============================================================================
-- Revisão manual com auditoria para classificações automáticas de departamento
-- ============================================================================
-- Por que uma tabela e não apenas o UPDATE direto: hoje a aprovação acontece
-- na memória do navegador e some. Sem trilha, ninguém consegue responder
-- "quem trocou este departamento, com base em qual evidência, e quando" — que
-- é exatamente a pergunta que aparece quando uma classificação de IA erra.

CREATE TABLE IF NOT EXISTS public.skill_reclassification_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_id UUID NOT NULL REFERENCES public.skill_registry(id) ON DELETE CASCADE,
  skill_slug TEXT NOT NULL DEFAULT '',
  skill_name TEXT NOT NULL DEFAULT '',

  -- Snapshot ANTES/DEPOIS. `department_from` é congelado no momento da
  -- proposta e serve como guarda de concorrência na aprovação.
  department_from TEXT,
  department_to TEXT NOT NULL,

  -- Evidência que sustenta a proposta.
  confidence NUMERIC(6,4) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  margin NUMERIC(6,4) NOT NULL DEFAULT 0 CHECK (margin >= 0 AND margin <= 1),
  runner_up TEXT,
  matched_terms TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  source TEXT NOT NULL DEFAULT 'lexico' CHECK (source IN ('lexico','ia')),
  rationale TEXT NOT NULL DEFAULT '',

  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','rejeitado')),
  decision_reason TEXT NOT NULL DEFAULT '',

  requested_by UUID,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Uma decisão sempre tem autor e data; pendente nunca tem.
  CONSTRAINT skill_reclass_decision_complete CHECK (
    (status = 'pendente' AND reviewed_at IS NULL)
    OR (status <> 'pendente' AND reviewed_at IS NOT NULL)
  ),
  -- Proposta no-op não pode virar fila de revisão.
  CONSTRAINT skill_reclass_not_noop CHECK (department_from IS DISTINCT FROM department_to)
);

-- Só UMA pendência por skill: duas propostas concorrentes gerariam decisões
-- contraditórias sobre o mesmo registro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_reclass_one_pending
  ON public.skill_reclassification_reviews (skill_id)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_skill_reclass_status_created
  ON public.skill_reclassification_reviews (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_reclass_skill
  ON public.skill_reclassification_reviews (skill_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.skill_reclassification_reviews TO authenticated;
GRANT ALL ON public.skill_reclassification_reviews TO service_role;

ALTER TABLE public.skill_reclassification_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem revisoes de classificacao"
  ON public.skill_reclassification_reviews FOR SELECT TO authenticated
  USING (true);

-- Propor é barato e reversível: qualquer curador pode enfileirar, desde que
-- assine a proposta com a própria identidade e ela nasça pendente.
CREATE POLICY "Curadores propoem revisoes em proprio nome"
  ON public.skill_reclassification_reviews FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = (SELECT auth.uid())
    AND status = 'pendente'
    AND reviewed_by IS NULL
  );

-- Decidir muda o Registry: restrito a admins.
CREATE POLICY "Admins decidem revisoes"
  ON public.skill_reclassification_reviews FOR UPDATE TO authenticated
  USING (is_workspace_admin((SELECT auth.uid())))
  WITH CHECK (is_workspace_admin((SELECT auth.uid())));

-- Sem policy de DELETE: trilha de auditoria é append-only por design.

CREATE TRIGGER update_skill_reclass_updated_at
  BEFORE UPDATE ON public.skill_reclassification_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Decisão atômica: aprovar aplica a troca; rejeitar apenas registra.
-- ============================================================================
-- SECURITY DEFINER porque precisa escrever em skill_registry e no audit_log
-- na MESMA transação. A checagem de admin é feita explicitamente dentro da
-- função — definer sem guarda seria um bypass de RLS.
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

  IF _approve THEN
    SELECT department INTO v_current FROM public.skill_registry
    WHERE id = v_review.skill_id FOR UPDATE;

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
        curated_by = v_uid,
        curated_at = now(),
        updated_at = now()
    WHERE id = v_review.skill_id;
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
      'rationale', LEFT(v_review.rationale, 500),
      'decision_reason', v_review.decision_reason
    )
  );

  RETURN v_review;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_skill_reclassification(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_skill_reclassification(UUID, BOOLEAN, TEXT) TO authenticated;