
-- Performance indexes for frequently queried columns.
-- All indexes are wrapped in existence guards: this migration runs before
-- 20260332000001 which adds agent_id/user_id/level to agent_traces and the
-- version column to prompt_versions. Tables like workspace_members,
-- oracle_history, knowledge_bases, and evaluation_runs are added by even
-- later migrations. Skipping an index here is always safe — the migration
-- that introduces the column/table also creates the matching index.
DO $$
BEGIN
  -- agents: user_id is in the baseline schema
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'user_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agents' AND indexname = 'idx_agents_user_id') THEN
      CREATE INDEX idx_agents_user_id ON public.agents (user_id);
    END IF;
  END IF;

  -- agents: updated_at is in the baseline schema
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'updated_at'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agents' AND indexname = 'idx_agents_updated_at') THEN
      CREATE INDEX idx_agents_updated_at ON public.agents (updated_at DESC);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agents' AND indexname = 'idx_agents_user_updated') THEN
      CREATE INDEX idx_agents_user_updated ON public.agents (user_id, updated_at DESC);
    END IF;
  END IF;

  -- agent_traces: agent_id added by 20260332000001
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_traces' AND column_name = 'agent_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_traces' AND indexname = 'idx_agent_traces_agent_id') THEN
      CREATE INDEX idx_agent_traces_agent_id ON public.agent_traces (agent_id);
    END IF;
  END IF;

  -- agent_traces: user_id added by 20260332000001
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_traces' AND column_name = 'user_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_traces' AND indexname = 'idx_agent_traces_user_created') THEN
      CREATE INDEX idx_agent_traces_user_created ON public.agent_traces (user_id, created_at DESC);
    END IF;
  END IF;

  -- agent_usage: agent_id in baseline
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_usage' AND column_name = 'agent_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_usage' AND indexname = 'idx_agent_usage_agent_date') THEN
      CREATE INDEX idx_agent_usage_agent_date ON public.agent_usage (agent_id, date DESC);
    END IF;
  END IF;

  -- agent_usage: user_id in baseline
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_usage' AND column_name = 'user_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_usage' AND indexname = 'idx_agent_usage_user_id') THEN
      CREATE INDEX idx_agent_usage_user_id ON public.agent_usage (user_id);
    END IF;
  END IF;

  -- prompt_versions: version column not in stub baseline
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prompt_versions' AND column_name = 'version'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'prompt_versions' AND indexname = 'idx_prompt_versions_agent_version') THEN
      CREATE INDEX idx_prompt_versions_agent_version ON public.prompt_versions (agent_id, version DESC);
    END IF;
  END IF;

  -- workspace_members: table added by later migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workspace_members'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'workspace_members' AND indexname = 'idx_workspace_members_user_id') THEN
      CREATE INDEX idx_workspace_members_user_id ON public.workspace_members (user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'workspace_members' AND indexname = 'idx_workspace_members_workspace_id') THEN
      CREATE INDEX idx_workspace_members_workspace_id ON public.workspace_members (workspace_id);
    END IF;
  END IF;

  -- oracle_history: table added by later migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'oracle_history'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'oracle_history' AND indexname = 'idx_oracle_history_user_created') THEN
      CREATE INDEX idx_oracle_history_user_created ON public.oracle_history (user_id, created_at DESC);
    END IF;
  END IF;

  -- knowledge_bases: table added by later migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'knowledge_bases'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'knowledge_bases' AND indexname = 'idx_knowledge_bases_workspace_id') THEN
      CREATE INDEX idx_knowledge_bases_workspace_id ON public.knowledge_bases (workspace_id);
    END IF;
  END IF;

  -- evaluation_runs: table added by later migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evaluation_runs'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'evaluation_runs' AND indexname = 'idx_evaluation_runs_workspace_id') THEN
      CREATE INDEX idx_evaluation_runs_workspace_id ON public.evaluation_runs (workspace_id);
    END IF;
  END IF;
END $$;
