-- ============================================================================
-- Procedência da descrição de uma skill.
--
-- Por que uma coluna e não um campo em `skill_config`:
-- a decisão "posso sobrescrever este texto?" é consultada em toda tentativa de
-- enriquecimento e precisa ser indexável e verificável por CHECK. Enterrada em
-- JSONB ela viraria uma convenção não aplicada — e a primeira regressão
-- sobrescreveria a descrição escrita por uma pessoa.
-- ============================================================================

ALTER TABLE public.skill_registry
  ADD COLUMN IF NOT EXISTS description_source text,
  ADD COLUMN IF NOT EXISTS description_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS description_model text,
  ADD COLUMN IF NOT EXISTS description_generated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'skill_registry_description_source_chk'
  ) THEN
    ALTER TABLE public.skill_registry
      ADD CONSTRAINT skill_registry_description_source_chk
      CHECK (description_source IS NULL
             OR description_source IN ('humano', 'repositorio', 'ia'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'skill_registry_description_confidence_chk'
  ) THEN
    ALTER TABLE public.skill_registry
      ADD CONSTRAINT skill_registry_description_confidence_chk
      CHECK (description_confidence IS NULL
             OR (description_confidence >= 0 AND description_confidence <= 1));
  END IF;
END $$;

COMMENT ON COLUMN public.skill_registry.description_source IS
  'Procedencia da descricao: humano (escrita/curada por pessoa), repositorio (extraida do fonte), ia (gerada por LLM). NULL = desconhecida.';

-- Backfill conservador: tudo que JÁ tem texto é tratado como humano/curado.
-- O viés é deliberado — classificar errado para "humano" apenas impede um
-- enriquecimento automático; o inverso destruiria curadoria manual.
UPDATE public.skill_registry
   SET description_source = 'humano'
 WHERE description_source IS NULL
   AND length(btrim(description)) > 0;

-- Índice parcial: a fila de enriquecimento pergunta exatamente por isto —
-- importadas do GitHub, ainda sem texto útil.
CREATE INDEX IF NOT EXISTS idx_skill_registry_empty_description
  ON public.skill_registry (updated_at DESC)
  WHERE source_repo IS NOT NULL AND length(btrim(description)) = 0;

-- ============================================================================
-- Aplicação da descrição gerada.
--
-- SECURITY DEFINER porque a política de UPDATE do Registry exige admin, mas a
-- checagem de limiar e a guarda de concorrência precisam ser ATÔMICAS com a
-- escrita. Feitas no cliente, seriam um TOCTOU: dois curadores rodando a fila
-- ao mesmo tempo sobrescreveriam um ao outro, e um cliente adulterado poderia
-- gravar uma descrição de confiança 0.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_skill_description(
  _skill_id uuid,
  _description text,
  _confidence numeric,
  _model text DEFAULT '',
  _min_confidence numeric DEFAULT 0.75
)
RETURNS public.skill_registry
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.skill_registry;
  _clean text;
  _limiar numeric;
BEGIN
  IF NOT public.is_workspace_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem aplicar descricoes geradas.'
      USING ERRCODE = '42501';
  END IF;

  -- O piso é do servidor: um `_min_confidence` mais permissivo vindo do
  -- cliente é ignorado. O parâmetro só serve para ENDURECER a regra.
  _limiar := greatest(coalesce(_min_confidence, 0.75), 0.75);

  IF _confidence IS NULL OR _confidence < _limiar THEN
    RAISE EXCEPTION 'Confianca % abaixo do minimo % exigido.', coalesce(_confidence, 0), _limiar
      USING ERRCODE = '55000';
  END IF;

  _clean := btrim(coalesce(_description, ''));
  IF length(_clean) < 40 OR length(_clean) > 600 THEN
    RAISE EXCEPTION 'Descricao gerada fora do tamanho aceitavel (40-600 caracteres).'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.skill_registry WHERE id = _skill_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Skill nao encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF _row.source_repo IS NULL THEN
    RAISE EXCEPTION 'Enriquecimento automatico so vale para skills importadas.'
      USING ERRCODE = '55000';
  END IF;

  -- Guarda de concorrência e de curadoria: se alguém escreveu a descrição
  -- entre o planejamento e a aplicacao, a geracao perde. Texto humano nunca
  -- e sobrescrito por IA.
  IF length(btrim(_row.description)) > 0 THEN
    RAISE EXCEPTION 'A skill ja possui descricao — nada foi sobrescrito.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.skill_registry
     SET description = _clean,
         description_source = 'ia',
         description_confidence = round(_confidence, 3),
         description_model = left(coalesce(_model, ''), 100),
         description_generated_at = now(),
         updated_at = now()
   WHERE id = _skill_id
  RETURNING * INTO _row;

  PERFORM public.log_audit_entry(
    'skill_description_enriched',
    'skill_registry',
    _skill_id::text,
    jsonb_build_object(
      'slug', _row.slug,
      'confidence', round(_confidence, 3),
      'model', left(coalesce(_model, ''), 100),
      'length', length(_clean)
    )
  );

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_skill_description(uuid, text, numeric, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_skill_description(uuid, text, numeric, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_skill_description(uuid, text, numeric, text, numeric) TO service_role;