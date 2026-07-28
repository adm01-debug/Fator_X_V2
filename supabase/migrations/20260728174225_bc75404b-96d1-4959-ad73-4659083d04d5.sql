ALTER TABLE public.skill_registry
  ADD COLUMN IF NOT EXISTS department_confidence numeric(4,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS department_source text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.skill_registry
  DROP CONSTRAINT IF EXISTS skill_registry_department_confidence_range;
ALTER TABLE public.skill_registry
  ADD CONSTRAINT skill_registry_department_confidence_range
  CHECK (department_confidence >= 0 AND department_confidence <= 1);

ALTER TABLE public.skill_registry
  DROP CONSTRAINT IF EXISTS skill_registry_department_source_valid;
ALTER TABLE public.skill_registry
  ADD CONSTRAINT skill_registry_department_source_valid
  CHECK (department_source IN ('unknown', 'heuristic', 'llm', 'human', 'import'));

COMMENT ON COLUMN public.skill_registry.department_confidence IS
  'Confianca [0,1] da classificacao departamental; herdada do candidato na promocao.';
COMMENT ON COLUMN public.skill_registry.department_source IS
  'Procedencia da classificacao: unknown | heuristic | llm | human | import.';

CREATE INDEX IF NOT EXISTS idx_skill_registry_low_confidence_department
  ON public.skill_registry (department_confidence, department)
  WHERE department_confidence < 0.5;