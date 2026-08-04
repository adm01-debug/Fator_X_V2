-- ═══════════════════════════════════════════════════════════════
-- ETAPA 6/50 — RLS: knowledge_entities, knowledge_relations,
--               agent_memories_v2, entity_resolution_logs
-- Mitiga: A-03, K-05 (USING (true) = cross-tenant READ de memórias)
-- Severity: 🔴 CRÍTICO
-- ═══════════════════════════════════════════════════════════════
-- PROBLEMA: 4 tabelas com POLICY "USING (true)" em SELECT
--   → qualquer usuário autenticado lê TODA a base de knowledge graph
--   → agent_memories_v2 expõe memórias de AGENTES DE OUTROS workspaces
-- SOLUÇÃO: workspace_id em todas + policies filtradas
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- PASSO 1: knowledge_entities ───────────────────────────────────
-- workspace_id JÁ existe (opcional). Torna NOT NULL se já tem dados.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='knowledge_entities' AND column_name='workspace_id') THEN
        ALTER TABLE public.knowledge_entities ADD COLUMN workspace_id UUID;
    END IF;

    -- Backfill workspace_id via agent_id (se existir)
    -- Se não conseguir, marca como NULL (entidades globais)
    UPDATE public.knowledge_entities ke
    SET workspace_id = ag.workspace_id
    FROM public.agents ag
    WHERE ke.metadata->>'agent_id' = ag.id::TEXT
      AND ke.workspace_id IS NULL;

    -- Para entidades sem agent_id: workspace do último editor (via updated_by se existir)
    -- Se nenhuma forma de derivar: mantém NULL (marcadas como globais)
END;
$$;
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_workspace ON public.knowledge_entities(workspace_id)
    WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_name ON public.knowledge_entities(name);

-- Drop policies inseguras
DROP POLICY IF EXISTS "Allow authenticated read on knowledge entities" ON public.knowledge_entities;

-- workspace-scoped: admins/members leem e escrevem
CREATE POLICY "knowledge_entities_workspace_all" ON public.knowledge_entities
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin', 'member')
        )
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

-- Entidades globais (workspace_id IS NULL): público para leitura
CREATE POLICY "knowledge_entities_global_read" ON public.knowledge_entities
    FOR SELECT USING (workspace_id IS NULL);

-- PASSO 2: knowledge_relations ────────────────────────────────────
-- NÃO TEM workspace_id. Deriva via source_id → knowledge_entities
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='knowledge_relations' AND column_name='workspace_id') THEN
        ALTER TABLE public.knowledge_relations ADD COLUMN workspace_id UUID;
        -- Backfill via source_id
        UPDATE public.knowledge_relations kr
        SET workspace_id = ke.workspace_id
        FROM public.knowledge_entities ke
        WHERE kr.source_id = ke.id
          AND kr.workspace_id IS NULL;
        -- Para relations sem source (se houver), tenta via target
        UPDATE public.knowledge_relations kr
        SET workspace_id = ke2.workspace_id
        FROM public.knowledge_entities ke2
        WHERE kr.target_id = ke2.id
          AND kr.workspace_id IS NULL;
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_knowledge_relations_workspace ON public.knowledge_relations(workspace_id)
    WHERE workspace_id IS NOT NULL;

DROP POLICY IF EXISTS "Allow authenticated read on knowledge relations" ON public.knowledge_relations;

CREATE POLICY "knowledge_relations_workspace_all" ON public.knowledge_relations
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

-- PASSO 3: agent_memories_v2 ─────────────────────────────────────
-- CRÍTICO: agent_id existe mas policy = USING (true)
-- Deriva workspace_id via agent_id
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='agent_memories_v2' AND column_name='workspace_id') THEN
        ALTER TABLE public.agent_memories_v2 ADD COLUMN workspace_id UUID;
        -- Backfill via agent
        UPDATE public.agent_memories_v2 am
        SET workspace_id = ag.workspace_id
        FROM public.agents ag
        WHERE am.agent_id = ag.id
          AND am.workspace_id IS NULL;
        -- agents globais (workspace_id NULL em agents): mantém NULL (sistema)
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_agent_memories_v2_workspace ON public.agent_memories_v2(workspace_id)
    WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memories_v2_agent ON public.agent_memories_v2(agent_id, context_tier)
    WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memories_v2_tier_decay ON public.agent_memories_v2(context_tier, last_accessed_at)
    WHERE workspace_id IS NOT NULL;

DROP POLICY IF EXISTS "Allow authenticated read on agent memories" ON public.agent_memories_v2;

-- Membros do workspace: leem memórias dos agentes do workspace
CREATE POLICY "agent_memories_v2_workspace_read" ON public.agent_memories_v2
    FOR SELECT USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
        OR workspace_id IS NULL  -- memórias globais de sistema
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

-- Inserção: agentes ou service_role
CREATE POLICY "agent_memories_v2_workspace_insert" ON public.agent_memories_v2
    FOR INSERT WITH CHECK (
        (workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        ) AND workspace_id IS NOT NULL)
        OR workspace_id IS NULL
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

-- Update/Delete: membros do workspace ou service_role
CREATE POLICY "agent_memories_v2_workspace_update" ON public.agent_memories_v2
    FOR UPDATE USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
        OR workspace_id IS NULL
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

CREATE POLICY "agent_memories_v2_workspace_delete" ON public.agent_memories_v2
    FOR DELETE USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
        OR workspace_id IS NULL
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

-- PASSO 4: entity_resolution_logs ────────────────────────────────
-- Deriva workspace_id via primary_entity_id → knowledge_entities
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='entity_resolution_logs' AND column_name='workspace_id') THEN
        ALTER TABLE public.entity_resolution_logs ADD COLUMN workspace_id UUID;
        UPDATE public.entity_resolution_logs erl
        SET workspace_id = ke.workspace_id
        FROM public.knowledge_entities ke
        WHERE erl.primary_entity_id = ke.id
          AND erl.workspace_id IS NULL;
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_entity_resolution_logs_workspace ON public.entity_resolution_logs(workspace_id)
    WHERE workspace_id IS NOT NULL;

DROP POLICY IF EXISTS "Allow authenticated read on resolution logs" ON public.entity_resolution_logs;

CREATE POLICY "entity_resolution_logs_workspace_all" ON public.entity_resolution_logs
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
    tbl TEXT;
    has_bad_policy BOOLEAN;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'knowledge_entities','knowledge_relations',
        'agent_memories_v2','entity_resolution_logs'
    ] LOOP
        SELECT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname='public' AND tablename=tbl
              AND policyname LIKE '%authenticated%read%using%true%'
        ) INTO has_bad_policy;

        IF has_bad_policy THEN
            RAISE WARNING 'Policy insegura ainda existe em %', tbl;
        END IF;

        RAISE NOTICE 'ETAPA 6: % policies OK', tbl;
    END LOOP;

    RAISE NOTICE 'ETAPA 6 OK: knowledge_graph RLS completo';
END;
$$;
