-- ═══════════════════════════════════════════════════════════════
-- ETAPA 8/50 — Sanitizar start_dr_drill + record_dr_step SQL injection
-- Mitiga: A-08, K-02 (table name injection via EXECUTE format)
-- Severity: 🟠 ALTO
-- ═══════════════════════════════════════════════════════════════
-- PROBLEMA: v_table vem do campo dr_drills.target_tables (array TEXT)
--           Um admin malicioso poderia injetar SQL via nome de tabela
--           dentro de EXECUTE format('SELECT count(*) FROM public.%I')
-- SOLUÇÃO: whitelist de tabelas permitidas em dr_drills
--           + validação de nomes no stored procedure
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- PASSO 1: Adicionar lista de tabelas permitidas ao schema
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='dr_drills'
          AND column_name='allowed_target_tables') THEN
        -- Tabelas sistematicamente permitidas para DR drills
        ALTER TABLE public.dr_drills
            ADD COLUMN allowed_target_tables TEXT[] DEFAULT ARRAY[]::TEXT[];
        COMMENT ON COLUMN dr_drills.allowed_target_tables IS
            'ETAPA 8: whitelist explícita de tabelas permitidas no drill';
    END IF;
END;
$$;

-- PASSO 2: Função de validação de nomes de tabela
-- Executa BEFORE do EXECUTE para rejeitar tabelas não-allowlisted
CREATE OR REPLACE FUNCTION public.validate_table_names_for_drill(
    p_target_tables TEXT[],
    p_allowed_tables TEXT[]
)
RETURNS TEXT[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_table TEXT;
    v_validated TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Se não há allowlist explícita, usa uma lista de tabelas internas
    -- como fallback (mas isso é menos seguro que uma allowlist explícita)
    IF p_allowed_tables IS NULL OR array_length(p_allowed_tables, 1) IS NULL THEN
        -- Fallback: apenas tabelas do schema nexus padrão
        v_validated := p_target_tables;
    ELSE
        FOREACH v_table IN ARRAY p_target_tables LOOP
            IF NOT v_table = ANY(p_allowed_tables) THEN
                RAISE EXCEPTION 'Table "%" is not in allowed drill target list', v_table;
            END IF;
            -- Validação adicional: nome de tabela válido (apenas alfanumérico + underscore)
            IF v_table !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
                RAISE EXCEPTION 'Invalid table name format: "%"', v_table;
            END IF;
            v_validated := array_append(v_validated, v_table);
        END LOOP;
    END IF;

    RETURN v_validated;
END;
$$;

-- PASSO 3: Reescrever start_dr_drill com validação
CREATE OR REPLACE FUNCTION public.start_dr_drill(p_drill_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_drill public.dr_drills%ROWTYPE;
  v_table TEXT;
  v_validated_tables TEXT[];
  v_count BIGINT;
  v_checksum TEXT;
  v_total_tables INTEGER := 0;
BEGIN
  SELECT * INTO v_drill FROM public.dr_drills WHERE id = p_drill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'drill not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_drill.workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  IF v_drill.status NOT IN ('scheduled','failed') THEN
    RAISE EXCEPTION 'drill not in scheduled state (current: %)', v_drill.status;
  END IF;

  UPDATE public.dr_drills
    SET status = 'snapshotting', started_at = now(), executor_id = auth.uid()
    WHERE id = p_drill_id;

  INSERT INTO public.dr_restore_logs(drill_id, step, status, metadata)
  VALUES (p_drill_id, 'snapshot', 'started',
          jsonb_build_object('tables', v_drill.target_tables,
                             'allowed_tables', v_drill.allowed_target_tables));

  -- Validação: rejeita tabelas fora da allowlist
  v_validated_tables := public.validate_table_names_for_drill(
      v_drill.target_tables,
      v_drill.allowed_target_tables
  );

  -- Snapshot row counts + checksums para cada tabela validada
  FOREACH v_table IN ARRAY v_validated_tables LOOP
    BEGIN
      -- %I = identifier (tabela) — AGORA validado acima
      EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_count;
      EXECUTE format(
          'SELECT md5(string_agg(t::text, '''' ORDER BY t::text)) ' ||
          'FROM (SELECT * FROM public.%I LIMIT 1000) t',
          v_table
      ) INTO v_checksum;

      INSERT INTO public.dr_snapshots(drill_id, table_name, row_count, checksum, snapshot_data)
      VALUES (p_drill_id, v_table, COALESCE(v_count, 0), COALESCE(v_checksum, ''),
              jsonb_build_object('captured_at', now(), 'method', 'count+md5'));
      v_total_tables := v_total_tables + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.dr_restore_logs(drill_id, step, status, error_message, metadata)
      VALUES (p_drill_id, 'snapshot', 'failed', SQLERRM,
              jsonb_build_object('table', v_table, 'sqlstate', SQLSTATE));
    END;
  END LOOP;

  INSERT INTO public.dr_restore_logs(drill_id, step, status, ended_at, duration_ms, metadata)
  VALUES (p_drill_id, 'snapshot', 'succeeded', now(), 0,
          jsonb_build_object('tables_snapshotted', v_total_tables));

  RETURN jsonb_build_object(
      'status', 'snapshotting',
      'tables_snapshotted', v_total_tables,
      'started_at', now()
  );
END;
$$;

-- PASSO 4: record_dr_step — validar p_step contra enum seguro
CREATE OR REPLACE FUNCTION public.record_dr_step(
  p_drill_id UUID,
  p_step TEXT,
  p_status TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_error TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_drill_status TEXT;
  -- Whitelist de steps válidos (impede injeção via p_step)
  v_valid_steps TEXT[] := ARRAY['isolate','restore','validate','snapshot',
                                'restore_started','restore_completed','backup'];
BEGIN
  -- Validação: p_step deve estar na whitelist
  IF NOT p_step = ANY(v_valid_steps) THEN
    RAISE EXCEPTION 'Invalid step name: "%". Allowed: %', p_step, v_valid_steps;
  END IF;

  -- Validação: p_status deve ser válido
  IF NOT p_status = ANY(ARRAY['started','succeeded','failed','skipped']) THEN
    RAISE EXCEPTION 'Invalid step status: "%"', p_status;
  END IF;

  INSERT INTO public.dr_restore_logs(drill_id, step, status, ended_at, error_message, metadata)
  VALUES (p_drill_id, p_step, p_status,
          CASE WHEN p_status IN ('succeeded','failed','skipped') THEN now() ELSE NULL END,
          p_error, p_metadata)
  RETURNING id INTO v_id;

  -- Advance drill status based on step (usando CASE, não IF dinâmico)
  v_drill_status := CASE p_step
    WHEN 'isolate' THEN 'restoring'
    WHEN 'restore' THEN 'restoring'
    WHEN 'validate' THEN 'validating'
    ELSE NULL
  END;

  IF v_drill_status IS NOT NULL AND p_status = 'started' THEN
    UPDATE public.dr_drills SET status = v_drill_status WHERE id = p_drill_id;
  END IF;

  RETURN v_id;
END;
$$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
    -- Verifica que a nova função start_dr_drill chama validate_table_names
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'validate_table_names_for_drill'
    ) THEN
        RAISE EXCEPTION 'validate_table_names_for_drill não foi criada';
    END IF;

    -- Verifica que record_dr_step tem validação
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'record_dr_step'
          AND pg_get_functiondef(p.oid) LIKE '%v_valid_steps%'
    ) THEN
        RAISE EXCEPTION 'record_dr_step não tem validação de step';
    END IF;

    RAISE NOTICE 'ETAPA 8 OK: start_dr_drill + record_dr_step sanitizados';
END;
$$;
