-- Restaura o RPC public.log_audit_entry que sumiu do banco de producao (drift).
-- Evidencia: pg_proc nao lista a funcao, mas o front a chama em 4 servicos
-- (notesService, notebooksService, noteVersionsService, noteTemplatesService),
-- auditService (20 acoes de auditoria) e skill-harvester. O teste
-- tests/rls/personas.test.ts exige o RPC funcionando. Auditoria silenciosamente
-- falha (try/catch + logger.warn) -> trilha LGPD vazia.
--
-- Contrato alinhado ao schema REAL do banco: audit_log.entity_id e UUID.
-- (a migration original 20260401002019 usava TEXT; a coluna real e uuid e todos os
-- call sites passam UUID valido ou null). Os types da API gerados
-- (types.ts: log_audit_entry Args { p_entity_id?: string }) continuam compativeis:
-- supabase-js envia o UUID como string e o Postgres faz a conversao de entrada.
-- O hardening 20260522144713 revogou EXECUTE de todas as SECURITY DEFINER para
-- authenticated; 20260724000001 revogou de anon. Por isso o GRANT para
-- authenticated e o REVOKE para anon no final (funcao de escrita, anon nunca deve
-- executar).

CREATE OR REPLACE FUNCTION public.log_audit_entry(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_audit_entry(TEXT, TEXT, UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_audit_entry(TEXT, TEXT, UUID, JSONB) TO authenticated;