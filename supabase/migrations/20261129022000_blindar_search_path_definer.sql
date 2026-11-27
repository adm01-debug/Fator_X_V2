-- ============================================================================
-- 1) Fecha o vetor de escalacao de privilegio nas funcoes SECURITY DEFINER
--    que rodavam sem `search_path` fixo.
--
-- Evidencia (catalogo real de producao, 2026-11-27):
--   as 3 funcoes abaixo estavam com proconfig = NULL e ACL
--   `postgres=X | authenticated=X | service_role=X`.
--
--   Risco concreto em create_partition_if_not_exists(text, timestamptz):
--   e SECURITY DEFINER, recebe nome de tabela e monta `CREATE TABLE %I ...`
--   via EXECUTE, sem search_path fixo. Qualquer usuario `authenticated`
--   (logo, qualquer conta logada) podia executa-la apontando para um objeto
--   em outro schema com o privilegio do owner -- o mesmo padrao de escalacao
--   documentado nos advisories de SECURITY DEFINER sem search_path.
--
--   update_budget_on_usage e check_budget_alert so disparam por TRIGGER em
--   `budgets`, mas blindar as tres custa zero e elimina o risco residual
--   caso alguem ligue o EXECUTE a anon no futuro.
--
-- Idempotente: ALTER FUNCTION ... SET search_path apenas grava proconfig.
-- Os corpos nao sao reescritos, portanto nenhum comportamento muda.
-- ============================================================================

ALTER FUNCTION public.update_budget_on_usage()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.check_budget_alert()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.create_partition_if_not_exists(text, timestamptz)
  SET search_path = public, pg_temp;

-- create_partition_if_not_exists e chamada apenas por trg_auto_partition(),
-- que roda como trigger das tabelas particionadas -- nunca pelo front.
-- Fechar o EXECUTE para authenticated remove a superficie de ataque sem
-- quebrar nenhum consumidor (verificado: zero chamadas em src/ e functions/).
REVOKE EXECUTE ON FUNCTION public.create_partition_if_not_exists(text, timestamptz)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.create_partition_if_not_exists(text, timestamptz) IS
  'DDL utilitario: cria a particao mensal se nao existir. SECURITY DEFINER so '
  'para trigger (trg_auto_partition); executavel apenas por service_role.';
