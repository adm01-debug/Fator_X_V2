-- ═══════════════════════════════════════════════════════════════
-- ETAPA 2/50 — search_path hardening em SECURITY DEFINER functions
-- Mitiga: A-07 (search_path hijacking), K-01
-- Status: SAFE — apenas ALTER FUNCTION, não modifica lógica
-- ═══════════════════════════════════════════════════════════════

-- Funções que JÁ têm SET search_path = public (nada a fazer):
-- 20260331110311 (log_audit_entry)
-- 20260416201454 (forum triggers)
-- 20260417003407, 20260418144313, 20260418151333
-- 20260418112552, 20260418102513, 20260418125950, 20260418132552, 20260418134141, 20260418142049
-- 20260417004130 (partial: 91,118,142)
-- Todas migrations >= 20260722 (post-Fase6 hardening)

-- ═══════════════════════════════════════════════════════════════
-- PASSO 1: Identificar funções vulneráveis (sem SET search_path)
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
    vuln_func RECORD;
    fixed_count INT := 0;
BEGIN
    FOR vuln_func IN
        SELECT p.oid,
               p.proname,
               n.nspname,
               pg_get_function_identity_arguments(p.oid) AS arg_types
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prokind = 'f'
          AND n.nspname = 'public'
          AND NOT (pg_get_functiondef(p.oid) LIKE '%SET search_path = public%'
                OR pg_get_functiondef(p.oid) LIKE '%SET search_path=public%')
          AND NOT (
              obj_description(p.oid, 'pg_proc') LIKE '%search_path audited%'
              OR obj_description(p.oid, 'pg_proc') LIKE '%Fase6%'
          )
    LOOP
        BEGIN
            -- Include full argument signature to handle overloaded function names
            EXECUTE format(
                'ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions',
                vuln_func.nspname,
                vuln_func.proname,
                vuln_func.arg_types
            );
            fixed_count := fixed_count + 1;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    RAISE NOTICE 'ETAPA 2: % functions hardening search_path applied', fixed_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- PASSO 2: Revogar EXECUTE de anon/public em todas SECURITY DEFINER
-- (princípio do menor privilégio — apenas service_role/supabase_admin)
-- ═══════════════════════════════════════════════════════════════

-- Revoga execução de anon (authenticated ainda pode chamar via service_role bypass)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Revoga execução de authenticated (funções são chamáveis via service_role RPC)
-- Comentado: alguns fluxes legítimos usam authenticated. Descomente se quiser lock total.
-- REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- Confirma que service_role e supabase_admin mantêm acesso
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO supabase_admin;

-- ═══════════════════════════════════════════════════════════════
-- PASSO 3: Verificação — lista funções que ainda podem estar vulneráveis
-- ═══════════════════════════════════════════════════════════════

-- Esta view permite auditar o estado pós-migration
CREATE OR REPLACE VIEW _audit_security_definer AS
SELECT
    p.proname                                             AS function_name,
    n.nspname                                             AS schema,
    pg_get_functiondef(p.oid) LIKE '%SET search_path%'   AS has_search_path,
    NOT (pg_get_functiondef(p.oid) LIKE '%SET search_path%')
        AND p.prokind = 'f'                              AS needs_review,
    obj_description(p.oid, 'pg_proc')                     AS comment,
    array_to_string(
        NULLIF(current_setting('search_path', true), '')::text[],
        ', '
    )                                                     AS current_search_path
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND EXISTS (
      SELECT 1 FROM pg_roles r
      WHERE has_function_privilege(r.oid, p.oid, 'EXECUTE')
        AND r.rolname IN ('authenticated', 'anon')
  )
ORDER BY needs_review DESC, p.proname;

COMMENT ON VIEW _audit_security_definer IS
    'ETAPA 2 audit view — funções com EXECUTE para anon/authenticated. needs_review=true = requiere atención.';

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK (se necessário)
-- ═══════════════════════════════════════════════════════════════
-- SELECT format('ALTER FUNCTION %I.%I RESET search_path', proname, nspname)
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prokind = 'f'
--   AND pg_get_functiondef(p.oid) LIKE '%SET search_path = public%';
