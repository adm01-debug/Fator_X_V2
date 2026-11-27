-- ============================================================================
-- verify_api_key: fecha a RPC e as rotinas de expurgo que estavam em PUBLIC.
--
-- verify_api_key(p_raw_key TEXT)
--   Definida em 20261126230000_recuperar_funcoes_e_triggers.sql:3414 como
--   SECURITY DEFINER sobre public.api_keys, sem guarda de escopo e sem REVOKE.
--   Funcoes criadas em public nascem executaveis por PUBLIC (pg_default_acl),
--   entao qualquer usuario autenticado podia chama-la com um palpite e obter
--   {valid, workspace_id, agent_id, key_id} de uma chave de OUTRO workspace.
--   Nao ha nenhum chamador no repo: a validacao real de x-api-key e feita em
--   TypeScript por supabase/functions/_shared/auth.ts:143-162, que consulta
--   api_keys com service_role e compara em tempo constante.
--   -> Fecha para PUBLIC/anon/authenticated e mantem service_role.
--
-- purge_stale_harvest_checkpoints(interval) e
-- purge_removed_template_skill_links(_days integer DEFAULT 90)
--   Sao rotinas de manutencao (apagam linhas de harvest/links). Ja receberam
--   GRANT a service_role em 20260728173157_f38e019d:20 e 20261126230000:4438,
--   mas nunca levaram REVOKE FROM PUBLIC — o GRANT nao remove a heranca de
--   PUBLIC, entao continuavam executaveis por qualquer usuario.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.verify_api_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_api_key(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.purge_stale_harvest_checkpoints(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_stale_harvest_checkpoints(interval) TO service_role;

REVOKE EXECUTE ON FUNCTION public.purge_removed_template_skill_links(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_removed_template_skill_links(integer) TO service_role;

COMMENT ON FUNCTION public.verify_api_key(text) IS
  'Verificacao legada de API key em SQL (bcrypt + fallback sha256). Sem chamador no repo; a validacao vive em supabase/functions/_shared/auth.ts. Somente service_role.';