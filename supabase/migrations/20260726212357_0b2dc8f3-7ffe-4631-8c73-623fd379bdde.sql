-- ── 1. Remove GRANT herdado nas tabelas-pai ──────────────────────────────
-- Em tabela particionada, o privilégio verificado é o do PAI (o da partição
-- não é consultado quando se consulta via pai). Eu havia revogado apenas nas
-- partições, o que não fechava nada. A RLS já barrava as linhas, então não
-- houve exposição de dados — mas o privilégio em si estava errado.
REVOKE ALL ON public.traces FROM authenticated, anon;
REVOKE ALL ON public.spans  FROM authenticated, anon;

-- ── 2. Estados de fila reais ─────────────────────────────────────────────
-- O CHECK de queue_items permite: pending | processing | completed | failed |
-- dead_letter. A versão anterior desta função filtrava por 'cancelled' e
-- 'running', que não existem: 'dead_letter' nunca seria expurgado (crescimento
-- ilimitado) e o predicado de 'cancelled' era morto.
CREATE OR REPLACE FUNCTION internal.purge_telemetry()
RETURNS TABLE(table_name text, deleted_rows integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.webhook_delivery_logs WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'webhook_delivery_logs'; deleted_rows := v_count; RETURN NEXT;

  -- 180 dias: eventos de segurança sustentam investigação retroativa, então
  -- ficam mais que telemetria comum — mas não indefinidamente.
  DELETE FROM public.security_events WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'security_events'; deleted_rows := v_count; RETURN NEXT;

  DELETE FROM public.cron_schedule_executions WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'cron_schedule_executions'; deleted_rows := v_count; RETURN NEXT;

  -- Prazos escalonados por quanto tempo o registro ainda tem valor:
  --  completed   → só volume, descarta cedo.
  --  failed      → janela de investigação/retry.
  --  dead_letter → evidência de incidente, guarda muito mais.
  -- pending/processing NUNCA são apagados: um item antigo nesses estados é
  -- sintoma de worker travado. Apagá-lo destruiria trabalho não executado e
  -- esconderia o incidente justamente de quem precisa vê-lo.
  DELETE FROM public.queue_items
   WHERE (status = 'completed'   AND created_at < now() - interval '7 days')
      OR (status = 'failed'      AND created_at < now() - interval '30 days')
      OR (status = 'dead_letter' AND created_at < now() - interval '90 days');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'queue_items'; deleted_rows := v_count; RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION internal.purge_telemetry() FROM public, anon, authenticated;