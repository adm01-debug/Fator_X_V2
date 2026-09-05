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
ALTER TABLE public.agents ALTER COLUMN name SET DEFAULT 'Novo Agente';

ALTER TABLE public.agents ALTER COLUMN is_template SET DEFAULT false;
UPDATE public.agents SET is_template = false WHERE is_template IS NULL;

ALTER TABLE public.agents ALTER COLUMN status SET DEFAULT 'draft';
UPDATE public.agents SET status = 'draft' WHERE status IS NULL;

ALTER TABLE public.agents ALTER COLUMN version SET DEFAULT 0;
UPDATE public.agents SET version = 0 WHERE version IS NULL;

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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notification_templates') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_templates' AND column_name = 'name') THEN
      ALTER TABLE public.notification_templates ADD COLUMN name TEXT NOT NULL DEFAULT 'Untitled';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_templates' AND column_name = 'channel') THEN
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

ALTER TABLE public.notifications ALTER COLUMN body SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN body SET DEFAULT '';
ALTER TABLE public.notifications ALTER COLUMN channel SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN channel SET DEFAULT 'in_app';

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

ALTER TABLE public.user_roles ALTER COLUMN role_key SET NOT NULL;
ALTER TABLE public.user_roles ALTER COLUMN role_key SET DEFAULT 'editor';
UPDATE public.user_roles SET role_key = 'editor' WHERE role_key IS NULL;

ALTER TABLE public.auth_attempts
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT false;

ALTER TABLE public.auth_attempts ALTER COLUMN email SET NOT NULL;
ALTER TABLE public.auth_attempts ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.auth_attempts ALTER COLUMN success SET DEFAULT false;

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

INSERT INTO public.notification_templates (id, name, channel)
VALUES ('00000000-0000-0000-0000-000000000001', 'System Default', 'in_app')
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roles') THEN
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

INSERT INTO public.roles (id, name, key, description, level, color, icon, is_system, is_active) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Admin', 'workspace_admin', 'Administrador do workspace', 100, '#ef4444', 'crown', true, true),
  ('00000000-0000-0000-0000-000000000002', 'Editor', 'editor', 'Editor padrao', 50, '#6366f1', 'edit', true, true),
  ('00000000-0000-0000-0000-000000000003', 'Viewer', 'viewer', 'Visualizador apenas', 10, '#10b981', 'eye', true, true)
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_skills') THEN
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
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = 'agent_skills'
        AND kcu.column_name = 'agent_id'
    ) THEN
      ALTER TABLE public.agent_skills
        ADD CONSTRAINT agent_skills_agent_id_fkey
        FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
