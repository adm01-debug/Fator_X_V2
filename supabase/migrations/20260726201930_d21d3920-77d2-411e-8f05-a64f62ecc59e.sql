-- ═══════════════════════════════════════════════════════════════
-- Fase 4 — Cadências de vendas
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE public.crm_cadences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  -- Faixa de lead que dispara a inscrição automática. NULL = somente manual.
  trigger_tier TEXT CHECK (trigger_tier IN ('hot','qualified','nurture','cold')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  -- Teto de envios por dia: protege reputação de domínio e custo.
  daily_send_cap INTEGER NOT NULL DEFAULT 100 CHECK (daily_send_cap >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_cadences TO authenticated;
GRANT ALL ON public.crm_cadences TO service_role;
ALTER TABLE public.crm_cadences ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão das demais tabelas de CRM: helper SECURITY DEFINER já existente.
CREATE POLICY "crm_cadences_member_access" ON public.crm_cadences FOR ALL TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))));

CREATE INDEX idx_crm_cadences_workspace ON public.crm_cadences (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_crm_cadences_trigger ON public.crm_cadences (workspace_id, trigger_tier)
  WHERE is_active AND deleted_at IS NULL;

CREATE TRIGGER trg_crm_cadences_updated_at
  BEFORE UPDATE ON public.crm_cadences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ───────────────────────────────────────────────────────────────

CREATE TABLE public.crm_cadence_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  cadence_id UUID NOT NULL REFERENCES public.crm_cadences(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp','slack','task')),
  -- Atraso a partir da conclusão do passo anterior (ou da inscrição, no passo 0).
  delay_hours INTEGER NOT NULL DEFAULT 24 CHECK (delay_hours >= 0),
  subject TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cadence_id, position)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_cadence_steps TO authenticated;
GRANT ALL ON public.crm_cadence_steps TO service_role;
ALTER TABLE public.crm_cadence_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_cadence_steps_member_access" ON public.crm_cadence_steps FOR ALL TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))));

CREATE INDEX idx_crm_cadence_steps_cadence ON public.crm_cadence_steps (cadence_id, position);
CREATE INDEX idx_crm_cadence_steps_workspace ON public.crm_cadence_steps (workspace_id);

CREATE TRIGGER trg_crm_cadence_steps_updated_at
  BEFORE UPDATE ON public.crm_cadence_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ───────────────────────────────────────────────────────────────

CREATE TABLE public.crm_cadence_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  cadence_id UUID NOT NULL REFERENCES public.crm_cadences(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','stopped','failed')),
  current_step INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  last_sent_at TIMESTAMPTZ,
  stop_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_cadence_enrollments TO authenticated;
GRANT ALL ON public.crm_cadence_enrollments TO service_role;
ALTER TABLE public.crm_cadence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_cadence_enrollments_member_access" ON public.crm_cadence_enrollments FOR ALL TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids((SELECT auth.uid()))));

-- Um negócio só pode ter UMA inscrição ativa por cadência; históricas são livres.
CREATE UNIQUE INDEX idx_crm_enrollments_unique_active
  ON public.crm_cadence_enrollments (cadence_id, deal_id)
  WHERE status = 'active';

-- Fila do runner: varredura por (status, next_run_at) é o caminho quente.
CREATE INDEX idx_crm_enrollments_due
  ON public.crm_cadence_enrollments (next_run_at)
  WHERE status = 'active';

CREATE INDEX idx_crm_enrollments_workspace ON public.crm_cadence_enrollments (workspace_id, status);
CREATE INDEX idx_crm_enrollments_deal ON public.crm_cadence_enrollments (deal_id);
CREATE INDEX idx_crm_enrollments_contact ON public.crm_cadence_enrollments (contact_id);

CREATE TRIGGER trg_crm_cadence_enrollments_updated_at
  BEFORE UPDATE ON public.crm_cadence_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();