-- ═══════════════════════════════════════════════════════════════
-- ETAPA 5/50 — RLS: agent_skills, skill_registry, agent_installed_skills
-- Mitiga: A-03, K-05 (agent_memories cross-tenant + skills leak)
-- Severity: 🔴 CRÍTICO
-- ═══════════════════════════════════════════════════════════════
-- PROBLEMA: agent_skills + skill_registry têm ENABLE RLS sem policies
--           → nenhum usuário acessa (RLS nega por default) OU
--           → policies incompletas em agent_installed_skills
-- SOLUÇÃO: workspace-scoped policies em todas as 3 tabelas
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- PASSO 1: agent_skills ─────────────────────────────────────────
-- workspace_id derivado do agent (que tem workspace_id)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='agent_skills' AND column_name='workspace_id') THEN
        ALTER TABLE public.agent_skills ADD COLUMN workspace_id UUID;
        -- Backfill via JOIN com agents table
        UPDATE public.agent_skills a_s
        SET workspace_id = ag.workspace_id
        FROM public.agents ag
        WHERE a_s.agent_id = ag.id
          AND a_s.workspace_id IS NULL;
        ALTER TABLE public.agent_skills ALTER COLUMN workspace_id SET NOT NULL;
        COMMENT ON COLUMN agent_skills.workspace_id IS 'ETAPA 5: denormalizado de agents';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_agent_skills_workspace ON public.agent_skills(workspace_id);

-- DROP policies existentes (se houver) e substituir
DROP POLICY IF EXISTS "agent_skills_all" ON public.agent_skills;
DROP POLICY IF EXISTS "agent_skills_select" ON public.agent_skills;

CREATE POLICY "agent_skills_workspace_read" ON public.agent_skills
    FOR SELECT USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE POLICY "agent_skills_workspace_insert" ON public.agent_skills
    FOR INSERT WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin', 'member')
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE POLICY "agent_skills_workspace_update" ON public.agent_skills
    FOR UPDATE USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin', 'member')
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE POLICY "agent_skills_workspace_delete" ON public.agent_skills
    FOR DELETE USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
        OR auth.jwt_role() = 'service_role'
    );

-- PASSO 2: skill_registry ────────────────────────────────────────
-- Marketplace: público para leitura, workspace-scoped para write
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='skill_registry' AND column_name='workspace_id') THEN
        ALTER TABLE public.skill_registry ADD COLUMN workspace_id UUID;
        COMMENT ON COLUMN skill_registry.workspace_id IS
            'ETAPA 5: NULL = global do marketplace, UUID = custom do workspace';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_skill_registry_workspace ON public.skill_registry(workspace_id);

DROP POLICY IF EXISTS "skill_registry_all" ON public.skill_registry;
DROP POLICY IF EXISTS "skill_registry_select" ON public.skill_registry;

-- Público para leitura (marketplace global)
CREATE POLICY "skill_registry_public_read" ON public.skill_registry
    FOR SELECT USING (TRUE);

-- Workspace para criação/edição (admin do workspace ou service_role)
CREATE POLICY "skill_registry_workspace_insert" ON public.skill_registry
    FOR INSERT WITH CHECK (
        (workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        ) AND workspace_id IS NOT NULL)
        OR auth.jwt_role() = 'service_role'
    );

CREATE POLICY "skill_registry_workspace_update" ON public.skill_registry
    FOR UPDATE USING (
        (workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        ) AND workspace_id IS NOT NULL)
        OR auth.jwt_role() = 'service_role'
    );

-- Only owner/workspace admins de uma skill custom podem deletar
CREATE POLICY "skill_registry_workspace_delete" ON public.skill_registry
    FOR DELETE USING (
        (workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role = 'owner'
        ) AND workspace_id IS NOT NULL)
        OR auth.jwt_role() = 'service_role'
    );

-- PASSO 3: agent_installed_skills ────────────────────────────────
-- Deriva workspace_id de agent_installed_skills → agent → workspace
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='agent_installed_skills' AND column_name='workspace_id') THEN
        ALTER TABLE public.agent_installed_skills ADD COLUMN workspace_id UUID;
        UPDATE public.agent_installed_skills ais
        SET workspace_id = ag.workspace_id
        FROM public.agents ag
        WHERE ais.agent_id = ag.id
          AND ais.workspace_id IS NULL;
        ALTER TABLE public.agent_installed_skills ALTER COLUMN workspace_id SET NOT NULL;
        COMMENT ON COLUMN agent_installed_skills.workspace_id IS 'ETAPA 5: denormalizado de agents';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_agent_installed_skills_workspace ON public.agent_installed_skills(workspace_id);

DROP POLICY IF EXISTS "agent_installed_skills_all" ON public.agent_installed_skills;
DROP POLICY IF EXISTS "Users can update installed skills" ON public.agent_installed_skills;

CREATE POLICY "agent_installed_skills_workspace_read" ON public.agent_installed_skills
    FOR SELECT USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE POLICY "agent_installed_skills_workspace_insert" ON public.agent_installed_skills
    FOR INSERT WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin', 'member')
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE POLICY "agent_installed_skills_workspace_update" ON public.agent_installed_skills
    FOR UPDATE USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin', 'member')
        )
        OR auth.jwt_role() = 'service_role'
    );

CREATE POLICY "agent_installed_skills_workspace_delete" ON public.agent_installed_skills
    FOR DELETE USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
        OR auth.jwt_role() = 'service_role'
    );

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
    tbl TEXT;
    policy_count INT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['agent_skills', 'skill_registry', 'agent_installed_skills'] LOOP
        SELECT COUNT(*) INTO policy_count
        FROM pg_policies WHERE schemaname='public' AND tablename=tbl;

        RAISE NOTICE 'ETAPA 5: % has % policies', tbl, policy_count;

        IF policy_count = 0 THEN
            RAISE EXCEPTION 'CRITICAL: % has ZERO RLS policies!', tbl;
        END IF;
    END LOOP;

    RAISE NOTICE 'ETAPA 5 OK: agent_skills + skill_registry + agent_installed_skills RLS complete';
END;
$$;
