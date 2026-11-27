-- ============================================================
-- Gatilho real da edge `slack-agent-notify`
--
-- A edge afirma no cabeçalho (index.ts:3-4) que é disparada via pg_net.http_post
-- por trigger, mas nenhuma migration a chamava. Resultado: a tela
-- "Notificações de Agentes" (SlackAgentNotificationsPanel) salvava regras em
-- slack_agent_notifications que nada conseguia acionar.
--
-- Dispara quando uma execução de agente termina de fato:
--   * `traces`      — telemetria OTEL; apenas quando o span raiz fecha em 'error';
--   * `agent_traces` — eventos por execução; eventos terminais run_completed/run_failed.
--
-- Best-effort: sem `app.settings.supabase_url` / `app.settings.slack_notify_secret`
-- o gatilho é no-op, e qualquer erro vira WARNING — nunca derruba a escrita do trace.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_slack_on_agent_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_catalog
AS $fn$
DECLARE
  v_base text := NULLIF(current_setting('app.settings.supabase_url', true), '');
  v_secret text := NULLIF(current_setting('app.settings.slack_notify_secret', true), '');
  v_status text;
  v_workspace uuid;
  v_agent uuid;
  v_duration int;
  v_cost numeric;
  v_error text;
  v_bucket text := 'user';
BEGIN  IF TG_TABLE_NAME = 'traces' THEN
    IF NEW.status IS DISTINCT FROM 'error' THEN
      RETURN NEW;
    END IF;
    -- `traces` é gravada via service_role (telemetria), não por usuário final:
    -- o balde mais apertado evita que notificações de job consumam o de usuário.
    v_bucket := 'service';
    v_status := 'failure';
    v_agent := NEW.agent_id;
    v_duration := CASE
      WHEN NEW.end_time IS NOT NULL
        THEN ROUND(EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) * 1000)::int
      ELSE NULL
    END;
    v_error := NULL;
  ELSE
    IF NEW.event IS NULL OR NEW.event NOT IN ('run_completed', 'run_failed') THEN
      RETURN NEW;
    END IF;
    v_status := CASE WHEN NEW.event = 'run_failed' THEN 'failure' ELSE 'success' END;
    v_agent := NEW.agent_id;
    v_duration := NEW.latency_ms;
    v_cost := NEW.cost_usd;
    v_error := CASE
      WHEN v_status = 'failure'
        THEN left(COALESCE(NEW.metadata->>'error', NEW.output::text, 'erro na execucao'), 2000)
      ELSE NULL
    END;
  END IF;

  IF v_agent IS NULL OR v_base IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.workspace_id INTO v_workspace FROM public.agents a WHERE a.id = v_agent LIMIT 1;
  IF v_workspace IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_base, '/') || '/functions/v1/slack-agent-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-slack-notify-secret', v_secret,
      'x-rate-limit-bucket', v_bucket
    ),
    body := jsonb_build_object(
      'agent_id', v_agent,
      'workspace_id', v_workspace,
      'status', v_status,
      'duration_ms', v_duration,
      'cost_usd', v_cost,
      'trace_id', CASE WHEN TG_TABLE_NAME = 'traces' THEN NEW.trace_id ELSE NEW.session_id END,
      'error', v_error
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_slack_on_agent_run falhou (best-effort): %', SQLERRM;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.notify_slack_on_agent_run() IS
  'Dispara slack-agent-notify via pg_net ao fim de execucoes de agente (best-effort).';

REVOKE ALL ON FUNCTION public.notify_slack_on_agent_run() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_slack_on_trace_end ON public.traces;
CREATE TRIGGER trg_notify_slack_on_trace_end
  AFTER INSERT ON public.traces
  FOR EACH ROW
  WHEN (NEW.status = 'error')
  EXECUTE FUNCTION public.notify_slack_on_agent_run();

DROP TRIGGER IF EXISTS trg_notify_slack_on_agent_trace ON public.agent_traces;
CREATE TRIGGER trg_notify_slack_on_agent_trace
  AFTER INSERT ON public.agent_traces
  FOR EACH ROW
  WHEN (NEW.event IN ('run_completed', 'run_failed'))
  EXECUTE FUNCTION public.notify_slack_on_agent_run();