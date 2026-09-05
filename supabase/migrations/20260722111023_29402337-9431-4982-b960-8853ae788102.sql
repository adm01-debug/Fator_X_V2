
-- ============================================================
-- SLACK INTEGRATION — Foundation Tables (Módulo 1)
-- ============================================================

-- 1) slack_workspace_config
CREATE TABLE IF NOT EXISTS public.slack_workspace_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  slack_team_id TEXT NOT NULL,
  slack_team_name TEXT,
  bot_user_id TEXT NOT NULL,
  bot_display_name TEXT,
  installed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.slack_workspace_config TO authenticated;
GRANT ALL ON public.slack_workspace_config TO service_role;

ALTER TABLE public.slack_workspace_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace admins manage slack config"
  ON public.slack_workspace_config
  FOR ALL
  TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

CREATE POLICY "Workspace members view slack config"
  ON public.slack_workspace_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = slack_workspace_config.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_slack_workspace_config_workspace ON public.slack_workspace_config(workspace_id);

-- 2) slack_channel_routes
CREATE TABLE IF NOT EXISTS public.slack_channel_routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'security_alert', 'partition_automation_failure', 'circuit_breaker',
    'high_cost', 'agent_failure', 'system_error', 'custom'
  )),
  category_label TEXT,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  min_severity TEXT NOT NULL DEFAULT 'warning' CHECK (min_severity IN ('info', 'warning', 'error', 'critical')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  mention_users TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.slack_channel_routes TO authenticated;
GRANT ALL ON public.slack_channel_routes TO service_role;

ALTER TABLE public.slack_channel_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace admins manage slack routes"
  ON public.slack_channel_routes
  FOR ALL
  TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

CREATE INDEX IF NOT EXISTS idx_slack_channel_routes_workspace_category
  ON public.slack_channel_routes(workspace_id, category)
  WHERE enabled = true;

-- 3) slack_event_dedupe
CREATE TABLE IF NOT EXISTS public.slack_event_dedupe (
  event_id TEXT NOT NULL PRIMARY KEY,
  event_type TEXT NOT NULL,
  team_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

GRANT SELECT ON public.slack_event_dedupe TO authenticated;
GRANT ALL ON public.slack_event_dedupe TO service_role;

ALTER TABLE public.slack_event_dedupe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins inspect slack event dedupe"
  ON public.slack_event_dedupe
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_key IN ('admin', 'owner')
    )
  );

CREATE INDEX IF NOT EXISTS idx_slack_event_dedupe_expires ON public.slack_event_dedupe(expires_at);

-- 4) slack_user_cache
CREATE TABLE IF NOT EXISTS public.slack_user_cache (
  slack_user_id TEXT NOT NULL PRIMARY KEY,
  team_id TEXT NOT NULL,
  display_name TEXT,
  real_name TEXT,
  email TEXT,
  is_bot BOOLEAN NOT NULL DEFAULT false,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

GRANT SELECT ON public.slack_user_cache TO authenticated;
GRANT ALL ON public.slack_user_cache TO service_role;

ALTER TABLE public.slack_user_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins inspect slack user cache"
  ON public.slack_user_cache
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_key IN ('admin', 'owner')
    )
  );

CREATE INDEX IF NOT EXISTS idx_slack_user_cache_team ON public.slack_user_cache(team_id);
CREATE INDEX IF NOT EXISTS idx_slack_user_cache_expires ON public.slack_user_cache(expires_at);

-- Triggers updated_at
CREATE TRIGGER trg_slack_workspace_config_updated_at
  BEFORE UPDATE ON public.slack_workspace_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_slack_channel_routes_updated_at
  BEFORE UPDATE ON public.slack_channel_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cleanup function + cron
CREATE OR REPLACE FUNCTION internal.cleanup_slack_ephemeral()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
BEGIN
  DELETE FROM public.slack_event_dedupe WHERE expires_at < now();
  DELETE FROM public.slack_user_cache WHERE expires_at < now();
END;
$$;

REVOKE ALL ON FUNCTION internal.cleanup_slack_ephemeral() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.cleanup_slack_ephemeral() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'slack-ephemeral-cleanup',
      '0 4 * * *',
      'SELECT internal.cleanup_slack_ephemeral();'
    );
  END IF;
END;
$$;
