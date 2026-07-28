-- 1) Procedência ponta-a-ponta: o staging precisa carregar QUEM classificou.
--    Sem esta coluna, o veredito do léxico calculado na coleta morria no
--    staging e a skill promovida renascia como 'unknown'/0.0.
ALTER TABLE public.skill_harvest_candidates
  ADD COLUMN IF NOT EXISTS department_source text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.skill_harvest_candidates
  DROP CONSTRAINT IF EXISTS skill_harvest_candidates_department_source_check;

ALTER TABLE public.skill_harvest_candidates
  ADD CONSTRAINT skill_harvest_candidates_department_source_check
  CHECK (department_source IN ('unknown','heuristic','platform_heuristic','llm','human','import'));

-- Retroativo: candidatos que já têm departamento e confiança vieram do léxico
-- determinístico da coleta. Marcá-los como 'unknown' seria apagar um fato conhecido.
UPDATE public.skill_harvest_candidates
   SET department_source = 'heuristic'
 WHERE department IS NOT NULL
   AND department_confidence > 0
   AND department_source = 'unknown';

CREATE INDEX IF NOT EXISTS idx_shc_department_source
  ON public.skill_harvest_candidates (department_source);

-- 2) Trava de integridade da procedência no registro definitivo.
--    Um CHECK seria rígido demais (rejeitaria inserts legítimos de código que
--    ainda não conhece a coluna); a trigger NORMALIZA em vez de recusar, então
--    nenhum caminho de escrita quebra e nenhum registro incoerente entra.
CREATE OR REPLACE FUNCTION public.normalize_skill_department_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Sem departamento não existe decisão da qual duvidar: zera a procedência
  -- para que a skill caia na fila "sem departamento", não na de "revisar".
  IF NEW.department IS NULL THEN
    NEW.department_source := 'unknown';
    NEW.department_confidence := 0;
    RETURN NEW;
  END IF;

  -- Curadoria humana é o topo da hierarquia de evidência: confiança plena,
  -- independentemente do que o cliente enviou (um 0.0 acidental reenfileiraria
  -- para revisão uma decisão que já foi tomada por uma pessoa).
  IF NEW.department_source = 'human' THEN
    NEW.department_confidence := 1.0;
    RETURN NEW;
  END IF;

  -- Departamento preenchido sem procedência declarada = alguém escreveu o
  -- rótulo sem dizer quem decidiu. 'import' é o rótulo honesto: rastreável,
  -- de baixa confiança e visível no filtro de origem do painel.
  IF NEW.department_source = 'unknown' THEN
    NEW.department_source := 'import';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skill_registry_department_provenance ON public.skill_registry;
CREATE TRIGGER trg_skill_registry_department_provenance
  BEFORE INSERT OR UPDATE OF department, department_source, department_confidence
  ON public.skill_registry
  FOR EACH ROW EXECUTE FUNCTION public.normalize_skill_department_provenance();