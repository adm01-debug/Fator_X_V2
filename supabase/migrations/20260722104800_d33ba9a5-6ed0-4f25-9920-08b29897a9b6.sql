
-- =============================================================================
-- SELF-TEST: Simula o avanço do relógio e valida que a automação de partições
-- cria tabelas com RLS + políticas + grants corretos.
-- =============================================================================

CREATE OR REPLACE FUNCTION internal.test_partition_automation()
RETURNS TABLE(test_name text, passed boolean, details text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
DECLARE
  v_test_month date;
  v_partition_name text;
  v_rls_enabled boolean;
  v_policy_count int;
  v_grant_count int;
  v_parent text;
BEGIN
  -- Simular criação para 12 meses no futuro (mês que ainda não existe)
  v_test_month := date_trunc('month', now() + interval '12 months')::date;

  -- Executa a rotina de automação
  PERFORM internal.ensure_monthly_partitions();

  -- Loop pelos parents particionados esperados
  FOR v_parent IN
    SELECT unnest(ARRAY['agent_traces', 'audit_log_v2', 'trace_events_v2'])
  LOOP
    v_partition_name := v_parent || '_' || to_char(v_test_month, 'YYYY_MM');

    -- TEST 1: Partição existe?
    test_name := format('[%s] partição %s existe', v_parent, v_partition_name);
    passed := EXISTS(
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_partition_name
    );
    details := CASE WHEN passed THEN 'OK' ELSE 'FALTANDO' END;
    RETURN NEXT;

    IF NOT passed THEN CONTINUE; END IF;

    -- TEST 2: RLS habilitado?
    SELECT c.relrowsecurity INTO v_rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = v_partition_name;

    test_name := format('[%s] RLS habilitado em %s', v_parent, v_partition_name);
    passed := COALESCE(v_rls_enabled, false);
    details := CASE WHEN passed THEN 'RLS ON' ELSE 'RLS OFF - VAZAMENTO!' END;
    RETURN NEXT;

    -- TEST 3: Pelo menos 1 política existe?
    SELECT count(*) INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = v_partition_name;

    test_name := format('[%s] políticas em %s', v_parent, v_partition_name);
    passed := v_policy_count >= 1;
    details := format('%s políticas', v_policy_count);
    RETURN NEXT;

    -- TEST 4: Grants para service_role?
    SELECT count(*) INTO v_grant_count
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = v_partition_name
      AND grantee = 'service_role';

    test_name := format('[%s] grants service_role em %s', v_parent, v_partition_name);
    passed := v_grant_count >= 1;
    details := format('%s grants', v_grant_count);
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION internal.test_partition_automation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.test_partition_automation() TO service_role;

COMMENT ON FUNCTION internal.test_partition_automation() IS
  'Self-test: executa ensure_monthly_partitions() e verifica que partições futuras nascem com RLS + políticas + grants corretos. Deve ser chamado periodicamente por monitoramento.';
