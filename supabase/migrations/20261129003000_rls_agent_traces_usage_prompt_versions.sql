-- `agent_traces`, `agent_usage` e `prompt_versions` nasceram como stubs
-- (20260330000001_schema_baseline.sql:27-48, só `id` e poucas colunas) e nunca
-- receberam ENABLE ROW LEVEL SECURITY nem uma única CREATE POLICY — a varredura
-- das 236 tabelas das migrations encontrou exatamente essas três sem RLS e sem
-- policy.
--
-- As colunas reais vêm das migrations seguintes, e é delas que sai a chave de
-- isolamento:
--   agent_traces    → agent_id, session_id, event, level, latency_ms, created_at
--   agent_usage     → agent_id, user_id, date
--   prompt_versions → agent_id, version, content...
--
-- Tabela sem RLS no schema `public` é alcançável por qualquer requisição
-- PostgREST com a anon key: sem policy, `authenticated` lê a base inteira,
-- de todos os workspaces. O app lê essas três por `supabaseExternal`
-- (src/components/agents/versioning/RunFilter.tsx:74, src/services/dashboardService.ts:57,121,
-- src/services/billingService.ts:98), que cai no Lovable Cloud DB quando
-- VITE_EXTERNAL_SUPABASE_URL não está definida
-- (src/integrations/supabase/externalClient.ts:25-32) — ou seja, produção.
--
-- As policies espelham o modelo do repo: dono por `user_id`/`auth.uid()`,
-- administração por `is_workspace_admin(auth.uid(), agents.workspace_id)`.
-- `agent_traces` não tem `user_id`: o dono é resolvido pelo agente.

ALTER TABLE IF EXISTS public.agent_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prompt_versions ENABLE ROW LEVEL SECURITY;

-- ─── agent_traces ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Dono le as proprias traces" ON public.agent_traces;
CREATE POLICY "Dono le as proprias traces" ON public.agent_traces
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
       WHERE a.id = agent_traces.agent_id
         AND a.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admin do workspace le as traces" ON public.agent_traces;
CREATE POLICY "Admin do workspace le as traces" ON public.agent_traces
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
       WHERE a.id = agent_traces.agent_id
         AND public.is_workspace_admin((SELECT auth.uid()), a.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Dono insere traces dos proprios agentes" ON public.agent_traces;
CREATE POLICY "Dono insere traces dos proprios agentes" ON public.agent_traces
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agents a
       WHERE a.id = agent_traces.agent_id
         AND a.user_id = (SELECT auth.uid())
    )
  );

-- ─── agent_usage ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Usuario le o proprio uso" ON public.agent_usage;
CREATE POLICY "Usuario le o proprio uso" ON public.agent_usage
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admin do workspace le o uso" ON public.agent_usage;
CREATE POLICY "Admin do workspace le o uso" ON public.agent_usage
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
       WHERE a.id = agent_usage.agent_id
         AND public.is_workspace_admin((SELECT auth.uid()), a.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Usuario registra o proprio uso" ON public.agent_usage;
CREATE POLICY "Usuario registra o proprio uso" ON public.agent_usage
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ─── prompt_versions ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Dono le as versoes dos proprios agentes" ON public.prompt_versions;
CREATE POLICY "Dono le as versoes dos proprios agentes" ON public.prompt_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
       WHERE a.id = prompt_versions.agent_id
         AND a.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admin do workspace le as versoes" ON public.prompt_versions;
CREATE POLICY "Admin do workspace le as versoes" ON public.prompt_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
       WHERE a.id = prompt_versions.agent_id
         AND public.is_workspace_admin((SELECT auth.uid()), a.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Dono grava versoes dos proprios agentes" ON public.prompt_versions;
CREATE POLICY "Dono grava versoes dos proprios agentes" ON public.prompt_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agents a
       WHERE a.id = prompt_versions.agent_id
         AND a.user_id = (SELECT auth.uid())
    )
  );
