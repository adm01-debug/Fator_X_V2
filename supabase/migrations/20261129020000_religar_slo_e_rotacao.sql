-- ============================================================
-- Religar telas de SLO e Rotação de Segredos
-- ============================================================
-- 1. `get_slo_summary`: auto-escopada (filtra `user_id = auth.uid()`,
--    exige sessão) e por isso segura para `authenticated`. O hotfix
--    20260905140000 a restringiu a `service_role` por precaução, o que
--    deixou o SLODashboard quebrado em produção (a RPC lança
--    "permission denied"), sem ganho de segurança — o corpo já não
--    expõe dado de outro usuário.
--
-- 2. `refresh_secrets_status`: NÃO deve ser regrantada. Ela varre
--    `managed_secrets` de TODOS os workspaces; o revoke foi correto.
--    A tela passa a usar `get_secrets_status_summary(workspace_id)`,
--    que já existia, é escopada por workspace, valida membership via
--    `get_user_workspace_ids` e já tem GRANT para `authenticated`.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.get_slo_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_slo_summary(integer) TO authenticated;

COMMENT ON FUNCTION public.get_slo_summary(integer) IS
  'Resumo de SLO do próprio usuário (filtra user_id = auth.uid()). Executável por authenticated; anon revogado.';