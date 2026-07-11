-- WAVE 4 — Hardening: statement_timeout, idle_in_transaction_session_timeout e lock_timeout por role
-- Previne queries runaway de esgotar o pool e travar o app.

ALTER ROLE anon SET statement_timeout = '8s';
ALTER ROLE anon SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE anon SET lock_timeout = '2s';

ALTER ROLE authenticated SET statement_timeout = '30s';
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE authenticated SET lock_timeout = '5s';

-- service_role precisa de mais folga para jobs administrativos, backfills e cron
ALTER ROLE service_role SET statement_timeout = '120s';
ALTER ROLE service_role SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE service_role SET lock_timeout = '10s';

-- authenticator (role que o PostgREST usa para trocar de role) — timeout curto para conexões ociosas
ALTER ROLE authenticator SET statement_timeout = '30s';
ALTER ROLE authenticator SET idle_in_transaction_session_timeout = '10s';