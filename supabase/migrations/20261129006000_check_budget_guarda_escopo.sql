-- ============================================================================
-- check_budget: adiciona a guarda de escopo que a funcao irma ja tem.
--
-- Causa: check_budget(p_workspace_id UUID) e STABLE SECURITY DEFINER e recebe o
-- workspace como parametro, mas nao valida se o chamador pertence a ele
-- (20261126230000_recuperar_funcoes_e_triggers.sql:838). A irma
-- get_current_spend, definida 25 linhas acima (mesmo arquivo, linha 813), faz:
--   IF NOT (p_workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))
--     THEN RAISE EXCEPTION 'forbidden'; END IF;
-- Como SECURITY DEFINER ignora a RLS de workspace_budgets e agent_traces, a
-- ausencia da guarda devolve gasto mensal/diario, limite, hard_stop e
-- soft_threshold_pct de QUALQUER workspace para qualquer usuario autenticado.
--
-- Chamadores legitimos:
--   - src/services/budgetService.ts:83  -> authenticated, com JWT do usuario
--   - supabase/functions/llm-gateway/index.ts:267 -> service_role
-- service_role nao tem request.jwt.claim.sub, entao auth.uid() e NULL; a guarda
-- e pulada nesse caso para nao quebrar o enforcement de budget do gateway.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_budget(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_budget public.workspace_budgets%ROWTYPE;
  v_monthly_spend NUMERIC := 0;
  v_daily_spend NUMERIC := 0;
  v_monthly_pct NUMERIC := 0;
  v_daily_pct NUMERIC := 0;
  v_allowed BOOLEAN := true;
  v_reason TEXT := NULL;
  v_warning BOOLEAN := false;
BEGIN
  -- Escopo: usuario autenticado so consulta workspace do qual e membro.
  -- service_role (auth.uid() NULL) segue sem restricao — e o caller do gateway.
  IF auth.uid() IS NOT NULL
     AND p_workspace_id NOT IN (SELECT public.get_user_workspace_ids(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_budget FROM public.workspace_budgets WHERE workspace_id = p_workspace_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'configured', false);
  END IF;

  SELECT COALESCE(SUM(t.cost_usd), 0) INTO v_monthly_spend
    FROM public.agent_traces t JOIN public.agents a ON a.id = t.agent_id
    WHERE a.workspace_id = p_workspace_id AND t.created_at >= date_trunc('month', now()) AND t.cost_usd IS NOT NULL;
  SELECT COALESCE(SUM(t.cost_usd), 0) INTO v_daily_spend
    FROM public.agent_traces t JOIN public.agents a ON a.id = t.agent_id
    WHERE a.workspace_id = p_workspace_id AND t.created_at >= date_trunc('day', now()) AND t.cost_usd IS NOT NULL;

  IF v_budget.monthly_limit_usd IS NOT NULL AND v_budget.monthly_limit_usd > 0 THEN
    v_monthly_pct := ROUND((v_monthly_spend / v_budget.monthly_limit_usd) * 100, 2);
  END IF;
  IF v_budget.daily_limit_usd IS NOT NULL AND v_budget.daily_limit_usd > 0 THEN
    v_daily_pct := ROUND((v_daily_spend / v_budget.daily_limit_usd) * 100, 2);
  END IF;

  IF v_budget.hard_stop THEN
    IF v_budget.monthly_limit_usd IS NOT NULL AND v_monthly_spend >= v_budget.monthly_limit_usd THEN
      v_allowed := false; v_reason := 'monthly_limit_exceeded';
    ELSIF v_budget.daily_limit_usd IS NOT NULL AND v_daily_spend >= v_budget.daily_limit_usd THEN
      v_allowed := false; v_reason := 'daily_limit_exceeded';
    END IF;
  END IF;

  IF v_monthly_pct >= v_budget.soft_threshold_pct OR v_daily_pct >= v_budget.soft_threshold_pct THEN
    v_warning := true;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'configured', true,
    'reason', v_reason,
    'warning', v_warning,
    'hard_stop', v_budget.hard_stop,
    'monthly_spend', v_monthly_spend,
    'monthly_limit', v_budget.monthly_limit_usd,
    'monthly_pct', v_monthly_pct,
    'daily_spend', v_daily_spend,
    'daily_limit', v_budget.daily_limit_usd,
    'daily_pct', v_daily_pct,
    'soft_threshold_pct', v_budget.soft_threshold_pct
  );
END;
$$;

COMMENT ON FUNCTION public.check_budget(uuid) IS
  'Status de budget do workspace. SECURITY DEFINER com guarda de escopo via get_user_workspace_ids(auth.uid()); service_role (auth.uid() NULL) passa sem restricao.';