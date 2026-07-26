-- Reivindicação atômica da fila de cadências.
--
-- Por que uma função e não um SELECT + UPDATE do lado da aplicação: entre as
-- duas instruções existe uma janela em que outro worker (ou uma segunda
-- execução do cron que se sobrepôs) lê a mesma linha e envia a mensagem de
-- novo. FOR UPDATE SKIP LOCKED elimina a janela: cada linha é entregue a
-- exatamente um chamador, e concorrentes pulam o que já está travado em vez de
-- ficarem bloqueados.
--
-- O avanço de next_run_at para um "lease" curto garante que, se o worker morrer
-- no meio, a inscrição volta à fila sozinha em vez de ficar presa.
CREATE OR REPLACE FUNCTION public.claim_due_cadence_enrollments(
  p_limit INTEGER DEFAULT 50,
  p_lease_minutes INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  workspace_id UUID,
  cadence_id UUID,
  deal_id UUID,
  contact_id UUID,
  current_step INTEGER,
  attempts INTEGER
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT e.id
    FROM public.crm_cadence_enrollments e
    JOIN public.crm_cadences c ON c.id = e.cadence_id
    WHERE e.status = 'active'
      AND e.next_run_at <= now()
      AND c.is_active
      AND c.deleted_at IS NULL
    ORDER BY e.next_run_at
    LIMIT GREATEST(p_limit, 0)
    FOR UPDATE OF e SKIP LOCKED
  )
  UPDATE public.crm_cadence_enrollments AS e
  SET next_run_at = now() + make_interval(mins => GREATEST(p_lease_minutes, 1)),
      attempts = e.attempts + 1
  FROM due
  WHERE e.id = due.id
  RETURNING e.id, e.workspace_id, e.cadence_id, e.deal_id, e.contact_id,
            e.current_step, e.attempts;
END;
$$;

-- Fila é infraestrutura: apenas a execução automática pode reivindicar trabalho.
REVOKE ALL ON FUNCTION public.claim_due_cadence_enrollments(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_cadence_enrollments(INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_due_cadence_enrollments(INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_cadence_enrollments(INTEGER, INTEGER) TO service_role;