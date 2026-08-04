
-- Performance indexes for frequently queried columns.
-- All indexes are wrapped in existence guards: this migration runs before several
-- schema migrations that add the referenced columns/tables. Later migrations
-- (20260331215314, 20260404152137, 20260405195401) re-create any index skipped
-- here once the columns exist, so skipping is always safe on preview branches.
DO $$
BEGIN
  -- agents: status column added by 20260332000001
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'status'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agents' AND indexname = 'idx_agents_user_status') THEN
      CREATE INDEX idx_agents_user_status ON public.agents(user_id, status);
    END IF;
  END IF;

  -- agents: updated_at (standard column, guarded for safety)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'updated_at'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agents' AND indexname = 'idx_agents_user_updated') THEN
      CREATE INDEX idx_agents_user_updated ON public.agents(user_id, updated_at DESC);
    END IF;
  END IF;

  -- agent_traces: agent_id added by 20260332000001
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_traces' AND column_name = 'agent_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_traces' AND indexname = 'idx_agent_traces_agent_created') THEN
      CREATE INDEX idx_agent_traces_agent_created ON public.agent_traces(agent_id, created_at DESC);
    END IF;
  END IF;

  -- agent_traces: level added by 20260332000001
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_traces' AND column_name = 'level'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_traces' AND indexname = 'idx_agent_traces_level') THEN
      CREATE INDEX idx_agent_traces_level ON public.agent_traces(level);
    END IF;
  END IF;

  -- agent_traces: user_id + level, both added by 20260332000001
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_traces' AND column_name = 'user_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_traces' AND column_name = 'level'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_traces' AND indexname = 'idx_agent_traces_user_level') THEN
      CREATE INDEX idx_agent_traces_user_level ON public.agent_traces(user_id, level);
    END IF;
  END IF;

  -- agent_usage: agent_id in baseline but guarded for safety
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_usage' AND column_name = 'agent_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_usage' AND indexname = 'idx_agent_usage_agent_date') THEN
      CREATE INDEX idx_agent_usage_agent_date ON public.agent_usage(agent_id, date DESC);
    END IF;
  END IF;

  -- agent_usage: user_id in baseline but guarded for safety
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_usage' AND column_name = 'user_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_usage' AND indexname = 'idx_agent_usage_user_date') THEN
      CREATE INDEX idx_agent_usage_user_date ON public.agent_usage(user_id, date DESC);
    END IF;
  END IF;

  -- workspace_members: table added by later migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workspace_members'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'workspace_members' AND indexname = 'idx_workspace_members_user') THEN
      CREATE INDEX idx_workspace_members_user ON public.workspace_members(user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'workspace_members' AND indexname = 'idx_workspace_members_workspace') THEN
      CREATE INDEX idx_workspace_members_workspace ON public.workspace_members(workspace_id);
    END IF;
  END IF;

  -- workspace_secrets: table added by later migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workspace_secrets'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'workspace_secrets' AND indexname = 'idx_workspace_secrets_workspace') THEN
      CREATE INDEX idx_workspace_secrets_workspace ON public.workspace_secrets(workspace_id, key_name);
    END IF;
  END IF;

  -- prompt_versions: version column not in stub baseline
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prompt_versions' AND column_name = 'version'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'prompt_versions' AND indexname = 'idx_prompt_versions_agent') THEN
      CREATE INDEX idx_prompt_versions_agent ON public.prompt_versions(agent_id, version DESC);
    END IF;
  END IF;

  -- oracle_history: table added by later migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'oracle_history'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'oracle_history' AND indexname = 'idx_oracle_history_user') THEN
      CREATE INDEX idx_oracle_history_user ON public.oracle_history(user_id, created_at DESC);
    END IF;
  END IF;

  -- evaluation_runs: table added by later migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evaluation_runs'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'evaluation_runs' AND indexname = 'idx_evaluation_runs_workspace') THEN
      CREATE INDEX idx_evaluation_runs_workspace ON public.evaluation_runs(workspace_id);
    END IF;
  END IF;

  -- knowledge_bases: table added by later migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'knowledge_bases'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'knowledge_bases' AND indexname = 'idx_knowledge_bases_workspace') THEN
      CREATE INDEX idx_knowledge_bases_workspace ON public.knowledge_bases(workspace_id);
    END IF;
  END IF;
END $$;
