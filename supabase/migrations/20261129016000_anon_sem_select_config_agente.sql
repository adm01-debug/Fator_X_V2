-- ============================================================================
-- Fecha SELECT de anon em tabelas de configuracao de agente e MCP
-- (auditoria 2026-11-27)
--
-- `agent_configs`, `agent_permissions`, `mcp_tools` e `security_config` tem
-- RLS habilitada e policies corretas, todas restritas ao papel
-- `authenticated` (nenhuma se aplica a anon). Ainda assim o grant de SELECT
-- para anon continua ligado, herdado do padrao do Supabase.
--
-- Na pratica nao vaza nada hoje: nenhuma policy casa com anon, entao ele le
-- zero linhas -- e as quatro estao vazias (0 linhas em todas, medido agora).
-- O grant e inofensivo, mas e superficie que nao precisa existir: se alguem
-- criar no futuro uma policy permissiva ou desligar RLS por engano, o grant
-- ja estara la.
--
-- Nenhuma policy e alterada, nenhum dado e apagado. So o grant de anon sai.
-- Idempotente e tolerante a tabela ausente.
-- ============================================================================

DO $$
DECLARE
  t text;
  existe boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_configs',
    'agent_permissions',
    'mcp_tools',
    'security_config'
  ]
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) INTO existe;

    IF NOT existe THEN
      RAISE NOTICE 'public.% nao existe neste ambiente; nada a fazer', t;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    RAISE NOTICE 'public.%: anon revogado', t;
  END LOOP;
END $$;