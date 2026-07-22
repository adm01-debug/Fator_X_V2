
-- Fase 10 — Performance Insights & Auto-EXPLAIN

-- 1) Histórico de alertas de slow query
CREATE OR REPLACE FUNCTION public.get_slow_query_alerts_history(_days INT DEFAULT 7)
RETURNS TABLE(
  id UUID,
  severity TEXT,
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.severity, a.message, a.metadata, a.created_at, a.resolved_at
  FROM public.security_alerts a
  WHERE a.category = 'performance.slow_query'
    AND a.created_at > now() - make_interval(days => GREATEST(_days, 1))
    AND public.is_workspace_admin(auth.uid())
  ORDER BY a.created_at DESC
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.get_slow_query_alerts_history(INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_slow_query_alerts_history(INT) TO authenticated;

-- 2) Auto-EXPLAIN de query fornecida (admin-only, SELECT-only)
CREATE OR REPLACE FUNCTION public.explain_query_plan(_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan JSONB;
  v_normalized TEXT;
  v_seq_scans INT := 0;
  v_suggestions TEXT[] := ARRAY[]::TEXT[];
  v_node JSONB;
BEGIN
  IF NOT public.is_workspace_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: admin required';
  END IF;

  v_normalized := lower(btrim(_query));
  IF v_normalized !~ '^(select|with)\s' THEN
    RAISE EXCEPTION 'only SELECT/WITH queries are allowed';
  END IF;
  IF v_normalized ~ '\y(insert|update|delete|drop|alter|truncate|grant|revoke|create)\y' THEN
    RAISE EXCEPTION 'mutating keywords are not allowed';
  END IF;

  -- EXPLAIN sem ANALYZE para não executar (planos apenas)
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || _query INTO v_plan;

  -- Heurística: contar Seq Scans em tabelas grandes
  FOR v_node IN
    SELECT jsonb_path_query(v_plan, '$.**."Node Type"')
  LOOP
    IF v_node #>> '{}' = 'Seq Scan' THEN
      v_seq_scans := v_seq_scans + 1;
    END IF;
  END LOOP;

  IF v_seq_scans > 0 THEN
    v_suggestions := array_append(
      v_suggestions,
      format('Detectados %s Seq Scan(s). Avalie criar índice B-Tree nas colunas dos filtros WHERE mais seletivos.', v_seq_scans)
    );
  END IF;

  RETURN jsonb_build_object(
    'plan', v_plan,
    'seq_scans', v_seq_scans,
    'suggestions', to_jsonb(v_suggestions),
    'captured_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.explain_query_plan(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.explain_query_plan(TEXT) TO authenticated;
