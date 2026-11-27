-- ============================================================================
-- Fecha EXECUTE de anon nas funcoes de public (auditoria 2026-11-27)
--
-- Causa raiz: PUBLIC recebe EXECUTE por padrao em toda funcao nova. As
-- migrations de 2026-09-05 revogaram isso apenas para TABELAS (ver
-- 20260905130000_revoke_anon_default_privileges.sql), entao toda FUNCAO
-- criada depois nasceu executavel por anon -- inclusive via heranca de
-- PUBLIC, que ignora um REVOKE direcionado so a anon.
--
-- Prova no catalogo de producao (has_function_privilege):
--   88 RPCs executaveis por anon, 27 delas sem nenhuma checagem de
--   auth.uid()/workspace no corpo -- incluindo _fase8_snapshot_as(uuid),
--   que era SECURITY DEFINER e injetava o JWT sub de QUALQUER uuid antes
--   de chamar get_db_health_snapshot(), um bypass de autenticacao.
--
-- Escopo: revogar de anon E de PUBLIC, devolvendo o grant explicito a
-- authenticated nas funcoes que ja podiam executa-las. As 61 RPCs que
-- validam identidade no corpo seguem protegidas como antes.
-- ============================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    -- A ordem importa: gravar o acesso de authenticated ANTES de tirar
    -- PUBLIC, senao a informacao de heranca se perde.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', r.sig);
    IF r.auth_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END $$;

-- Estrutural: funcoes futuras criadas por postgres em public nao nascem
-- executaveis por anon. Sem isso o problema volta na proxima migration.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;

-- ---------------------------------------------------------------------------
-- _fase8_snapshot_as: bypass de autenticacao, sem chamador legitimo
-- (nenhuma referencia em src/ nem em migracao de aplicacao). Removida.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._fase8_snapshot_as(uuid);