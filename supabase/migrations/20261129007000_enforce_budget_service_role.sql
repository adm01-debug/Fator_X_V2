-- ============================================================================
-- enforce_budget: restringe a execucao a service_role.
--
-- Causa: enforce_budget() (20261126230000_recuperar_funcoes_e_triggers.sql:899)
-- e SECURITY DEFINER e itera sobre TODOS os registros de workspace_budgets,
-- gravando em budget_events e atualizando public.agents de cada workspace
-- (status='paused' quando o limite duro estoura). Ela nao recebe parametro
-- nenhum e nao tem guarda de admin — quem pode chamar decide o que ela toca.
--
-- Como toda funcao de public nasce executavel por PUBLIC (pg_default_acl), a
-- RPC estava aberta a qualquer usuario autenticado: um clique forcava o ciclo
-- de enforcement de budget de todos os tenants e pausava agentes alheios.
-- As funcoes irmas do mesmo arquivo ja sao protegidas:
--   - check_budget          -> guarda de escopo (20261129006000)
--   - reset_workspace_budget -> is_workspace_admin(auth.uid(), p_workspace_id)
--
-- Nao existe cron.schedule chamando enforce_budget e o unico chamador no app,
-- src/services/budgetService.ts:114 (enforceBudget), nao tem uso na UI.
-- A rotina continua disponivel para operacao via service_role.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.enforce_budget() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_budget() TO service_role;

COMMENT ON FUNCTION public.enforce_budget() IS
  'Ciclo de enforcement de budget de todos os workspaces (grava budget_events e pausa agentes). Somente service_role.';