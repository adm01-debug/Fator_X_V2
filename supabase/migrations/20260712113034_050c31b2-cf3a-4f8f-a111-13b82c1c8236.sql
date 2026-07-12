-- WAVE 4 — Covering indexes for RLS hot paths + dedup

-- workspace_members: has 'role' column
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_covering
  ON public.workspace_members USING btree (user_id)
  INCLUDE (workspace_id, role);

DROP INDEX IF EXISTS public.idx_workspace_members_workspace_id;
DROP INDEX IF EXISTS public.idx_workspace_members_user_id;

-- user_roles: column is role_key (not role)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role_covering
  ON public.user_roles USING btree (user_id, role_key)
  INCLUDE (workspace_id);

DROP INDEX IF EXISTS public.idx_user_roles_user;

-- agents: dedup
DROP INDEX IF EXISTS public.idx_agents_workspace;
DROP INDEX IF EXISTS public.idx_agents_user_id;

-- Reduce bloat on hot tables
ALTER TABLE public.workspace_members SET (fillfactor = 90);
ALTER TABLE public.user_roles       SET (fillfactor = 90);
ALTER TABLE public.agents           SET (fillfactor = 90);

ANALYZE public.workspace_members;
ANALYZE public.user_roles;
ANALYZE public.agents;
