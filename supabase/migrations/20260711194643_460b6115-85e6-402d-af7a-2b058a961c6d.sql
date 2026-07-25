
-- Duplicata verdadeira em agent_traces: dois índices btree idênticos (agent_id, created_at DESC)
-- Cascata automática remove filhos em todas as partições
DROP INDEX IF EXISTS public.idx_agent_traces_agent_created_desc;

-- Tabelas de negócio: duplicatas confirmadas
DROP INDEX IF EXISTS public.idx_evaluation_runs_workspace;
DROP INDEX IF EXISTS public.idx_knowledge_bases_workspace;
DROP INDEX IF EXISTS public.idx_oracle_history_created;
DROP INDEX IF EXISTS public.idx_oracle_history_user;
DROP INDEX IF EXISTS public.idx_prompt_versions_agent;
DROP INDEX IF EXISTS public.idx_sessions_agent;
DROP INDEX IF EXISTS public.idx_smm_skill;
DROP INDEX IF EXISTS public.idx_skill_registry_slug;
DROP INDEX IF EXISTS public.idx_user_filter_preferences_user_scope;
DROP INDEX IF EXISTS public.idx_workflow_runs_workflow;
DROP INDEX IF EXISTS public.idx_workflows_workspace;
DROP INDEX IF EXISTS public.idx_workspace_members_user;
DROP INDEX IF EXISTS public.idx_workspace_members_workspace;

ANALYZE public.workspace_members;
ANALYZE public.workflows;
ANALYZE public.oracle_history;
ANALYZE public.sessions;
