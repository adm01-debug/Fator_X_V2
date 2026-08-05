
-- Fix 1: Restrict workspace_secrets SELECT to owners only
-- Table added by a later migration, guard required.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workspace_secrets'
  ) THEN
    DROP POLICY IF EXISTS "Members can view workspace secrets" ON public.workspace_secrets;
    DROP POLICY IF EXISTS "Owners can view workspace secrets" ON public.workspace_secrets;
    CREATE POLICY "Owners can view workspace secrets"
    ON public.workspace_secrets FOR SELECT
    TO authenticated
    USING (workspace_id IN (
      SELECT ws.id FROM workspaces ws WHERE ws.owner_id = auth.uid()
    ));
  END IF;
END $$;

-- Fix 2: Restrict agent templates to authenticated users only
-- agents.is_template may not exist in the stub baseline, guard required.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'is_template'
  ) THEN
    DROP POLICY IF EXISTS "Anyone can view templates" ON public.agents;
    CREATE POLICY "Authenticated users can view templates"
    ON public.agents FOR SELECT
    TO authenticated
    USING (is_template = true);
  END IF;
END $$;
