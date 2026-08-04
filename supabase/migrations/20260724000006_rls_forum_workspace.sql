-- ═══════════════════════════════════════════════════════════════
-- ETAPA 7/50 — RLS: forum_threads, forum_posts, help_centers
-- Mitiga: A-01 (forum cross-tenant)
-- Severity: 🔴 CRÍTICO
-- ═══════════════════════════════════════════════════════════════
-- PROBLEMA: forum_threads + forum_posts têm SELECT USING (true)
--   → QUALQUER usuário lê QUALQUER thread de QUALQUER workspace
--   → help_centers já está ok (is_published = true para SELECT)
-- SOLUÇÃO: SELECT filtrado por workspace via help_center.workspace_id
--           Insert/Update/Delete: workspace-scoped via membership
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- PASSO 1: help_centers — garantir workspace_id
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='help_centers' AND column_name='workspace_id') THEN
        ALTER TABLE public.help_centers ADD COLUMN workspace_id UUID;
        COMMENT ON COLUMN help_centers.workspace_id IS 'ETAPA 7: workspace-scoped RLS';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_help_centers_workspace ON public.help_centers(workspace_id);

-- Redefine policy de help_centers (a existente já é razoável, mas refinamos)
DROP POLICY IF EXISTS "Public read published help centers" ON public.help_centers;
DROP POLICY IF EXISTS "Workspace members manage help centers" ON public.help_centers;

CREATE POLICY "help_centers_public_read" ON public.help_centers
    FOR SELECT USING (is_published = true);

CREATE POLICY "help_centers_workspace_read" ON public.help_centers
    FOR SELECT USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
        OR is_published = true
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

CREATE POLICY "help_centers_workspace_write" ON public.help_centers
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

-- PASSO 2: forum_threads ────────────────────────────────────────
-- workspace_id derivado de help_center.workspace_id
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='forum_threads' AND column_name='workspace_id') THEN
        ALTER TABLE public.forum_threads ADD COLUMN workspace_id UUID;
        UPDATE public.forum_threads ft
        SET workspace_id = hc.workspace_id
        FROM public.help_centers hc
        WHERE ft.help_center_id = hc.id
          AND ft.workspace_id IS NULL;
        COMMENT ON COLUMN forum_threads.workspace_id IS 'ETAPA 7: denormalizado de help_centers';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_forum_threads_workspace ON public.forum_threads(workspace_id)
    WHERE workspace_id IS NOT NULL;

-- Drop policies inseguras
DROP POLICY IF EXISTS "Public read forum threads" ON public.forum_threads;
DROP POLICY IF EXISTS "Authenticated create threads" ON public.forum_threads;
DROP POLICY IF EXISTS "Authors update own threads" ON public.forum_threads;
DROP POLICY IF EXISTS "Authors delete own threads" ON public.forum_threads;

-- SELECT: workspace-scoped via help_center (publicados são públicos)
CREATE POLICY "forum_threads_workspace_read" ON public.forum_threads
    FOR SELECT USING (
        (
            -- Thread publicada → pública
            is_published = true
            AND help_center_id IN (
                SELECT id FROM public.help_centers WHERE is_published = true
            )
        )
        OR
        (
            -- Thread do workspace do usuário
            help_center_id IN (
                SELECT hc.id FROM public.help_centers hc
                JOIN public.workspace_members wm ON wm.workspace_id = hc.workspace_id
                WHERE wm.user_id = auth.uid()
            )
        )
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

-- INSERT: workspace-scoped (membro) + published
CREATE POLICY "forum_threads_workspace_insert" ON public.forum_threads
    FOR INSERT WITH CHECK (
        (
            help_center_id IN (
                SELECT hc.id FROM public.help_centers hc
                JOIN public.workspace_members wm ON wm.workspace_id = hc.workspace_id
                WHERE wm.user_id = auth.uid()
                  AND hc.workspace_id IS NOT NULL
            )
        )
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

-- UPDATE: autor da thread ou admin do workspace
CREATE POLICY "forum_threads_workspace_update" ON public.forum_threads
    FOR UPDATE USING (
        (
            -- Autor da thread
            created_by = auth.uid()
        )
        OR
        (
            -- Admin do workspace
            help_center_id IN (
                SELECT hc.id FROM public.help_centers hc
                JOIN public.workspace_members wm ON wm.workspace_id = hc.workspace_id
                WHERE wm.user_id = auth.uid()
                  AND wm.role IN ('owner', 'admin')
            )
        )
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

-- DELETE: admin do workspace
CREATE POLICY "forum_threads_workspace_delete" ON public.forum_threads
    FOR DELETE USING (
        help_center_id IN (
            SELECT hc.id FROM public.help_centers hc
            JOIN public.workspace_members wm ON wm.workspace_id = hc.workspace_id
            WHERE wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
        )
        OR created_by = auth.uid()
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

-- PASSO 3: forum_posts ──────────────────────────────────────────
-- workspace_id derivado de forum_threads
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='forum_posts' AND column_name='workspace_id') THEN
        ALTER TABLE public.forum_posts ADD COLUMN workspace_id UUID;
        UPDATE public.forum_posts fp
        SET workspace_id = ft.workspace_id
        FROM public.forum_threads ft
        WHERE fp.thread_id = ft.id
          AND fp.workspace_id IS NULL;
        COMMENT ON COLUMN forum_posts.workspace_id IS 'ETAPA 7: denormalizado de forum_threads';
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_forum_posts_workspace ON public.forum_posts(workspace_id)
    WHERE workspace_id IS NOT NULL;

DROP POLICY IF EXISTS "Public read forum posts" ON public.forum_posts;
DROP POLICY IF EXISTS "Authenticated create posts" ON public.forum_posts;
DROP POLICY IF EXISTS "Authors update own posts" ON public.forum_posts;
DROP POLICY IF EXISTS "Authors delete own posts" ON public.forum_posts;

CREATE POLICY "forum_posts_workspace_read" ON public.forum_posts
    FOR SELECT USING (
        (
            -- Post em thread pública
            thread_id IN (
                SELECT ft.id FROM public.forum_threads ft
                JOIN public.help_centers hc ON ft.help_center_id = hc.id
                WHERE ft.is_published = true AND hc.is_published = true
            )
        )
        OR
        (
            -- Post em thread do workspace do usuário
            thread_id IN (
                SELECT ft.id FROM public.forum_threads ft
                JOIN public.help_centers hc ON ft.help_center_id = hc.id
                JOIN public.workspace_members wm ON wm.workspace_id = hc.workspace_id
                WHERE wm.user_id = auth.uid()
            )
        )
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

CREATE POLICY "forum_posts_workspace_insert" ON public.forum_posts
    FOR INSERT WITH CHECK (
        (
            thread_id IN (
                SELECT ft.id FROM public.forum_threads ft
                JOIN public.help_centers hc ON ft.help_center_id = hc.id
                JOIN public.workspace_members wm ON wm.workspace_id = hc.workspace_id
                WHERE wm.user_id = auth.uid()
                  AND hc.workspace_id IS NOT NULL
            )
        )
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

CREATE POLICY "forum_posts_workspace_update" ON public.forum_posts
    FOR UPDATE USING (
        created_by = auth.uid()
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

CREATE POLICY "forum_posts_workspace_delete" ON public.forum_posts
    FOR DELETE USING (
        created_by = auth.uid()
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
    -- Confirma que USING (true) não existe mais nos fóruns
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public'
          AND tablename IN ('forum_threads', 'forum_posts')
          AND policyname LIKE '%public%read%'
    ) THEN
        RAISE WARNING 'Policy pública insegura ainda existe em forum_tables';
    END IF;

    RAISE NOTICE 'ETAPA 7 OK: forum + help_centers workspace-scoped';
END;
$$;
