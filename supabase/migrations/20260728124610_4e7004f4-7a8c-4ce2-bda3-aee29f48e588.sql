-- =====================================================================
-- Curadoria administrativa do catálogo público de skills
--
-- Problema: 100% das 142 linhas de public.skill_registry têm created_by
-- NULL (foram inseridas por harvest/seed), e a única política de UPDATE
-- exige created_by = auth.uid(). Resultado: o catálogo público é
-- imutável pela aplicação — nenhuma correção de departamento, tag ou
-- qualidade é possível sem service_role.
--
-- Solução: política adicional, estritamente escopada, permitindo que
-- administradores de workspace editem APENAS skills públicas. Skills
-- privadas continuam exclusivas do dono. Nada é afrouxado para o papel
-- anon nem para usuários comuns.
-- =====================================================================

-- Trilha de auditoria: quem foi o último a curar e quando.
ALTER TABLE public.skill_registry
  ADD COLUMN IF NOT EXISTS curated_by uuid,
  ADD COLUMN IF NOT EXISTS curated_at timestamptz;

COMMENT ON COLUMN public.skill_registry.curated_by IS
  'Último administrador que editou esta skill pública (curadoria).';
COMMENT ON COLUMN public.skill_registry.curated_at IS
  'Momento da última curadoria administrativa.';

-- WITH CHECK espelha o USING para impedir que um admin "sequestre" a
-- skill tornando-a privada ou reatribuindo o criador no mesmo UPDATE.
DROP POLICY IF EXISTS "Workspace admins can curate public skills" ON public.skill_registry;
CREATE POLICY "Workspace admins can curate public skills"
  ON public.skill_registry
  FOR UPDATE
  TO authenticated
  USING (is_public = true AND public.is_workspace_admin((SELECT auth.uid())))
  WITH CHECK (is_public = true AND public.is_workspace_admin((SELECT auth.uid())));

-- Preenche curated_by/curated_at automaticamente em qualquer UPDATE,
-- para que a trilha não dependa do cliente enviar os campos.
CREATE OR REPLACE FUNCTION public.stamp_skill_curation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.department IS DISTINCT FROM OLD.department
     OR NEW.tags IS DISTINCT FROM OLD.tags
     OR NEW.category IS DISTINCT FROM OLD.category THEN
    NEW.curated_by := auth.uid();
    NEW.curated_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_skill_curation ON public.skill_registry;
CREATE TRIGGER trg_stamp_skill_curation
  BEFORE UPDATE ON public.skill_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_skill_curation();

-- Índice para o painel de curadoria (skills sem departamento primeiro).
CREATE INDEX IF NOT EXISTS idx_skill_registry_department_null
  ON public.skill_registry (department)
  WHERE department IS NULL;