
-- Performance indexes for frequently queried columns
-- idx_agents_user_status is guarded: the status column is added in migration
-- 20260332000001 which runs after this file. On a fresh preview branch the
-- column does not exist yet; later migration 20260404152137 creates the index
-- once status is present. On production the column already exists and the
-- index is created here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'status'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agents' AND indexname = 'idx_agents_user_status') THEN
      CREATE INDEX idx_agents_user_status ON public.agents(user_id, status);
    END IF;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_agents_user_updated ON public.agents(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_traces_agent_created ON public.agent_traces(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_traces_level ON public.agent_traces(level);
CREATE INDEX IF NOT EXISTS idx_agent_traces_user_level ON public.agent_traces(user_id, level);
CREATE INDEX IF NOT EXISTS idx_agent_usage_agent_date ON public.agent_usage(agent_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_agent_usage_user_date ON public.agent_usage(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON public.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_secrets_workspace ON public.workspace_secrets(workspace_id, key_name);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_agent ON public.prompt_versions(agent_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_oracle_history_user ON public.oracle_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_workspace ON public.evaluation_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_workspace ON public.knowledge_bases(workspace_id);
