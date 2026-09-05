ALTER TABLE public.skill_reclassification_reviews
  ADD COLUMN IF NOT EXISTS confidence_threshold numeric(5,4);

ALTER TABLE public.skill_reclassification_reviews
  DROP CONSTRAINT IF EXISTS skill_reclass_threshold_range;

ALTER TABLE public.skill_reclassification_reviews
  ADD CONSTRAINT skill_reclass_threshold_range
  CHECK (confidence_threshold IS NULL OR (confidence_threshold >= 0 AND confidence_threshold <= 1));

COMMENT ON COLUMN public.skill_reclassification_reviews.confidence_threshold IS
  'Limiar de confianca exigido pelo curador no momento da proposta. Sem ele, uma proposta de 0.60 aprovada ontem e indistinguivel de uma rejeitada hoje sob limiar 0.80.';