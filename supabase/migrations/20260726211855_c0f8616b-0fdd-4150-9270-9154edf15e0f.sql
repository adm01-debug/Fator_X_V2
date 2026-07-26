-- Rotinas de manutenção acionadas exclusivamente por pg_cron / service_role.
-- Estavam com EXECUTE para authenticated por herança do default do schema,
-- não por decisão: nenhuma tela do produto chama qualquer uma delas.
--
-- Risco concreto que isto fecha:
--  - dispatch_security_alert_to_slack: qualquer usuário logado podia disparar
--    notificações à equipe de segurança em laço (ruído / fadiga de alerta).
--  - prune_*: podiam apagar histórico de performance antes da retenção.
--  - sample_*/check_bloat_and_alert: escrita de métricas falsas, corrompendo
--    as linhas de base usadas na detecção de regressão.
REVOKE ALL ON FUNCTION internal.check_bloat_and_alert()            FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION internal.dispatch_security_alert_to_slack() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION internal.prune_perf_snapshots()             FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION internal.prune_wal_snapshots()              FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION internal.sample_rollback_stats()            FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION internal.sample_wal_stats()                 FROM public, anon, authenticated;

-- Impede que a próxima função criada em `internal` repita o problema.
ALTER DEFAULT PRIVILEGES IN SCHEMA internal REVOKE EXECUTE ON FUNCTIONS FROM public;