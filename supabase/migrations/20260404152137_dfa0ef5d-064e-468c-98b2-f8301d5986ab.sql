
-- Performance indexes for frequent queries
-- Each index is guarded with a column-existence check to handle stub baselines
-- where some tables were created by earlier migrations with fewer columns.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_traces' AND column_name = 'agent_id')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_traces' AND indexname = 'idx_agent_traces_agent_id')
  THEN
    CREATE INDEX idx_agent_traces_agent_id ON public.agent_traces(agent_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_traces' AND column_name = 'user_id')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_traces' AND column_name = 'created_at')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_traces' AND indexname = 'idx_agent_traces_user_created')
  THEN
    CREATE INDEX idx_agent_traces_user_created ON public.agent_traces(user_id, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_usage' AND column_name = 'agent_id')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_usage' AND column_name = 'date')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_usage' AND indexname = 'idx_agent_usage_agent_date')
  THEN
    CREATE INDEX idx_agent_usage_agent_date ON public.agent_usage(agent_id, date DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_usage' AND column_name = 'user_id')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_usage' AND column_name = 'date')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_usage' AND indexname = 'idx_agent_usage_user_date')
  THEN
    CREATE INDEX idx_agent_usage_user_date ON public.agent_usage(user_id, date DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_memories' AND column_name = 'memory_type')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_memories' AND column_name = 'workspace_id')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_memories' AND indexname = 'idx_agent_memories_type_ws')
  THEN
    CREATE INDEX idx_agent_memories_type_ws ON public.agent_memories(memory_type, workspace_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_memories' AND column_name = 'created_at')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agent_memories' AND indexname = 'idx_agent_memories_created')
  THEN
    CREATE INDEX idx_agent_memories_created ON public.agent_memories(created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'user_id')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'created_at')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'audit_log' AND indexname = 'idx_audit_log_user_created')
  THEN
    CREATE INDEX idx_audit_log_user_created ON public.audit_log(user_id, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'user_id')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'status')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agents' AND indexname = 'idx_agents_user_status')
  THEN
    CREATE INDEX idx_agents_user_status ON public.agents(user_id, status);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'workspace_id')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agents' AND indexname = 'idx_agents_workspace')
  THEN
    CREATE INDEX idx_agents_workspace ON public.agents(workspace_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflows' AND column_name = 'workspace_id')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'workflows' AND indexname = 'idx_workflows_workspace')
  THEN
    CREATE INDEX idx_workflows_workspace ON public.workflows(workspace_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'agent_id')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'sessions' AND indexname = 'idx_sessions_agent')
  THEN
    CREATE INDEX idx_sessions_agent ON public.sessions(agent_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'user_id')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'started_at')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'sessions' AND indexname = 'idx_sessions_user')
  THEN
    CREATE INDEX idx_sessions_user ON public.sessions(user_id, started_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prompt_versions' AND column_name = 'version'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'prompt_versions' AND indexname = 'idx_prompt_versions_agent'
  ) THEN
    CREATE INDEX idx_prompt_versions_agent ON public.prompt_versions(agent_id, version DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_runs' AND column_name = 'workflow_id')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_runs' AND column_name = 'created_at')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'workflow_runs' AND indexname = 'idx_workflow_runs_workflow')
  THEN
    CREATE INDEX idx_workflow_runs_workflow ON public.workflow_runs(workflow_id, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deploy_connections' AND column_name = 'agent_id')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'deploy_connections' AND indexname = 'idx_deploy_connections_agent')
  THEN
    CREATE INDEX idx_deploy_connections_agent ON public.deploy_connections(agent_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'oracle_history' AND column_name = 'user_id')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'oracle_history' AND column_name = 'created_at')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'oracle_history' AND indexname = 'idx_oracle_history_user')
  THEN
    CREATE INDEX idx_oracle_history_user ON public.oracle_history(user_id, created_at DESC);
  END IF;
END $$;
