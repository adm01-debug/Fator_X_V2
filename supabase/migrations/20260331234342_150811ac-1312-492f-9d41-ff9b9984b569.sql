-- Fix SELECT policies from public to authenticated role

-- agents: user_id is in the baseline schema, no existence guard needed.
DROP POLICY IF EXISTS "Users can view own agents" ON public.agents;
CREATE POLICY "Users can view own agents"
ON public.agents FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- agent_usage: user_id is in the baseline schema, no existence guard needed.
DROP POLICY IF EXISTS "Users can view own usage" ON public.agent_usage;
CREATE POLICY "Users can view own usage"
ON public.agent_usage FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- prompt_versions: user_id may not exist in stub baseline, guard required.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prompt_versions' AND column_name = 'user_id'
  ) THEN
    DROP POLICY IF EXISTS "Users can view own prompt versions" ON public.prompt_versions;
    CREATE POLICY "Users can view own prompt versions"
    ON public.prompt_versions FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- agent_traces: user_id added by migration 20260332000001, guard required.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_traces' AND column_name = 'user_id'
  ) THEN
    DROP POLICY IF EXISTS "Users can view own traces" ON public.agent_traces;
    CREATE POLICY "Users can view own traces"
    ON public.agent_traces FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;
