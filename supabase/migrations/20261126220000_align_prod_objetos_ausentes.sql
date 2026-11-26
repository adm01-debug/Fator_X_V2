-- Alinhamento do banco oficial (qdlnzopxrlsoljcrcmzv) ao schema do repo.
--
-- Evidencia (catalogo real, leitura via Management API em 2026-11-26):
--   * producao: 224 tabelas base, 17 views, 0 matviews, 2217 colunas, 46 funcoes
--   * ledger: 338 migracoes aplicadas, maior versao 20261121120000 (= ultima do repo)
--   * mesmo assim, 157 tabelas existentes estao sem 1193 colunas e 12 objetos faltam:
--     as tabelas de producao foram criadas como "cascas" (id, agent_id, workspace_id,
--     user_id, created_at, updated_at, version) e os CREATE TABLE IF NOT EXISTS das
--     migracoes viraram no-op, entao as colunas nunca foram criadas.
--
-- Este arquivo e aditivo e idempotente. Nao remove nem altera nada existente.
-- Nao esta envolvido em transacao unica de proposito: se uma instrucao falhar,
-- as anteriores permanecem (re-executavel).
--
-- Aplicar SOMENTE apos aprovacao do dono (DDL em producao = regra 8).

-- ============================================================================
-- Alinhamento de produção: recria objetos que o frontend usa e que não existem
-- no banco de produção (evidência: probe PostgREST devolveu PGRST205 / 404 em
-- 98 dos 292 objetos declarados em src/integrations/supabase/types.ts).
--
-- Este arquivo cobre apenas os objetos de domínio que a UI lê ou grava;
-- partições mensais (traces_*/spans_*/audit_log_v2_*/agent_traces_v2_*/
-- trace_events_v2*) ficam de fora de propósito — os pais existem em produção e
-- a criação de partições é responsabilidade do cron create_partition_if_not_exists.
--
-- Idempotente: pode ser executado mais de uma vez sem efeito colateral.
-- Nenhum DROP de dado: só CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ============================================================================

-- ============================================================================
-- 1) slack_dispatch_dlq — em produção existe apenas a casca
--    (id, workspace_id, created_at, updated_at). Completa as colunas da
--    migração original 20260722115006 para o painel de DLQ funcionar.
-- ============================================================================
ALTER TABLE public.slack_dispatch_dlq
  ADD COLUMN IF NOT EXISTS alert_id UUID,
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_slack_dlq_pending
  ON public.slack_dispatch_dlq(next_retry_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_slack_dlq_workspace
  ON public.slack_dispatch_dlq(workspace_id, created_at DESC);

ALTER TABLE public.slack_dispatch_dlq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members read dlq" ON public.slack_dispatch_dlq;
CREATE POLICY "workspace members read dlq" ON public.slack_dispatch_dlq FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "service_role manages dlq" ON public.slack_dispatch_dlq;
CREATE POLICY "service_role manages dlq" ON public.slack_dispatch_dlq FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 2) Tabelas de domínio ausentes
-- ============================================================================

-- 2.1 smoke test de rede (admin de plataforma) -------------------------------
CREATE TABLE IF NOT EXISTS public.pg_net_smoke_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  request_id bigint,
  target_url text NOT NULL,
  status_code int,
  error_msg text,
  latency_ms int,
  succeeded boolean NOT NULL DEFAULT false
);

GRANT SELECT ON public.pg_net_smoke_runs TO authenticated;
GRANT ALL ON public.pg_net_smoke_runs TO service_role;

ALTER TABLE public.pg_net_smoke_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can read pg_net smoke runs" ON public.pg_net_smoke_runs;
CREATE POLICY "Platform admins can read pg_net smoke runs"
  ON public.pg_net_smoke_runs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role_key = 'platform_admin'
  ));

-- 2.2 deduplicação de eventos do Slack --------------------------------------
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

DROP POLICY IF EXISTS "Admins inspect slack event dedupe" ON public.slack_event_dedupe;
CREATE POLICY "Admins inspect slack event dedupe"
  ON public.slack_event_dedupe FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_key IN ('admin', 'owner')
    )
  );

CREATE INDEX IF NOT EXISTS idx_slack_event_dedupe_expires
  ON public.slack_event_dedupe(expires_at);

-- 2.3 eventos de orçamento (BudgetsPage + realtime) -------------------------
CREATE TABLE IF NOT EXISTS public.budget_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('soft_warning','hard_block','agent_paused','reset')),
  period TEXT NOT NULL CHECK (period IN ('daily','monthly')),
  period_spend_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
  period_limit_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  pct_used NUMERIC(6,2) NOT NULL DEFAULT 0,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_budget_events_workspace_time
  ON public.budget_events(workspace_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_budget_events_type
  ON public.budget_events(event_type);

ALTER TABLE public.budget_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view budget events" ON public.budget_events;
CREATE POLICY "Members can view budget events"
  ON public.budget_events FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));

-- 2.4 presets de campos do diálogo de rollback -----------------------------
CREATE TABLE IF NOT EXISTS public.restore_field_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  copy_prompt BOOLEAN NOT NULL DEFAULT true,
  copy_tools BOOLEAN NOT NULL DEFAULT true,
  copy_model BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT restore_field_presets_user_name_unique UNIQUE (user_id, name),
  CONSTRAINT restore_field_presets_at_least_one CHECK (copy_prompt OR copy_tools OR copy_model),
  CONSTRAINT restore_field_presets_name_len CHECK (char_length(name) BETWEEN 1 AND 60)
);

CREATE INDEX IF NOT EXISTS idx_restore_field_presets_user
  ON public.restore_field_presets (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_restore_field_presets_one_default
  ON public.restore_field_presets (user_id)
  WHERE is_default = true;

ALTER TABLE public.restore_field_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own restore presets" ON public.restore_field_presets;
CREATE POLICY "Users view own restore presets"
  ON public.restore_field_presets FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users create own restore presets" ON public.restore_field_presets;
CREATE POLICY "Users create own restore presets"
  ON public.restore_field_presets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own restore presets" ON public.restore_field_presets;
CREATE POLICY "Users update own restore presets"
  ON public.restore_field_presets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own restore presets" ON public.restore_field_presets;
CREATE POLICY "Users delete own restore presets"
  ON public.restore_field_presets FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_restore_field_presets_updated_at ON public.restore_field_presets;
CREATE TRIGGER trg_restore_field_presets_updated_at
  BEFORE UPDATE ON public.restore_field_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2.5 trilha de revisão de riscos + recálculo do risco ---------------------
CREATE TABLE IF NOT EXISTS public.risk_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES public.risk_register(id) ON DELETE CASCADE,
  reviewed_by UUID NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_residual_score INTEGER,
  new_residual_score INTEGER,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_risk_reviews_risk
  ON public.risk_review_events(risk_id, reviewed_at DESC);

ALTER TABLE public.risk_review_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view reviews" ON public.risk_review_events;
CREATE POLICY "Members view reviews" ON public.risk_review_events FOR SELECT
  USING (risk_id IN (SELECT id FROM public.risk_register WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))));

DROP POLICY IF EXISTS "Admins insert reviews" ON public.risk_review_events;
CREATE POLICY "Admins insert reviews" ON public.risk_review_events FOR INSERT
  WITH CHECK (risk_id IN (SELECT id FROM public.risk_register WHERE public.is_workspace_admin(auth.uid(), workspace_id)));

CREATE OR REPLACE FUNCTION public.handle_risk_review_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_interval INTERVAL;
BEGIN
  v_interval := CASE WHEN NEW.new_residual_score >= 15 THEN interval '30 days' ELSE interval '90 days' END;

  UPDATE public.risk_register
    SET residual_score = COALESCE(NEW.new_residual_score, residual_score),
        next_review_due = NEW.reviewed_at + v_interval,
        status = CASE WHEN status = 'identified' THEN 'assessed' ELSE status END,
        updated_at = now()
    WHERE id = NEW.risk_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_risk_review_event ON public.risk_review_events;
CREATE TRIGGER trg_risk_review_event AFTER INSERT ON public.risk_review_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_risk_review_event();

-- 2.6 rotação de segredos --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.secret_rotation_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  secret_id UUID NOT NULL REFERENCES public.managed_secrets(id) ON DELETE CASCADE,
  rotated_by UUID NOT NULL,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL CHECK (reason IN ('scheduled','compromised','employee_offboarding','manual','policy_change')),
  previous_age_days INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_secret_rotation_events_secret
  ON public.secret_rotation_events(secret_id, rotated_at DESC);

ALTER TABLE public.secret_rotation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view rotation events" ON public.secret_rotation_events;
CREATE POLICY "Workspace members can view rotation events"
  ON public.secret_rotation_events FOR SELECT
  USING (secret_id IN (
    SELECT id FROM public.managed_secrets
    WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
  ));

DROP POLICY IF EXISTS "Workspace admins can insert rotation events" ON public.secret_rotation_events;
CREATE POLICY "Workspace admins can insert rotation events"
  ON public.secret_rotation_events FOR INSERT
  WITH CHECK (
    rotated_by = auth.uid() AND
    secret_id IN (
      SELECT id FROM public.managed_secrets
      WHERE public.is_workspace_admin(auth.uid(), workspace_id)
    )
  );

CREATE OR REPLACE FUNCTION public.handle_secret_rotation_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_interval INTEGER;
BEGIN
  SELECT rotation_interval_days INTO v_interval
    FROM public.managed_secrets WHERE id = NEW.secret_id;

  UPDATE public.managed_secrets
    SET last_rotated_at = NEW.rotated_at,
        next_rotation_due = NEW.rotated_at + (v_interval || ' days')::interval,
        status = 'active',
        updated_at = now()
    WHERE id = NEW.secret_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_secret_rotation_event ON public.secret_rotation_events;
CREATE TRIGGER trg_secret_rotation_event
AFTER INSERT ON public.secret_rotation_events
FOR EACH ROW EXECUTE FUNCTION public.handle_secret_rotation_event();

-- 2.7 eventos do OpenClaw --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.openclaw_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID,
  kind TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  source TEXT NOT NULL DEFAULT 'proxy' CHECK (source IN ('proxy','webhook','router','other')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_openclaw_events_workspace_created
  ON public.openclaw_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_openclaw_events_kind_created
  ON public.openclaw_events (kind, created_at DESC);

GRANT SELECT ON public.openclaw_events TO authenticated;
GRANT ALL ON public.openclaw_events TO service_role;

ALTER TABLE public.openclaw_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own workspace events" ON public.openclaw_events;
CREATE POLICY "Members read own workspace events" ON public.openclaw_events
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = openclaw_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- 2.8 e-mails dos membros (PII isolada) ------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_member_emails (
  member_id    uuid PRIMARY KEY REFERENCES public.workspace_members(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  email        text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wme_workspace ON public.workspace_member_emails(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wme_user ON public.workspace_member_emails(user_id);

ALTER TABLE public.workspace_member_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "self or admin reads email" ON public.workspace_member_emails;
CREATE POLICY "self or admin reads email"
ON public.workspace_member_emails FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "owner inserts emails" ON public.workspace_member_emails;
CREATE POLICY "owner inserts emails"
ON public.workspace_member_emails FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  OR public.is_workspace_admin(auth.uid(), workspace_id)
);

DROP POLICY IF EXISTS "self or admin updates email" ON public.workspace_member_emails;
CREATE POLICY "self or admin updates email"
ON public.workspace_member_emails FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
WITH CHECK (user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "admin deletes emails" ON public.workspace_member_emails;
CREATE POLICY "admin deletes emails"
ON public.workspace_member_emails FOR DELETE TO authenticated
USING (public.is_workspace_admin(auth.uid(), workspace_id));

-- workspace_members.email: a migracao 20260331110311 grava (role, email, name) nessa
-- tabela, mas nenhuma migracao declara a coluna. Em producao ela nao existe e o backfill
-- abaixo quebrava com SQLSTATE 42703 (reproduzido no Supabase Preview da PR #175).
ALTER TABLE public.workspace_members ADD COLUMN IF NOT EXISTS email text;

-- 2.9 e-mails órfãos de produção: copia o que já existe em workspace_members -
--     (a coluna legada não é removida aqui; a view passa a ler a tabela nova)
INSERT INTO public.workspace_member_emails (member_id, workspace_id, user_id, email)
SELECT wm.id, wm.workspace_id, wm.user_id, wm.email
FROM public.workspace_members wm
WHERE wm.email IS NOT NULL
  AND wm.email <> ''
ON CONFLICT (member_id) DO NOTHING;

-- 2.10 eventos de tracing (tabela v1 usada por TracesTimelinePage) ----------
CREATE TABLE IF NOT EXISTS public.trace_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_trace_id UUID REFERENCES public.session_traces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trace_events_session
  ON public.trace_events(session_trace_id, created_at DESC);

-- Fail-closed: a tabela v1 não tem workspace_id, então nada é exposto
-- automaticamente; service_role (exporters) continua com acesso total.
ALTER TABLE public.trace_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.trace_events TO service_role;

-- 2.11 snapshots forenses (ForensicSnapshotsPage / ReplayForkPage) ---------
CREATE TABLE IF NOT EXISTS public.forensic_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  execution_id TEXT NOT NULL,
  agent_id UUID,
  step_index INTEGER NOT NULL DEFAULT 0,
  decision_type TEXT NOT NULL DEFAULT 'unknown',
  state_before JSONB,
  state_after JSONB,
  decision_rationale TEXT,
  input_hash TEXT,
  output_hash TEXT,
  chain_hash TEXT,
  previous_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forensic_snapshots_execution
  ON public.forensic_snapshots(execution_id, step_index);
CREATE INDEX IF NOT EXISTS idx_forensic_snapshots_created
  ON public.forensic_snapshots(created_at DESC);

ALTER TABLE public.forensic_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view own workspace forensic snapshots" ON public.forensic_snapshots;
CREATE POLICY "Members view own workspace forensic snapshots"
  ON public.forensic_snapshots FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));

-- ============================================================================
-- 3) Views ausentes
-- ============================================================================

-- 3.1 rollup diário de execuções por agente ---------------------------------

-- ============================================================================
-- 2) Colunas ausentes nas tabelas que JA existem em producao
--    Fonte: catalogo real (224 tabelas / 2217 colunas) x definicoes das migracoes.
--    Todas idempotentes (ADD COLUMN IF NOT EXISTS). NOT NULL so com DEFAULT.
-- ============================================================================

-- Colunas ausentes em producao, medidas no catalogo real (241 relacoes / 2217 colunas).
-- Gerado das definicoes das migracoes do repo + fallback no types.ts.
-- tabelas=157 colunas=1193 migracao=1089 types=104 sem_fonte=0

-- access_blocked_log (5)
ALTER TABLE public.access_blocked_log ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE public.access_blocked_log ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.access_blocked_log ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.access_blocked_log ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.access_blocked_log ADD COLUMN IF NOT EXISTS user_agent text;

-- agent_eval_datasets (4)
ALTER TABLE public.agent_eval_datasets ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.agent_eval_datasets ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.agent_eval_datasets ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.agent_eval_datasets ADD COLUMN IF NOT EXISTS name TEXT;

-- agent_eval_results (11)
ALTER TABLE public.agent_eval_results ADD COLUMN IF NOT EXISTS actual TEXT;
ALTER TABLE public.agent_eval_results ADD COLUMN IF NOT EXISTS cost_usd NUMERIC DEFAULT 0;
ALTER TABLE public.agent_eval_results ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.agent_eval_results ADD COLUMN IF NOT EXISTS expected TEXT;
ALTER TABLE public.agent_eval_results ADD COLUMN IF NOT EXISTS input TEXT;
ALTER TABLE public.agent_eval_results ADD COLUMN IF NOT EXISTS item_index INTEGER;
ALTER TABLE public.agent_eval_results ADD COLUMN IF NOT EXISTS judge_reasoning TEXT;
ALTER TABLE public.agent_eval_results ADD COLUMN IF NOT EXISTS latency_ms INTEGER DEFAULT 0;
ALTER TABLE public.agent_eval_results ADD COLUMN IF NOT EXISTS passed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.agent_eval_results ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES public.agent_eval_runs(id) ON DELETE CASCADE;
ALTER TABLE public.agent_eval_results ADD COLUMN IF NOT EXISTS score NUMERIC NOT NULL DEFAULT 0;

-- agent_eval_runs (13)
ALTER TABLE public.agent_eval_runs ADD COLUMN IF NOT EXISTS avg_latency_ms INTEGER DEFAULT 0;
ALTER TABLE public.agent_eval_runs ADD COLUMN IF NOT EXISTS avg_score NUMERIC DEFAULT 0;
ALTER TABLE public.agent_eval_runs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.agent_eval_runs ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.agent_eval_runs ADD COLUMN IF NOT EXISTS dataset_id UUID REFERENCES public.agent_eval_datasets(id) ON DELETE CASCADE;
ALTER TABLE public.agent_eval_runs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.agent_eval_runs ADD COLUMN IF NOT EXISTS failed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.agent_eval_runs ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.agent_eval_runs ADD COLUMN IF NOT EXISTS passed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.agent_eval_runs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.agent_eval_runs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE public.agent_eval_runs ADD COLUMN IF NOT EXISTS total_cost_usd NUMERIC DEFAULT 0;
ALTER TABLE public.agent_eval_runs ADD COLUMN IF NOT EXISTS total_items INTEGER NOT NULL DEFAULT 0;

-- agent_experiment_runs (11)
ALTER TABLE public.agent_experiment_runs ADD COLUMN IF NOT EXISTS cost_usd NUMERIC DEFAULT 0;
ALTER TABLE public.agent_experiment_runs ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.agent_experiment_runs ADD COLUMN IF NOT EXISTS experiment_id UUID REFERENCES public.agent_experiments(id) ON DELETE CASCADE;
ALTER TABLE public.agent_experiment_runs ADD COLUMN IF NOT EXISTS feedback TEXT;
ALTER TABLE public.agent_experiment_runs ADD COLUMN IF NOT EXISTS input JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.agent_experiment_runs ADD COLUMN IF NOT EXISTS latency_ms INTEGER;
ALTER TABLE public.agent_experiment_runs ADD COLUMN IF NOT EXISTS output JSONB;
ALTER TABLE public.agent_experiment_runs ADD COLUMN IF NOT EXISTS score NUMERIC;
ALTER TABLE public.agent_experiment_runs ADD COLUMN IF NOT EXISTS tokens_input INTEGER DEFAULT 0;
ALTER TABLE public.agent_experiment_runs ADD COLUMN IF NOT EXISTS tokens_output INTEGER DEFAULT 0;
ALTER TABLE public.agent_experiment_runs ADD COLUMN IF NOT EXISTS variant TEXT CHECK (variant IN ('a','b'));

-- agent_experiments (10)
ALTER TABLE public.agent_experiments ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.agent_experiments ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.agent_experiments ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.agent_experiments ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.agent_experiments ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.agent_experiments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed'));
ALTER TABLE public.agent_experiments ADD COLUMN IF NOT EXISTS traffic_split INTEGER NOT NULL DEFAULT 50 CHECK (traffic_split BETWEEN 0 AND 100);
ALTER TABLE public.agent_experiments ADD COLUMN IF NOT EXISTS variant_a_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.agent_experiments ADD COLUMN IF NOT EXISTS variant_b_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.agent_experiments ADD COLUMN IF NOT EXISTS winner TEXT CHECK (winner IN ('a','b') OR winner IS NULL);

-- agent_graphs (6)
ALTER TABLE public.agent_graphs ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.agent_graphs ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.agent_graphs ADD COLUMN IF NOT EXISTS edges JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.agent_graphs ADD COLUMN IF NOT EXISTS entry_node_id TEXT;
ALTER TABLE public.agent_graphs ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.agent_graphs ADD COLUMN IF NOT EXISTS nodes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- agent_installed_skills (1)
ALTER TABLE public.agent_installed_skills ADD COLUMN IF NOT EXISTS config_overrides jsonb;

-- agent_memories (2)
ALTER TABLE public.agent_memories ADD COLUMN IF NOT EXISTS decay_rate FLOAT DEFAULT 0.01;
ALTER TABLE public.agent_memories ADD COLUMN IF NOT EXISTS relevance_score NUMERIC DEFAULT 1.0;

-- agent_routing_config (1)
ALTER TABLE public.agent_routing_config ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true;

-- agent_versions (4)
ALTER TABLE public.agent_versions ADD COLUMN IF NOT EXISTS change_summary TEXT;
ALTER TABLE public.agent_versions ADD COLUMN IF NOT EXISTS config JSONB;
ALTER TABLE public.agent_versions ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.agent_versions ADD COLUMN IF NOT EXISTS model TEXT;

-- agent_workflow_runs (9)
ALTER TABLE public.agent_workflow_runs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.agent_workflow_runs ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.agent_workflow_runs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.agent_workflow_runs ADD COLUMN IF NOT EXISTS input JSONB;
ALTER TABLE public.agent_workflow_runs ADD COLUMN IF NOT EXISTS output JSONB;
ALTER TABLE public.agent_workflow_runs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.agent_workflow_runs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'running';
ALTER TABLE public.agent_workflow_runs ADD COLUMN IF NOT EXISTS trace JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.agent_workflow_runs ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES public.agent_workflows(id) ON DELETE CASCADE;

-- agent_workflows (6)
ALTER TABLE public.agent_workflows ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.agent_workflows ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.agent_workflows ADD COLUMN IF NOT EXISTS edges JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.agent_workflows ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.agent_workflows ADD COLUMN IF NOT EXISTS nodes JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.agent_workflows ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

-- alerts (5)
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT false;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS message TEXT DEFAULT '';
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'warning' CHECK (severity IN ('info','warning','critical'));
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS title TEXT;

-- asset_audits (6)
ALTER TABLE public.asset_audits ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE;
ALTER TABLE public.asset_audits ADD COLUMN IF NOT EXISTS audited_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.asset_audits ADD COLUMN IF NOT EXISTS audited_by UUID;
ALTER TABLE public.asset_audits ADD COLUMN IF NOT EXISTS findings TEXT;
ALTER TABLE public.asset_audits ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.asset_audits ADD COLUMN IF NOT EXISTS status_after public.asset_status NOT NULL DEFAULT 'active';

-- assets (9)
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS classification public.asset_classification NOT NULL DEFAULT 'internal';
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS custodian_id UUID;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS linked_system_id UUID;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS linked_vendor_id UUID;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS purchased_at DATE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS vendor TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS warranty_until DATE;

-- audit_events (2)
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- automation_logs (6)
ALTER TABLE public.automation_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE public.automation_logs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.automation_logs ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE public.automation_logs ADD COLUMN IF NOT EXISTS rule_id UUID REFERENCES public.automation_rules(id) ON DELETE CASCADE;
ALTER TABLE public.automation_logs ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('success','failed','running','skipped'));
ALTER TABLE public.automation_logs ADD COLUMN IF NOT EXISTS trigger_payload JSONB;

-- automation_rules (10)
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS action_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS action_type TEXT CHECK (action_type IN ('disc_analysis','eq_analysis','bias_analysis','full_pipeline','notify','webhook'));
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS run_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS trigger_type TEXT CHECK (trigger_type IN ('interaction_created','interaction_length','manual','scheduled','webhook'));

-- bcp_test_runs (11)
ALTER TABLE public.bcp_test_runs ADD COLUMN IF NOT EXISTS action_items TEXT;
ALTER TABLE public.bcp_test_runs ADD COLUMN IF NOT EXISTS actual_rpo_minutes INTEGER;
ALTER TABLE public.bcp_test_runs ADD COLUMN IF NOT EXISTS actual_rto_minutes INTEGER;
ALTER TABLE public.bcp_test_runs ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.bcp_test_runs ADD COLUMN IF NOT EXISTS executed_by UUID;
ALTER TABLE public.bcp_test_runs ADD COLUMN IF NOT EXISTS gaps TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.bcp_test_runs ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.bcp_test_runs ADD COLUMN IF NOT EXISTS scenario TEXT;
ALTER TABLE public.bcp_test_runs ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.bcp_test_runs ADD COLUMN IF NOT EXISTS system_id UUID REFERENCES public.business_systems(id) ON DELETE CASCADE;
ALTER TABLE public.bcp_test_runs ADD COLUMN IF NOT EXISTS test_type public.bcp_test_type NOT NULL DEFAULT 'tabletop';

-- bitrix24_webhook_events (8)
ALTER TABLE public.bitrix24_webhook_events ADD COLUMN IF NOT EXISTS bitrix_event_id text;
ALTER TABLE public.bitrix24_webhook_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.bitrix24_webhook_events ADD COLUMN IF NOT EXISTS raw_payload jsonb;
ALTER TABLE public.bitrix24_webhook_events ADD COLUMN IF NOT EXISTS routed_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL;
ALTER TABLE public.bitrix24_webhook_events ADD COLUMN IF NOT EXISTS routing_error text;
ALTER TABLE public.bitrix24_webhook_events ADD COLUMN IF NOT EXISTS routing_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.bitrix24_webhook_events ADD COLUMN IF NOT EXISTS signature_valid boolean NOT NULL DEFAULT false;
ALTER TABLE public.bitrix24_webhook_events ADD COLUMN IF NOT EXISTS trace_id text;

-- browser_sessions (11)
ALTER TABLE public.browser_sessions ADD COLUMN IF NOT EXISTS cost_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.browser_sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.browser_sessions ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.browser_sessions ADD COLUMN IF NOT EXISTS final_result TEXT;
ALTER TABLE public.browser_sessions ADD COLUMN IF NOT EXISTS goal TEXT;
ALTER TABLE public.browser_sessions ADD COLUMN IF NOT EXISTS max_steps INTEGER NOT NULL DEFAULT 15;
ALTER TABLE public.browser_sessions ADD COLUMN IF NOT EXISTS start_url TEXT;
ALTER TABLE public.browser_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.browser_sessions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled'));
ALTER TABLE public.browser_sessions ADD COLUMN IF NOT EXISTS steps JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.browser_sessions ADD COLUMN IF NOT EXISTS steps_count INTEGER NOT NULL DEFAULT 0;

-- budgets (6)
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS alert_threshold NUMERIC DEFAULT 0.8;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS current_usd NUMERIC DEFAULT 0;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS limit_usd NUMERIC NOT NULL DEFAULT 100;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Mensal';
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS period TEXT DEFAULT 'monthly' CHECK (period IN ('daily','weekly','monthly'));

-- business_systems (3)
ALTER TABLE public.business_systems ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.business_systems ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ;
ALTER TABLE public.business_systems ADD COLUMN IF NOT EXISTS next_test_due TIMESTAMPTZ;

-- change_approvals (5)
ALTER TABLE public.change_approvals ADD COLUMN IF NOT EXISTS approver_id UUID;
ALTER TABLE public.change_approvals ADD COLUMN IF NOT EXISTS change_id UUID REFERENCES public.change_requests(id) ON DELETE CASCADE;
ALTER TABLE public.change_approvals ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE public.change_approvals ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.change_approvals ADD COLUMN IF NOT EXISTS decision public.change_decision;

-- change_requests (7)
ALTER TABLE public.change_requests ADD COLUMN IF NOT EXISTS affected_systems TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.change_requests ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE public.change_requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.change_requests ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;
ALTER TABLE public.change_requests ADD COLUMN IF NOT EXISTS post_mortem_url TEXT;
ALTER TABLE public.change_requests ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE public.change_requests ADD COLUMN IF NOT EXISTS validation_steps TEXT;

-- chunks (2)
ALTER TABLE public.chunks ADD COLUMN IF NOT EXISTS l0_abstract TEXT;
ALTER TABLE public.chunks ADD COLUMN IF NOT EXISTS l1_overview TEXT;

-- citation_telemetry (11)
ALTER TABLE public.citation_telemetry ADD COLUMN IF NOT EXISTS chunk_id TEXT;
ALTER TABLE public.citation_telemetry ADD COLUMN IF NOT EXISTS citation_n SMALLINT;
ALTER TABLE public.citation_telemetry ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.citation_telemetry ADD COLUMN IF NOT EXISTS document_id UUID;
ALTER TABLE public.citation_telemetry ADD COLUMN IF NOT EXISTS document_title TEXT;
ALTER TABLE public.citation_telemetry ADD COLUMN IF NOT EXISTS dwell_ms INT;
ALTER TABLE public.citation_telemetry ADD COLUMN IF NOT EXISTS notebook_id UUID;
ALTER TABLE public.citation_telemetry ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.citation_telemetry ADD COLUMN IF NOT EXISTS opened_document BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.citation_telemetry ADD COLUMN IF NOT EXISTS page INT;
ALTER TABLE public.citation_telemetry ADD COLUMN IF NOT EXISTS section TEXT;

-- code_executions (11)
ALTER TABLE public.code_executions ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.code_executions ADD COLUMN IF NOT EXISTS duration_ms INTEGER DEFAULT 0;
ALTER TABLE public.code_executions ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.code_executions ADD COLUMN IF NOT EXISTS exit_code INTEGER;
ALTER TABLE public.code_executions ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.code_executions ADD COLUMN IF NOT EXISTS memory_mb NUMERIC DEFAULT 0;
ALTER TABLE public.code_executions ADD COLUMN IF NOT EXISTS runtime TEXT CHECK (runtime IN ('python', 'node', 'deno'));
ALTER TABLE public.code_executions ADD COLUMN IF NOT EXISTS simulated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.code_executions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','timeout'));
ALTER TABLE public.code_executions ADD COLUMN IF NOT EXISTS stderr TEXT DEFAULT '';
ALTER TABLE public.code_executions ADD COLUMN IF NOT EXISTS stdout TEXT DEFAULT '';

-- collections (3)
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS icon text;
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS is_archived boolean;

-- compliance_controls (7)
ALTER TABLE public.compliance_controls ADD COLUMN IF NOT EXISTS auto_check_query TEXT;
ALTER TABLE public.compliance_controls ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.compliance_controls ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.compliance_controls ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.compliance_controls ADD COLUMN IF NOT EXISTS evidence_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE public.compliance_controls ADD COLUMN IF NOT EXISTS framework_id UUID REFERENCES public.compliance_frameworks(id) ON DELETE CASCADE;
ALTER TABLE public.compliance_controls ADD COLUMN IF NOT EXISTS title TEXT;

-- compliance_evidence (8)
ALTER TABLE public.compliance_evidence ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.compliance_evidence ADD COLUMN IF NOT EXISTS control_id UUID REFERENCES public.compliance_controls(id);
ALTER TABLE public.compliance_evidence ADD COLUMN IF NOT EXISTS evidence_data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.compliance_evidence ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.compliance_evidence ADD COLUMN IF NOT EXISTS report_id UUID REFERENCES public.compliance_reports(id) ON DELETE CASCADE;
ALTER TABLE public.compliance_evidence ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.compliance_evidence ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE public.compliance_evidence ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- compliance_frameworks (3)
ALTER TABLE public.compliance_frameworks ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.compliance_frameworks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.compliance_frameworks ADD COLUMN IF NOT EXISTS name TEXT;

-- compliance_reports (13)
ALTER TABLE public.compliance_reports ADD COLUMN IF NOT EXISTS failed_controls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.compliance_reports ADD COLUMN IF NOT EXISTS framework_id UUID REFERENCES public.compliance_frameworks(id);
ALTER TABLE public.compliance_reports ADD COLUMN IF NOT EXISTS generated_by UUID;
ALTER TABLE public.compliance_reports ADD COLUMN IF NOT EXISTS na_controls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.compliance_reports ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.compliance_reports ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.compliance_reports ADD COLUMN IF NOT EXISTS passed_controls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.compliance_reports ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE public.compliance_reports ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE public.compliance_reports ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.compliance_reports ADD COLUMN IF NOT EXISTS score NUMERIC(5,2);
ALTER TABLE public.compliance_reports ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE public.compliance_reports ADD COLUMN IF NOT EXISTS total_controls INTEGER NOT NULL DEFAULT 0;

-- consent_records (4)
ALTER TABLE public.consent_records ADD COLUMN IF NOT EXISTS consent_type TEXT;
ALTER TABLE public.consent_records ADD COLUMN IF NOT EXISTS granted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.consent_records ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.consent_records ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- cost_alerts (10)
ALTER TABLE public.cost_alerts ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE public.cost_alerts ADD COLUMN IF NOT EXISTS acknowledged_by UUID;
ALTER TABLE public.cost_alerts ADD COLUMN IF NOT EXISTS baseline_cost_usd NUMERIC;
ALTER TABLE public.cost_alerts ADD COLUMN IF NOT EXISTS observed_cost_usd NUMERIC;
ALTER TABLE public.cost_alerts ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('workspace','agent','model'));
ALTER TABLE public.cost_alerts ADD COLUMN IF NOT EXISTS scope_id TEXT;
ALTER TABLE public.cost_alerts ADD COLUMN IF NOT EXISTS scope_label TEXT;
ALTER TABLE public.cost_alerts ADD COLUMN IF NOT EXISTS severity TEXT CHECK (severity IN ('info','warning','critical'));
ALTER TABLE public.cost_alerts ADD COLUMN IF NOT EXISTS triggered_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.cost_alerts ADD COLUMN IF NOT EXISTS z_score NUMERIC;

-- cost_baselines (8)
ALTER TABLE public.cost_baselines ADD COLUMN IF NOT EXISTS avg_cost_usd NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.cost_baselines ADD COLUMN IF NOT EXISTS computed_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.cost_baselines ADD COLUMN IF NOT EXISTS day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6);
ALTER TABLE public.cost_baselines ADD COLUMN IF NOT EXISTS hour_of_day INTEGER CHECK (hour_of_day BETWEEN 0 AND 23);
ALTER TABLE public.cost_baselines ADD COLUMN IF NOT EXISTS sample_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.cost_baselines ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('workspace','agent','model'));
ALTER TABLE public.cost_baselines ADD COLUMN IF NOT EXISTS scope_id TEXT;
ALTER TABLE public.cost_baselines ADD COLUMN IF NOT EXISTS stddev_cost_usd NUMERIC NOT NULL DEFAULT 0;

-- creator_payouts (7)
ALTER TABLE public.creator_payouts ADD COLUMN IF NOT EXISTS creator_id UUID;
ALTER TABLE public.creator_payouts ADD COLUMN IF NOT EXISTS payout_method TEXT;
ALTER TABLE public.creator_payouts ADD COLUMN IF NOT EXISTS payout_ref TEXT;
ALTER TABLE public.creator_payouts ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE public.creator_payouts ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE public.creator_payouts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed'));
ALTER TABLE public.creator_payouts ADD COLUMN IF NOT EXISTS total_cents INTEGER NOT NULL DEFAULT 0;

-- crm_activities (11)
ALTER TABLE public.crm_activities ADD COLUMN IF NOT EXISTS activity_type TEXT CHECK (activity_type IN ('note','email','call','message','stage_change','task','system'));
ALTER TABLE public.crm_activities ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE public.crm_activities ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.crm_activities ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.crm_companies(id) ON DELETE CASCADE;
ALTER TABLE public.crm_activities ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE;
ALTER TABLE public.crm_activities ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES public.crm_deals(id) ON DELETE CASCADE;
ALTER TABLE public.crm_activities ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.crm_activities ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.crm_activities ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.crm_activities ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'nexus';
ALTER TABLE public.crm_activities ADD COLUMN IF NOT EXISTS trace_id TEXT;

-- crm_cadence_enrollments (10)
ALTER TABLE public.crm_cadence_enrollments ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0);
ALTER TABLE public.crm_cadence_enrollments ADD COLUMN IF NOT EXISTS cadence_id UUID REFERENCES public.crm_cadences(id) ON DELETE CASCADE;
ALTER TABLE public.crm_cadence_enrollments ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL;
ALTER TABLE public.crm_cadence_enrollments ADD COLUMN IF NOT EXISTS current_step INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0);
ALTER TABLE public.crm_cadence_enrollments ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES public.crm_deals(id) ON DELETE CASCADE;
ALTER TABLE public.crm_cadence_enrollments ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.crm_cadence_enrollments ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;
ALTER TABLE public.crm_cadence_enrollments ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.crm_cadence_enrollments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','stopped','failed'));
ALTER TABLE public.crm_cadence_enrollments ADD COLUMN IF NOT EXISTS stop_reason TEXT;

-- crm_cadence_runs (11)
ALTER TABLE public.crm_cadence_runs ADD COLUMN IF NOT EXISTS capped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crm_cadence_runs ADD COLUMN IF NOT EXISTS claimed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crm_cadence_runs ADD COLUMN IF NOT EXISTS completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crm_cadence_runs ADD COLUMN IF NOT EXISTS dry_run BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.crm_cadence_runs ADD COLUMN IF NOT EXISTS duration_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crm_cadence_runs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.crm_cadence_runs ADD COLUMN IF NOT EXISTS failed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crm_cadence_runs ADD COLUMN IF NOT EXISTS sent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crm_cadence_runs ADD COLUMN IF NOT EXISTS skipped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crm_cadence_runs ADD COLUMN IF NOT EXISTS stopped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crm_cadence_runs ADD COLUMN IF NOT EXISTS triggered_by TEXT NOT NULL DEFAULT 'cron' CHECK (triggered_by IN ('cron', 'manual'));

-- crm_cadence_steps (6)
ALTER TABLE public.crm_cadence_steps ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.crm_cadence_steps ADD COLUMN IF NOT EXISTS cadence_id UUID REFERENCES public.crm_cadences(id) ON DELETE CASCADE;
ALTER TABLE public.crm_cadence_steps ADD COLUMN IF NOT EXISTS channel TEXT CHECK (channel IN ('email','whatsapp','slack','task'));
ALTER TABLE public.crm_cadence_steps ADD COLUMN IF NOT EXISTS delay_hours INTEGER NOT NULL DEFAULT 24 CHECK (delay_hours >= 0);
ALTER TABLE public.crm_cadence_steps ADD COLUMN IF NOT EXISTS position INTEGER CHECK (position >= 0);
ALTER TABLE public.crm_cadence_steps ADD COLUMN IF NOT EXISTS subject TEXT;

-- crm_cadences (6)
ALTER TABLE public.crm_cadences ADD COLUMN IF NOT EXISTS daily_send_cap INTEGER NOT NULL DEFAULT 100 CHECK (daily_send_cap >= 0);
ALTER TABLE public.crm_cadences ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.crm_cadences ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.crm_cadences ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.crm_cadences ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.crm_cadences ADD COLUMN IF NOT EXISTS trigger_tier TEXT CHECK (trigger_tier IN ('hot','qualified','nurture','cold'));

-- crm_companies (12)
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS enrichment_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS external_ref TEXT;
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS icp_profile_id uuid;
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS icp_score NUMERIC(5,2);
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS score_reason JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS scored_at timestamptz;
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS size_band TEXT CHECK (size_band IN ('micro','small','medium','large','enterprise'));

-- crm_contacts (9)
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS enrichment_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS external_ref TEXT;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS opted_out BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS phone TEXT;

-- crm_deals (19)
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS expected_close_at TIMESTAMPTZ;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS external_ref TEXT;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS icp_profile_id uuid;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS lead_score NUMERIC(5,2);
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE SET NULL;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS score_reason JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS scored_at timestamptz;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES public.crm_stages(id) ON DELETE SET NULL;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost'));
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS title TEXT;

-- crm_icp_profiles (14)
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS hot_threshold NUMERIC NOT NULL DEFAULT 85 CHECK (hot_threshold >= 0 AND hot_threshold <= 100);
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS max_company_size INTEGER;
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS min_company_size INTEGER;
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS qualified_threshold NUMERIC NOT NULL DEFAULT 70 CHECK (qualified_threshold >= 0 AND qualified_threshold <= 100);
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS target_industries TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS target_job_titles TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS weight_company_size NUMERIC NOT NULL DEFAULT 25 CHECK (weight_company_size >= 0 AND weight_company_size <= 100);
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS weight_engagement NUMERIC NOT NULL DEFAULT 25 CHECK (weight_engagement >= 0 AND weight_engagement <= 100);
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS weight_industry NUMERIC NOT NULL DEFAULT 25 CHECK (weight_industry >= 0 AND weight_industry <= 100);
ALTER TABLE public.crm_icp_profiles ADD COLUMN IF NOT EXISTS weight_job_title NUMERIC NOT NULL DEFAULT 25 CHECK (weight_job_title >= 0 AND weight_job_title <= 100);

-- crm_pipelines (4)
ALTER TABLE public.crm_pipelines ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.crm_pipelines ADD COLUMN IF NOT EXISTS external_ref TEXT;
ALTER TABLE public.crm_pipelines ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.crm_pipelines ADD COLUMN IF NOT EXISTS name TEXT;

-- crm_stages (8)
ALTER TABLE public.crm_stages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.crm_stages ADD COLUMN IF NOT EXISTS external_ref TEXT;
ALTER TABLE public.crm_stages ADD COLUMN IF NOT EXISTS is_lost BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.crm_stages ADD COLUMN IF NOT EXISTS is_won BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.crm_stages ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.crm_stages ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE CASCADE;
ALTER TABLE public.crm_stages ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;
ALTER TABLE public.crm_stages ADD COLUMN IF NOT EXISTS win_probability NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (win_probability >= 0 AND win_probability <= 100);

-- cron_schedule_executions (1)
ALTER TABLE public.cron_schedule_executions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- cron_schedules (6)
ALTER TABLE public.cron_schedules ADD COLUMN IF NOT EXISTS interval_seconds INTEGER;
ALTER TABLE public.cron_schedules ADD COLUMN IF NOT EXISTS max_runs INTEGER;
ALTER TABLE public.cron_schedules ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','completed','failed','expired'));
ALTER TABLE public.cron_schedules ADD COLUMN IF NOT EXISTS target_config JSONB DEFAULT '{}';
ALTER TABLE public.cron_schedules ADD COLUMN IF NOT EXISTS target_id TEXT;
ALTER TABLE public.cron_schedules ADD COLUMN IF NOT EXISTS target_type TEXT CHECK (target_type IN ('workflow','agent','edge_function','webhook'));

-- data_deletion_requests (5)
ALTER TABLE public.data_deletion_requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.data_deletion_requests ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE public.data_deletion_requests ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.data_deletion_requests ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.data_deletion_requests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

-- deploy_connections (6)
ALTER TABLE public.deploy_connections ADD COLUMN IF NOT EXISTS channel TEXT CHECK (channel IN ('api','whatsapp','web_chat','slack','email','bitrix24','telegram','discord'));
ALTER TABLE public.deploy_connections ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';
ALTER TABLE public.deploy_connections ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.deploy_connections ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
ALTER TABLE public.deploy_connections ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;
ALTER TABLE public.deploy_connections ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'inactive' CHECK (status IN ('active','inactive','error','configuring'));

-- dr_drills (16)
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS actual_rpo_seconds INTEGER;
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS actual_rto_seconds INTEGER;
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS executor_id UUID;
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS rpo_target_seconds INTEGER NOT NULL DEFAULT 300;
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS rto_target_seconds INTEGER NOT NULL DEFAULT 900;
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('full','workspace','table'));
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','snapshotting','restoring','validating','completed','failed','cancelled'));
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS success BOOLEAN;
ALTER TABLE public.dr_drills ADD COLUMN IF NOT EXISTS target_tables TEXT[] NOT NULL DEFAULT '{}';

-- dr_restore_logs (8)
ALTER TABLE public.dr_restore_logs ADD COLUMN IF NOT EXISTS drill_id UUID REFERENCES public.dr_drills(id) ON DELETE CASCADE;
ALTER TABLE public.dr_restore_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE public.dr_restore_logs ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.dr_restore_logs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.dr_restore_logs ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.dr_restore_logs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.dr_restore_logs ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('started','succeeded','failed','skipped'));
ALTER TABLE public.dr_restore_logs ADD COLUMN IF NOT EXISTS step TEXT CHECK (step IN ('snapshot','isolate','restore','validate','cleanup'));

-- dr_snapshots (7)
ALTER TABLE public.dr_snapshots ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.dr_snapshots ADD COLUMN IF NOT EXISTS checksum TEXT NOT NULL DEFAULT '';
ALTER TABLE public.dr_snapshots ADD COLUMN IF NOT EXISTS drill_id UUID REFERENCES public.dr_drills(id) ON DELETE CASCADE;
ALTER TABLE public.dr_snapshots ADD COLUMN IF NOT EXISTS row_count BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.dr_snapshots ADD COLUMN IF NOT EXISTS size_bytes BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.dr_snapshots ADD COLUMN IF NOT EXISTS snapshot_data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.dr_snapshots ADD COLUMN IF NOT EXISTS table_name TEXT;

-- entity_resolution_logs (4)
ALTER TABLE public.entity_resolution_logs ADD COLUMN IF NOT EXISTS confidence FLOAT;
ALTER TABLE public.entity_resolution_logs ADD COLUMN IF NOT EXISTS merged_entity_id UUID;
ALTER TABLE public.entity_resolution_logs ADD COLUMN IF NOT EXISTS primary_entity_id UUID REFERENCES public.knowledge_entities(id);
ALTER TABLE public.entity_resolution_logs ADD COLUMN IF NOT EXISTS resolution_method TEXT;

-- environments (2)
ALTER TABLE public.environments ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';
ALTER TABLE public.environments ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'development';

-- eval_runs (4)
ALTER TABLE public.eval_runs ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.eval_runs ADD COLUMN IF NOT EXISTS metric_type TEXT;
ALTER TABLE public.eval_runs ADD COLUMN IF NOT EXISTS sample_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.eval_runs ADD COLUMN IF NOT EXISTS scores JSONB NOT NULL DEFAULT '{}'::jsonb;

-- evaluation_datasets (3)
ALTER TABLE public.evaluation_datasets ADD COLUMN IF NOT EXISTS case_count INTEGER DEFAULT 0;
ALTER TABLE public.evaluation_datasets ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.evaluation_datasets ADD COLUMN IF NOT EXISTS name TEXT;

-- forum_posts (8)
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS author_id uuid;
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS author_name text NOT NULL DEFAULT 'Anônimo';
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS is_answer boolean NOT NULL DEFAULT false;
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS parent_post_id uuid REFERENCES public.forum_posts(id) ON DELETE CASCADE;
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES public.forum_threads(id) ON DELETE CASCADE;
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS upvotes integer NOT NULL DEFAULT 0;



-- forum_threads (14)
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS author_id uuid;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS author_name text NOT NULL DEFAULT 'Anônimo';
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS help_center_id uuid REFERENCES public.help_centers(id) ON DELETE CASCADE;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS is_resolved boolean NOT NULL DEFAULT false;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS upvotes integer NOT NULL DEFAULT 0;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;



-- freeze_windows (2)
ALTER TABLE public.freeze_windows ADD COLUMN IF NOT EXISTS allow_emergency BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.freeze_windows ADD COLUMN IF NOT EXISTS name TEXT;

-- geo_allowed_countries (3)
ALTER TABLE public.geo_allowed_countries ADD COLUMN IF NOT EXISTS country_code text CHECK (length(country_code) = 2);
ALTER TABLE public.geo_allowed_countries ADD COLUMN IF NOT EXISTS country_name text;
ALTER TABLE public.geo_allowed_countries ADD COLUMN IF NOT EXISTS created_by uuid;

-- graph_executions (10)
ALTER TABLE public.graph_executions ADD COLUMN IF NOT EXISTS current_node_id TEXT;
ALTER TABLE public.graph_executions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.graph_executions ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.graph_executions ADD COLUMN IF NOT EXISTS final_output TEXT;
ALTER TABLE public.graph_executions ADD COLUMN IF NOT EXISTS graph_id UUID REFERENCES public.agent_graphs(id) ON DELETE CASCADE;
ALTER TABLE public.graph_executions ADD COLUMN IF NOT EXISTS input TEXT;
ALTER TABLE public.graph_executions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.graph_executions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'running';
ALTER TABLE public.graph_executions ADD COLUMN IF NOT EXISTS total_cost_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.graph_executions ADD COLUMN IF NOT EXISTS trace JSONB NOT NULL DEFAULT '[]'::jsonb;

-- guardrail_policies (4)
ALTER TABLE public.guardrail_policies ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';
ALTER TABLE public.guardrail_policies ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.guardrail_policies ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.guardrail_policies ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'content_filter';

-- help_centers (9)
ALTER TABLE public.help_centers ADD COLUMN IF NOT EXISTS custom_domain text;
ALTER TABLE public.help_centers ADD COLUMN IF NOT EXISTS description text DEFAULT '';
ALTER TABLE public.help_centers ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;
ALTER TABLE public.help_centers ADD COLUMN IF NOT EXISTS knowledge_base_id uuid REFERENCES public.knowledge_bases(id) ON DELETE SET NULL;
ALTER TABLE public.help_centers ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.help_centers ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#6366f1';
ALTER TABLE public.help_centers ADD COLUMN IF NOT EXISTS seo_meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.help_centers ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.help_centers ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Central de Ajuda';

-- idempotency_keys (4)
ALTER TABLE public.idempotency_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.idempotency_keys ADD COLUMN IF NOT EXISTS key text;
ALTER TABLE public.idempotency_keys ADD COLUMN IF NOT EXISTS response_body JSONB;
ALTER TABLE public.idempotency_keys ADD COLUMN IF NOT EXISTS status_code INTEGER;

-- incident_playbooks (10)
ALTER TABLE public.incident_playbooks ADD COLUMN IF NOT EXISTS actions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.incident_playbooks ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER NOT NULL DEFAULT 5;
ALTER TABLE public.incident_playbooks ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.incident_playbooks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.incident_playbooks ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.incident_playbooks ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;
ALTER TABLE public.incident_playbooks ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.incident_playbooks ADD COLUMN IF NOT EXISTS run_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.incident_playbooks ADD COLUMN IF NOT EXISTS trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.incident_playbooks ADD COLUMN IF NOT EXISTS trigger_type TEXT CHECK (trigger_type IN ('slo_breach','synthetic_fail','cost_anomaly','budget_block','manual'));

-- incident_runs (9)
ALTER TABLE public.incident_runs ADD COLUMN IF NOT EXISTS action_results JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.incident_runs ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.incident_runs ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.incident_runs ADD COLUMN IF NOT EXISTS playbook_id UUID REFERENCES public.incident_playbooks(id) ON DELETE CASCADE;
ALTER TABLE public.incident_runs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.incident_runs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','partial'));
ALTER TABLE public.incident_runs ADD COLUMN IF NOT EXISTS trigger_event JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.incident_runs ADD COLUMN IF NOT EXISTS triggered_by TEXT;
ALTER TABLE public.incident_runs ADD COLUMN IF NOT EXISTS triggered_by_user UUID;

-- ip_whitelist (4)
ALTER TABLE public.ip_whitelist ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.ip_whitelist ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.ip_whitelist ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.ip_whitelist ADD COLUMN IF NOT EXISTS label text;

-- ir_playbook_steps (8)
ALTER TABLE public.ir_playbook_steps ADD COLUMN IF NOT EXISTS automation_hint TEXT;
ALTER TABLE public.ir_playbook_steps ADD COLUMN IF NOT EXISTS expected_duration_minutes INTEGER;
ALTER TABLE public.ir_playbook_steps ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE public.ir_playbook_steps ADD COLUMN IF NOT EXISTS phase public.ir_phase;
ALTER TABLE public.ir_playbook_steps ADD COLUMN IF NOT EXISTS playbook_id UUID REFERENCES public.ir_playbooks(id) ON DELETE CASCADE;
ALTER TABLE public.ir_playbook_steps ADD COLUMN IF NOT EXISTS responsible_role TEXT;
ALTER TABLE public.ir_playbook_steps ADD COLUMN IF NOT EXISTS step_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.ir_playbook_steps ADD COLUMN IF NOT EXISTS title TEXT;

-- ir_playbooks (5)
ALTER TABLE public.ir_playbooks ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.ir_playbooks ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.ir_playbooks ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.ir_playbooks ADD COLUMN IF NOT EXISTS next_review_due TIMESTAMPTZ;
ALTER TABLE public.ir_playbooks ADD COLUMN IF NOT EXISTS severity_default public.ir_severity NOT NULL DEFAULT 'medium';

-- ir_tabletop_exercises (9)
ALTER TABLE public.ir_tabletop_exercises ADD COLUMN IF NOT EXISTS action_items TEXT;
ALTER TABLE public.ir_tabletop_exercises ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.ir_tabletop_exercises ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;
ALTER TABLE public.ir_tabletop_exercises ADD COLUMN IF NOT EXISTS facilitator_id UUID;
ALTER TABLE public.ir_tabletop_exercises ADD COLUMN IF NOT EXISTS gaps TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.ir_tabletop_exercises ADD COLUMN IF NOT EXISTS mttr_actual_minutes INTEGER;
ALTER TABLE public.ir_tabletop_exercises ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.ir_tabletop_exercises ADD COLUMN IF NOT EXISTS outcome public.ir_tabletop_outcome NOT NULL DEFAULT 'scheduled';
ALTER TABLE public.ir_tabletop_exercises ADD COLUMN IF NOT EXISTS scenario TEXT;

-- kb_article_versions (6)
ALTER TABLE public.kb_article_versions ADD COLUMN IF NOT EXISTS article_id uuid REFERENCES public.kb_articles(id) ON DELETE CASCADE;
ALTER TABLE public.kb_article_versions ADD COLUMN IF NOT EXISTS author_id uuid;
ALTER TABLE public.kb_article_versions ADD COLUMN IF NOT EXISTS change_summary text DEFAULT '';
ALTER TABLE public.kb_article_versions ADD COLUMN IF NOT EXISTS content_html text;
ALTER TABLE public.kb_article_versions ADD COLUMN IF NOT EXISTS content_json jsonb;
ALTER TABLE public.kb_article_versions ADD COLUMN IF NOT EXISTS title text;

-- kb_articles (15)
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS author_id uuid;
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS content_html text DEFAULT '';
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS content_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS excerpt text DEFAULT '';
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS help_center_id uuid REFERENCES public.help_centers(id) ON DELETE SET NULL;
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS helpful_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS knowledge_base_id uuid REFERENCES public.knowledge_bases(id) ON DELETE CASCADE;
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'pt-BR';
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS not_helpful_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived'));
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

-- kb_query_gaps (11)
ALTER TABLE public.kb_query_gaps ADD COLUMN IF NOT EXISTS best_match_chunk_id uuid;
ALTER TABLE public.kb_query_gaps ADD COLUMN IF NOT EXISTS best_match_score numeric DEFAULT 0;
ALTER TABLE public.kb_query_gaps ADD COLUMN IF NOT EXISTS knowledge_base_id uuid REFERENCES public.knowledge_bases(id) ON DELETE CASCADE;
ALTER TABLE public.kb_query_gaps ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.kb_query_gaps ADD COLUMN IF NOT EXISTS occurrences integer NOT NULL DEFAULT 1;
ALTER TABLE public.kb_query_gaps ADD COLUMN IF NOT EXISTS query text;
ALTER TABLE public.kb_query_gaps ADD COLUMN IF NOT EXISTS query_normalized text;
ALTER TABLE public.kb_query_gaps ADD COLUMN IF NOT EXISTS resolved_article_id uuid REFERENCES public.kb_articles(id) ON DELETE SET NULL;
ALTER TABLE public.kb_query_gaps ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','dismissed'));
ALTER TABLE public.kb_query_gaps ADD COLUMN IF NOT EXISTS suggested_outline jsonb;
ALTER TABLE public.kb_query_gaps ADD COLUMN IF NOT EXISTS suggested_topic text;

-- kb_translations (8)
ALTER TABLE public.kb_translations ADD COLUMN IF NOT EXISTS article_id uuid REFERENCES public.kb_articles(id) ON DELETE CASCADE;
ALTER TABLE public.kb_translations ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT false;
ALTER TABLE public.kb_translations ADD COLUMN IF NOT EXISTS source_hash text;
ALTER TABLE public.kb_translations ADD COLUMN IF NOT EXISTS source_language text;
ALTER TABLE public.kb_translations ADD COLUMN IF NOT EXISTS target_language text;
ALTER TABLE public.kb_translations ADD COLUMN IF NOT EXISTS translated_content_json jsonb;
ALTER TABLE public.kb_translations ADD COLUMN IF NOT EXISTS translated_title text;
ALTER TABLE public.kb_translations ADD COLUMN IF NOT EXISTS translation_method text NOT NULL DEFAULT 'ai' CHECK (translation_method IN ('ai','human','hybrid'));

-- knowledge_entities (6)
ALTER TABLE public.knowledge_entities ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.knowledge_entities ADD COLUMN IF NOT EXISTS importance_score FLOAT DEFAULT 1.0;
ALTER TABLE public.knowledge_entities ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.knowledge_entities ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.knowledge_entities ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.knowledge_entities ADD COLUMN IF NOT EXISTS properties JSONB DEFAULT '{}'::jsonb;


-- knowledge_links (8)
ALTER TABLE public.knowledge_links ADD COLUMN IF NOT EXISTS context TEXT;
ALTER TABLE public.knowledge_links ADD COLUMN IF NOT EXISTS created_by UUID NULL;
ALTER TABLE public.knowledge_links ADD COLUMN IF NOT EXISTS link_kind TEXT NOT NULL DEFAULT 'wikilink' CHECK (link_kind IN ('wikilink','mention','tag','semantic','manual'));
ALTER TABLE public.knowledge_links ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE public.knowledge_links ADD COLUMN IF NOT EXISTS source_type TEXT CHECK (source_type IN ('note','document','entity','chunk'));
ALTER TABLE public.knowledge_links ADD COLUMN IF NOT EXISTS target_id UUID;
ALTER TABLE public.knowledge_links ADD COLUMN IF NOT EXISTS target_label TEXT;
ALTER TABLE public.knowledge_links ADD COLUMN IF NOT EXISTS target_type TEXT CHECK (target_type IN ('note','document','entity','chunk','tag'));

-- knowledge_relations (5)
ALTER TABLE public.knowledge_relations ADD COLUMN IF NOT EXISTS properties JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.knowledge_relations ADD COLUMN IF NOT EXISTS relation_type TEXT;
ALTER TABLE public.knowledge_relations ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.knowledge_entities(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_relations ADD COLUMN IF NOT EXISTS strength FLOAT DEFAULT 1.0;
ALTER TABLE public.knowledge_relations ADD COLUMN IF NOT EXISTS target_id UUID REFERENCES public.knowledge_entities(id) ON DELETE CASCADE;

-- managed_secrets (4)
ALTER TABLE public.managed_secrets ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.managed_secrets ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'prod' CHECK (environment IN ('prod','staging','dev'));
ALTER TABLE public.managed_secrets ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.managed_secrets ADD COLUMN IF NOT EXISTS provider TEXT;

-- mcp_servers (7)
ALTER TABLE public.mcp_servers ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.mcp_servers ADD COLUMN IF NOT EXISTS last_connected TIMESTAMPTZ;
ALTER TABLE public.mcp_servers ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.mcp_servers ADD COLUMN IF NOT EXISTS resources JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.mcp_servers ADD COLUMN IF NOT EXISTS tools JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.mcp_servers ADD COLUMN IF NOT EXISTS tools_discovered JSONB DEFAULT '[]';
ALTER TABLE public.mcp_servers ADD COLUMN IF NOT EXISTS url TEXT;

-- model_pricing (3)
ALTER TABLE public.model_pricing ADD COLUMN IF NOT EXISTS input_cost_per_1k NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.model_pricing ADD COLUMN IF NOT EXISTS model_pattern TEXT;
ALTER TABLE public.model_pricing ADD COLUMN IF NOT EXISTS output_cost_per_1k NUMERIC NOT NULL DEFAULT 0;

-- notebook_canvases (8)
ALTER TABLE public.notebook_canvases ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.notebook_canvases ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.notebook_canvases ADD COLUMN IF NOT EXISTS edges JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.notebook_canvases ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notebook_canvases ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Novo canvas';
ALTER TABLE public.notebook_canvases ADD COLUMN IF NOT EXISTS nodes JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.notebook_canvases ADD COLUMN IF NOT EXISTS notebook_id UUID REFERENCES public.collections(id) ON DELETE CASCADE;
ALTER TABLE public.notebook_canvases ADD COLUMN IF NOT EXISTS viewport JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb;

-- notebook_note_templates (9)
ALTER TABLE public.notebook_note_templates ADD COLUMN IF NOT EXISTS body_md TEXT NOT NULL DEFAULT '';
ALTER TABLE public.notebook_note_templates ADD COLUMN IF NOT EXISTS collection_id UUID NULL REFERENCES public.collections(id) ON DELETE CASCADE;
ALTER TABLE public.notebook_note_templates ADD COLUMN IF NOT EXISTS created_by UUID NULL;
ALTER TABLE public.notebook_note_templates ADD COLUMN IF NOT EXISTS description TEXT NULL;
ALTER TABLE public.notebook_note_templates ADD COLUMN IF NOT EXISTS is_builtin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.notebook_note_templates ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.notebook_note_templates ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'notebook' CHECK (scope IN ('workspace','notebook'));
ALTER TABLE public.notebook_note_templates ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.notebook_note_templates ADD COLUMN IF NOT EXISTS title_pattern TEXT NOT NULL DEFAULT '{{title}}';

-- notebook_note_versions (7)
ALTER TABLE public.notebook_note_versions ADD COLUMN IF NOT EXISTS body_md TEXT;
ALTER TABLE public.notebook_note_versions ADD COLUMN IF NOT EXISTS created_by UUID NULL;
ALTER TABLE public.notebook_note_versions ADD COLUMN IF NOT EXISTS note_id UUID REFERENCES public.notebook_notes(id) ON DELETE CASCADE;
ALTER TABLE public.notebook_note_versions ADD COLUMN IF NOT EXISTS reason TEXT NULL;
ALTER TABLE public.notebook_note_versions ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.notebook_note_versions ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.notebook_note_versions ADD COLUMN IF NOT EXISTS version_number INTEGER;

-- notebook_notes (8)
ALTER TABLE public.notebook_notes ADD COLUMN IF NOT EXISTS body_md TEXT NOT NULL DEFAULT '';
ALTER TABLE public.notebook_notes ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES public.collections(id) ON DELETE CASCADE;
ALTER TABLE public.notebook_notes ADD COLUMN IF NOT EXISTS created_by UUID NULL;
ALTER TABLE public.notebook_notes ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notebook_notes ADD COLUMN IF NOT EXISTS is_daily boolean;
ALTER TABLE public.notebook_notes ADD COLUMN IF NOT EXISTS note_date DATE NULL;
ALTER TABLE public.notebook_notes ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.notebook_notes ADD COLUMN IF NOT EXISTS title TEXT;

-- notebook_podcasts (12)
ALTER TABLE public.notebook_podcasts ADD COLUMN IF NOT EXISTS audio_path TEXT;
ALTER TABLE public.notebook_podcasts ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE public.notebook_podcasts ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notebook_podcasts ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE public.notebook_podcasts ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.notebook_podcasts ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE public.notebook_podcasts ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.notebook_podcasts ADD COLUMN IF NOT EXISTS notebook_id UUID REFERENCES public.collections(id) ON DELETE CASCADE;
ALTER TABLE public.notebook_podcasts ADD COLUMN IF NOT EXISTS script_md TEXT;
ALTER TABLE public.notebook_podcasts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','generating','ready','failed','canceled'));
ALTER TABLE public.notebook_podcasts ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Podcast do Notebook';
ALTER TABLE public.notebook_podcasts ADD COLUMN IF NOT EXISTS voice TEXT NOT NULL DEFAULT 'alloy';

-- oncall_schedule (6)
ALTER TABLE public.oncall_schedule ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.oncall_schedule ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE public.oncall_schedule ADD COLUMN IF NOT EXISTS escalation_order INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.oncall_schedule ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.oncall_schedule ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE public.oncall_schedule ADD COLUMN IF NOT EXISTS user_name TEXT;

-- oncall_schedule_emails (2)
ALTER TABLE public.oncall_schedule_emails ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.oncall_schedule(id) ON DELETE CASCADE;
ALTER TABLE public.oncall_schedule_emails ADD COLUMN IF NOT EXISTS user_email text;


-- openclaw_agent_templates (13)
ALTER TABLE public.openclaw_agent_templates ADD COLUMN IF NOT EXISTS agents_md text;
ALTER TABLE public.openclaw_agent_templates ADD COLUMN IF NOT EXISTS category text CHECK (category IN ('vendas','atendimento','produtividade','observabilidade','conteudo','pessoal'));
ALTER TABLE public.openclaw_agent_templates ADD COLUMN IF NOT EXISTS cron_schedule text;
ALTER TABLE public.openclaw_agent_templates ADD COLUMN IF NOT EXISTS description_pt text;
ALTER TABLE public.openclaw_agent_templates ADD COLUMN IF NOT EXISTS difficulty smallint CHECK (difficulty BETWEEN 1 AND 3);
ALTER TABLE public.openclaw_agent_templates ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;
ALTER TABLE public.openclaw_agent_templates ADD COLUMN IF NOT EXISTS name_pt text;
ALTER TABLE public.openclaw_agent_templates ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'native' CHECK (origin IN ('awesome-openclaw-zh','native'));
ALTER TABLE public.openclaw_agent_templates ADD COLUMN IF NOT EXISTS required_channels jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.openclaw_agent_templates ADD COLUMN IF NOT EXISTS skills jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.openclaw_agent_templates ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.openclaw_agent_templates ADD COLUMN IF NOT EXISTS soul_md text;
ALTER TABLE public.openclaw_agent_templates ADD COLUMN IF NOT EXISTS source_url text;

-- openclaw_deployments (6)
ALTER TABLE public.openclaw_deployments ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ;
ALTER TABLE public.openclaw_deployments ADD COLUMN IF NOT EXISTS deployed_by UUID NULL;
ALTER TABLE public.openclaw_deployments ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.openclaw_deployments ADD COLUMN IF NOT EXISTS manifest JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE public.openclaw_deployments ADD COLUMN IF NOT EXISTS openclaw_agent_id TEXT;
ALTER TABLE public.openclaw_deployments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','deployed','failed','rolled_back'));

-- openclaw_whatsapp_instances (7)
ALTER TABLE public.openclaw_whatsapp_instances ADD COLUMN IF NOT EXISTS auto_reply boolean;
ALTER TABLE public.openclaw_whatsapp_instances ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.openclaw_whatsapp_instances ADD COLUMN IF NOT EXISTS instance_name TEXT;
ALTER TABLE public.openclaw_whatsapp_instances ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE public.openclaw_whatsapp_instances ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE public.openclaw_whatsapp_instances ADD COLUMN IF NOT EXISTS qr_code TEXT;
ALTER TABLE public.openclaw_whatsapp_instances ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','connected','expired','disconnected','error'));

-- openclaw_whatsapp_messages (9)
ALTER TABLE public.openclaw_whatsapp_messages ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.openclaw_whatsapp_messages ADD COLUMN IF NOT EXISTS direction TEXT CHECK (direction IN ('inbound','outbound'));
ALTER TABLE public.openclaw_whatsapp_messages ADD COLUMN IF NOT EXISTS external_message_id TEXT;
ALTER TABLE public.openclaw_whatsapp_messages ADD COLUMN IF NOT EXISTS handled_by UUID NULL;
ALTER TABLE public.openclaw_whatsapp_messages ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES public.openclaw_whatsapp_instances(id) ON DELETE CASCADE;
ALTER TABLE public.openclaw_whatsapp_messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE public.openclaw_whatsapp_messages ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE public.openclaw_whatsapp_messages ADD COLUMN IF NOT EXISTS remote_phone TEXT;
ALTER TABLE public.openclaw_whatsapp_messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','sent','failed','human_takeover'));

-- pentest_engagements (13)
ALTER TABLE public.pentest_engagements ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.pentest_engagements ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.pentest_engagements ADD COLUMN IF NOT EXISTS engagement_type TEXT CHECK (engagement_type IN ('black_box','grey_box','white_box','red_team'));
ALTER TABLE public.pentest_engagements ADD COLUMN IF NOT EXISTS executive_summary TEXT;
ALTER TABLE public.pentest_engagements ADD COLUMN IF NOT EXISTS lead_contact TEXT;
ALTER TABLE public.pentest_engagements ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.pentest_engagements ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.pentest_engagements ADD COLUMN IF NOT EXISTS report_url TEXT;
ALTER TABLE public.pentest_engagements ADD COLUMN IF NOT EXISTS scope JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.pentest_engagements ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.pentest_engagements ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scoping' CHECK (status IN ('scoping','in_progress','reporting','completed','cancelled'));
ALTER TABLE public.pentest_engagements ADD COLUMN IF NOT EXISTS total_findings INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.pentest_engagements ADD COLUMN IF NOT EXISTS vendor TEXT;

-- pentest_findings (9)
ALTER TABLE public.pentest_findings ADD COLUMN IF NOT EXISTS affected_assets TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.pentest_findings ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE public.pentest_findings ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.pentest_findings ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE public.pentest_findings ADD COLUMN IF NOT EXISTS fixed_at TIMESTAMPTZ;
ALTER TABLE public.pentest_findings ADD COLUMN IF NOT EXISTS impact TEXT;
ALTER TABLE public.pentest_findings ADD COLUMN IF NOT EXISTS recommendation TEXT;
ALTER TABLE public.pentest_findings ADD COLUMN IF NOT EXISTS reproduction_steps TEXT;
ALTER TABLE public.pentest_findings ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- postmortem_action_items (8)
ALTER TABLE public.postmortem_action_items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.postmortem_action_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.postmortem_action_items ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.postmortem_action_items ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.postmortem_action_items ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE public.postmortem_action_items ADD COLUMN IF NOT EXISTS postmortem_id UUID REFERENCES public.postmortems(id) ON DELETE CASCADE;
ALTER TABLE public.postmortem_action_items ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'P2' CHECK (priority IN ('P0','P1','P2'));
ALTER TABLE public.postmortem_action_items ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled'));

-- postmortems (15)
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS author_id UUID;
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS contributing_factors TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS incident_source TEXT NOT NULL DEFAULT 'manual' CHECK (incident_source IN ('incident_run','game_day','dr_drill','manual'));
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS lessons_learned TEXT;
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS reviewer_id UUID;
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS root_cause TEXT;
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'SEV3' CHECK (severity IN ('SEV1','SEV2','SEV3','SEV4'));
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published'));
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS timeline JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS what_went_well TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.postmortems ADD COLUMN IF NOT EXISTS what_went_wrong TEXT[] NOT NULL DEFAULT '{}';

-- prompt_experiment_runs (11)
ALTER TABLE public.prompt_experiment_runs ADD COLUMN IF NOT EXISTS cost_cents NUMERIC(10,4) NOT NULL DEFAULT 0;
ALTER TABLE public.prompt_experiment_runs ADD COLUMN IF NOT EXISTS experiment_id UUID REFERENCES public.prompt_experiments(id) ON DELETE CASCADE;
ALTER TABLE public.prompt_experiment_runs ADD COLUMN IF NOT EXISTS latency_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.prompt_experiment_runs ADD COLUMN IF NOT EXISTS prompt_version_id UUID;
ALTER TABLE public.prompt_experiment_runs ADD COLUMN IF NOT EXISTS quality_score NUMERIC(4,3) CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1));
ALTER TABLE public.prompt_experiment_runs ADD COLUMN IF NOT EXISTS session_key TEXT;
ALTER TABLE public.prompt_experiment_runs ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.prompt_experiment_runs ADD COLUMN IF NOT EXISTS tokens_input INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.prompt_experiment_runs ADD COLUMN IF NOT EXISTS tokens_output INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.prompt_experiment_runs ADD COLUMN IF NOT EXISTS trace_id UUID;
ALTER TABLE public.prompt_experiment_runs ADD COLUMN IF NOT EXISTS variant TEXT CHECK (variant IN ('a','b'));

-- prompt_experiments (14)
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS guardrails JSONB NOT NULL DEFAULT '{"max_cost_increase_pct":50,"max_latency_increase_ms":2000,"min_quality":0.6}'::jsonb;
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed'));
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS success_metric TEXT NOT NULL DEFAULT 'quality' CHECK (success_metric IN ('quality','latency','cost','success_rate'));
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS traffic_split INTEGER NOT NULL DEFAULT 50 CHECK (traffic_split BETWEEN 0 AND 100);
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS variant_a_label TEXT NOT NULL DEFAULT 'Controle';
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS variant_a_version_id UUID;
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS variant_b_label TEXT NOT NULL DEFAULT 'Challenger';
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS variant_b_version_id UUID;
ALTER TABLE public.prompt_experiments ADD COLUMN IF NOT EXISTS winner TEXT CHECK (winner IN ('a','b'));

-- prompt_versions (3)
ALTER TABLE public.prompt_versions ADD COLUMN IF NOT EXISTS change_summary text;
ALTER TABLE public.prompt_versions ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.prompt_versions ADD COLUMN IF NOT EXISTS is_active boolean;

-- queue_items (13)
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS attempt INTEGER DEFAULT 0;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES public.task_queues(id) ON DELETE CASCADE;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','dead_letter'));
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS timeout_ms INTEGER DEFAULT 30000;

-- replay_forks (16)
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10,6) DEFAULT 0;
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS deterministic_seed TEXT;
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS fork_step_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Fork sem nome';
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS new_execution_id TEXT;
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS override_input JSONB;
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS parent_agent_id TEXT;
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS parent_chain_hash TEXT;
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS parent_execution_id TEXT;
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS state_snapshot JSONB;
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.replay_forks ADD COLUMN IF NOT EXISTS total_steps INTEGER DEFAULT 0;

-- retention_job_runs (8)
ALTER TABLE public.retention_job_runs ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.retention_job_runs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE public.retention_job_runs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.retention_job_runs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
ALTER TABLE public.retention_job_runs ADD COLUMN IF NOT EXISTS job_name TEXT;
ALTER TABLE public.retention_job_runs ADD COLUMN IF NOT EXISTS partitions_dropped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.retention_job_runs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.retention_job_runs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed'));

-- risk_register (4)
ALTER TABLE public.risk_register ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.risk_register ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.risk_register ADD COLUMN IF NOT EXISTS identified_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.risk_register ADD COLUMN IF NOT EXISTS related_finding_id UUID REFERENCES public.pentest_findings(id) ON DELETE SET NULL;

-- sbom_components (7)
ALTER TABLE public.sbom_components ADD COLUMN IF NOT EXISTS direct BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.sbom_components ADD COLUMN IF NOT EXISTS ecosystem TEXT NOT NULL DEFAULT 'npm' CHECK (ecosystem IN ('npm','deno','pypi','cargo','go','maven','rubygems'));
ALTER TABLE public.sbom_components ADD COLUMN IF NOT EXISTS license TEXT;
ALTER TABLE public.sbom_components ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.sbom_components ADD COLUMN IF NOT EXISTS purl TEXT;
ALTER TABLE public.sbom_components ADD COLUMN IF NOT EXISTS snapshot_id UUID REFERENCES public.sbom_snapshots(id) ON DELETE CASCADE;
ALTER TABLE public.sbom_components ADD COLUMN IF NOT EXISTS supplier TEXT;

-- sbom_snapshots (6)
ALTER TABLE public.sbom_snapshots ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'cyclonedx' CHECK (format IN ('cyclonedx','spdx'));
ALTER TABLE public.sbom_snapshots ADD COLUMN IF NOT EXISTS generated_by UUID;
ALTER TABLE public.sbom_snapshots ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.sbom_snapshots ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.sbom_snapshots ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'package.json' CHECK (source IN ('package.json','manual','upload'));
ALTER TABLE public.sbom_snapshots ADD COLUMN IF NOT EXISTS total_components INTEGER NOT NULL DEFAULT 0;

-- security_alerts (6)
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS resolved_by UUID;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical'));

-- session_traces (8)
ALTER TABLE public.session_traces ADD COLUMN IF NOT EXISTS cost_usd NUMERIC;
ALTER TABLE public.session_traces ADD COLUMN IF NOT EXISTS input JSONB;
ALTER TABLE public.session_traces ADD COLUMN IF NOT EXISTS latency_ms INTEGER;
ALTER TABLE public.session_traces ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE public.session_traces ADD COLUMN IF NOT EXISTS output JSONB;
ALTER TABLE public.session_traces ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE;
ALTER TABLE public.session_traces ADD COLUMN IF NOT EXISTS tokens_used INTEGER;
ALTER TABLE public.session_traces ADD COLUMN IF NOT EXISTS trace_type TEXT NOT NULL DEFAULT 'llm_call';

-- sessions (4)
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active','ended','error'));

-- skill_harvest_candidates (27)
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT '';
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'tools';
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS department_confidence NUMERIC(4,3) NOT NULL DEFAULT 0;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS department_source text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS last_commit_at TIMESTAMPTZ;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS mcp_server_url TEXT;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS promoted_skill_id UUID REFERENCES public.skill_registry(id) ON DELETE SET NULL;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS quality_score NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS raw_content TEXT;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS rejection_reasons TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES public.skill_harvest_runs(id) ON DELETE SET NULL;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS skill_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS source_commit TEXT;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS source_license TEXT;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS source_path TEXT;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS source_repo TEXT;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS stars INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.skill_harvest_candidates ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- skill_harvest_checkpoints (6)
ALTER TABLE public.skill_harvest_checkpoints ADD COLUMN IF NOT EXISTS file_offset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.skill_harvest_checkpoints ADD COLUMN IF NOT EXISTS inserted_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.skill_harvest_checkpoints ADD COLUMN IF NOT EXISTS last_run_id UUID;
ALTER TABLE public.skill_harvest_checkpoints ADD COLUMN IF NOT EXISTS repo_key TEXT;
ALTER TABLE public.skill_harvest_checkpoints ADD COLUMN IF NOT EXISTS repos TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.skill_harvest_checkpoints ADD COLUMN IF NOT EXISTS total_files INTEGER NOT NULL DEFAULT 0;

-- skill_harvest_runs (5)
ALTER TABLE public.skill_harvest_runs ADD COLUMN IF NOT EXISTS candidates_rejected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.skill_harvest_runs ADD COLUMN IF NOT EXISTS departments TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.skill_harvest_runs ADD COLUMN IF NOT EXISTS queries TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.skill_harvest_runs ADD COLUMN IF NOT EXISTS triggered_by UUID;
ALTER TABLE public.skill_harvest_runs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- skill_marketplace_meta (9)
ALTER TABLE public.skill_marketplace_meta ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0;
ALTER TABLE public.skill_marketplace_meta ADD COLUMN IF NOT EXISTS creator_id UUID;
ALTER TABLE public.skill_marketplace_meta ADD COLUMN IF NOT EXISTS creator_payout_pct INTEGER NOT NULL DEFAULT 70 CHECK (creator_payout_pct BETWEEN 0 AND 100);
ALTER TABLE public.skill_marketplace_meta ADD COLUMN IF NOT EXISTS install_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.skill_marketplace_meta ADD COLUMN IF NOT EXISTS price_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.skill_marketplace_meta ADD COLUMN IF NOT EXISTS pricing_model TEXT NOT NULL DEFAULT 'free' CHECK (pricing_model IN ('free','one_time','subscription'));
ALTER TABLE public.skill_marketplace_meta ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.skill_marketplace_meta ADD COLUMN IF NOT EXISTS skill_id UUID;
ALTER TABLE public.skill_marketplace_meta ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;

-- skill_purchases (9)
ALTER TABLE public.skill_purchases ADD COLUMN IF NOT EXISTS amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.skill_purchases ADD COLUMN IF NOT EXISTS buyer_id UUID;
ALTER TABLE public.skill_purchases ADD COLUMN IF NOT EXISTS creator_id UUID;
ALTER TABLE public.skill_purchases ADD COLUMN IF NOT EXISTS creator_payout_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.skill_purchases ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'mock';
ALTER TABLE public.skill_purchases ADD COLUMN IF NOT EXISTS payment_ref TEXT;
ALTER TABLE public.skill_purchases ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.skill_purchases ADD COLUMN IF NOT EXISTS skill_id UUID;
ALTER TABLE public.skill_purchases ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','refunded','failed'));


-- skill_reviews (4)
ALTER TABLE public.skill_reviews ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE public.skill_reviews ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE public.skill_reviews ADD COLUMN IF NOT EXISTS reviewer_id UUID;
ALTER TABLE public.skill_reviews ADD COLUMN IF NOT EXISTS skill_id UUID;

-- slack_agent_notifications (5)
ALTER TABLE public.slack_agent_notifications ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE public.slack_agent_notifications ADD COLUMN IF NOT EXISTS channel_name TEXT;
ALTER TABLE public.slack_agent_notifications ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.slack_agent_notifications ADD COLUMN IF NOT EXISTS notify_on TEXT NOT NULL DEFAULT 'both' CHECK (notify_on IN ('success','failure','both'));
ALTER TABLE public.slack_agent_notifications ADD COLUMN IF NOT EXISTS template TEXT;

-- slack_bot_bindings (3)
ALTER TABLE public.slack_bot_bindings ADD COLUMN IF NOT EXISTS channel_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.slack_bot_bindings ADD COLUMN IF NOT EXISTS default_agent_id UUID;
ALTER TABLE public.slack_bot_bindings ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- slack_channel_routes (8)
ALTER TABLE public.slack_channel_routes ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ( 'security_alert', 'partition_automation_failure', 'circuit_breaker', 'high_cost', 'agent_failure', 'system_error', 'custom'));
ALTER TABLE public.slack_channel_routes ADD COLUMN IF NOT EXISTS category_label TEXT;
ALTER TABLE public.slack_channel_routes ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE public.slack_channel_routes ADD COLUMN IF NOT EXISTS channel_name TEXT;
ALTER TABLE public.slack_channel_routes ADD COLUMN IF NOT EXISTS created_by UUID NULL;
ALTER TABLE public.slack_channel_routes ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.slack_channel_routes ADD COLUMN IF NOT EXISTS mention_users TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.slack_channel_routes ADD COLUMN IF NOT EXISTS min_severity TEXT NOT NULL DEFAULT 'warning' CHECK (min_severity IN ('info', 'warning', 'error', 'critical'));

-- slack_dispatch_dlq (6)
ALTER TABLE public.slack_dispatch_dlq ADD COLUMN IF NOT EXISTS alert_id UUID;
ALTER TABLE public.slack_dispatch_dlq ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.slack_dispatch_dlq ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.slack_dispatch_dlq ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes');
ALTER TABLE public.slack_dispatch_dlq ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE public.slack_dispatch_dlq ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- slack_rag_sources (8)
ALTER TABLE public.slack_rag_sources ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE public.slack_rag_sources ADD COLUMN IF NOT EXISTS channel_name TEXT;
ALTER TABLE public.slack_rag_sources ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.slack_rag_sources ADD COLUMN IF NOT EXISTS last_sync_error TEXT;
ALTER TABLE public.slack_rag_sources ADD COLUMN IF NOT EXISTS last_sync_status TEXT;
ALTER TABLE public.slack_rag_sources ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE public.slack_rag_sources ADD COLUMN IF NOT EXISTS message_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.slack_rag_sources ADD COLUMN IF NOT EXISTS oldest_ts TEXT;

-- slack_user_cache (8)
ALTER TABLE public.slack_user_cache ADD COLUMN IF NOT EXISTS cached_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.slack_user_cache ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.slack_user_cache ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.slack_user_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours');
ALTER TABLE public.slack_user_cache ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.slack_user_cache ADD COLUMN IF NOT EXISTS real_name TEXT;
ALTER TABLE public.slack_user_cache ADD COLUMN IF NOT EXISTS slack_user_id TEXT;
ALTER TABLE public.slack_user_cache ADD COLUMN IF NOT EXISTS team_id TEXT;

-- slack_workspace_config (9)
ALTER TABLE public.slack_workspace_config ADD COLUMN IF NOT EXISTS bot_display_name TEXT;
ALTER TABLE public.slack_workspace_config ADD COLUMN IF NOT EXISTS bot_user_id TEXT;
ALTER TABLE public.slack_workspace_config ADD COLUMN IF NOT EXISTS installed_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.slack_workspace_config ADD COLUMN IF NOT EXISTS installed_by UUID NULL;
ALTER TABLE public.slack_workspace_config ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.slack_workspace_config ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE public.slack_workspace_config ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.slack_workspace_config ADD COLUMN IF NOT EXISTS slack_team_id TEXT;
ALTER TABLE public.slack_workspace_config ADD COLUMN IF NOT EXISTS slack_team_name TEXT;

-- spans (12)
ALTER TABLE public.spans ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.spans ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE public.spans ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE public.spans ADD COLUMN IF NOT EXISTS events JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.spans ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE public.spans ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.spans ADD COLUMN IF NOT EXISTS parent_span_id TEXT;
ALTER TABLE public.spans ADD COLUMN IF NOT EXISTS span_id TEXT;
ALTER TABLE public.spans ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE public.spans ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.spans ADD COLUMN IF NOT EXISTS status_message TEXT;
ALTER TABLE public.spans ADD COLUMN IF NOT EXISTS trace_id TEXT;

-- synthetic_checks (8)
ALTER TABLE public.synthetic_checks ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.synthetic_checks ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.synthetic_checks ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.synthetic_checks ADD COLUMN IF NOT EXISTS expected_status_max_ms INTEGER NOT NULL DEFAULT 3000 CHECK (expected_status_max_ms BETWEEN 100 AND 30000);
ALTER TABLE public.synthetic_checks ADD COLUMN IF NOT EXISTS interval_minutes INTEGER NOT NULL DEFAULT 5 CHECK (interval_minutes BETWEEN 1 AND 60);
ALTER TABLE public.synthetic_checks ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
ALTER TABLE public.synthetic_checks ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.synthetic_checks ADD COLUMN IF NOT EXISTS target TEXT CHECK (target IN ('llm-gateway', 'agent-workflow-runner', 'health'));

-- synthetic_results (6)
ALTER TABLE public.synthetic_results ADD COLUMN IF NOT EXISTS check_id UUID REFERENCES public.synthetic_checks(id) ON DELETE CASCADE;
ALTER TABLE public.synthetic_results ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.synthetic_results ADD COLUMN IF NOT EXISTS latency_ms INTEGER;
ALTER TABLE public.synthetic_results ADD COLUMN IF NOT EXISTS ran_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.synthetic_results ADD COLUMN IF NOT EXISTS status_code INTEGER;
ALTER TABLE public.synthetic_results ADD COLUMN IF NOT EXISTS success BOOLEAN;

-- task_queues (8)
ALTER TABLE public.task_queues ADD COLUMN IF NOT EXISTS current_size INTEGER DEFAULT 0;
ALTER TABLE public.task_queues ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.task_queues ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0;
ALTER TABLE public.task_queues ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT false;
ALTER TABLE public.task_queues ADD COLUMN IF NOT EXISTS max_concurrency INTEGER DEFAULT 5;
ALTER TABLE public.task_queues ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.task_queues ADD COLUMN IF NOT EXISTS processed_count INTEGER DEFAULT 0;
ALTER TABLE public.task_queues ADD COLUMN IF NOT EXISTS strategy TEXT DEFAULT 'fifo' CHECK (strategy IN ('fifo','lifo','priority'));

-- template_skill_links (12)
ALTER TABLE public.template_skill_links ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.template_skill_links ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.template_skill_links ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.template_skill_links ADD COLUMN IF NOT EXISTS department_match BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.template_skill_links ADD COLUMN IF NOT EXISTS is_strong_match BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.template_skill_links ADD COLUMN IF NOT EXISTS matched_keywords TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.template_skill_links ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'auto' CHECK (origin IN ('auto','manual'));
ALTER TABLE public.template_skill_links ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT '';
ALTER TABLE public.template_skill_links ADD COLUMN IF NOT EXISTS score NUMERIC(6,3) NOT NULL DEFAULT 0;
ALTER TABLE public.template_skill_links ADD COLUMN IF NOT EXISTS skill_id UUID REFERENCES public.skill_registry(id) ON DELETE CASCADE;
ALTER TABLE public.template_skill_links ADD COLUMN IF NOT EXISTS template_id TEXT;
ALTER TABLE public.template_skill_links ADD COLUMN IF NOT EXISTS updated_by uuid;

-- test_cases (5)
ALTER TABLE public.test_cases ADD COLUMN IF NOT EXISTS dataset_id UUID REFERENCES public.evaluation_datasets(id) ON DELETE CASCADE;
ALTER TABLE public.test_cases ADD COLUMN IF NOT EXISTS expected_output TEXT;
ALTER TABLE public.test_cases ADD COLUMN IF NOT EXISTS input TEXT;
ALTER TABLE public.test_cases ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE public.test_cases ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- tool_integrations (5)
ALTER TABLE public.tool_integrations ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';
ALTER TABLE public.tool_integrations ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.tool_integrations ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.tool_integrations ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.tool_integrations ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'api';

-- tool_policies (6)
ALTER TABLE public.tool_policies ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';
ALTER TABLE public.tool_policies ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'development';
ALTER TABLE public.tool_policies ADD COLUMN IF NOT EXISTS is_allowed BOOLEAN DEFAULT true;
ALTER TABLE public.tool_policies ADD COLUMN IF NOT EXISTS max_calls_per_run INTEGER;
ALTER TABLE public.tool_policies ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false;
ALTER TABLE public.tool_policies ADD COLUMN IF NOT EXISTS tool_integration_id UUID REFERENCES public.tool_integrations(id) ON DELETE CASCADE;

-- traces (9)
ALTER TABLE public.traces ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE public.traces ADD COLUMN IF NOT EXISTS root_name TEXT;
ALTER TABLE public.traces ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE public.traces ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.traces ADD COLUMN IF NOT EXISTS span_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.traces ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE public.traces ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE public.traces ADD COLUMN IF NOT EXISTS trace_id TEXT;
ALTER TABLE public.traces ADD COLUMN IF NOT EXISTS workflow_id UUID;

-- usage_records (4)
ALTER TABLE public.usage_records ADD COLUMN IF NOT EXISTS cost_usd NUMERIC DEFAULT 0;
ALTER TABLE public.usage_records ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE public.usage_records ADD COLUMN IF NOT EXISTS record_type TEXT NOT NULL DEFAULT 'llm_call';
ALTER TABLE public.usage_records ADD COLUMN IF NOT EXISTS tokens INTEGER DEFAULT 0;


-- user_2fa (1)
ALTER TABLE public.user_2fa ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

-- user_research_configs (1)
ALTER TABLE public.user_research_configs ADD COLUMN IF NOT EXISTS config JSONB;

-- vendor_assessments (10)
ALTER TABLE public.vendor_assessments ADD COLUMN IF NOT EXISTS assessed_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.vendor_assessments ADD COLUMN IF NOT EXISTS assessed_by UUID;
ALTER TABLE public.vendor_assessments ADD COLUMN IF NOT EXISTS compliance_score INTEGER CHECK (compliance_score BETWEEN 1 AND 5);
ALTER TABLE public.vendor_assessments ADD COLUMN IF NOT EXISTS findings TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.vendor_assessments ADD COLUMN IF NOT EXISTS next_review_due TIMESTAMPTZ;
ALTER TABLE public.vendor_assessments ADD COLUMN IF NOT EXISTS operational_score INTEGER CHECK (operational_score BETWEEN 1 AND 5);
ALTER TABLE public.vendor_assessments ADD COLUMN IF NOT EXISTS recommendations TEXT;
ALTER TABLE public.vendor_assessments ADD COLUMN IF NOT EXISTS security_score INTEGER CHECK (security_score BETWEEN 1 AND 5);
ALTER TABLE public.vendor_assessments ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE;
ALTER TABLE public.vendor_assessments ADD COLUMN IF NOT EXISTS risk_score INTEGER GENERATED ALWAYS AS ( (6 - security_score) * (6 - compliance_score)) STORED;

-- vendor_documents (8)
ALTER TABLE public.vendor_documents ADD COLUMN IF NOT EXISTS doc_type TEXT CHECK (doc_type IN ('dpa','soc2','iso27001','pentest_report','questionnaire','contract','other'));
ALTER TABLE public.vendor_documents ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.vendor_documents ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.vendor_documents ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.vendor_documents ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.vendor_documents ADD COLUMN IF NOT EXISTS uploaded_by UUID;
ALTER TABLE public.vendor_documents ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
ALTER TABLE public.vendor_documents ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE;

-- vendors (9)
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS data_classification TEXT NOT NULL DEFAULT 'confidential' CHECK (data_classification IN ('pii','phi','financial','confidential','public'));
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS dpa_signed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS iso27001_valid_until TIMESTAMPTZ;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS next_review_due TIMESTAMPTZ;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS offboarded_at TIMESTAMPTZ;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS soc2_valid_until TIMESTAMPTZ;

-- voice_sessions (9)
ALTER TABLE public.voice_sessions ADD COLUMN IF NOT EXISTS audio_in_seconds NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.voice_sessions ADD COLUMN IF NOT EXISTS audio_out_seconds NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.voice_sessions ADD COLUMN IF NOT EXISTS cost_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.voice_sessions ADD COLUMN IF NOT EXISTS duration_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.voice_sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.voice_sessions ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.voice_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.voice_sessions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','error'));
ALTER TABLE public.voice_sessions ADD COLUMN IF NOT EXISTS transcript JSONB NOT NULL DEFAULT '[]'::jsonb;

-- vulnerability_findings (7)
ALTER TABLE public.vulnerability_findings ADD COLUMN IF NOT EXISTS acknowledged_by UUID;
ALTER TABLE public.vulnerability_findings ADD COLUMN IF NOT EXISTS component_id UUID REFERENCES public.sbom_components(id) ON DELETE CASCADE;
ALTER TABLE public.vulnerability_findings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.vulnerability_findings ADD COLUMN IF NOT EXISTS reference_url TEXT;
ALTER TABLE public.vulnerability_findings ADD COLUMN IF NOT EXISTS resolved_by UUID;
ALTER TABLE public.vulnerability_findings ADD COLUMN IF NOT EXISTS snapshot_id UUID REFERENCES public.sbom_snapshots(id) ON DELETE CASCADE;
ALTER TABLE public.vulnerability_findings ADD COLUMN IF NOT EXISTS summary TEXT;

-- webhook_delivery_logs (10)
ALTER TABLE public.webhook_delivery_logs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.webhook_delivery_logs ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.webhook_delivery_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE public.webhook_delivery_logs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.webhook_delivery_logs ADD COLUMN IF NOT EXISTS event TEXT;
ALTER TABLE public.webhook_delivery_logs ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.webhook_delivery_logs ADD COLUMN IF NOT EXISTS response_body TEXT;
ALTER TABLE public.webhook_delivery_logs ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('delivered','failed'));
ALTER TABLE public.webhook_delivery_logs ADD COLUMN IF NOT EXISTS status_code INTEGER;
ALTER TABLE public.webhook_delivery_logs ADD COLUMN IF NOT EXISTS webhook_endpoint_id UUID REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE;

-- webhook_endpoints (1)
ALTER TABLE public.webhook_endpoints ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- whatsapp_webhook_events (12)
ALTER TABLE public.whatsapp_webhook_events ADD COLUMN IF NOT EXISTS body_preview text;
ALTER TABLE public.whatsapp_webhook_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.whatsapp_webhook_events ADD COLUMN IF NOT EXISTS from_phone text;
ALTER TABLE public.whatsapp_webhook_events ADD COLUMN IF NOT EXISTS message_id text;
ALTER TABLE public.whatsapp_webhook_events ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.whatsapp_webhook_events ADD COLUMN IF NOT EXISTS raw_payload jsonb;
ALTER TABLE public.whatsapp_webhook_events ADD COLUMN IF NOT EXISTS routed_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL;
ALTER TABLE public.whatsapp_webhook_events ADD COLUMN IF NOT EXISTS routing_error text;
ALTER TABLE public.whatsapp_webhook_events ADD COLUMN IF NOT EXISTS routing_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.whatsapp_webhook_events ADD COLUMN IF NOT EXISTS signature_valid boolean NOT NULL DEFAULT false;
ALTER TABLE public.whatsapp_webhook_events ADD COLUMN IF NOT EXISTS to_phone text;
ALTER TABLE public.whatsapp_webhook_events ADD COLUMN IF NOT EXISTS trace_id text;

-- workflow_runs (8)
ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0;
ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS output JSONB DEFAULT '{}';
ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled','timeout'));
ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS total_steps INTEGER DEFAULT 0;
ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE;

-- workflow_steps (5)
ALTER TABLE public.workflow_steps ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';
ALTER TABLE public.workflow_steps ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.workflow_steps ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'executor';
ALTER TABLE public.workflow_steps ADD COLUMN IF NOT EXISTS step_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.workflow_steps ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE;

-- workspace_budgets (6)
ALTER TABLE public.workspace_budgets ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.workspace_budgets ADD COLUMN IF NOT EXISTS daily_limit_usd NUMERIC(12,2);
ALTER TABLE public.workspace_budgets ADD COLUMN IF NOT EXISTS hard_stop BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.workspace_budgets ADD COLUMN IF NOT EXISTS monthly_limit_usd NUMERIC(12,2);
ALTER TABLE public.workspace_budgets ADD COLUMN IF NOT EXISTS notify_emails TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.workspace_budgets ADD COLUMN IF NOT EXISTS soft_threshold_pct INTEGER NOT NULL DEFAULT 80 CHECK (soft_threshold_pct BETWEEN 1 AND 100);


-- workspace_secrets (1)
ALTER TABLE public.workspace_secrets ADD COLUMN IF NOT EXISTS encrypted_value bytea;


CREATE SCHEMA IF NOT EXISTS internal;
GRANT USAGE ON SCHEMA internal TO service_role;

CREATE MATERIALIZED VIEW IF NOT EXISTS internal.agent_daily_metrics AS
SELECT
  agent_id,
  date_trunc('day', created_at) AS day,
  count(*)::bigint AS executions,
  count(*) FILTER (WHERE level = 'error')::bigint AS errors,
  avg(latency_ms)::numeric(12,2) AS avg_latency_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric(12,2) AS p95_latency_ms,
  sum(tokens_used)::bigint AS total_tokens,
  sum(cost_usd)::numeric(14,6) AS total_cost_usd
FROM public.agent_traces
WHERE created_at > (now() - interval '90 days')
GROUP BY agent_id, date_trunc('day', created_at);

CREATE UNIQUE INDEX IF NOT EXISTS agent_daily_metrics_pk
  ON internal.agent_daily_metrics (agent_id, day);
CREATE INDEX IF NOT EXISTS agent_daily_metrics_day_idx
  ON internal.agent_daily_metrics (day DESC);

GRANT SELECT ON internal.agent_daily_metrics TO service_role;

CREATE OR REPLACE VIEW public.agent_daily_metrics
WITH (security_invoker = true) AS
SELECT m.*
FROM internal.agent_daily_metrics m
WHERE EXISTS (
  SELECT 1
  FROM public.agents a
  WHERE a.id = m.agent_id
);

GRANT SELECT ON public.agent_daily_metrics TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_agent_daily_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY internal.agent_daily_metrics;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_agent_daily_metrics() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_agent_daily_metrics() TO service_role;

-- 3.2 custo por chamador ---------------------------------------------------
CREATE OR REPLACE VIEW public.llm_cost_by_caller AS
SELECT
  ur.workspace_id,
  COALESCE(NULLIF(ur.metadata->>'caller',''), 'external') AS caller,
  COALESCE(ur.metadata->>'provider', 'unknown') AS provider,
  COALESCE(ur.metadata->>'model', 'unknown') AS model,
  date_trunc('day', ur.created_at) AS day,
  COUNT(*) AS calls,
  SUM(ur.tokens)::bigint AS tokens,
  SUM(ur.cost_usd)::numeric(14,6) AS cost_usd
FROM public.usage_records ur
WHERE ur.record_type = 'llm_call'
GROUP BY 1,2,3,4,5;

GRANT SELECT ON public.llm_cost_by_caller TO authenticated;
GRANT SELECT ON public.llm_cost_by_caller TO service_role;

CREATE INDEX IF NOT EXISTS usage_records_caller_idx
  ON public.usage_records ((metadata->>'caller'))
  WHERE record_type = 'llm_call';

-- 3.3 saúde da fila de despacho do Slack -----------------------------------
CREATE OR REPLACE VIEW public.slack_dlq_stats
WITH (security_invoker = true) AS
SELECT
  workspace_id,
  COUNT(*) FILTER (WHERE resolved_at IS NULL AND attempts < 5) AS pending,
  COUNT(*) FILTER (WHERE resolved_at IS NULL AND attempts >= 5) AS dead,
  COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved,
  MAX(created_at) FILTER (WHERE resolved_at IS NULL) AS oldest_pending_at,
  MAX(attempts) FILTER (WHERE resolved_at IS NULL) AS max_attempts
FROM public.slack_dispatch_dlq
GROUP BY workspace_id;

GRANT SELECT ON public.slack_dlq_stats TO authenticated;
GRANT ALL ON public.slack_dlq_stats TO service_role;

-- 3.4 saude do despacho do Slack (corpo original de 20260722115006) ------
CREATE OR REPLACE VIEW public.slack_dispatch_health AS
SELECT
  workspace_id,
  COALESCE(SUM((metadata->>'successes')::int), 0)::bigint AS successes,
  COALESCE(SUM((metadata->>'failures')::int), 0)::bigint AS failures,
  COUNT(*)::bigint AS total_dispatches,
  MAX(created_at) AS last_dispatch_at
FROM public.audit_events
WHERE event_type = 'slack_integration'
  AND action = 'alert_dispatched'
  AND created_at > now() - INTERVAL '24 hours'
GROUP BY workspace_id;

GRANT SELECT ON public.slack_dispatch_health TO authenticated;
GRANT SELECT ON public.slack_dispatch_health TO service_role;

-- 3.4 membros do workspace com e-mail (PII protegida pela RLS da tabela) ----
CREATE OR REPLACE VIEW public.workspace_members_safe
WITH (security_invoker = true)
AS
SELECT
  wm.id, wm.workspace_id, wm.user_id, wm.role, wm.name,
  wm.invited_at, wm.accepted_at,
  wme.email
FROM public.workspace_members wm
LEFT JOIN public.workspace_member_emails wme
  ON wme.member_id = wm.id
 AND (wme.user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), wm.workspace_id))
WHERE wm.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()));

GRANT SELECT ON public.workspace_members_safe TO authenticated;

CREATE OR REPLACE VIEW public.workspace_members_directory
WITH (security_invoker = true)
AS
SELECT
  wm.id, wm.workspace_id, wm.user_id, wm.role, wm.name,
  wme.email,
  wm.accepted_at
FROM public.workspace_members wm
LEFT JOIN public.workspace_member_emails wme
  ON wme.member_id = wm.id
 AND (wme.user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), wm.workspace_id))
WHERE wm.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()));

GRANT SELECT ON public.workspace_members_directory TO authenticated;


-- ============================================================================
-- 4) Views que existem em producao como CASCA de uma coluna (`SELECT id ...`)
--    As 9 relacoes abaixo sao views, nao tabelas: o gerador da secao 2 tentou
--    ALTER TABLE nelas e o Supabase Preview abortou com 42809
--    ("ADD COLUMN cannot be performed on relation ... this operation is not
--    supported for views"). Aqui a definicao canonica do repo volta a valer.
--    CREATE OR REPLACE preserva grants e dependentes (mesma tecnica da #163).
--    As views safe do forum trazem o filtro `WHERE is_published` da #163, para
--    que rascunho nao volte a aparecer na lista publica nem por esquecimento
--    de um .eq() no cliente.
-- ============================================================================

CREATE OR REPLACE VIEW public.forum_threads_public
  WITH (security_invoker = true) AS
  SELECT id, help_center_id, title, body, category, author_name,
         is_pinned, is_locked, is_resolved, view_count, reply_count,
         upvotes, last_activity_at, created_at
  FROM public.forum_threads;

CREATE OR REPLACE VIEW public.forum_posts_public
  WITH (security_invoker = true) AS
  SELECT id, thread_id, parent_post_id, body, author_name,
         is_answer, upvotes, created_at, updated_at
  FROM public.forum_posts;

CREATE OR REPLACE VIEW public.forum_threads_safe
  WITH (security_invoker = true) AS
  SELECT id, help_center_id, author_id,
         CASE WHEN author_name ~* '@' THEN 'Membro' ELSE author_name END AS author_name,
         title, body, category, is_pinned, is_locked, is_resolved,
         view_count, reply_count, upvotes, last_activity_at, created_at
  FROM public.forum_threads
  WHERE is_published;

CREATE OR REPLACE VIEW public.forum_posts_safe
  WITH (security_invoker = true) AS
  SELECT id, thread_id, author_id,
         CASE WHEN author_name ~* '@' THEN 'Membro' ELSE author_name END AS author_name,
         body, is_answer, upvotes, parent_post_id, created_at, updated_at
  FROM public.forum_posts
  WHERE is_published;

CREATE OR REPLACE VIEW public.workspace_members_public
  WITH (security_invoker = true) AS
  SELECT id, workspace_id, user_id, role, name
  FROM public.workspace_members;

CREATE OR REPLACE VIEW public.usage_records_cost_safe
  WITH (security_invoker = true) AS
  SELECT
    ur.id,
    ur.workspace_id,
    ur.agent_id,
    ur.record_type,
    ur.tokens,
    ur.created_at,
    CASE
      WHEN public.is_workspace_admin(auth.uid(), ur.workspace_id) THEN ur.cost_usd
      ELSE NULL
    END AS cost_usd,
    CASE
      WHEN public.is_workspace_admin(auth.uid(), ur.workspace_id) THEN ur.metadata
      ELSE '{}'::jsonb
    END AS metadata
  FROM public.usage_records ur;

CREATE OR REPLACE VIEW public.skill_registry_safe
  WITH (security_invoker = true) AS
  SELECT
    sr.id, sr.name, sr.slug, sr.description, sr.category, sr.author,
    sr.version, sr.tags, sr.install_count, sr.rating, sr.skill_config,
    sr.is_verified, sr.is_public, sr.created_by, sr.created_at, sr.updated_at,
    CASE
      WHEN sr.created_by = auth.uid() THEN sr.mcp_server_url
      ELSE NULL
    END AS mcp_server_url
  FROM public.skill_registry sr;

CREATE OR REPLACE VIEW public.oncall_schedule_safe
  WITH (security_invoker = true) AS
  SELECT
    os.id, os.workspace_id, os.user_id, os.user_name,
    os.starts_at, os.ends_at, os.escalation_order, os.notes,
    os.created_by, os.created_at,
    oce.user_email
  FROM public.oncall_schedule os
  LEFT JOIN public.oncall_schedule_emails oce
    ON oce.schedule_id = os.id
   AND (oce.user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), os.workspace_id))
  WHERE os.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()));

GRANT SELECT ON public.forum_threads_public TO authenticated, anon;
GRANT SELECT ON public.forum_posts_public   TO authenticated, anon;
GRANT SELECT ON public.forum_threads_safe   TO authenticated, anon;
GRANT SELECT ON public.forum_posts_safe     TO authenticated, anon;
GRANT SELECT ON public.workspace_members_public TO authenticated;
GRANT SELECT ON public.usage_records_cost_safe  TO authenticated;
GRANT SELECT ON public.skill_registry_safe      TO authenticated;
GRANT SELECT ON public.oncall_schedule_safe     TO authenticated;
