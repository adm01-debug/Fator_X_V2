-- Três views de leitura operacional foram criadas SEM `security_invoker`, então
-- executam com os privilégios do dono e IGNORAM a RLS das tabelas de origem.
-- Como todas concedem SELECT a `authenticated`, qualquer usuário logado de
-- qualquer workspace lê os dados agregados de TODOS os workspaces:
--
--   llm_cost_by_caller   → custo, tokens, provedor e modelo de LLM por workspace
--                          (20261126220000_align_prod_objetos_ausentes.sql:1913-1927)
--   slack_dispatch_health→ sucessos, falhas e último disparo do Slack por workspace
--                          (20261126220000_align_prod_objetos_ausentes.sql:1951-1962)
--   knowledge_graph_health_v → filtra por `workspace_members` na mão, mas continua
--                          rodando como dono; a checagem de membership fica sendo a
--                          única barreira (20261127000000_recuperar_objetos_internos.sql:91)
--
-- `audit_log_safe` já foi corrigida para `security_invoker = true` em
-- 20260405153812_aa5c7334-67eb-490b-bb5e-bbcb233ff9f7.sql:5-6 — essas três
-- ficaram de fora.
--
-- Além do `security_invoker`, cada view ganha o filtro explícito de workspace,
-- para que a leitura dependa de RLS E de membership: se uma tabela de origem
-- ganhar uma policy permissiva no futuro, a view continua fechada.

-- ─── llm_cost_by_caller ──────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.llm_cost_by_caller;
CREATE VIEW public.llm_cost_by_caller
WITH (security_invoker = true) AS
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
  AND ur.workspace_id IN (
    SELECT wm.workspace_id FROM public.workspace_members wm
     WHERE wm.user_id = (SELECT auth.uid())
  )
GROUP BY 1,2,3,4,5;

GRANT SELECT ON public.llm_cost_by_caller TO authenticated;
GRANT SELECT ON public.llm_cost_by_caller TO service_role;

-- ─── slack_dispatch_health ───────────────────────────────────────────────────
DROP VIEW IF EXISTS public.slack_dispatch_health;
CREATE VIEW public.slack_dispatch_health
WITH (security_invoker = true) AS
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
  AND workspace_id IN (
    SELECT wm.workspace_id FROM public.workspace_members wm
     WHERE wm.user_id = (SELECT auth.uid())
  )
GROUP BY workspace_id;

GRANT SELECT ON public.slack_dispatch_health TO authenticated;
GRANT SELECT ON public.slack_dispatch_health TO service_role;

-- ─── knowledge_graph_health_v ────────────────────────────────────────────────
DROP VIEW IF EXISTS public.knowledge_graph_health_v;
CREATE VIEW public.knowledge_graph_health_v
WITH (security_invoker = true) AS
SELECT h.*
  FROM public.knowledge_graph_health h
 WHERE EXISTS (
   SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = h.workspace_id
      AND wm.user_id = (SELECT auth.uid())
 );

GRANT SELECT ON public.knowledge_graph_health_v TO authenticated;
