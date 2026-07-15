-- Hotfix crítico: remover work_mem custom das roles anon/authenticated.
-- Alguma camada gerenciada (Lovable Cloud / supautils) está re-aplicando o valor
-- como "4mb"/"8mb" em lowercase, o que Postgres rejeita com 22023, quebrando
-- 100% das chamadas RPC/PostgREST via anon key.
-- Voltamos ao default do cluster (2184 kB) — memoria fina será tunada via infra.
ALTER ROLE anon RESET work_mem;
ALTER ROLE authenticated RESET work_mem;
ALTER ROLE authenticated RESET hash_mem_multiplier;