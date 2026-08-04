-- Fix 1: Agents - change write policies from public to authenticated
-- agents.user_id is in the baseline schema, no existence guard needed.
DROP POLICY IF EXISTS "Users can delete own agents" ON public.agents;
CREATE POLICY "Users can delete own agents"
ON public.agents FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own agents" ON public.agents;
CREATE POLICY "Users can insert own agents"
ON public.agents FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own agents" ON public.agents;
CREATE POLICY "Users can update own agents"
ON public.agents FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Fix 2: agent_traces - user_id added by migration 20260332000001, guard required.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_traces' AND column_name = 'user_id'
  ) THEN
    DROP POLICY IF EXISTS "Users can insert own traces" ON public.agent_traces;
    CREATE POLICY "Users can insert own traces"
    ON public.agent_traces FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS "Users can update own traces" ON public.agent_traces;
    CREATE POLICY "Users can update own traces"
    ON public.agent_traces FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS "Users can delete own traces" ON public.agent_traces;
    CREATE POLICY "Users can delete own traces"
    ON public.agent_traces FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- Fix 3: prompt_versions - user_id may not exist in stub baseline, guard required.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prompt_versions' AND column_name = 'user_id'
  ) THEN
    DROP POLICY IF EXISTS "Users can insert own prompt versions" ON public.prompt_versions;
    CREATE POLICY "Users can insert own prompt versions"
    ON public.prompt_versions FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS "Users can update own prompt versions" ON public.prompt_versions;
    CREATE POLICY "Users can update own prompt versions"
    ON public.prompt_versions FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS "Users can delete own prompt versions" ON public.prompt_versions;
    CREATE POLICY "Users can delete own prompt versions"
    ON public.prompt_versions FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- Fix 4: agent_usage - user_id is in the baseline schema, no existence guard needed.
DROP POLICY IF EXISTS "Users can insert own usage" ON public.agent_usage;
CREATE POLICY "Users can insert own usage"
ON public.agent_usage FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own usage" ON public.agent_usage;
CREATE POLICY "Users can update own usage"
ON public.agent_usage FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own usage" ON public.agent_usage;
CREATE POLICY "Users can delete own usage"
ON public.agent_usage FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Fix 5: workspace_members - table added by a later migration, guard required.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workspace_members'
  ) THEN
    DROP POLICY IF EXISTS "Members see workspace members" ON public.workspace_members;
    DROP POLICY IF EXISTS "Members can view own workspace members" ON public.workspace_members;
    CREATE POLICY "Members can view workspace members"
    ON public.workspace_members FOR SELECT
    TO authenticated
    USING (
      workspace_id IN (
        SELECT ws.id FROM workspaces ws WHERE ws.owner_id = auth.uid()
      )
      OR user_id = auth.uid()
    );
  END IF;
END $$;
