CREATE TABLE IF NOT EXISTS public.crm_cadence_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  triggered_by  TEXT NOT NULL DEFAULT 'cron' CHECK (triggered_by IN ('cron', 'manual')),
  dry_run       BOOLEAN NOT NULL DEFAULT false,
  claimed       INTEGER NOT NULL DEFAULT 0,
  sent          INTEGER NOT NULL DEFAULT 0,
  completed     INTEGER NOT NULL DEFAULT 0,
  stopped       INTEGER NOT NULL DEFAULT 0,
  failed        INTEGER NOT NULL DEFAULT 0,
  skipped       INTEGER NOT NULL DEFAULT 0,
  capped        INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sem grant de INSERT/UPDATE para usuários: só o runner (service_role) escreve.
-- Deixar o cliente escrever aqui permitiria forjar histórico de auditoria.
GRANT SELECT ON public.crm_cadence_runs TO authenticated;
GRANT ALL ON public.crm_cadence_runs TO service_role;

ALTER TABLE public.crm_cadence_runs ENABLE ROW LEVEL SECURITY;

-- workspace_id NULL = rodada global do cron: não pertence a ninguém, então
-- fica restrita a admins em vez de vazar para todo usuário autenticado.
CREATE POLICY "Membros veem execuções do seu workspace"
ON public.crm_cadence_runs
FOR SELECT
TO authenticated
USING (
  (workspace_id IS NOT NULL AND workspace_id IN (
     SELECT public.get_user_workspace_ids((SELECT auth.uid()))
   ))
  OR (workspace_id IS NULL AND public.is_workspace_admin((SELECT auth.uid())))
);

CREATE INDEX IF NOT EXISTS idx_crm_cadence_runs_ws_created
  ON public.crm_cadence_runs (workspace_id, created_at DESC);