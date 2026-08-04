-- Fator X V2 schema baseline — 193 tables applied via Supabase Dashboard
-- 2026-08-01
--
-- IMPORTANT: The full schema was applied interactively via the Dashboard and
-- cannot be fully reconstructed here. The stubs below create the minimum
-- structure needed so that subsequent migration files can reference these
-- tables via FK constraints or ALTER TABLE statements without failing on a
-- fresh (CI/preview) database that starts with no tables at all.
--
-- In production, all IF NOT EXISTS guards prevent conflicts with the real
-- tables created via the Dashboard.

-- ═══ agents (stub) ════════════════════════════════════════════════════════════
-- Referenced as FK target by evaluation_runs (20260331110311) and altered by
-- fix_stub_schemas (20260332000001) which adds all real columns.
CREATE TABLE IF NOT EXISTS public.agents (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID,
  is_template  BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ agent_traces (stub) ══════════════════════════════════════════════════════
-- Altered by fix_stub_schemas (20260332000001) which adds all real columns.
CREATE TABLE IF NOT EXISTS public.agent_traces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY
);

-- ═══ agent_usage (stub) ═══════════════════════════════════════════════════════
-- Altered by implement_all_features (20260401200000) which adds a UNIQUE
-- constraint on (agent_id, user_id, date).
CREATE TABLE IF NOT EXISTS public.agent_usage (
  id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID,
  user_id  UUID,
  date     DATE
);

-- ═══ prompt_versions (stub) ═══════════════════════════════════════════════════
-- Altered by 20260405195401 which adds FK agent_id → agents(id) and an index.
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID
);

-- ═══ notifications (stub) ═════════════════════════════════════════════════════
-- Altered by fix_stub_schemas (20260332000001) which adds all real columns and
-- the FK to notification_templates.
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY
);

-- ═══ user_roles (stub) ════════════════════════════════════════════════════════
-- Altered by fix_stub_schemas (20260332000001) which adds role, workspace_id,
-- user_id columns and FK to workspaces.
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY
);

-- ═══ auth_attempts (stub) ═════════════════════════════════════════════════════
-- Altered by fix_stub_schemas (20260332000001) which adds id, email,
-- ip_address, success, created_at columns.
CREATE TABLE IF NOT EXISTS public.auth_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY
);

-- ═══ chunks (stub) ════════════════════════════════════════════════════════════
-- Altered by consolidated_schema_fixes (20260332000002) which adds the FK
-- chunks_knowledge_base_id_fkey → knowledge_bases(id).
CREATE TABLE IF NOT EXISTS public.chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY
);

-- ═══ vector_indexes (stub) ════════════════════════════════════════════════════
-- Altered by consolidated_schema_fixes (20260332000002) which adds the FK
-- vector_indexes_knowledge_base_id_fkey → knowledge_bases(id).
CREATE TABLE IF NOT EXISTS public.vector_indexes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY
);
