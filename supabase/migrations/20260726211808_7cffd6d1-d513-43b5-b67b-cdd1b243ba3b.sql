-- ═══════════════════════════════════════════════════════════════
-- 1. Catálogo único de famílias particionadas
-- ═══════════════════════════════════════════════════════════════
-- Antes, a lista de parents vivia hardcoded em ensure_monthly_partitions,
-- drop_old_partitions e check_partition_health. Três cópias = a próxima
-- família adicionada silenciosamente não teria retenção OU não teria
-- monitoramento, dependendo de qual função fosse esquecida.
CREATE TABLE IF NOT EXISTS internal.partitioned_families (
  parent_table    text PRIMARY KEY,
  partition_prefix text NOT NULL,
  retention_days  integer NOT NULL CHECK (retention_days >= 1),
  -- Define quais policies cada partição recebe. Enumerado (não SQL livre)
  -- para que a função de criação nunca execute texto vindo de dados.
  policy_kind     text NOT NULL CHECK (policy_kind IN ('agent_traces','workspace_admin','service_only')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO internal.partitioned_families (parent_table, partition_prefix, retention_days, policy_kind)
VALUES
  ('agent_traces',    'agent_traces_v2',  90,  'agent_traces'),
  ('audit_log_v2',    'audit_log_v2',     365, 'workspace_admin'),
  ('trace_events_v2', 'trace_events_v2',  90,  'workspace_admin'),
  ('traces',          'traces',           90,  'service_only'),
  ('spans',           'spans',            30,  'service_only')
ON CONFLICT (parent_table) DO UPDATE
  SET partition_prefix = EXCLUDED.partition_prefix,
      retention_days   = EXCLUDED.retention_days,
      policy_kind      = EXCLUDED.policy_kind;

-- ═══════════════════════════════════════════════════════════════
-- 2. Converte traces e spans em tabelas particionadas
-- ═══════════════════════════════════════════════════════════════
-- Ambas estão vazias (criadas na rodada anterior e ainda sem escrita real),
-- então o DROP/CREATE é gratuito. Fazer isso depois, com volume, exigiria
-- copiar dados e uma janela de indisponibilidade.
DROP TABLE IF EXISTS public.spans;
DROP TABLE IF EXISTS public.traces;

CREATE TABLE IF NOT EXISTS public.traces (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  trace_id     text NOT NULL,
  root_name    text,
  user_id      uuid,
  agent_id     uuid,
  session_id   uuid,
  workflow_id  uuid,
  start_time   timestamptz,
  end_time     timestamptz,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error','cancelled')),
  source       text,
  span_count   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- A PK de tabela particionada precisa conter a chave de partição.
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS public.spans (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  span_id        text NOT NULL,
  trace_id       text NOT NULL,
  parent_span_id text,
  name           text NOT NULL,
  kind           text,
  start_time     timestamptz,
  end_time       timestamptz,
  duration_ms    integer,
  status         text,
  status_message text,
  attributes     jsonb NOT NULL DEFAULT '{}'::jsonb,
  events         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

GRANT ALL ON public.traces TO service_role;
GRANT ALL ON public.spans  TO service_role;

ALTER TABLE public.traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spans  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "traces service only" ON public.traces
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "spans service only" ON public.spans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Unicidade de trace_id agora inclui created_at por imposição do pgvector...
-- (na verdade, por imposição do particionamento: todo índice único precisa
-- conter a chave de partição). Consequência real e aceita: dois rastros com o
-- mesmo trace_id em MESES diferentes deixam de colidir. Só afeta um rastro que
-- nasça exatamente na virada do mês.
CREATE UNIQUE INDEX IF NOT EXISTS idx_traces_trace_id ON public.traces (trace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_traces_created ON public.traces USING brin (created_at);
CREATE INDEX IF NOT EXISTS idx_traces_agent   ON public.traces (agent_id, created_at DESC) WHERE agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_spans_trace   ON public.spans (trace_id, start_time);
CREATE INDEX IF NOT EXISTS idx_spans_created ON public.spans USING brin (created_at);

-- ═══════════════════════════════════════════════════════════════
-- 3. ensure_monthly_partitions passa a ler o catálogo
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION internal.ensure_monthly_partitions(p_months_ahead integer DEFAULT 12)
RETURNS TABLE(created_partition text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
DECLARE
  f record;
  v_month_start timestamptz;
  v_month_end   timestamptz;
  v_partition_name text;
  v_offset int;
  v_has_workspace boolean;
  v_has_agent boolean;
  v_has_user boolean;
BEGIN
  FOR f IN SELECT * FROM internal.partitioned_families ORDER BY parent_table LOOP
    FOR v_offset IN -3..GREATEST(p_months_ahead, 6) LOOP
      v_month_start := date_trunc('month', now() + make_interval(months => v_offset));
      v_month_end   := v_month_start + interval '1 month';
      v_partition_name := format('%s_%s', f.partition_prefix, to_char(v_month_start, 'YYYY_MM'));

      IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=v_partition_name
      ) THEN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
          v_partition_name, f.parent_table, v_month_start, v_month_end
        );
        EXECUTE format(
          'ALTER TABLE public.%I SET (
             autovacuum_vacuum_scale_factor = 0.05,
             autovacuum_analyze_scale_factor = 0.01,
             autovacuum_vacuum_insert_scale_factor = 0.05,
             fillfactor = 100)',
          v_partition_name
        );
        created_partition := v_partition_name;
        RETURN NEXT;
      END IF;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_partition_name);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', v_partition_name);

      SELECT
        bool_or(column_name='workspace_id'),
        bool_or(column_name='agent_id'),
        bool_or(column_name='user_id')
      INTO v_has_workspace, v_has_agent, v_has_user
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=v_partition_name;

      IF f.policy_kind='agent_traces' AND v_has_user AND v_has_agent THEN
        EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', v_partition_name);
        EXECUTE format('DROP POLICY IF EXISTS "Users can see their own traces" ON public.%I', v_partition_name);
        EXECUTE format($p$
          CREATE POLICY "Users can see their own traces" ON public.%I FOR SELECT
          USING (user_id = (SELECT auth.uid()))
        $p$, v_partition_name);
        EXECUTE format('DROP POLICY IF EXISTS "Admins only" ON public.%I', v_partition_name);
        EXECUTE format($p$
          CREATE POLICY "Admins only" ON public.%I FOR ALL TO authenticated
          USING (EXISTS (SELECT 1 FROM public.agents a
                         WHERE a.id = %I.agent_id
                           AND public.is_workspace_admin((SELECT auth.uid()), a.workspace_id)))
          WITH CHECK (EXISTS (SELECT 1 FROM public.agents a
                              WHERE a.id = %I.agent_id
                                AND public.is_workspace_admin((SELECT auth.uid()), a.workspace_id)))
        $p$, v_partition_name, v_partition_name, v_partition_name);

      ELSIF f.policy_kind='workspace_admin' AND v_has_workspace THEN
        EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', v_partition_name);
        EXECUTE format('DROP POLICY IF EXISTS "Admins only" ON public.%I', v_partition_name);
        EXECUTE format($p$
          CREATE POLICY "Admins only" ON public.%I FOR ALL TO authenticated
          USING (public.is_workspace_admin((SELECT auth.uid()), workspace_id))
          WITH CHECK (public.is_workspace_admin((SELECT auth.uid()), workspace_id))
        $p$, v_partition_name);

      ELSIF f.policy_kind='service_only' THEN
        -- Telemetria bruta: nenhum acesso direto do cliente. A leitura passa
        -- por RPC/edge function, que aplica o recorte por workspace.
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated, anon', v_partition_name);
        EXECUTE format('DROP POLICY IF EXISTS "service only" ON public.%I', v_partition_name);
        EXECUTE format($p$
          CREATE POLICY "service only" ON public.%I FOR ALL TO service_role
          USING (true) WITH CHECK (true)
        $p$, v_partition_name);
      END IF;
    END LOOP;
  END LOOP;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════
-- 4. drop_old_partitions com retenção POR FAMÍLIA
-- ═══════════════════════════════════════════════════════════════
-- Antes aplicava um único p_retention_days a todas. spans (30d) e audit_log_v2
-- (365d) têm necessidades opostas: um parâmetro só significava guardar spans
-- demais ou descartar auditoria cedo demais.
CREATE OR REPLACE FUNCTION internal.drop_old_partitions(p_retention_days integer DEFAULT NULL)
RETURNS TABLE(dropped_partition text, month_end timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
DECLARE
  r record;
  v_cutoff timestamptz;
  v_end_ts timestamptz;
BEGIN
  FOR r IN
    SELECT nc.nspname AS schema,
           cc.relname AS partition,
           pg_get_expr(cc.relpartbound, cc.oid) AS bounds,
           f.retention_days
    FROM pg_inherits i
    JOIN pg_class parent ON parent.oid=i.inhparent
    JOIN pg_class cc ON cc.oid=i.inhrelid
    JOIN pg_namespace nc ON nc.oid=cc.relnamespace
    JOIN internal.partitioned_families f ON f.parent_table = parent.relname
  LOOP
    -- p_retention_days, quando informado, força um override manual global.
    v_cutoff := date_trunc('month', now() - make_interval(days => COALESCE(p_retention_days, r.retention_days)));
    v_end_ts := (regexp_match(r.bounds, $re$TO \('([^']+)'\)$re$))[1]::timestamptz;

    IF v_end_ts IS NOT NULL AND v_end_ts <= v_cutoff THEN
      EXECUTE format('DROP TABLE %I.%I', r.schema, r.partition);
      dropped_partition := r.partition;
      month_end := v_end_ts;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════
-- 5. check_partition_health passa a ler o catálogo
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION internal.check_partition_health()
RETURNS TABLE(parent_table text, missing_partition text, severity text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
DECLARE
  f record;
  v_next_month timestamptz;
  v_partition_name text;
BEGIN
  FOR f IN SELECT * FROM internal.partitioned_families ORDER BY 1 LOOP
    v_next_month := date_trunc('month', now() + interval '1 month');
    v_partition_name := format('%s_%s', f.partition_prefix, to_char(v_next_month, 'YYYY_MM'));

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_partition_name
    ) THEN
      PERFORM internal.ensure_monthly_partitions();

      IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = v_partition_name
      ) THEN
        parent_table := f.parent_table;
        missing_partition := v_partition_name;
        severity := 'critical';

        INSERT INTO public.security_alerts(severity, category, message, metadata)
        VALUES (
          'critical',
          'partition_missing',
          format('A partição %s da tabela %s não pôde ser criada automaticamente.', v_partition_name, f.parent_table),
          jsonb_build_object('parent', f.parent_table, 'partition', v_partition_name)
        );

        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════
-- 6. Expurgo das tabelas de histórico NÃO particionadas
-- ═══════════════════════════════════════════════════════════════
-- Volume moderado o bastante para DELETE por idade valer mais que a
-- complexidade operacional de particionar.
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
  -- ficam mais que telemetria comum, mas não indefinidamente.
  DELETE FROM public.security_events WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'security_events'; deleted_rows := v_count; RETURN NEXT;

  DELETE FROM public.cron_schedule_executions WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'cron_schedule_executions'; deleted_rows := v_count; RETURN NEXT;

  -- Só itens em estado TERMINAL. Um item pending/running antigo é sintoma de
  -- worker travado: apagá-lo destruiria trabalho não executado e esconderia o
  -- incidente. Ele deve continuar visível até alguém resolver.
  DELETE FROM public.queue_items
   WHERE status IN ('completed','failed','cancelled')
     AND created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'queue_items'; deleted_rows := v_count; RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION internal.purge_telemetry() FROM public, anon, authenticated;

-- Materializa imediatamente as partições de traces/spans.
SELECT internal.ensure_monthly_partitions(12);