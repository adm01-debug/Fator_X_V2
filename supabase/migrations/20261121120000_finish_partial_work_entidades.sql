-- ===========================================================
-- Corretiva: conclui o trabalho parcial do outro agente.
-- Tabelas criadas via dashboard (webhook_endpoints, webhook_events,
-- game_days, game_day_scorecards) ficaram como boilerplate vazio
-- (id/agent_id/workspace_id/user_id/version) sem nenhuma coluna de
-- negocio nem RPCs. Esta migration troca pelo schema real
-- definido nas migrations-fonte do repo (20260405220001,
-- 20260418104142, 20260521103753 + evolucoes posteriores) e
-- mantem o padrao RLS workspace-scoped vigente (member_*).
--
-- Idempotente: reexecutavel sem erro em prod E em preview (onde
-- as migrations rodam do zero e as tabelas ja existem com schema
-- real). As secoes de DROP/CREATE so rodam quando a tabela ainda
-- e o boilerplate vazio (via DO com flag); policies e RPCs usam
-- DO-block de existencia/CREATE OR REPLACE.
-- ===========================================================

-- =========================================================
-- 0. FLAGS — detecta se as tabelas ainda sao o boilerplate vazio
-- =========================================================
DO $$
DECLARE
  v_missing int;
BEGIN
  -- O schema FINAL (convergido em prod pela V1) tem colunas de negocio
  -- + workspace_id + user_id. No preview limpo as migrations-fonte criam
  -- o schema de negocio SEM user_id (e em parte sem workspace_id), entao
  -- exigir o schema-final garante que o DROP/CREATE convergente rode la
  -- e que em prod (ja convergido) seja no-op.
  SELECT count(*) INTO v_missing FROM information_schema.columns
   WHERE table_schema='public' AND table_name='webhook_endpoints'
     AND column_name IN ('name','path','secret','workspace_id','user_id');
  IF v_missing < 5 OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='webhook_events' AND column_name='workspace_id') THEN
    RAISE NOTICE 'webhook: convergindo para schema-final (DROP/CREATE)';
    PERFORM set_config('fx.skip_webhook_ddl', 'false', true);
  ELSE
    RAISE NOTICE 'webhook: schema-final ja presente; pulando DROP/CREATE';
    PERFORM set_config('fx.skip_webhook_ddl', 'true', true);
  END IF;

  SELECT count(*) INTO v_missing FROM information_schema.columns
   WHERE table_schema='public' AND table_name='game_days'
     AND column_name IN ('title','scenario','workspace_id','user_id');
  IF v_missing < 4 THEN
    RAISE NOTICE 'game_days: convergindo para schema-final (DROP/CREATE)';
    PERFORM set_config('fx.skip_game_ddl', 'false', true);
  ELSE
    RAISE NOTICE 'game_days: schema-final ja presente; pulando DROP/CREATE';
    PERFORM set_config('fx.skip_game_ddl', 'true', true);
  END IF;
END $$;

-- =========================================================
-- 1. WEBHOOK ENDPOINTS (schema real do repo + workspace_id)
-- =========================================================
DO $$
BEGIN
  IF current_setting('fx.skip_webhook_ddl', true) = 'true' THEN
    RAISE NOTICE 'webhook: pulando (schema ja existe)';
    RETURN;
  END IF;

  DROP TABLE IF EXISTS public.webhook_events CASCADE;
  DROP TABLE IF EXISTS public.webhook_endpoints CASCADE;

  CREATE TABLE public.webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    path TEXT NOT NULL UNIQUE,
    secret TEXT NOT NULL DEFAULT '',
    methods TEXT[] DEFAULT ARRAY['POST'],
    auth_type TEXT DEFAULT 'hmac_sha256' CHECK (auth_type IN ('none','header','hmac_sha256','basic','bearer','api_key')),
    auth_config JSONB DEFAULT '{}',
    status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','rate_limited','revoked')),
    target_type TEXT NOT NULL DEFAULT 'workflow' CHECK (target_type IN ('workflow','agent','edge_function','custom')),
    target_id TEXT NOT NULL DEFAULT '',
    target_config JSONB DEFAULT '{}',
    transform_script TEXT,
    rate_limit_per_minute INTEGER DEFAULT 60,
    request_count INTEGER DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    ip_whitelist TEXT[] DEFAULT ARRAY[]::TEXT[],
    headers_filter JSONB DEFAULT '{}',
    created_by UUID,
    workspace_id UUID NOT NULL,
    user_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_webhooks_path ON public.webhook_endpoints(path);
  CREATE INDEX IF NOT EXISTS idx_webhooks_status ON public.webhook_endpoints(status);
  CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_workspace ON public.webhook_endpoints(workspace_id);

  ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

  CREATE TABLE public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    headers JSONB DEFAULT '{}',
    query_params JSONB DEFAULT '{}',
    body JSONB,
    source_ip TEXT,
    status TEXT DEFAULT 'received' CHECK (status IN ('received','processed','failed','rejected')),
    response_code INTEGER DEFAULT 200,
    response_body JSONB,
    processing_time_ms INTEGER,
    error TEXT,
    source TEXT,
    external_event_id TEXT,
    workspace_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook ON public.webhook_events(webhook_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_webhook_events_workspace ON public.webhook_events(workspace_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_source_event
    ON public.webhook_events(webhook_id, external_event_id)
    WHERE external_event_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_webhook_events_source_created
    ON public.webhook_events(source, created_at DESC)
    WHERE source IS NOT NULL;

  ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
END $$;

-- =========================================================
-- 2. GAME DAYS (incident drills)
-- =========================================================
DO $$
BEGIN
  IF current_setting('fx.skip_game_ddl', true) = 'true' THEN
    RAISE NOTICE 'game: pulando (schema ja existe)';
    RETURN;
  END IF;

  DROP TABLE IF EXISTS public.game_day_scorecards CASCADE;
  DROP TABLE IF EXISTS public.game_day_events CASCADE;
  DROP TABLE IF EXISTS public.game_days CASCADE;

  CREATE TABLE public.game_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    scenario TEXT NOT NULL CHECK (scenario IN ('provider_outage','cost_spike','db_slowdown','auth_failure','custom')),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','running','completed','aborted')),
    scheduled_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    facilitator_id UUID NOT NULL,
    participants UUID[] NOT NULL DEFAULT '{}',
    runbook_section TEXT,
    chaos_experiment_id UUID,
    user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_game_days_workspace ON public.game_days(workspace_id, scheduled_at DESC);
  CREATE INDEX IF NOT EXISTS idx_game_days_status ON public.game_days(status) WHERE status IN ('scheduled','running');

  CREATE TABLE public.game_day_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_day_id UUID NOT NULL REFERENCES public.game_days(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('fault_injected','detection','mitigation','resolution','note')),
    actor_id UUID NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    description TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
  );
  CREATE INDEX IF NOT EXISTS idx_game_day_events_drill ON public.game_day_events(game_day_id, occurred_at);

  CREATE TABLE public.game_day_scorecards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_day_id UUID NOT NULL UNIQUE REFERENCES public.game_days(id) ON DELETE CASCADE,
    mttr_seconds INTEGER,
    mttd_seconds INTEGER,
    runbook_followed BOOLEAN NOT NULL DEFAULT true,
    gaps_found TEXT[] NOT NULL DEFAULT '{}',
    score INTEGER CHECK (score BETWEEN 1 AND 10),
    retrospective_notes TEXT,
    user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL
  );

  ALTER TABLE public.game_days ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.game_day_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.game_day_scorecards ENABLE ROW LEVEL SECURITY;
END $$;

-- Trigger updated_at (funcao existe em prod; idempotente)
DROP TRIGGER IF EXISTS game_days_updated_at ON public.game_days;
CREATE TRIGGER game_days_updated_at
BEFORE UPDATE ON public.game_days
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2b. CHAOS EXPERIMENTS — completa colunas de negocio parciais
--     (start_game_day injeta caos nelas). ALTER aditivo.
-- =========================================================
ALTER TABLE public.chaos_experiments
  ADD COLUMN IF NOT EXISTS target TEXT CHECK (target IN ('llm-gateway', 'agent-workflow-runner')),
  ADD COLUMN IF NOT EXISTS fault_type TEXT CHECK (fault_type IN ('latency', 'error_500', 'error_429', 'timeout')),
  ADD COLUMN IF NOT EXISTS probability NUMERIC(4,3) NOT NULL DEFAULT 0.05 CHECK (probability >= 0 AND probability <= 0.5),
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER DEFAULT 500 CHECK (latency_ms >= 0 AND latency_ms <= 10000);

CREATE INDEX IF NOT EXISTS idx_chaos_active ON public.chaos_experiments(target, enabled, expires_at) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_chaos_workspace ON public.chaos_experiments(workspace_id, created_at DESC);

-- =========================================================
-- 3. POLICIES — padrao member_* workspace-scoped (idempotente)
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_endpoints' AND policyname='webhook_endpoints_member_select') THEN
    CREATE POLICY webhook_endpoints_member_select ON public.webhook_endpoints FOR SELECT TO authenticated
      USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_endpoints' AND policyname='webhook_endpoints_member_insert') THEN
    CREATE POLICY webhook_endpoints_member_insert ON public.webhook_endpoints FOR INSERT TO authenticated
      WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_endpoints' AND policyname='webhook_endpoints_member_update') THEN
    CREATE POLICY webhook_endpoints_member_update ON public.webhook_endpoints FOR UPDATE TO authenticated
      USING (user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
      WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_endpoints' AND policyname='webhook_endpoints_member_delete') THEN
    CREATE POLICY webhook_endpoints_member_delete ON public.webhook_endpoints FOR DELETE TO authenticated
      USING (user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_events' AND policyname='webhook_events_member_select') THEN
    CREATE POLICY webhook_events_member_select ON public.webhook_events FOR SELECT TO authenticated
      USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_events' AND policyname='webhook_events_member_insert') THEN
    CREATE POLICY webhook_events_member_insert ON public.webhook_events FOR INSERT TO authenticated
      WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='game_days' AND policyname='game_days_member_select') THEN
    CREATE POLICY game_days_member_select ON public.game_days FOR SELECT TO authenticated
      USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='game_days' AND policyname='game_days_member_insert') THEN
    CREATE POLICY game_days_member_insert ON public.game_days FOR INSERT TO authenticated
      WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='game_days' AND policyname='game_days_member_update') THEN
    CREATE POLICY game_days_member_update ON public.game_days FOR UPDATE TO authenticated
      USING (user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
      WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='game_days' AND policyname='game_days_member_delete') THEN
    CREATE POLICY game_days_member_delete ON public.game_days FOR DELETE TO authenticated
      USING (user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='game_day_events' AND policyname='game_day_events_member_select') THEN
    CREATE POLICY game_day_events_member_select ON public.game_day_events FOR SELECT TO authenticated
      USING (game_day_id IN (SELECT id FROM public.game_days WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='game_day_events' AND policyname='game_day_events_member_insert') THEN
    CREATE POLICY game_day_events_member_insert ON public.game_day_events FOR INSERT TO authenticated
      WITH CHECK (actor_id = auth.uid() AND game_day_id IN (
        SELECT id FROM public.game_days
        WHERE status = 'running'
          AND (facilitator_id = auth.uid() OR auth.uid() = ANY(participants) OR public.is_workspace_admin(auth.uid(), workspace_id))
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='game_day_scorecards' AND policyname='game_day_scorecards_member_select') THEN
    CREATE POLICY game_day_scorecards_member_select ON public.game_day_scorecards FOR SELECT TO authenticated
      USING (game_day_id IN (SELECT id FROM public.game_days WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='game_day_scorecards' AND policyname='game_day_scorecards_member_insert') THEN
    CREATE POLICY game_day_scorecards_member_insert ON public.game_day_scorecards FOR INSERT TO authenticated
      WITH CHECK (created_by = auth.uid() AND game_day_id IN (
        SELECT id FROM public.game_days
        WHERE facilitator_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id)
      ));
  END IF;
END $$;

-- =========================================================
-- 4. RPCs
-- =========================================================
CREATE OR REPLACE FUNCTION public.increment_webhook_counter(webhook_uuid UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.webhook_endpoints
  SET request_count = request_count + 1, last_triggered_at = now()
  WHERE id = webhook_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_game_day(p_game_day_id UUID, p_inject_chaos BOOLEAN DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gd public.game_days%ROWTYPE;
  v_chaos_id UUID;
  v_target TEXT;
  v_fault TEXT;
BEGIN
  SELECT * INTO gd FROM public.game_days WHERE id = p_game_day_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'game day not found'; END IF;
  IF gd.facilitator_id <> auth.uid() AND NOT public.is_workspace_admin(auth.uid(), gd.workspace_id) THEN
    RAISE EXCEPTION 'forbidden: only facilitator or admin can start';
  END IF;
  IF gd.status <> 'scheduled' THEN
    RAISE EXCEPTION 'game day is not in scheduled state';
  END IF;

  UPDATE public.game_days
    SET status = 'running', started_at = now()
    WHERE id = p_game_day_id;

  IF p_inject_chaos THEN
    v_target := CASE gd.scenario
      WHEN 'provider_outage' THEN 'llm-gateway'
      WHEN 'db_slowdown' THEN 'agent-workflow-runner'
      ELSE 'llm-gateway'
    END;
    v_fault := CASE gd.scenario
      WHEN 'provider_outage' THEN 'error_500'
      WHEN 'db_slowdown' THEN 'latency'
      WHEN 'auth_failure' THEN 'error_429'
      ELSE 'error_500'
    END;
    INSERT INTO public.chaos_experiments (workspace_id, name, target, fault_type, probability, latency_ms, expires_at, enabled, created_by)
    VALUES (gd.workspace_id, 'Game Day: ' || gd.title, v_target, v_fault, 0.5, 2000, now() + interval '2 hours', true, auth.uid())
    RETURNING id INTO v_chaos_id;
    UPDATE public.game_days SET chaos_experiment_id = v_chaos_id WHERE id = p_game_day_id;
  END IF;

  INSERT INTO public.game_day_events(game_day_id, event_type, actor_id, description, metadata)
  VALUES (p_game_day_id, 'fault_injected', auth.uid(),
          'Game day started - scenario: ' || gd.scenario,
          jsonb_build_object('chaos_experiment_id', v_chaos_id, 'auto_injected', p_inject_chaos));

  RETURN jsonb_build_object('status','running','started_at',now(),'chaos_experiment_id',v_chaos_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_game_day_event(p_game_day_id UUID, p_event_type TEXT, p_description TEXT, p_metadata JSONB DEFAULT '{}'::jsonb)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.game_day_events(game_day_id, event_type, actor_id, description, metadata)
  VALUES (p_game_day_id, p_event_type, auth.uid(), p_description, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_game_day(
  p_game_day_id UUID,
  p_runbook_followed BOOLEAN DEFAULT true,
  p_gaps_found TEXT[] DEFAULT '{}',
  p_score INTEGER DEFAULT NULL,
  p_retrospective TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gd public.game_days%ROWTYPE;
  v_fault_at TIMESTAMPTZ;
  v_detect_at TIMESTAMPTZ;
  v_resolved_at TIMESTAMPTZ;
  v_mttr INTEGER;
  v_mttd INTEGER;
  v_scorecard_id UUID;
BEGIN
  SELECT * INTO gd FROM public.game_days WHERE id = p_game_day_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'game day not found'; END IF;
  IF gd.facilitator_id <> auth.uid() AND NOT public.is_workspace_admin(auth.uid(), gd.workspace_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT MIN(occurred_at) INTO v_fault_at FROM public.game_day_events WHERE game_day_id = p_game_day_id AND event_type = 'fault_injected';
  SELECT MIN(occurred_at) INTO v_detect_at FROM public.game_day_events WHERE game_day_id = p_game_day_id AND event_type = 'detection';
  SELECT MAX(occurred_at) INTO v_resolved_at FROM public.game_day_events WHERE game_day_id = p_game_day_id AND event_type = 'resolution';

  IF v_fault_at IS NOT NULL AND v_resolved_at IS NOT NULL THEN
    v_mttr := EXTRACT(EPOCH FROM (v_resolved_at - v_fault_at))::int;
  END IF;
  IF v_fault_at IS NOT NULL AND v_detect_at IS NOT NULL THEN
    v_mttd := EXTRACT(EPOCH FROM (v_detect_at - v_fault_at))::int;
  END IF;

  UPDATE public.game_days SET status = 'completed', ended_at = now() WHERE id = p_game_day_id;

  IF gd.chaos_experiment_id IS NOT NULL THEN
    UPDATE public.chaos_experiments SET enabled = false WHERE id = gd.chaos_experiment_id;
  END IF;

  INSERT INTO public.game_day_scorecards(game_day_id, mttr_seconds, mttd_seconds, runbook_followed, gaps_found, score, retrospective_notes, created_by)
  VALUES (p_game_day_id, v_mttr, v_mttd, p_runbook_followed, p_gaps_found, p_score, p_retrospective, auth.uid())
  RETURNING id INTO v_scorecard_id;

  RETURN jsonb_build_object('scorecard_id', v_scorecard_id, 'mttr_seconds', v_mttr, 'mttd_seconds', v_mttd, 'status','completed');
END;
$$;

-- Grants de execucao (alinha com o resto do repo; idempotente)
GRANT EXECUTE ON FUNCTION public.increment_webhook_counter(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_webhook_counter(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_game_day(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_game_day_event(uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_game_day(uuid, boolean, text[], integer, text) TO authenticated, service_role;

-- Realtime: adiciona apenas se ainda nao estiver na publicacao
DO $$
DECLARE v_present boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='game_day_events') INTO v_present;
  IF NOT v_present THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_day_events;
  END IF;
  SELECT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='game_days') INTO v_present;
  IF NOT v_present THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_days;
  END IF;
END $$;