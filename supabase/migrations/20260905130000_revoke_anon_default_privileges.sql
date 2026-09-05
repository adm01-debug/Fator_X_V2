-- ═══════════════════════════════════════════════════════════════════
-- Onda 2 — Fix estrutural: anon não ganha escrita em tabelas novas
-- Auditoria 2026-09-05: pg_default_acl concedia anon=arwdDxtm (ALL) em
-- public para todo objeto criado por postgres — toda tabela nova nascia
-- com INSERT/UPDATE/DELETE/TRUNCATE para anon (foi o caso da própria
-- rate_limit_entries minutos após a limpeza da Onda 1).
-- ═══════════════════════════════════════════════════════════════════

-- Pontual: remover os grants herdados pela tabela criada na Onda 1
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rate_limit_entries FROM anon;

-- Estrutural: futuras tabelas criadas por postgres em public NÃO herdam
-- mais escrita para anon (RLS continua sendo a linha de defesa principal;
-- isto remove a linha de ataque secundária por GRANT).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon;
