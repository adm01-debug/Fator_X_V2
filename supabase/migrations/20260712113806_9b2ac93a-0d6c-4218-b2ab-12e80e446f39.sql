-- WAVE 4 — Item: tuning de memória por role + plan cache em SECURITY DEFINER RLS helpers

-- 1) Role authenticated: queries curtas do PostgREST
ALTER ROLE authenticated SET work_mem = '8MB';
ALTER ROLE authenticated SET hash_mem_multiplier = '2.0';
ALTER ROLE authenticated SET jit = 'off';
ALTER ROLE authenticated SET random_page_cost = '1.1';
ALTER ROLE authenticated SET effective_io_concurrency = '200';

-- 2) Role anon: perfil mais conservador
ALTER ROLE anon SET work_mem = '4MB';
ALTER ROLE anon SET jit = 'off';
ALTER ROLE anon SET random_page_cost = '1.1';

-- 3) Plan cache estável em funções RLS triviais (aplicado condicionalmente)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'is_workspace_admin',
        'get_user_workspace_ids',
        'is_mfa_valid_for_role',
        'is_user_locked_out'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET plan_cache_mode = force_generic_plan', r.sig);
  END LOOP;
END$$;
