-- ============================================================
-- Fator X V2 — Consolidated Schema Fixes
-- Aplica todas as correções de colunas/tabelas/policies descobertas
-- durante a migração do projeto Lovable para Supabase qdlnzopxrlsoljcrcmzv
-- Idempotente — pode ser rodado várias vezes sem efeito colateral.
-- ============================================================

-- ===========================================================
-- 1. ENUMS
-- ===========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_status') THEN
    CREATE TYPE agent_status AS ENUM (
      'draft','configured','testing','staging','review',
      'production','monitoring','deprecated','archived'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trace_level') THEN
    CREATE TYPE trace_level AS ENUM ('debug','info','warning','error','critical');
  END IF;
END $$;

-- ===========================================================
-- 2. AGENTS
-- ===========================================================
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Novo Agente',
  ADD COLUMN IF NOT EXISTS mission TEXT,
  ADD COLUMN IF NOT EXISTS avatar_emoji TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS persona TEXT,
  ADD COLUMN IF NOT EXISTS reasoning TEXT,
  ADD COLUMN IF NOT EXISTS template_category TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS status agent_status DEFAULT 'draft';

ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_user_id_fkey,
  ADD CONSTRAINT agents_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_workspace_id_fkey,
  ADD CONSTRAINT agents_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;

UPDATE public.agents SET name = 'Novo Agente' WHERE name IS NULL;
ALTER TABLE public.agents ALTER COLUMN name SET NOT NULL;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_agents_updated_at ON public.agents;
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================================
-- 3. AGENT_TRACES
-- ===========================================================
ALTER TABLE public.agent_traces
  ADD COLUMN IF NOT EXISTS agent_id UUID,
  ADD COLUMN IF NOT EXISTS cost_usd NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS event TEXT,
  ADD COLUMN IF NOT EXISTS input JSONB,
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS level trace_level DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS output JSONB,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS tokens_used INTEGER,
  ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.agent_traces
  DROP CONSTRAINT IF EXISTS agent_traces_agent_id_fkey,
  ADD CONSTRAINT agent_traces_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;

-- ===========================================================
-- 4. NOTIFICATION_TEMPLATES
-- ===========================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notification_templates') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_templates' AND column_name='name') THEN
      ALTER TABLE public.notification_templates ADD COLUMN name TEXT NOT NULL DEFAULT 'Untitled';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_templates' AND column_name='channel') THEN
      ALTER TABLE public.notification_templates ADD COLUMN channel TEXT DEFAULT 'in_app';
    END IF;
    ALTER TABLE public.notification_templates
      ADD COLUMN IF NOT EXISTS body_template TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS body_html_template TEXT,
      ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS subject_template TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS variables TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS workspace_id UUID;
  ELSE
    CREATE TABLE public.notification_templates (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      name TEXT NOT NULL,
      body_template TEXT DEFAULT '',
      body_html_template TEXT,
      category TEXT DEFAULT 'general',
      channel TEXT DEFAULT 'in_app',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      is_active BOOLEAN DEFAULT true,
      subject_template TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      variables TEXT[] DEFAULT '{}',
      workspace_id UUID
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.notification_templates WHERE id = '00000000-0000-0000-0000-000000000001'
  ) THEN
    INSERT INTO public.notification_templates (id, name, channel)
    VALUES ('00000000-0000-0000-0000-000000000001', 'System Default', 'in_app');
  END IF;
END $$;

-- ===========================================================
-- 5. NOTIFICATIONS
-- ===========================================================
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_id UUID,
  ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS recipient_address TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS template_id UUID,
  ADD COLUMN IF NOT EXISTS template_vars JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS workspace_id UUID,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_template_id_fkey,
  ADD CONSTRAINT notifications_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES public.notification_templates(id) ON DELETE SET NULL;

-- ===========================================================
-- 6. USER_ROLES
-- ===========================================================
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS assigned_by UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS role_key TEXT NOT NULL DEFAULT 'editor',
  ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS workspace_id UUID NOT NULL;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_workspace_id_fkey,
  ADD CONSTRAINT user_roles_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

UPDATE public.user_roles SET role_key = 'editor' WHERE role_key IS NULL;

-- ===========================================================
-- 7. AUTH_ATTEMPTS + FUNCTIONS
-- ===========================================================
ALTER TABLE public.auth_attempts
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_user_locked_out(target_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  failed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO failed_count
  FROM public.auth_attempts
  WHERE email = target_email
    AND success = false
    AND created_at > NOW() - INTERVAL '15 minutes';
  RETURN failed_count >= 5;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_slo_summary(p_window_hours INTEGER DEFAULT 24)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'window_hours', p_window_hours,
    'generated_at', NOW(),
    'note', 'SLO tracking stub'
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_auth_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.auth_attempts
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- ===========================================================
-- 8. ROLES
-- ===========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='roles') THEN
    CREATE TABLE public.roles (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      description TEXT,
      level INTEGER DEFAULT 0,
      color TEXT DEFAULT '#6366f1',
      icon TEXT DEFAULT 'shield',
      is_system BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    ALTER TABLE public.roles
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS key TEXT,
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6366f1',
      ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'shield',
      ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE key = 'workspace_admin') THEN
    INSERT INTO public.roles (id, name, key, description, level, color, icon, is_system, is_active)
    VALUES ('00000000-0000-0000-0000-000000000001', 'Admin', 'workspace_admin', 'Administrador do workspace', 100, '#ef4444', 'crown', true, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE key = 'editor') THEN
    INSERT INTO public.roles (id, name, key, description, level, color, icon, is_system, is_active)
    VALUES ('00000000-0000-0000-0000-000000000002', 'Editor', 'editor', 'Editor padrao', 50, '#6366f1', 'edit', true, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE key = 'viewer') THEN
    INSERT INTO public.roles (id, name, key, description, level, color, icon, is_system, is_active)
    VALUES ('00000000-0000-0000-0000-000000000003', 'Viewer', 'viewer', 'Visualizador apenas', 10, '#10b981', 'eye', true, true);
  END IF;
END $$;

-- ===========================================================
-- 9. AGENT_SKILLS
-- ===========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='agent_skills') THEN
    CREATE TABLE public.agent_skills (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
      skill_name TEXT NOT NULL,
      pattern TEXT NOT NULL,
      description TEXT DEFAULT '',
      confidence NUMERIC DEFAULT 0.8,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      source_trace_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      version INTEGER DEFAULT 1
    );
  ELSE
    ALTER TABLE public.agent_skills
      ADD COLUMN IF NOT EXISTS agent_id UUID,
      ADD COLUMN IF NOT EXISTS skill_name TEXT,
      ADD COLUMN IF NOT EXISTS pattern TEXT,
      ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS confidence NUMERIC DEFAULT 0.8,
      ADD COLUMN IF NOT EXISTS success_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS source_trace_id UUID,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
  END IF;
END $$;

-- ===========================================================
-- 10. KNOWLEDGE_BASES / VECTOR_INDEXES / CHUNKS
-- ===========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_bases' AND column_name='name') THEN
    ALTER TABLE public.knowledge_bases ADD COLUMN name TEXT NOT NULL DEFAULT 'Untitled KB';
  END IF;
  ALTER TABLE public.knowledge_bases
    ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS workspace_id UUID,
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'text-embedding-3-small',
    ADD COLUMN IF NOT EXISTS chunking_strategy TEXT DEFAULT 'recursive',
    ADD COLUMN IF NOT EXISTS chunk_size INTEGER DEFAULT 1000,
    ADD COLUMN IF NOT EXISTS chunk_overlap INTEGER DEFAULT 200,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
END $$;

ALTER TABLE public.vector_indexes
  ADD COLUMN IF NOT EXISTS knowledge_base_id UUID,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS dimensions INTEGER,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public' AND tc.table_name = 'vector_indexes'
      AND kcu.column_name = 'knowledge_base_id'
  ) THEN
    ALTER TABLE public.vector_indexes
      ADD CONSTRAINT vector_indexes_knowledge_base_id_fkey
      FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.chunks
  ADD COLUMN IF NOT EXISTS embedding_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS chunk_index INTEGER,
  ADD COLUMN IF NOT EXISTS token_count INTEGER,
  ADD COLUMN IF NOT EXISTS document_id UUID,
  ADD COLUMN IF NOT EXISTS knowledge_base_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public' AND tc.table_name = 'chunks'
      AND kcu.column_name = 'knowledge_base_id'
  ) THEN
    ALTER TABLE public.chunks
      ADD CONSTRAINT chunks_knowledge_base_id_fkey
      FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ===========================================================
-- 11. AGENT_MEMORIES
-- ===========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='agent_memories') THEN
    CREATE TABLE public.agent_memories (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      memory_type TEXT DEFAULT 'semantic',
      tier TEXT DEFAULT 'short_term',
      content TEXT,
      importance NUMERIC DEFAULT 0.5,
      metadata JSONB DEFAULT '{}',
      source TEXT,
      access_count INTEGER DEFAULT 0,
      last_accessed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    ALTER TABLE public.agent_memories
      ADD COLUMN IF NOT EXISTS memory_type TEXT DEFAULT 'semantic',
      ADD COLUMN IF NOT EXISTS agent_id UUID,
      ADD COLUMN IF NOT EXISTS user_id UUID,
      ADD COLUMN IF NOT EXISTS workspace_id UUID,
      ADD COLUMN IF NOT EXISTS source TEXT,
      ADD COLUMN IF NOT EXISTS content TEXT,
      ADD COLUMN IF NOT EXISTS importance NUMERIC DEFAULT 0.5,
      ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'short_term',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_memories_memory_type ON public.agent_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_agent_memories_workspace ON public.agent_memories(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON public.agent_memories(agent_id);

ALTER TABLE public.agent_memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ws_agent_memories_all" ON public.agent_memories;
CREATE POLICY "ws_agent_memories_all" ON public.agent_memories FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())
  );

-- ===========================================================
-- 12. MCP_SERVERS / MCP_TOOLS
-- ===========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mcp_servers') THEN
    CREATE TABLE public.mcp_servers (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Sem nome',
      display_name TEXT,
      description TEXT,
      transport TEXT DEFAULT 'stdio',
      endpoint TEXT,
      command TEXT,
      args JSONB DEFAULT '[]',
      env JSONB DEFAULT '{}',
      status TEXT DEFAULT 'disconnected',
      is_active BOOLEAN DEFAULT true,
      workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
      created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      last_connected_at TIMESTAMPTZ,
      last_error TEXT,
      config JSONB DEFAULT '{}',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    ALTER TABLE public.mcp_servers
      ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Sem nome',
      ADD COLUMN IF NOT EXISTS display_name TEXT,
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS transport TEXT DEFAULT 'stdio',
      ADD COLUMN IF NOT EXISTS endpoint TEXT,
      ADD COLUMN IF NOT EXISTS command TEXT,
      ADD COLUMN IF NOT EXISTS args JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS env JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'disconnected',
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS workspace_id UUID,
      ADD COLUMN IF NOT EXISTS created_by UUID,
      ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_error TEXT,
      ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mcp_servers_workspace ON public.mcp_servers(workspace_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mcp_tools') THEN
    CREATE TABLE public.mcp_tools (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      server_id UUID REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      input_schema JSONB DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    ALTER TABLE public.mcp_tools
      ADD COLUMN IF NOT EXISTS server_id UUID,
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS input_schema JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS workspace_id UUID,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_tools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ws_mcp_servers_all" ON public.mcp_servers;
CREATE POLICY "ws_mcp_servers_all" ON public.mcp_servers FOR ALL TO authenticated
  USING (workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid()));
DROP POLICY IF EXISTS "ws_mcp_tools_all" ON public.mcp_tools;
CREATE POLICY "ws_mcp_tools_all" ON public.mcp_tools FOR ALL TO authenticated
  USING (workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid()));

-- ===========================================================
-- 13. WORKFLOWS / WORKFLOW_EXECUTIONS
-- ===========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='workflows') THEN
    CREATE TABLE public.workflows (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Sem nome',
      description TEXT,
      status TEXT DEFAULT 'active',
      config JSONB DEFAULT '{}',
      nodes JSONB DEFAULT '[]',
      edges JSONB DEFAULT '[]',
      workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
      created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      is_template BOOLEAN DEFAULT false,
      template_category TEXT,
      version INTEGER DEFAULT 1,
      last_run_at TIMESTAMPTZ,
      run_count INTEGER DEFAULT 0,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    ALTER TABLE public.workflows
      ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Sem nome',
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS nodes JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS edges JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS workspace_id UUID,
      ADD COLUMN IF NOT EXISTS created_by UUID,
      ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS template_category TEXT,
      ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS run_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='workflow_executions') THEN
    CREATE TABLE public.workflow_executions (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'running',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      duration_ms INTEGER,
      result JSONB,
      error TEXT,
      input JSONB,
      output JSONB,
      triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    ALTER TABLE public.workflow_executions
      ADD COLUMN IF NOT EXISTS workflow_id UUID,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'running',
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
      ADD COLUMN IF NOT EXISTS result JSONB,
      ADD COLUMN IF NOT EXISTS error TEXT,
      ADD COLUMN IF NOT EXISTS input JSONB,
      ADD COLUMN IF NOT EXISTS output JSONB,
      ADD COLUMN IF NOT EXISTS triggered_by UUID,
      ADD COLUMN IF NOT EXISTS workspace_id UUID,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON public.workflows(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON public.workflow_executions(workflow_id);

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ws_workflows_all" ON public.workflows;
CREATE POLICY "ws_workflows_all" ON public.workflows FOR ALL TO authenticated
  USING (workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid()));
DROP POLICY IF EXISTS "ws_workflow_executions_all" ON public.workflow_executions;
CREATE POLICY "ws_workflow_executions_all" ON public.workflow_executions FOR ALL TO authenticated
  USING (workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid()));

DO $$ BEGIN RAISE NOTICE 'Fator X V2 consolidated schema fixes applied.'; END $$;
