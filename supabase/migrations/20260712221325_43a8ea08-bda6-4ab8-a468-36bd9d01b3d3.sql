
-- Cleanup automático de sessões órfãs (voice_sessions, browser_sessions)
-- Regras:
--   * Sessões 'running'/'in_progress' sem heartbeat há > 30 min => marcadas 'timeout' com error_message
--   * Sessões 'completed'/'failed'/'timeout' com > 90 dias => arquivadas (deletadas de hot storage)

CREATE OR REPLACE FUNCTION internal.cleanup_orphan_sessions()
RETURNS TABLE(kind text, action text, affected int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
DECLARE
  v_browser_timeout int := 0;
  v_voice_timeout int := 0;
  v_browser_purged int := 0;
  v_voice_purged int := 0;
BEGIN
  -- Browser: timeout de sessões travadas
  WITH updated AS (
    UPDATE public.browser_sessions
       SET status = 'timeout',
           ended_at = now(),
           error_message = COALESCE(error_message, 'auto-timeout: no updates for >30min')
     WHERE status IN ('running','in_progress','pending')
       AND started_at < now() - interval '30 minutes'
       AND ended_at IS NULL
     RETURNING 1
  ) SELECT count(*) INTO v_browser_timeout FROM updated;

  -- Voice: timeout de sessões travadas
  WITH updated AS (
    UPDATE public.voice_sessions
       SET status = 'timeout',
           ended_at = now(),
           metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('auto_timeout', true, 'timeout_reason','no updates for >30min')
     WHERE status IN ('running','in_progress','pending','active')
       AND started_at < now() - interval '30 minutes'
       AND ended_at IS NULL
     RETURNING 1
  ) SELECT count(*) INTO v_voice_timeout FROM updated;

  -- Purge histórico > 90 dias
  WITH del AS (
    DELETE FROM public.browser_sessions
     WHERE status IN ('completed','failed','timeout','cancelled')
       AND COALESCE(ended_at, started_at, created_at) < now() - interval '90 days'
     RETURNING 1
  ) SELECT count(*) INTO v_browser_purged FROM del;

  WITH del AS (
    DELETE FROM public.voice_sessions
     WHERE status IN ('completed','failed','timeout','cancelled')
       AND COALESCE(ended_at, started_at, created_at) < now() - interval '90 days'
     RETURNING 1
  ) SELECT count(*) INTO v_voice_purged FROM del;

  RETURN QUERY VALUES
    ('browser_sessions','timeout', v_browser_timeout),
    ('voice_sessions','timeout', v_voice_timeout),
    ('browser_sessions','purge_90d', v_browser_purged),
    ('voice_sessions','purge_90d', v_voice_purged);
END;
$$;

REVOKE ALL ON FUNCTION internal.cleanup_orphan_sessions() FROM public, anon, authenticated;

-- Agendar a cada 10 minutos (idempotente)
DO $$
DECLARE v_jobid int;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'cleanup-orphan-sessions';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
  PERFORM cron.schedule(
    'cleanup-orphan-sessions',
    '*/10 * * * *',
    $cron$ SELECT internal.cleanup_orphan_sessions(); $cron$
  );
END $$;
