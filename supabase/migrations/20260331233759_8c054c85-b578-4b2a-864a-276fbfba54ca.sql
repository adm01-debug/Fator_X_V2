-- Fix 1: Restrict workspace_members email visibility to owners only
-- Table added by a later migration, guard required.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workspace_members'
  ) THEN
    DROP POLICY IF EXISTS "Members can view workspace members" ON public.workspace_members;
    CREATE POLICY "Members can view own workspace members"
    ON public.workspace_members FOR SELECT
    TO authenticated
    USING (
      user_id = auth.uid()
      OR workspace_id IN (
        SELECT ws.id FROM workspaces ws WHERE ws.owner_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Fix 2: Replace overly permissive template policy
-- agents.is_template may not exist in the stub baseline; workspace_members may not exist.
-- Guard on both column and table existence.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'is_template'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workspace_members'
  ) THEN
    DROP POLICY IF EXISTS "Authenticated users can view templates" ON public.agents;
    CREATE POLICY "Authenticated users can view templates"
    ON public.agents FOR SELECT
    TO authenticated
    USING (
      user_id = auth.uid()
      OR (is_template = true AND workspace_id IN (
        SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
      ))
    );
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'is_template'
  ) THEN
    DROP POLICY IF EXISTS "Authenticated users can view templates" ON public.agents;
    CREATE POLICY "Authenticated users can view templates"
    ON public.agents FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() OR is_template = true);
  END IF;
END $$;
