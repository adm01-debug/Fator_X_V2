
-- =========================================================
-- 1) FORUM: is_published (threads + posts)
-- =========================================================
ALTER TABLE public.forum_threads
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_forum_threads_published
  ON public.forum_threads (help_center_id, is_published, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_published
  ON public.forum_posts (thread_id, is_published, created_at);

DROP POLICY IF EXISTS "Public read forum threads" ON public.forum_threads;
CREATE POLICY "Public read forum threads"
  ON public.forum_threads FOR SELECT
  TO anon, authenticated
  USING (is_published = true OR auth.uid() = author_id);

DROP POLICY IF EXISTS "Public read forum posts" ON public.forum_posts;
CREATE POLICY "Public read forum posts"
  ON public.forum_posts FOR SELECT
  TO anon, authenticated
  USING (
    is_published = true
    OR auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM public.forum_threads t
      WHERE t.id = forum_posts.thread_id AND t.author_id = auth.uid()
    )
  );

-- =========================================================
-- 2) TRACES RETENTION (90 days)
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_agent_traces_agent_created
  ON public.agent_traces (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_traces_user_created
  ON public.agent_traces (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trace_events_v2_workspace_created
  ON public.trace_events_v2 (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trace_events_v2_trace
  ON public.trace_events_v2 (trace_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prune_traces_retention(_days INT DEFAULT 90)
RETURNS TABLE(table_name TEXT, partition_name TEXT, dropped BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  cutoff TIMESTAMPTZ := now() - make_interval(days => _days);
  part_end TIMESTAMPTZ;
  expr TEXT;
BEGIN
  FOR r IN
    SELECT
      n.nspname  AS schema_name,
      c.relname  AS part_name,
      p.relname  AS parent_name,
      pg_get_expr(c.relpartbound, c.oid) AS bound_expr
    FROM pg_inherits i
    JOIN pg_class c  ON c.oid = i.inhrelid
    JOIN pg_class p  ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.relname IN ('agent_traces','trace_events_v2')
  LOOP
    expr := r.bound_expr;
    IF expr IS NULL OR expr NOT ILIKE 'FOR VALUES FROM %' THEN
      CONTINUE;
    END IF;
    -- bound: FOR VALUES FROM ('YYYY-MM-DD ...') TO ('YYYY-MM-DD ...')
    BEGIN
      part_end := (regexp_matches(expr, 'TO \(''([^'']+)''\)'))[1]::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
    IF part_end <= cutoff THEN
      EXECUTE format('DROP TABLE IF EXISTS %I.%I', r.schema_name, r.part_name);
      table_name := r.parent_name;
      partition_name := r.part_name;
      dropped := true;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_traces_retention(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_traces_retention(INT) TO service_role;

-- Schedule daily @ 03:15 UTC (pg_cron)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('traces-retention-90d')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'traces-retention-90d');
    PERFORM cron.schedule(
      'traces-retention-90d',
      '15 3 * * *',
      $c$ SELECT public.prune_traces_retention(90); $c$
    );
  END IF;
END $$;
