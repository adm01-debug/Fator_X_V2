-- ============================================================================
-- Fecha a heranca de PUBLIC nas rotinas de sistema (cron, LGPD, experimental).
--
-- Todas as funcoes abaixo nasceram em public, e pg_default_acl concede
-- EXECUTE a PUBLIC em toda funcao criada no schema. Receberam GRANT ... TO
-- service_role em migrations posteriores, mas GRANT nao remove a heranca de
-- PUBLIC — continuaram executaveis por qualquer usuario autenticado
-- (inclusive anon).
--
-- cleanup_auth_attempts() — o caso mais grave: faz DELETE sem WHERE de usuario
--   em public.auth_attempts (>90 dias), public.account_lockouts e
--   public.ip_rate_limits. Chamavel por authenticated, apagava a evidencia de
--   auditoria de login de TODOS os usuarios. E uma rotina de cron
--   (lgpd-cleanup-auth-attempts, 20260724000013_lgpd_cron_jobs.sql:267).
--
-- lgpd_apply_retention_policies() / lgpd_send_review_reminders() /
-- lgpd_check_sar_deadlines() — cron LGPD (linhas 261, 263, 265 do mesmo
--   arquivo). Apagam/anonimizam dados conforme politica.
--
-- run_prune_traces_retention_monitored(int) / check_retention_job_health() —
--   rotinas de cron; agendadas em 20261129002000_agendar_retencao_traces.sql.
--
-- compute_cost_baselines() / detect_cost_anomalies() — varrem agent_traces de
--   TODOS os workspaces. Ver 20261129010000 (escopo por chamador).
--
-- compute_experiment_stats(p_experiment_id) — agrega todas as sessoes de um
--   experimento A/B, sem checar vinculo do chamador com o experimento.
--
-- assign_variant(p_experiment_id, p_session_key) — escreve a atribuicao de
--   variante na sessao informada; aceita session_key arbitraria. Mantida
--   para authenticated (e o fluxo de experimentos), fechada para PUBLIC/anon.
--
-- Nenhum desses nomes tem chamador no front (src/) nem em supabase/functions:
-- rodam por cron ou por operacao.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.cleanup_auth_attempts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_auth_attempts() TO service_role;

REVOKE EXECUTE ON FUNCTION public.lgpd_apply_retention_policies() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lgpd_apply_retention_policies() TO service_role;

REVOKE EXECUTE ON FUNCTION public.lgpd_send_review_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lgpd_send_review_reminders() TO service_role;

REVOKE EXECUTE ON FUNCTION public.lgpd_check_sar_deadlines() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lgpd_check_sar_deadlines() TO service_role;

REVOKE EXECUTE ON FUNCTION public.run_prune_traces_retention_monitored(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_prune_traces_retention_monitored(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_retention_job_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_retention_job_health() TO service_role;

REVOKE EXECUTE ON FUNCTION public.compute_cost_baselines() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_cost_baselines() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.detect_cost_anomalies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detect_cost_anomalies() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.compute_experiment_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_experiment_stats(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.assign_variant(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_variant(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.cleanup_auth_attempts() IS
  'Expurgo LGPD de auth_attempts (90d), account_lockouts e ip_rate_limits. Rotina de cron; somente service_role.';