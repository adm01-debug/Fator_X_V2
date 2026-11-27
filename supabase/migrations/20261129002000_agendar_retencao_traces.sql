-- `run_prune_traces_retention_monitored` grava histórico em retention_job_runs,
-- gera security_alert em falha e é vigiada por `check_retention_job_health`
-- (que alerta após 26h sem sucesso). Faltava o único elo: ninguém a agendava,
-- então a retenção de traces nunca rodou e o watchdog alertaria para sempre.
-- `purge-template-skill-links-daily` já era agendado desde
-- 20260727222828…sql:78-95; este é o par que faltava.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-traces-retention-daily') THEN
      PERFORM cron.unschedule('prune-traces-retention-daily');
    END IF;
    PERFORM cron.schedule(
      'prune-traces-retention-daily',
      '10 3 * * *',
      'SELECT public.run_prune_traces_retention_monitored(90);'
    );

    -- O watchdog só faz sentido se também for chamado; sem isso o alerta de
    -- "retenção atrasada" nunca é produzido.
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention-job-health-watchdog') THEN
      PERFORM cron.unschedule('retention-job-health-watchdog');
    END IF;
    PERFORM cron.schedule(
      'retention-job-health-watchdog',
      '40 * * * *',
      'SELECT public.check_retention_job_health();'
    );
  END IF;
END;
$$;

-- `cleanup_old_auth_attempts` (20260401000004…sql:232) é a duplicata antiga de
-- `cleanup_auth_attempts`: apaga `auth_attempts` com mais de **30 dias**, o
-- que contraria a política LGPD vigente de **90 dias** (20260724000011…sql:259-264,
-- a que roda no cron `lgpd-cleanup-auth-attempts`). Nenhum objeto, edge ou
-- código do app a chama; só a `service_role` tem EXECUTE. Manter uma rotina de
-- expurgo de PII com prazo errado ao alcance de qualquer script é risco sem
-- contrapartida, então ela sai.
DROP FUNCTION IF EXISTS public.cleanup_old_auth_attempts();
