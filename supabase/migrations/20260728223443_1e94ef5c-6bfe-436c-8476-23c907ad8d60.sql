-- ─────────────────────────────────────────────────────────────────────────────
-- Coletâneas (meta-repositórios) no registro de skills
--
-- Contexto: `skill-harvester/lib.ts::isMetaRepository` já barra awesome-lists,
-- cursos e roadmaps na coleta, mas 21 registros entraram ANTES dessa guarda.
-- Eles ficam presos na fila de "revisar departamento" pedindo ao curador uma
-- decisão que não existe: `awesome-mac` não pertence a nenhum departamento.
--
-- Modelamos como coluna explícita, e não como um valor especial de
-- `department`/`department_source`, porque "não é uma skill instalável" é
-- ortogonal a "qual é o departamento": um dia uma coletânea pode ganhar um
-- rótulo correto e continuar não sendo instalável.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.skill_registry
  ADD COLUMN IF NOT EXISTS is_meta_collection boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.skill_registry.is_meta_collection IS
  'true quando o item e uma coletanea (awesome-list, curso, roadmap, livro de links) e nao uma skill instalavel. Espelha isMetaRepository() do harvester. Excluido da fila de revisao departamental e da vitrine publica.';

-- Backfill: mesmos padrões do harvester, aplicados a nome, slug e descrição.
-- `unaccent` não está garantido aqui, então usamos ILIKE/regex sobre o texto cru
-- — os slugs do GitHub já são ASCII.
UPDATE public.skill_registry
SET is_meta_collection = true
WHERE is_meta_collection = false
  AND (
    concat_ws(' ', name, slug, coalesce(description, '')) ~* '(\mawesome\M|awesome[-_]|[-_]awesome\M|\mcurated\M|\mcollection\M|\mlist of\M|list[-_]of|cheat[-_ ]?sheets?|for[-_ ]beginners|from[-_ ]scratch|\mroadmap\M|\mtutorials?\M|\mcourse\M|book[-_ ]of|best[-_ ]websites|professional[-_ ]programming|everything[-_ ]you[-_ ]need[-_ ]to[-_ ]know)'
  );

-- Uma coletânea nunca é instalável, logo nunca é publicável nem "verificada".
-- Trigger (e não CHECK) pelo mesmo motivo da normalização de procedência:
-- normalizar torna o estado inválido inalcançável por qualquer caminho de
-- escrita, inclusive código legado, em vez de quebrar o insert.
CREATE OR REPLACE FUNCTION public.normalize_skill_meta_collection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_meta_collection THEN
    NEW.is_public := false;
    NEW.is_verified := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skill_registry_meta_collection ON public.skill_registry;
CREATE TRIGGER trg_skill_registry_meta_collection
  BEFORE INSERT OR UPDATE OF is_meta_collection, is_public, is_verified
  ON public.skill_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_skill_meta_collection();

-- Reaplica a invariante às linhas recém-marcadas (o UPDATE acima rodou antes
-- da trigger existir).
UPDATE public.skill_registry
SET is_public = false, is_verified = false
WHERE is_meta_collection AND (is_public OR is_verified);

-- A fila de governança varre exatamente este recorte; índice parcial mantém a
-- varredura proporcional ao que sobrou, não ao catálogo inteiro.
CREATE INDEX IF NOT EXISTS idx_skill_registry_department_review
  ON public.skill_registry (department_confidence)
  WHERE NOT is_meta_collection AND department_source <> 'human';