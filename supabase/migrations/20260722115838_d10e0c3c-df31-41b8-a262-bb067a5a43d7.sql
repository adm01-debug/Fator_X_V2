
-- =========================================================
-- 1) View: slack_dlq_stats
-- =========================================================
CREATE OR REPLACE VIEW public.slack_dlq_stats
WITH (security_invoker = true) AS
SELECT
  workspace_id,
  COUNT(*) FILTER (WHERE resolved_at IS NULL AND attempts < 5) AS pending,
  COUNT(*) FILTER (WHERE resolved_at IS NULL AND attempts >= 5) AS dead,
  COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved,
  MAX(created_at) FILTER (WHERE resolved_at IS NULL) AS oldest_pending_at,
  MAX(attempts) FILTER (WHERE resolved_at IS NULL) AS max_attempts
FROM public.slack_dispatch_dlq
GROUP BY workspace_id;

GRANT SELECT ON public.slack_dlq_stats TO authenticated;
GRANT ALL ON public.slack_dlq_stats TO service_role;

-- =========================================================
-- 2) Hardening SECURITY DEFINER — funções internas
--    (só service_role executa; frontend nunca chama)
-- =========================================================
DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'refresh_agent_daily_metrics()',
    'refresh_knowledge_graph_health()',
    'refresh_secrets_status()',
    'prune_traces_retention()',
    'run_prune_traces_retention_monitored()',
    'recompute_memory_tier()',
    'forum_update_thread_stats()',
    'validate_oncall_workspace_consistency()',
    'encrypt_secret_value(text)',
    'pg_net_smoke_post()',
    'pg_net_smoke_response()',
    'run_pg_net_smoke_test()',
    'check_retention_job_health()',
    'create_partition_if_not_exists(text, text, date, date)'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
      EXECUTE format($f$COMMENT ON FUNCTION public.%s IS 'Internal (trigger/cron/smoke). Hardened Fase6: only service_role.'$f$, fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Function % not found, skipping', fn;
    END;
  END LOOP;
END $$;

-- =========================================================
-- 3) Comentários em funções callable auditadas
-- =========================================================
COMMENT ON FUNCTION public.hybrid_memory_search(uuid, text, integer, text[]) IS
  'SECURITY DEFINER audited Fase6: agent_id scoped via RLS on agent_memories_v2 above.';
COMMENT ON FUNCTION public.get_embedding_coverage(uuid) IS
  'SECURITY DEFINER audited Fase6: only aggregates for the caller workspace_id.';
COMMENT ON FUNCTION public.get_knowledge_graph_health(uuid) IS
  'SECURITY DEFINER audited Fase6: only aggregates for the caller workspace_id.';
COMMENT ON FUNCTION public.touch_memory(uuid) IS
  'SECURITY DEFINER audited Fase6: verifies workspace_members membership before update.';
COMMENT ON FUNCTION public.reset_embedding_dead_letter(uuid) IS
  'SECURITY DEFINER audited Fase6: verifies workspace owner/admin.';
COMMENT ON FUNCTION public.memory_relevance(uuid) IS
  'SECURITY DEFINER audited Fase6: pure numeric computation, no data exposure.';
