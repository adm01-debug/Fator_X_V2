-- ============================================================================
-- 5) FUNCOES, GRANTS e TRIGGERS do repo que NAO existem em producao
--
-- Evidencia (catalogo real de producao, 2026-11-26):
--   pg_proc em `public` = 46 nomes; as migracoes do repo declaram 188
--   assinaturas. Faltam 139 nomes (listados abaixo). Sem elas, RPCs usadas
--   por telas que ja estao no app respondem PGRST202 (Registro de Riscos,
--   Anomalias de Custo, 2FA, Fornecedores, Segredos, Orcamento, LGPD,
--   On-call, Pentest, DR) e os triggers de updated_at/auditoria nunca disparam.
--
--   _fase8_snapshot_as, accept_workspace_invitation, acknowledge_cost_alert, acknowledge_vulnerability, activate_ir_playbook, apply_skill_description, assess_vendor, assign_variant, audit_asset, check_budget, check_budget_alert, check_retention_job_health, chunks_search_vector_trigger, claim_due_cadence_enrollments, cleanup_auth_attempts, close_risk, collections_fill_workspace, complete_dr_drill, compute_cost_baselines, compute_experiment_stats, create_api_key_bcrypt, create_incident_run, create_partition_if_not_exists, create_pentest_engagement, create_sbom_snapshot, decide_change, decide_skill_reclassification, decommission_asset, detect_cost_anomalies, detect_slow_queries_and_alert, disable_all_chaos, encrypt_secret_value, enforce_budget, enforce_freeze_window, execute_change, explain_query_plan, forum_update_thread_stats, generate_compliance_report, generate_postmortem_from_gameday, generate_postmortem_from_incident, get_active_chaos_faults, get_creator_earnings, get_cron_job_health, get_current_oncall, get_current_spend, get_db_health_timeseries, get_detector_slo_status, get_knowledge_graph_health, get_masked_secrets, get_my_2fa_status, get_oncall_with_contacts, get_partition_health_snapshot, get_pending_invites_for_email, get_pentest_summary, get_risk_summary, get_slow_query_alerts_history, get_synthetic_summary, get_workspace_daily_usage_v2, get_workspace_members_full, handle_asset_audit, handle_auth_failure_alert, handle_bcp_test_run, handle_ir_tabletop, handle_risk_review_event, handle_secret_rotation_event, handle_vendor_assessment, hash_api_key_bcrypt, hybrid_memory_search_notebook, hybrid_search, increment_skill_installs, increment_template_installs, increment_version_column, insert_audit_log, invite_workspace_member, is_mfa_valid_for_role, kb_article_create_version, lgpd_apply_retention_policies, lgpd_check_sar_deadlines, lgpd_send_review_reminders, make_audit_log_immutable, mark_secret_retired, mark_vulnerability_fixed, mask_email, match_chunks, match_memories, normalize_skill_department_provenance, normalize_skill_meta_collection, offboard_vendor, pg_net_schema, pg_net_smoke_post, pg_net_smoke_response, promote_experiment_winner, prune_traces_retention, publish_compliance_report, publish_postmortem, purchase_skill, purge_removed_template_skill_links, purge_stale_harvest_checkpoints, recalc_skill_rating, record_bcp_test, record_dr_step, record_pentest_finding, record_secret_rotation, record_vulnerability, refresh_agent_daily_metrics, refresh_knowledge_graph_health, refresh_secrets_status, register_asset, register_business_system, register_managed_secret, register_risk, register_vendor, reset_workspace_budget, review_risk, rollback_change, run_pg_net_smoke_test, run_prune_traces_retention_monitored, run_purge_template_skill_links_monitored, search_context_l0, set_pentest_finding_due_date, set_updated_at, snapshot_note_version, stamp_skill_curation, start_dr_drill, submit_change_request, template_skill_links_set_actor, tg_notebook_canvases_updated_at, touch_agent_routing_updated_at, touch_user_filter_preferences, trg_auto_partition, update_budget_on_usage, update_engagement_finding_count, update_incident_run, update_pentest_finding_status, validate_audit_log_fields, validate_oncall_workspace_consistency, verify_api_key, verify_api_key_bcrypt, verify_cron_token
--
-- Gerado das migracoes do repo: a ultima definicao de cada ASSINATURA (nome +
-- tipos dos argumentos) vence, na ordem cronologica. Nao toca funcao que ja
-- existe em producao. Idempotente: CREATE OR REPLACE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.workspace_members
  SET accepted_at = now()
  WHERE id = p_member_id
    AND user_id = auth.uid()
    AND accepted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_chunks(
  query_embedding extensions.vector(1536),
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.7,
  filter_kb_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  chunk_index INT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    c.content,
    c.chunk_index,
    c.metadata,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.chunks c
  JOIN public.documents d ON d.id = c.document_id
  JOIN public.collections col ON col.id = d.collection_id
  WHERE c.embedding IS NOT NULL
    AND c.embedding_status = 'done'
    AND (filter_kb_id IS NULL OR col.knowledge_base_id = filter_kb_id)
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_memories(
  query_embedding extensions.vector(1536),
  p_agent_id UUID,
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.6
)
RETURNS TABLE (
  id UUID,
  memory_type TEXT,
  content TEXT,
  source TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.memory_type,
    m.content,
    m.source,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.agent_memories m
  WHERE m.agent_id = p_agent_id
    AND m.embedding IS NOT NULL
    AND (m.expires_at IS NULL OR m.expires_at > now())
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_budget_on_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.budgets
  SET current_usd = current_usd + NEW.cost_usd,
      updated_at = now()
  WHERE workspace_id = NEW.workspace_id
    AND is_active = true
    AND period = 'monthly';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.check_budget_alert()
RETURNS TRIGGER AS $$
DECLARE
  budget_rec RECORD;
BEGIN
  -- Only fire if current_usd actually increased
  IF NEW.current_usd <= OLD.current_usd THEN
    RETURN NEW;
  END IF;
  
  IF NEW.current_usd >= (NEW.limit_usd * NEW.alert_threshold) THEN
    INSERT INTO public.alerts (workspace_id, severity, title, message)
    VALUES (
      NEW.workspace_id,
      CASE WHEN NEW.current_usd >= NEW.limit_usd THEN 'critical' ELSE 'warning' END,
      CASE WHEN NEW.current_usd >= NEW.limit_usd
        THEN 'Budget "' || NEW.name || '" estourado!'
        ELSE 'Budget "' || NEW.name || '" atingiu ' || ROUND((NEW.current_usd / NEW.limit_usd * 100)::numeric, 1) || '%'
      END,
      'Gasto atual: $' || ROUND(NEW.current_usd::numeric, 4) || ' / Limite: $' || ROUND(NEW.limit_usd::numeric, 2)
    )
    ON CONFLICT (workspace_id, title) DO UPDATE SET
      message = EXCLUDED.message,
      severity = EXCLUDED.severity,
      is_resolved = false,
      created_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.chunks_search_vector_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('portuguese', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.hybrid_search(
  query_text TEXT,
  query_embedding extensions.vector(1536),
  match_count INT DEFAULT 10,
  bm25_weight FLOAT DEFAULT 0.3,
  semantic_weight FLOAT DEFAULT 0.7,
  filter_kb_id UUID DEFAULT NULL
)
RETURNS TABLE (
  chunk_id UUID,
  content TEXT,
  document_id UUID,
  bm25_rank FLOAT,
  semantic_rank FLOAT,
  rrf_score FLOAT,
  metadata JSONB
) AS $$
DECLARE
  k CONSTANT INT := 60; -- RRF constant
  fetch_count INT := match_count * 5; -- Over-fetch for better fusion
BEGIN
  RETURN QUERY
  WITH
  -- BM25 full-text search
  bm25_results AS (
    SELECT c.id, c.content, c.document_id, c.metadata,
      ts_rank_cd(c.search_vector, plainto_tsquery('portuguese', query_text)) AS rank,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.search_vector, plainto_tsquery('portuguese', query_text)) DESC) AS rn
    FROM public.chunks c
    JOIN public.documents d ON c.document_id = d.id
    JOIN public.collections col ON d.collection_id = col.id
    WHERE c.search_vector @@ plainto_tsquery('portuguese', query_text)
      AND c.embedding_status = 'done'
      AND (filter_kb_id IS NULL OR col.knowledge_base_id = filter_kb_id)
    ORDER BY rank DESC
    LIMIT fetch_count
  ),
  -- Semantic vector search
  semantic_results AS (
    SELECT c.id, c.content, c.document_id, c.metadata,
      1 - (c.embedding <=> query_embedding) AS rank,
      ROW_NUMBER() OVER (ORDER BY c.embedding <=> query_embedding) AS rn
    FROM public.chunks c
    JOIN public.documents d ON c.document_id = d.id
    JOIN public.collections col ON d.collection_id = col.id
    WHERE c.embedding IS NOT NULL
      AND c.embedding_status = 'done'
      AND (filter_kb_id IS NULL OR col.knowledge_base_id = filter_kb_id)
    ORDER BY c.embedding <=> query_embedding
    LIMIT fetch_count
  ),
  -- Reciprocal Rank Fusion
  combined AS (
    SELECT
      COALESCE(b.id, s.id) AS id,
      COALESCE(b.content, s.content) AS content,
      COALESCE(b.document_id, s.document_id) AS document_id,
      COALESCE(b.metadata, s.metadata) AS metadata,
      COALESCE(b.rank, 0) AS bm25_r,
      COALESCE(s.rank, 0) AS sem_r,
      bm25_weight * (1.0 / (k + COALESCE(b.rn, fetch_count))) +
      semantic_weight * (1.0 / (k + COALESCE(s.rn, fetch_count))) AS score
    FROM bm25_results b
    FULL OUTER JOIN semantic_results s ON b.id = s.id
  )
  SELECT c.id, c.content, c.document_id, c.bm25_r, c.sem_r, c.score, c.metadata
  FROM combined c
  ORDER BY c.score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.hybrid_search(
  p_query_embedding extensions.vector(1024),
  p_query_text TEXT,
  p_collection_ids UUID[] DEFAULT NULL,
  p_top_k INTEGER DEFAULT 10,
  p_rrf_k INTEGER DEFAULT 60
) RETURNS TABLE(
  chunk_id UUID,
  content TEXT,
  document_id UUID,
  collection_id UUID,
  parent_chunk_id UUID,
  vector_score FLOAT,
  bm25_score FLOAT,
  rrf_score FLOAT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH
  -- Vector search (semantic)
  vector_results AS (
    SELECT c.id, c.content, c.document_id, c.collection_id, c.parent_chunk_id, c.metadata,
           1 - (c.embedding <=> p_query_embedding) AS score,
           ROW_NUMBER() OVER (ORDER BY c.embedding <=> p_query_embedding) AS rank
    FROM public.chunks c
    WHERE c.embedding IS NOT NULL
      AND c.chunk_level = 'child'
      AND (p_collection_ids IS NULL OR c.collection_id = ANY(p_collection_ids))
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT p_top_k * 3
  ),
  -- BM25 search (keyword)
  bm25_results AS (
    SELECT c.id, c.content, c.document_id, c.collection_id, c.parent_chunk_id, c.metadata,
           ts_rank_cd(c.bm25_tsvector, plainto_tsquery('portuguese', p_query_text)) AS score,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.bm25_tsvector, plainto_tsquery('portuguese', p_query_text)) DESC) AS rank
    FROM public.chunks c
    WHERE c.bm25_tsvector @@ plainto_tsquery('portuguese', p_query_text)
      AND c.chunk_level = 'child'
      AND (p_collection_ids IS NULL OR c.collection_id = ANY(p_collection_ids))
    ORDER BY score DESC
    LIMIT p_top_k * 3
  ),
  -- RRF fusion
  fused AS (
    SELECT
      COALESCE(v.id, b.id) AS id,
      COALESCE(v.content, b.content) AS content,
      COALESCE(v.document_id, b.document_id) AS document_id,
      COALESCE(v.collection_id, b.collection_id) AS collection_id,
      COALESCE(v.parent_chunk_id, b.parent_chunk_id) AS parent_chunk_id,
      COALESCE(v.metadata, b.metadata) AS metadata,
      COALESCE(v.score, 0) AS v_score,
      COALESCE(b.score, 0) AS b_score,
      COALESCE(1.0 / (p_rrf_k + v.rank), 0) + COALESCE(1.0 / (p_rrf_k + b.rank), 0) AS rrf
    FROM vector_results v
    FULL OUTER JOIN bm25_results b ON v.id = b.id
  )
  SELECT
    f.id AS chunk_id,
    f.content,
    f.document_id,
    f.collection_id,
    f.parent_chunk_id,
    f.v_score AS vector_score,
    f.b_score AS bm25_score,
    f.rrf AS rrf_score,
    f.metadata
  FROM fused f
  ORDER BY f.rrf DESC
  LIMIT p_top_k;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.increment_skill_installs(p_skill_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.skill_registry SET install_count = install_count + 1 WHERE id = p_skill_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_template_installs(template_uuid UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.automation_templates SET installs = installs + 1 WHERE id = template_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_masked_secrets(p_workspace_id uuid)
RETURNS TABLE(id uuid, key_name text, masked_value text, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    ws.id,
    ws.key_name,
    '••••••••' AS masked_value,
    ws.created_at,
    ws.updated_at
  FROM public.workspace_secrets ws
  JOIN public.workspaces w ON w.id = ws.workspace_id
  WHERE ws.workspace_id = p_workspace_id
    AND w.owner_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.touch_agent_routing_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.kb_article_create_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (OLD.content_json IS DISTINCT FROM NEW.content_json) OR (OLD.title IS DISTINCT FROM NEW.title) THEN
    NEW.current_version := OLD.current_version + 1;
    INSERT INTO public.kb_article_versions(article_id, version, title, content_json, content_html, author_id)
    VALUES (OLD.id, OLD.current_version, OLD.title, OLD.content_json, OLD.content_html, OLD.author_id);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.forum_update_thread_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_threads SET reply_count = reply_count + 1, last_activity_at = now() WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_threads SET reply_count = GREATEST(0, reply_count - 1) WHERE id = OLD.thread_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.recalc_skill_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_skill_id UUID := COALESCE(NEW.skill_id, OLD.skill_id);
  v_avg NUMERIC(3,2);
  v_count INTEGER;
BEGIN
  SELECT COALESCE(AVG(rating)::numeric(3,2), 0), COUNT(*)
    INTO v_avg, v_count
    FROM public.skill_reviews WHERE skill_id = v_skill_id;
  UPDATE public.skill_marketplace_meta
    SET avg_rating = v_avg, review_count = v_count, updated_at = now()
    WHERE skill_id = v_skill_id;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.purchase_skill(p_skill_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_meta public.skill_marketplace_meta%ROWTYPE;
  v_buyer UUID := auth.uid();
  v_payout INTEGER;
  v_fee INTEGER;
  v_purchase_id UUID;
BEGIN
  IF v_buyer IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO v_meta FROM public.skill_marketplace_meta WHERE skill_id = p_skill_id;
  IF NOT FOUND THEN
    -- Sem metadata = grátis, registra install só
    INSERT INTO public.skill_purchases (skill_id, buyer_id, creator_id, amount_cents, status, payment_provider)
      VALUES (p_skill_id, v_buyer, v_buyer, 0, 'completed', 'free')
      RETURNING id INTO v_purchase_id;
    RETURN jsonb_build_object('purchase_id', v_purchase_id, 'amount_cents', 0, 'status', 'completed');
  END IF;
  v_payout := (v_meta.price_cents * v_meta.creator_payout_pct) / 100;
  v_fee := v_meta.price_cents - v_payout;
  INSERT INTO public.skill_purchases (skill_id, buyer_id, creator_id, amount_cents, creator_payout_cents, platform_fee_cents, status, payment_provider)
    VALUES (p_skill_id, v_buyer, v_meta.creator_id, v_meta.price_cents, v_payout, v_fee, 'completed', 'mock')
    RETURNING id INTO v_purchase_id;
  UPDATE public.skill_marketplace_meta SET install_count = install_count + 1 WHERE skill_id = p_skill_id;
  RETURN jsonb_build_object('purchase_id', v_purchase_id, 'amount_cents', v_meta.price_cents, 'creator_payout_cents', v_payout, 'platform_fee_cents', v_fee, 'status', 'completed');
END $$;

CREATE OR REPLACE FUNCTION public.get_creator_earnings(p_creator_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_sales', COALESCE(COUNT(*), 0),
    'total_revenue_cents', COALESCE(SUM(amount_cents), 0),
    'total_payout_cents', COALESCE(SUM(creator_payout_cents), 0),
    'total_fees_cents', COALESCE(SUM(platform_fee_cents), 0)
  )
  FROM public.skill_purchases
  WHERE creator_id = COALESCE(p_creator_id, auth.uid())
    AND status = 'completed';
$$;

CREATE OR REPLACE FUNCTION public.assign_variant(p_experiment_id UUID, p_session_key TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_split INTEGER;
  v_status TEXT;
  v_hash INTEGER;
  v_key TEXT;
BEGIN
  SELECT traffic_split, status INTO v_split, v_status
    FROM public.prompt_experiments WHERE id = p_experiment_id;
  IF NOT FOUND OR v_status <> 'running' THEN
    RETURN 'a';
  END IF;
  v_key := COALESCE(p_session_key, gen_random_uuid()::text);
  v_hash := abs(hashtext(v_key)) % 100;
  IF v_hash < v_split THEN
    RETURN 'a';
  ELSE
    RETURN 'b';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.compute_experiment_stats(p_experiment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metric TEXT;
  v_a_n INTEGER; v_b_n INTEGER;
  v_a_success INTEGER; v_b_success INTEGER;
  v_a_lat NUMERIC; v_b_lat NUMERIC;
  v_a_cost NUMERIC; v_b_cost NUMERIC;
  v_a_qual NUMERIC; v_b_qual NUMERIC;
  v_p1 NUMERIC; v_p2 NUMERIC; v_p_pool NUMERIC;
  v_se NUMERIC; v_z NUMERIC; v_p_value NUMERIC;
  v_winner TEXT;
  v_significant BOOLEAN;
BEGIN
  SELECT success_metric INTO v_metric FROM public.prompt_experiments WHERE id = p_experiment_id;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE success),
         COALESCE(AVG(latency_ms),0), COALESCE(AVG(cost_cents),0), COALESCE(AVG(quality_score),0)
    INTO v_a_n, v_a_success, v_a_lat, v_a_cost, v_a_qual
    FROM public.prompt_experiment_runs
    WHERE experiment_id = p_experiment_id AND variant = 'a';

  SELECT COUNT(*), COUNT(*) FILTER (WHERE success),
         COALESCE(AVG(latency_ms),0), COALESCE(AVG(cost_cents),0), COALESCE(AVG(quality_score),0)
    INTO v_b_n, v_b_success, v_b_lat, v_b_cost, v_b_qual
    FROM public.prompt_experiment_runs
    WHERE experiment_id = p_experiment_id AND variant = 'b';

  -- Z-test de proporções (success rate)
  IF v_a_n > 0 AND v_b_n > 0 THEN
    v_p1 := v_a_success::NUMERIC / v_a_n;
    v_p2 := v_b_success::NUMERIC / v_b_n;
    v_p_pool := (v_a_success + v_b_success)::NUMERIC / (v_a_n + v_b_n);
    v_se := sqrt(v_p_pool * (1 - v_p_pool) * (1.0/v_a_n + 1.0/v_b_n));
    IF v_se > 0 THEN
      v_z := (v_p2 - v_p1) / v_se;
      -- Aproximação de p-value (two-tailed) via fórmula de erro
      v_p_value := 2 * (1 - (0.5 * (1 + (
        CASE WHEN abs(v_z) > 6 THEN 1
        ELSE (1 - exp(-0.717*abs(v_z) - 0.416*v_z*v_z)) END
      ))));
    ELSE
      v_p_value := 1;
    END IF;
  ELSE
    v_p_value := 1; v_z := 0;
  END IF;

  -- Winner candidato pela métrica
  v_winner := CASE
    WHEN v_metric = 'latency' THEN CASE WHEN v_a_lat <= v_b_lat THEN 'a' ELSE 'b' END
    WHEN v_metric = 'cost' THEN CASE WHEN v_a_cost <= v_b_cost THEN 'a' ELSE 'b' END
    WHEN v_metric = 'quality' THEN CASE WHEN v_a_qual >= v_b_qual THEN 'a' ELSE 'b' END
    ELSE CASE WHEN v_p1 >= v_p2 THEN 'a' ELSE 'b' END
  END;

  v_significant := (v_p_value < 0.05) AND (v_a_n >= 100) AND (v_b_n >= 100);

  RETURN jsonb_build_object(
    'variant_a', jsonb_build_object('runs', v_a_n, 'success', v_a_success, 'avg_latency_ms', v_a_lat, 'avg_cost_cents', v_a_cost, 'avg_quality', v_a_qual, 'success_rate', COALESCE(v_p1,0)),
    'variant_b', jsonb_build_object('runs', v_b_n, 'success', v_b_success, 'avg_latency_ms', v_b_lat, 'avg_cost_cents', v_b_cost, 'avg_quality', v_b_qual, 'success_rate', COALESCE(v_p2,0)),
    'p_value', COALESCE(v_p_value, 1),
    'z_score', COALESCE(v_z, 0),
    'significant', v_significant,
    'winner_candidate', v_winner,
    'metric', v_metric
  );
END $$;

CREATE OR REPLACE FUNCTION public.promote_experiment_winner(p_experiment_id UUID, p_winner TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace UUID;
  v_owner UUID;
BEGIN
  IF p_winner NOT IN ('a','b') THEN RAISE EXCEPTION 'invalid winner'; END IF;
  SELECT workspace_id, created_by INTO v_workspace, v_owner
    FROM public.prompt_experiments WHERE id = p_experiment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'experiment not found'; END IF;
  IF v_owner <> auth.uid() AND NOT is_workspace_admin(auth.uid(), v_workspace) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.prompt_experiments
    SET winner = p_winner, status = 'completed', ended_at = now()
    WHERE id = p_experiment_id;
  RETURN jsonb_build_object('experiment_id', p_experiment_id, 'winner', p_winner, 'status', 'completed');
END $$;

CREATE OR REPLACE FUNCTION public.mask_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_email IS NULL OR position('@' in p_email) = 0 THEN p_email
    ELSE left(split_part(p_email, '@', 1), 1) || '***@' || split_part(p_email, '@', 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.disable_all_chaos(p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT public.is_workspace_admin(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  UPDATE public.chaos_experiments
  SET enabled = false
  WHERE workspace_id = p_workspace_id AND enabled = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_chaos_faults(p_target TEXT)
RETURNS TABLE (
  id UUID,
  fault_type TEXT,
  probability NUMERIC,
  latency_ms INTEGER
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, fault_type, probability, latency_ms
  FROM public.chaos_experiments
  WHERE target = p_target
    AND enabled = true
    AND expires_at > now();
$$;

CREATE OR REPLACE FUNCTION public.get_synthetic_summary(p_check_id UUID, p_window_hours INTEGER DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER := 0;
  v_success INTEGER := 0;
  v_uptime NUMERIC := 100;
  v_p50 INTEGER := 0;
  v_p95 INTEGER := 0;
  v_recent jsonb := '[]'::jsonb;
BEGIN
  -- Auth check via RLS-aware query
  IF NOT EXISTS (
    SELECT 1 FROM public.synthetic_checks c
    WHERE c.id = p_check_id
      AND c.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE success),
    COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms), 0)::int,
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int
  INTO v_total, v_success, v_p50, v_p95
  FROM public.synthetic_results
  WHERE check_id = p_check_id
    AND ran_at >= now() - (p_window_hours || ' hours')::interval;

  IF v_total > 0 THEN
    v_uptime := ROUND((v_success::numeric / v_total) * 100, 2);
  END IF;

  -- Últimos 60 resultados (sparkline)
  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.ran_at), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT ran_at, success, latency_ms
    FROM public.synthetic_results
    WHERE check_id = p_check_id
    ORDER BY ran_at DESC
    LIMIT 60
  ) r;

  RETURN jsonb_build_object(
    'window_hours', p_window_hours,
    'total_runs', v_total,
    'success_count', v_success,
    'uptime_pct', v_uptime,
    'p50_latency_ms', v_p50,
    'p95_latency_ms', v_p95,
    'recent', v_recent
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_cost_baselines()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  -- Workspace-level baselines
  INSERT INTO public.cost_baselines (workspace_id, scope, scope_id, hour_of_day, day_of_week, avg_cost_usd, stddev_cost_usd, sample_count, computed_at)
  SELECT
    a.workspace_id,
    'workspace',
    NULL,
    EXTRACT(HOUR FROM t.created_at)::int,
    EXTRACT(DOW FROM t.created_at)::int,
    COALESCE(AVG(hourly_cost), 0),
    COALESCE(STDDEV(hourly_cost), 0),
    COUNT(*)
  FROM (
    SELECT
      tt.agent_id,
      date_trunc('hour', tt.created_at) AS hour_bucket,
      tt.created_at,
      SUM(tt.cost_usd) AS hourly_cost
    FROM public.agent_traces tt
    WHERE tt.created_at >= now() - interval '14 days'
      AND tt.cost_usd IS NOT NULL
    GROUP BY tt.agent_id, date_trunc('hour', tt.created_at), tt.created_at
  ) t
  JOIN public.agents a ON a.id = t.agent_id
  WHERE a.workspace_id IS NOT NULL
  GROUP BY a.workspace_id, EXTRACT(HOUR FROM t.created_at), EXTRACT(DOW FROM t.created_at)
  ON CONFLICT (workspace_id, scope, scope_id, hour_of_day, day_of_week)
  DO UPDATE SET
    avg_cost_usd = EXCLUDED.avg_cost_usd,
    stddev_cost_usd = EXCLUDED.stddev_cost_usd,
    sample_count = EXCLUDED.sample_count,
    computed_at = now();
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Agent-level baselines
  INSERT INTO public.cost_baselines (workspace_id, scope, scope_id, hour_of_day, day_of_week, avg_cost_usd, stddev_cost_usd, sample_count, computed_at)
  SELECT
    a.workspace_id,
    'agent',
    a.id::text,
    EXTRACT(HOUR FROM t.created_at)::int,
    EXTRACT(DOW FROM t.created_at)::int,
    COALESCE(AVG(t.cost_usd), 0),
    COALESCE(STDDEV(t.cost_usd), 0),
    COUNT(*)
  FROM public.agent_traces t
  JOIN public.agents a ON a.id = t.agent_id
  WHERE t.created_at >= now() - interval '14 days'
    AND t.cost_usd IS NOT NULL
    AND a.workspace_id IS NOT NULL
  GROUP BY a.workspace_id, a.id, EXTRACT(HOUR FROM t.created_at), EXTRACT(DOW FROM t.created_at)
  ON CONFLICT (workspace_id, scope, scope_id, hour_of_day, day_of_week)
  DO UPDATE SET
    avg_cost_usd = EXCLUDED.avg_cost_usd,
    stddev_cost_usd = EXCLUDED.stddev_cost_usd,
    sample_count = EXCLUDED.sample_count,
    computed_at = now();

  RETURN jsonb_build_object('status', 'ok', 'computed_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.detect_cost_anomalies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerts INTEGER := 0;
  v_hour INTEGER := EXTRACT(HOUR FROM now())::int;
  v_dow INTEGER := EXTRACT(DOW FROM now())::int;
  r RECORD;
  v_z NUMERIC;
  v_severity TEXT;
BEGIN
  FOR r IN
    SELECT
      a.workspace_id,
      a.id AS agent_id,
      a.name AS agent_name,
      SUM(t.cost_usd) AS observed
    FROM public.agent_traces t
    JOIN public.agents a ON a.id = t.agent_id
    WHERE t.created_at >= now() - interval '1 hour'
      AND t.cost_usd IS NOT NULL
      AND a.workspace_id IS NOT NULL
    GROUP BY a.workspace_id, a.id, a.name
    HAVING SUM(t.cost_usd) > 0.10
  LOOP
    -- find baseline for this agent
    SELECT
      CASE WHEN cb.stddev_cost_usd > 0
        THEN (r.observed - cb.avg_cost_usd) / cb.stddev_cost_usd
        ELSE 0
      END,
      cb.avg_cost_usd
    INTO v_z, r.observed
    FROM public.cost_baselines cb
    WHERE cb.workspace_id = r.workspace_id
      AND cb.scope = 'agent'
      AND cb.scope_id = r.agent_id::text
      AND cb.hour_of_day = v_hour
      AND cb.day_of_week = v_dow
      AND cb.sample_count >= 3
    LIMIT 1;

    IF v_z IS NULL OR v_z < 2 THEN CONTINUE; END IF;

    v_severity := CASE WHEN v_z >= 3 THEN 'critical' WHEN v_z >= 2 THEN 'warning' ELSE 'info' END;

    -- Avoid duplicate alerts within 1 hour
    IF EXISTS (
      SELECT 1 FROM public.cost_alerts
      WHERE workspace_id = r.workspace_id
        AND scope = 'agent'
        AND scope_id = r.agent_id::text
        AND triggered_at >= now() - interval '1 hour'
    ) THEN CONTINUE; END IF;

    INSERT INTO public.cost_alerts (workspace_id, scope, scope_id, scope_label, observed_cost_usd, baseline_cost_usd, z_score, severity)
    VALUES (r.workspace_id, 'agent', r.agent_id::text, r.agent_name, r.observed,
            (SELECT avg_cost_usd FROM public.cost_baselines WHERE workspace_id = r.workspace_id AND scope='agent' AND scope_id=r.agent_id::text AND hour_of_day=v_hour AND day_of_week=v_dow LIMIT 1),
            v_z, v_severity);
    v_alerts := v_alerts + 1;
  END LOOP;

  RETURN jsonb_build_object('alerts_created', v_alerts, 'checked_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_cost_alert(p_alert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws UUID;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.cost_alerts WHERE id = p_alert_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'alert not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_ws) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  UPDATE public.cost_alerts
    SET acknowledged_at = now(), acknowledged_by = auth.uid()
    WHERE id = p_alert_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_spend(p_workspace_id UUID, p_period TEXT DEFAULT 'monthly')
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ;
  v_spend NUMERIC := 0;
BEGIN
  IF NOT (p_workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_since := CASE
    WHEN p_period = 'daily' THEN date_trunc('day', now())
    ELSE date_trunc('month', now())
  END;
  SELECT COALESCE(SUM(t.cost_usd), 0) INTO v_spend
  FROM public.agent_traces t
  JOIN public.agents a ON a.id = t.agent_id
  WHERE a.workspace_id = p_workspace_id
    AND t.created_at >= v_since
    AND t.cost_usd IS NOT NULL;
  RETURN v_spend;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_budget(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_budget public.workspace_budgets%ROWTYPE;
  v_monthly_spend NUMERIC := 0;
  v_daily_spend NUMERIC := 0;
  v_monthly_pct NUMERIC := 0;
  v_daily_pct NUMERIC := 0;
  v_allowed BOOLEAN := true;
  v_reason TEXT := NULL;
  v_warning BOOLEAN := false;
BEGIN
  SELECT * INTO v_budget FROM public.workspace_budgets WHERE workspace_id = p_workspace_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'configured', false);
  END IF;

  SELECT COALESCE(SUM(t.cost_usd), 0) INTO v_monthly_spend
    FROM public.agent_traces t JOIN public.agents a ON a.id = t.agent_id
    WHERE a.workspace_id = p_workspace_id AND t.created_at >= date_trunc('month', now()) AND t.cost_usd IS NOT NULL;
  SELECT COALESCE(SUM(t.cost_usd), 0) INTO v_daily_spend
    FROM public.agent_traces t JOIN public.agents a ON a.id = t.agent_id
    WHERE a.workspace_id = p_workspace_id AND t.created_at >= date_trunc('day', now()) AND t.cost_usd IS NOT NULL;

  IF v_budget.monthly_limit_usd IS NOT NULL AND v_budget.monthly_limit_usd > 0 THEN
    v_monthly_pct := ROUND((v_monthly_spend / v_budget.monthly_limit_usd) * 100, 2);
  END IF;
  IF v_budget.daily_limit_usd IS NOT NULL AND v_budget.daily_limit_usd > 0 THEN
    v_daily_pct := ROUND((v_daily_spend / v_budget.daily_limit_usd) * 100, 2);
  END IF;

  IF v_budget.hard_stop THEN
    IF v_budget.monthly_limit_usd IS NOT NULL AND v_monthly_spend >= v_budget.monthly_limit_usd THEN
      v_allowed := false; v_reason := 'monthly_limit_exceeded';
    ELSIF v_budget.daily_limit_usd IS NOT NULL AND v_daily_spend >= v_budget.daily_limit_usd THEN
      v_allowed := false; v_reason := 'daily_limit_exceeded';
    END IF;
  END IF;

  IF v_monthly_pct >= v_budget.soft_threshold_pct OR v_daily_pct >= v_budget.soft_threshold_pct THEN
    v_warning := true;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'configured', true,
    'reason', v_reason,
    'warning', v_warning,
    'hard_stop', v_budget.hard_stop,
    'monthly_spend', v_monthly_spend,
    'monthly_limit', v_budget.monthly_limit_usd,
    'monthly_pct', v_monthly_pct,
    'daily_spend', v_daily_spend,
    'daily_limit', v_budget.daily_limit_usd,
    'daily_pct', v_daily_pct,
    'soft_threshold_pct', v_budget.soft_threshold_pct
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_budget()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_monthly NUMERIC; v_daily NUMERIC;
  v_monthly_pct NUMERIC; v_daily_pct NUMERIC;
  v_blocked INTEGER := 0; v_warned INTEGER := 0; v_paused INTEGER := 0;
  v_paused_count INTEGER;
BEGIN
  FOR r IN SELECT * FROM public.workspace_budgets LOOP
    SELECT COALESCE(SUM(t.cost_usd),0) INTO v_monthly
      FROM public.agent_traces t JOIN public.agents a ON a.id=t.agent_id
      WHERE a.workspace_id=r.workspace_id AND t.created_at >= date_trunc('month', now()) AND t.cost_usd IS NOT NULL;
    SELECT COALESCE(SUM(t.cost_usd),0) INTO v_daily
      FROM public.agent_traces t JOIN public.agents a ON a.id=t.agent_id
      WHERE a.workspace_id=r.workspace_id AND t.created_at >= date_trunc('day', now()) AND t.cost_usd IS NOT NULL;

    v_monthly_pct := CASE WHEN r.monthly_limit_usd > 0 THEN ROUND((v_monthly/r.monthly_limit_usd)*100,2) ELSE 0 END;
    v_daily_pct := CASE WHEN r.daily_limit_usd > 0 THEN ROUND((v_daily/r.daily_limit_usd)*100,2) ELSE 0 END;

    -- Hard block (monthly)
    IF r.hard_stop AND r.monthly_limit_usd IS NOT NULL AND v_monthly >= r.monthly_limit_usd THEN
      IF NOT EXISTS (SELECT 1 FROM public.budget_events WHERE workspace_id=r.workspace_id AND event_type='hard_block' AND period='monthly' AND triggered_at >= date_trunc('month', now())) THEN
        INSERT INTO public.budget_events(workspace_id,event_type,period,period_spend_usd,period_limit_usd,pct_used)
          VALUES(r.workspace_id,'hard_block','monthly',v_monthly,r.monthly_limit_usd,v_monthly_pct);
        UPDATE public.agents SET status='paused' WHERE workspace_id=r.workspace_id AND status='active';
        GET DIAGNOSTICS v_paused_count = ROW_COUNT;
        IF v_paused_count > 0 THEN
          INSERT INTO public.budget_events(workspace_id,event_type,period,period_spend_usd,period_limit_usd,pct_used,metadata)
            VALUES(r.workspace_id,'agent_paused','monthly',v_monthly,r.monthly_limit_usd,v_monthly_pct,jsonb_build_object('paused_count',v_paused_count));
          v_paused := v_paused + v_paused_count;
        END IF;
        v_blocked := v_blocked + 1;
      END IF;
    -- Hard block (daily)
    ELSIF r.hard_stop AND r.daily_limit_usd IS NOT NULL AND v_daily >= r.daily_limit_usd THEN
      IF NOT EXISTS (SELECT 1 FROM public.budget_events WHERE workspace_id=r.workspace_id AND event_type='hard_block' AND period='daily' AND triggered_at >= date_trunc('day', now())) THEN
        INSERT INTO public.budget_events(workspace_id,event_type,period,period_spend_usd,period_limit_usd,pct_used)
          VALUES(r.workspace_id,'hard_block','daily',v_daily,r.daily_limit_usd,v_daily_pct);
        v_blocked := v_blocked + 1;
      END IF;
    -- Soft warning
    ELSIF v_monthly_pct >= r.soft_threshold_pct AND r.monthly_limit_usd IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.budget_events WHERE workspace_id=r.workspace_id AND event_type='soft_warning' AND period='monthly' AND triggered_at >= now() - interval '6 hours') THEN
        INSERT INTO public.budget_events(workspace_id,event_type,period,period_spend_usd,period_limit_usd,pct_used)
          VALUES(r.workspace_id,'soft_warning','monthly',v_monthly,r.monthly_limit_usd,v_monthly_pct);
        v_warned := v_warned + 1;
      END IF;
    ELSIF v_daily_pct >= r.soft_threshold_pct AND r.daily_limit_usd IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.budget_events WHERE workspace_id=r.workspace_id AND event_type='soft_warning' AND period='daily' AND triggered_at >= now() - interval '6 hours') THEN
        INSERT INTO public.budget_events(workspace_id,event_type,period,period_spend_usd,period_limit_usd,pct_used)
          VALUES(r.workspace_id,'soft_warning','daily',v_daily,r.daily_limit_usd,v_daily_pct);
        v_warned := v_warned + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('blocked',v_blocked,'warned',v_warned,'agents_paused',v_paused,'checked_at',now());
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_workspace_budget(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_admin(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  UPDATE public.agents SET status='active' WHERE workspace_id=p_workspace_id AND status='paused';
  INSERT INTO public.budget_events(workspace_id,event_type,period,period_spend_usd,period_limit_usd,pct_used,metadata)
    VALUES(p_workspace_id,'reset','monthly',0,0,0,jsonb_build_object('reset_by',auth.uid()));
  RETURN jsonb_build_object('status','ok','reset_at',now());
END;
$$;

CREATE OR REPLACE FUNCTION public.create_incident_run(
  p_playbook_id UUID,
  p_triggered_by TEXT,
  p_trigger_event JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pb public.incident_playbooks%ROWTYPE;
  v_run_id UUID;
BEGIN
  SELECT * INTO v_pb FROM public.incident_playbooks WHERE id = p_playbook_id;
  IF NOT FOUND OR NOT v_pb.enabled THEN
    RETURN NULL;
  END IF;

  -- Cooldown check
  IF v_pb.last_triggered_at IS NOT NULL
     AND v_pb.last_triggered_at > now() - (v_pb.cooldown_minutes || ' minutes')::interval THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.incident_runs(playbook_id, workspace_id, triggered_by, trigger_event, triggered_by_user)
  VALUES (p_playbook_id, v_pb.workspace_id, p_triggered_by, p_trigger_event, auth.uid())
  RETURNING id INTO v_run_id;

  UPDATE public.incident_playbooks
    SET last_triggered_at = now(), run_count = run_count + 1
    WHERE id = p_playbook_id;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_incident_run(
  p_run_id UUID,
  p_status TEXT,
  p_action_results JSONB,
  p_notes TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.incident_runs
    SET status = p_status,
        action_results = p_action_results,
        notes = COALESCE(p_notes, notes),
        ended_at = CASE WHEN p_status IN ('succeeded','failed','partial') THEN now() ELSE ended_at END
    WHERE id = p_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_dr_drill(
  p_drill_id UUID,
  p_actual_rto_seconds INTEGER,
  p_actual_rpo_seconds INTEGER,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_drill public.dr_drills%ROWTYPE;
  v_rto_ok BOOLEAN;
  v_rpo_ok BOOLEAN;
BEGIN
  SELECT * INTO v_drill FROM public.dr_drills WHERE id = p_drill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'drill not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_drill.workspace_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_rto_ok := p_actual_rto_seconds <= v_drill.rto_target_seconds;
  v_rpo_ok := p_actual_rpo_seconds <= v_drill.rpo_target_seconds;

  UPDATE public.dr_drills
    SET status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
        ended_at = now(),
        actual_rto_seconds = p_actual_rto_seconds,
        actual_rpo_seconds = p_actual_rpo_seconds,
        success = p_success,
        error_message = p_error_message
    WHERE id = p_drill_id;

  INSERT INTO public.dr_restore_logs(drill_id, step, status, ended_at, metadata)
  VALUES (p_drill_id, 'cleanup', 'succeeded', now(),
          jsonb_build_object('rto_ok', v_rto_ok, 'rpo_ok', v_rpo_ok,
                             'rto_target', v_drill.rto_target_seconds,
                             'rpo_target', v_drill.rpo_target_seconds,
                             'rto_actual', p_actual_rto_seconds,
                             'rpo_actual', p_actual_rpo_seconds));

  RETURN jsonb_build_object(
    'status', CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    'rto_ok', v_rto_ok,
    'rpo_ok', v_rpo_ok,
    'rto_actual', p_actual_rto_seconds,
    'rpo_actual', p_actual_rpo_seconds
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_postmortem_from_incident(p_incident_run_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run RECORD;
  v_pb RECORD;
  v_pm_id UUID;
  v_timeline JSONB;
  v_severity TEXT;
  v_duration_seconds INTEGER;
BEGIN
  SELECT ir.*, ip.name AS pb_name, ip.trigger_type, ip.actions
    INTO v_run
    FROM public.incident_runs ir
    JOIN public.incident_playbooks ip ON ip.id = ir.playbook_id
    WHERE ir.id = p_incident_run_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'incident run not found'; END IF;

  IF NOT (v_run.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_duration_seconds := COALESCE(EXTRACT(EPOCH FROM (v_run.ended_at - v_run.started_at))::int, 0);
  v_severity := CASE
    WHEN v_run.status = 'failed' THEN 'SEV1'
    WHEN v_run.status = 'partial' THEN 'SEV2'
    ELSE 'SEV3'
  END;

  v_timeline := jsonb_build_array(
    jsonb_build_object('at', v_run.started_at, 'event', 'Incident detected', 'detail', 'Trigger: ' || v_run.triggered_by),
    jsonb_build_object('at', v_run.started_at, 'event', 'Playbook executed', 'detail', v_run.pb_name),
    jsonb_build_object('at', COALESCE(v_run.ended_at, now()), 'event', 'Resolution', 'detail', 'Status: ' || v_run.status)
  );

  INSERT INTO public.postmortems(
    workspace_id, title, incident_source, source_id, severity, status,
    summary, timeline, author_id, contributing_factors
  ) VALUES (
    v_run.workspace_id,
    'Postmortem: ' || v_run.pb_name || ' (' || to_char(v_run.started_at, 'YYYY-MM-DD HH24:MI') || ')',
    'incident_run',
    p_incident_run_id,
    v_severity,
    'draft',
    'Auto-generated from incident run. Duration: ' || v_duration_seconds || 's. Status: ' || v_run.status || '.',
    v_timeline,
    auth.uid(),
    ARRAY['Trigger: ' || v_run.triggered_by]
  ) RETURNING id INTO v_pm_id;

  RETURN v_pm_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_postmortem_from_gameday(p_game_day_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gd RECORD;
  v_sc RECORD;
  v_pm_id UUID;
  v_timeline JSONB;
  v_severity TEXT;
BEGIN
  SELECT * INTO v_gd FROM public.game_days WHERE id = p_game_day_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'game day not found'; END IF;

  IF NOT (v_gd.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_sc FROM public.game_day_scorecards WHERE game_day_id = p_game_day_id LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'at', occurred_at, 'event', event_type, 'detail', description
  ) ORDER BY occurred_at), '[]'::jsonb) INTO v_timeline
  FROM public.game_day_events WHERE game_day_id = p_game_day_id;

  v_severity := CASE
    WHEN v_sc.score IS NULL OR v_sc.score >= 8 THEN 'SEV3'
    WHEN v_sc.score >= 5 THEN 'SEV2'
    ELSE 'SEV1'
  END;

  INSERT INTO public.postmortems(
    workspace_id, title, incident_source, source_id, severity, status,
    summary, timeline, author_id, contributing_factors, what_went_wrong
  ) VALUES (
    v_gd.workspace_id,
    'Game Day Postmortem: ' || v_gd.title,
    'game_day',
    p_game_day_id,
    v_severity,
    'draft',
    'Game day exercise. Scenario: ' || v_gd.scenario || '. MTTR: ' || COALESCE(v_sc.mttr_seconds::text, 'n/a') || 's, MTTD: ' || COALESCE(v_sc.mttd_seconds::text, 'n/a') || 's. Score: ' || COALESCE(v_sc.score::text, 'n/a') || '/10.',
    v_timeline,
    auth.uid(),
    COALESCE(v_sc.gaps_found, ARRAY[]::text[]),
    COALESCE(v_sc.gaps_found, ARRAY[]::text[])
  ) RETURNING id INTO v_pm_id;

  RETURN v_pm_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_postmortem(p_postmortem_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pm RECORD;
  v_action_count INTEGER;
BEGIN
  SELECT * INTO v_pm FROM public.postmortems WHERE id = p_postmortem_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'postmortem not found'; END IF;

  IF v_pm.author_id <> auth.uid() AND NOT public.is_workspace_admin(auth.uid(), v_pm.workspace_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_pm.summary IS NULL OR length(trim(v_pm.summary)) < 10 THEN
    RAISE EXCEPTION 'summary required (min 10 chars)';
  END IF;
  IF v_pm.root_cause IS NULL OR length(trim(v_pm.root_cause)) < 10 THEN
    RAISE EXCEPTION 'root cause required (min 10 chars)';
  END IF;

  SELECT COUNT(*) INTO v_action_count FROM public.postmortem_action_items WHERE postmortem_id = p_postmortem_id;
  IF v_action_count < 1 THEN
    RAISE EXCEPTION 'at least 1 action item required';
  END IF;

  UPDATE public.postmortems
    SET status = 'published', published_at = now()
    WHERE id = p_postmortem_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'postmortem.published', 'postmortem', p_postmortem_id::text,
          jsonb_build_object('severity', v_pm.severity, 'action_items', v_action_count));

  RETURN jsonb_build_object('status', 'published', 'published_at', now(), 'action_items', v_action_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_compliance_report(
  _workspace_id UUID,
  _framework_code TEXT,
  _name TEXT,
  _period_start DATE,
  _period_end DATE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _report_id UUID;
  _framework_id UUID;
  _control RECORD;
  _passed INTEGER := 0;
  _failed INTEGER := 0;
  _total INTEGER := 0;
  _check_count BIGINT;
  _evidence_status TEXT;
BEGIN
  IF NOT public.is_workspace_admin(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can generate compliance reports';
  END IF;

  SELECT id INTO _framework_id FROM public.compliance_frameworks WHERE code = _framework_code;
  IF _framework_id IS NULL THEN
    RAISE EXCEPTION 'Framework % not found', _framework_code;
  END IF;

  INSERT INTO public.compliance_reports (
    workspace_id, framework_id, name, period_start, period_end, status, generated_by
  ) VALUES (
    _workspace_id, _framework_id, _name, _period_start, _period_end, 'draft', auth.uid()
  ) RETURNING id INTO _report_id;

  FOR _control IN
    SELECT * FROM public.compliance_controls WHERE framework_id = _framework_id
  LOOP
    _total := _total + 1;
    _evidence_status := 'pending';
    _check_count := 0;

    IF _control.evidence_type = 'auto' AND _control.auto_check_query IS NOT NULL THEN
      BEGIN
        EXECUTE _control.auto_check_query INTO _check_count;
        IF _check_count > 0 THEN
          _evidence_status := 'passed';
          _passed := _passed + 1;
        ELSE
          _evidence_status := 'failed';
          _failed := _failed + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        _evidence_status := 'failed';
        _failed := _failed + 1;
      END;
    END IF;

    INSERT INTO public.compliance_evidence (
      report_id, control_id, status, evidence_data
    ) VALUES (
      _report_id, _control.id, _evidence_status,
      jsonb_build_object('check_count', _check_count, 'auto', _control.evidence_type = 'auto')
    );
  END LOOP;

  UPDATE public.compliance_reports SET
    total_controls = _total,
    passed_controls = _passed,
    failed_controls = _failed,
    score = CASE WHEN _total > 0 THEN ROUND((_passed::numeric / _total) * 100, 2) ELSE 0 END
  WHERE id = _report_id;

  RETURN _report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_compliance_report(_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _workspace_id UUID;
BEGIN
  SELECT workspace_id INTO _workspace_id FROM public.compliance_reports WHERE id = _report_id;
  IF NOT public.is_workspace_admin(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can publish reports';
  END IF;

  UPDATE public.compliance_reports
  SET status = 'published', published_at = now()
  WHERE id = _report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_sbom_snapshot(
  p_workspace_id UUID,
  p_name TEXT,
  p_format TEXT,
  p_source TEXT,
  p_components JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_snapshot_id UUID;
  v_comp JSONB;
  v_count INTEGER := 0;
BEGIN
  IF NOT public.is_workspace_admin(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;

  INSERT INTO public.sbom_snapshots(workspace_id, name, format, source, generated_by, total_components)
  VALUES (p_workspace_id, p_name, COALESCE(p_format,'cyclonedx'), COALESCE(p_source,'package.json'), auth.uid(), 0)
  RETURNING id INTO v_snapshot_id;

  FOR v_comp IN SELECT * FROM jsonb_array_elements(p_components) LOOP
    INSERT INTO public.sbom_components(snapshot_id, name, version, ecosystem, license, direct, supplier, purl)
    VALUES (
      v_snapshot_id,
      v_comp->>'name',
      v_comp->>'version',
      COALESCE(v_comp->>'ecosystem','npm'),
      v_comp->>'license',
      COALESCE((v_comp->>'direct')::boolean, true),
      v_comp->>'supplier',
      v_comp->>'purl'
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.sbom_snapshots SET total_components = v_count WHERE id = v_snapshot_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'sbom.created', 'sbom_snapshot', v_snapshot_id::text,
          jsonb_build_object('components', v_count, 'name', p_name));

  RETURN v_snapshot_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_vulnerability(
  p_snapshot_id UUID,
  p_component_id UUID,
  p_cve_id TEXT,
  p_severity TEXT,
  p_cvss_score NUMERIC,
  p_summary TEXT,
  p_fixed_version TEXT,
  p_reference_url TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_finding_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.sbom_snapshots WHERE id = p_snapshot_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'snapshot not found'; END IF;

  -- Dedupe: same snapshot + component + CVE
  SELECT id INTO v_finding_id FROM public.vulnerability_findings
   WHERE snapshot_id = p_snapshot_id AND COALESCE(component_id::text,'') = COALESCE(p_component_id::text,'') AND cve_id = p_cve_id LIMIT 1;
  IF v_finding_id IS NOT NULL THEN RETURN v_finding_id; END IF;

  INSERT INTO public.vulnerability_findings(workspace_id, snapshot_id, component_id, cve_id, severity, cvss_score, summary, fixed_version, reference_url)
  VALUES (v_workspace_id, p_snapshot_id, p_component_id, p_cve_id, p_severity, p_cvss_score, p_summary, p_fixed_version, p_reference_url)
  RETURNING id INTO v_finding_id;

  RETURN v_finding_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_vulnerability(p_finding_id UUID, p_notes TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.vulnerability_findings WHERE id = p_finding_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'finding not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_workspace_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.vulnerability_findings
    SET status = 'acknowledged', acknowledged_by = auth.uid(), notes = COALESCE(p_notes, notes)
    WHERE id = p_finding_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'vulnerability.acknowledged', 'vulnerability_finding', p_finding_id::text, jsonb_build_object('notes', p_notes));
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_vulnerability_fixed(p_finding_id UUID, p_notes TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.vulnerability_findings WHERE id = p_finding_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'finding not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_workspace_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.vulnerability_findings
    SET status = 'fixed', resolved_by = auth.uid(), resolved_at = now(), notes = COALESCE(p_notes, notes)
    WHERE id = p_finding_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'vulnerability.fixed', 'vulnerability_finding', p_finding_id::text, jsonb_build_object('notes', p_notes));
END;
$$;

CREATE OR REPLACE FUNCTION public.register_managed_secret(
  p_workspace_id UUID,
  p_name TEXT,
  p_category TEXT,
  p_provider TEXT DEFAULT NULL,
  p_environment TEXT DEFAULT 'prod',
  p_rotation_interval_days INTEGER DEFAULT 90,
  p_owner_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_last_rotated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_last TIMESTAMPTZ;
  v_next TIMESTAMPTZ;
BEGIN
  IF NOT public.is_workspace_admin(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;

  v_last := COALESCE(p_last_rotated_at, now());
  v_next := v_last + (p_rotation_interval_days || ' days')::interval;

  INSERT INTO public.managed_secrets(
    workspace_id, name, category, provider, environment,
    rotation_interval_days, last_rotated_at, next_rotation_due,
    owner_id, notes, created_by, status
  ) VALUES (
    p_workspace_id, p_name, p_category, p_provider, p_environment,
    p_rotation_interval_days, v_last, v_next,
    p_owner_id, p_notes, auth.uid(),
    CASE WHEN v_next < now() THEN 'overdue'
         WHEN v_next < now() + interval '7 days' THEN 'pending_rotation'
         ELSE 'active' END
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'secret.registered', 'managed_secret', v_id::text,
          jsonb_build_object('name', p_name, 'category', p_category, 'environment', p_environment));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_secret_rotation(
  p_secret_id UUID,
  p_reason TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret public.managed_secrets%ROWTYPE;
  v_age INTEGER;
  v_event_id UUID;
BEGIN
  SELECT * INTO v_secret FROM public.managed_secrets WHERE id = p_secret_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'secret not found'; END IF;

  IF NOT public.is_workspace_admin(auth.uid(), v_secret.workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;

  v_age := CASE WHEN v_secret.last_rotated_at IS NOT NULL
    THEN EXTRACT(DAY FROM (now() - v_secret.last_rotated_at))::int
    ELSE NULL END;

  INSERT INTO public.secret_rotation_events(secret_id, rotated_by, reason, previous_age_days, notes)
  VALUES (p_secret_id, auth.uid(), p_reason, v_age, p_notes)
  RETURNING id INTO v_event_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'secret.rotated', 'managed_secret', p_secret_id::text,
          jsonb_build_object('reason', p_reason, 'previous_age_days', v_age));

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_secret_retired(
  p_secret_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws UUID;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.managed_secrets WHERE id = p_secret_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'secret not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_ws) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;

  UPDATE public.managed_secrets
    SET status = 'retired',
        notes = COALESCE(p_notes, notes),
        updated_at = now()
    WHERE id = p_secret_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'secret.retired', 'managed_secret', p_secret_id::text,
          jsonb_build_object('notes', p_notes));
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_secrets_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_overdue INTEGER;
  v_pending INTEGER;
BEGIN
  UPDATE public.managed_secrets
    SET status = 'overdue', updated_at = now()
    WHERE status != 'retired'
      AND status != 'overdue'
      AND next_rotation_due < now();
  GET DIAGNOSTICS v_overdue = ROW_COUNT;

  UPDATE public.managed_secrets
    SET status = 'pending_rotation', updated_at = now()
    WHERE status = 'active'
      AND next_rotation_due BETWEEN now() AND now() + interval '7 days';
  GET DIAGNOSTICS v_pending = ROW_COUNT;

  RETURN jsonb_build_object('marked_overdue', v_overdue, 'marked_pending', v_pending, 'checked_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.set_pentest_finding_due_date()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.due_date IS NULL THEN
    NEW.due_date := NEW.discovered_at + CASE NEW.severity
      WHEN 'critical' THEN interval '7 days'
      WHEN 'high' THEN interval '30 days'
      WHEN 'medium' THEN interval '90 days'
      WHEN 'low' THEN interval '180 days'
      ELSE interval '365 days'
    END;
  END IF;
  IF NEW.status = 'fixed' AND NEW.fixed_at IS NULL THEN
    NEW.fixed_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.update_engagement_finding_count()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.pentest_engagements SET total_findings = total_findings + 1, updated_at = now() WHERE id = NEW.engagement_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.pentest_engagements SET total_findings = GREATEST(0, total_findings - 1), updated_at = now() WHERE id = OLD.engagement_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.create_pentest_engagement(
  p_workspace_id UUID, p_name TEXT, p_vendor TEXT, p_engagement_type TEXT,
  p_scope JSONB DEFAULT '{}'::jsonb, p_started_at TIMESTAMPTZ DEFAULT NULL,
  p_lead_contact TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.is_workspace_admin(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  INSERT INTO public.pentest_engagements(workspace_id, name, vendor, engagement_type, scope, started_at, lead_contact, notes, created_by)
  VALUES (p_workspace_id, p_name, p_vendor, p_engagement_type, p_scope, p_started_at, p_lead_contact, p_notes, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'pentest.engagement_created', 'pentest_engagement', v_id::text,
          jsonb_build_object('vendor', p_vendor, 'type', p_engagement_type));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.record_pentest_finding(
  p_engagement_id UUID, p_title TEXT, p_severity TEXT, p_category TEXT,
  p_cvss_score NUMERIC DEFAULT NULL, p_description TEXT DEFAULT NULL,
  p_reproduction_steps TEXT DEFAULT NULL, p_impact TEXT DEFAULT NULL,
  p_recommendation TEXT DEFAULT NULL, p_affected_assets TEXT[] DEFAULT '{}'::text[]
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_workspace UUID; v_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.pentest_engagements WHERE id = p_engagement_id;
  IF v_workspace IS NULL THEN RAISE EXCEPTION 'engagement not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_workspace) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  INSERT INTO public.pentest_findings(engagement_id, workspace_id, title, severity, category, cvss_score,
    description, reproduction_steps, impact, recommendation, affected_assets, created_by)
  VALUES (p_engagement_id, v_workspace, p_title, p_severity, p_category, p_cvss_score,
    p_description, p_reproduction_steps, p_impact, p_recommendation, p_affected_assets, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'pentest.finding_recorded', 'pentest_finding', v_id::text,
          jsonb_build_object('severity', p_severity, 'category', p_category));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_pentest_finding_status(
  p_finding_id UUID, p_status TEXT, p_verification_notes TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_workspace UUID;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.pentest_findings WHERE id = p_finding_id;
  IF v_workspace IS NULL THEN RAISE EXCEPTION 'finding not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_workspace) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  UPDATE public.pentest_findings
    SET status = p_status,
        verification_notes = COALESCE(p_verification_notes, verification_notes),
        fixed_at = CASE WHEN p_status = 'fixed' THEN now() ELSE fixed_at END,
        updated_at = now()
    WHERE id = p_finding_id;
  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'pentest.finding_status_changed', 'pentest_finding', p_finding_id::text,
          jsonb_build_object('new_status', p_status));
END $$;

CREATE OR REPLACE FUNCTION public.get_pentest_summary(p_workspace_id UUID)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_engagements INTEGER; v_open INTEGER; v_overdue INTEGER;
  v_critical_open INTEGER; v_high_open INTEGER;
  v_mttr_days NUMERIC;
BEGIN
  IF NOT (p_workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT COUNT(*) INTO v_engagements FROM public.pentest_engagements WHERE workspace_id = p_workspace_id;
  SELECT COUNT(*) INTO v_open FROM public.pentest_findings WHERE workspace_id = p_workspace_id AND status IN ('open','in_remediation');
  SELECT COUNT(*) INTO v_overdue FROM public.pentest_findings WHERE workspace_id = p_workspace_id AND status IN ('open','in_remediation') AND due_date < now();
  SELECT COUNT(*) INTO v_critical_open FROM public.pentest_findings WHERE workspace_id = p_workspace_id AND status IN ('open','in_remediation') AND severity = 'critical';
  SELECT COUNT(*) INTO v_high_open FROM public.pentest_findings WHERE workspace_id = p_workspace_id AND status IN ('open','in_remediation') AND severity = 'high';
  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (fixed_at - discovered_at))/86400)::numeric, 1) INTO v_mttr_days
    FROM public.pentest_findings WHERE workspace_id = p_workspace_id AND status = 'fixed' AND fixed_at IS NOT NULL;
  RETURN jsonb_build_object(
    'engagements', v_engagements,
    'open_findings', v_open,
    'overdue', v_overdue,
    'critical_open', v_critical_open,
    'high_open', v_high_open,
    'mttr_days', COALESCE(v_mttr_days, 0)
  );
END $$;

CREATE OR REPLACE FUNCTION public.register_risk(
  p_workspace_id UUID, p_title TEXT, p_description TEXT, p_category TEXT,
  p_likelihood INTEGER, p_impact INTEGER, p_treatment TEXT DEFAULT 'mitigate',
  p_mitigation_plan TEXT DEFAULT NULL, p_owner_id UUID DEFAULT NULL,
  p_related_finding_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.is_workspace_admin(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  INSERT INTO public.risk_register(
    workspace_id, title, description, category, likelihood, impact, treatment,
    mitigation_plan, owner_id, related_finding_id, created_by
  ) VALUES (
    p_workspace_id, p_title, p_description, p_category, p_likelihood, p_impact, p_treatment,
    p_mitigation_plan, p_owner_id, p_related_finding_id, auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'risk.registered', 'risk', v_id::text,
          jsonb_build_object('title', p_title, 'category', p_category, 'inherent', p_likelihood * p_impact));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.review_risk(
  p_risk_id UUID, p_new_residual_score INTEGER, p_notes TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_workspace UUID; v_prev INTEGER; v_event_id UUID;
BEGIN
  SELECT workspace_id, residual_score INTO v_workspace, v_prev FROM public.risk_register WHERE id = p_risk_id;
  IF v_workspace IS NULL THEN RAISE EXCEPTION 'risk not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_workspace) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  IF p_new_residual_score IS NOT NULL AND (p_new_residual_score < 1 OR p_new_residual_score > 25) THEN
    RAISE EXCEPTION 'residual score must be between 1 and 25';
  END IF;

  INSERT INTO public.risk_review_events(risk_id, reviewed_by, previous_residual_score, new_residual_score, notes)
  VALUES (p_risk_id, auth.uid(), v_prev, p_new_residual_score, p_notes)
  RETURNING id INTO v_event_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'risk.reviewed', 'risk', p_risk_id::text,
          jsonb_build_object('previous', v_prev, 'new', p_new_residual_score));
  RETURN v_event_id;
END $$;

CREATE OR REPLACE FUNCTION public.close_risk(p_risk_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_workspace UUID;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.risk_register WHERE id = p_risk_id;
  IF v_workspace IS NULL THEN RAISE EXCEPTION 'risk not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_workspace) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  UPDATE public.risk_register
    SET status = 'closed', closed_at = now(), updated_at = now()
    WHERE id = p_risk_id;
  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'risk.closed', 'risk', p_risk_id::text, jsonb_build_object('notes', p_notes));
END $$;

CREATE OR REPLACE FUNCTION public.get_risk_summary(p_workspace_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total INTEGER; v_critical INTEGER; v_high INTEGER; v_medium INTEGER; v_low INTEGER;
  v_overdue INTEGER; v_untreated INTEGER; v_closed INTEGER;
  v_by_category JSONB; v_by_treatment JSONB; v_heatmap JSONB;
BEGIN
  IF NOT (p_workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status != 'closed'),
    COUNT(*) FILTER (WHERE status != 'closed' AND COALESCE(residual_score, inherent_score) >= 15),
    COUNT(*) FILTER (WHERE status != 'closed' AND COALESCE(residual_score, inherent_score) BETWEEN 9 AND 14),
    COUNT(*) FILTER (WHERE status != 'closed' AND COALESCE(residual_score, inherent_score) BETWEEN 4 AND 8),
    COUNT(*) FILTER (WHERE status != 'closed' AND COALESCE(residual_score, inherent_score) <= 3),
    COUNT(*) FILTER (WHERE status != 'closed' AND next_review_due < now()),
    COUNT(*) FILTER (WHERE status IN ('identified','assessed') AND residual_score IS NULL),
    COUNT(*) FILTER (WHERE status = 'closed')
  INTO v_total, v_critical, v_high, v_medium, v_low, v_overdue, v_untreated, v_closed
  FROM public.risk_register WHERE workspace_id = p_workspace_id;

  SELECT COALESCE(jsonb_object_agg(category, cnt), '{}'::jsonb) INTO v_by_category FROM (
    SELECT category, COUNT(*) AS cnt FROM public.risk_register
    WHERE workspace_id = p_workspace_id AND status != 'closed' GROUP BY category
  ) x;

  SELECT COALESCE(jsonb_object_agg(treatment, cnt), '{}'::jsonb) INTO v_by_treatment FROM (
    SELECT treatment, COUNT(*) AS cnt FROM public.risk_register
    WHERE workspace_id = p_workspace_id AND status != 'closed' GROUP BY treatment
  ) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('likelihood', likelihood, 'impact', impact, 'count', cnt)), '[]'::jsonb)
  INTO v_heatmap FROM (
    SELECT likelihood, impact, COUNT(*) AS cnt FROM public.risk_register
    WHERE workspace_id = p_workspace_id AND status != 'closed' GROUP BY likelihood, impact
  ) x;

  RETURN jsonb_build_object(
    'total', v_total, 'critical', v_critical, 'high', v_high, 'medium', v_medium, 'low', v_low,
    'overdue_reviews', v_overdue, 'untreated', v_untreated, 'closed', v_closed,
    'by_category', v_by_category, 'by_treatment', v_by_treatment, 'heatmap', v_heatmap
  );
END $$;

CREATE OR REPLACE FUNCTION public.handle_vendor_assessment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_crit TEXT;
  v_interval INTERVAL;
  v_next TIMESTAMPTZ;
BEGIN
  SELECT criticality INTO v_crit FROM public.vendors WHERE id = NEW.vendor_id;
  v_interval := CASE v_crit
    WHEN 'critical' THEN interval '90 days'
    WHEN 'high' THEN interval '180 days'
    ELSE interval '365 days'
  END;
  v_next := NEW.assessed_at + v_interval;

  -- Set on assessment row
  NEW.next_review_due := v_next;

  -- Update vendor
  UPDATE public.vendors
    SET next_review_due = v_next,
        updated_at = now()
    WHERE id = NEW.vendor_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_vendor(
  p_workspace_id UUID,
  p_name TEXT,
  p_vendor_type TEXT,
  p_criticality TEXT DEFAULT 'medium',
  p_data_classification TEXT DEFAULT 'confidential',
  p_website TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_dpa_signed BOOLEAN DEFAULT false,
  p_dpa_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_soc2_valid_until TIMESTAMPTZ DEFAULT NULL,
  p_iso27001_valid_until TIMESTAMPTZ DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_interval INTERVAL;
BEGIN
  IF NOT public.is_workspace_admin(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;

  v_interval := CASE p_criticality
    WHEN 'critical' THEN interval '90 days'
    WHEN 'high' THEN interval '180 days'
    ELSE interval '365 days'
  END;

  INSERT INTO public.vendors(
    workspace_id, name, vendor_type, criticality, data_classification,
    website, contact_email, dpa_signed, dpa_expires_at,
    soc2_valid_until, iso27001_valid_until, owner_id, notes,
    next_review_due, created_by
  ) VALUES (
    p_workspace_id, p_name, p_vendor_type, p_criticality, p_data_classification,
    p_website, p_contact_email, p_dpa_signed, p_dpa_expires_at,
    p_soc2_valid_until, p_iso27001_valid_until, p_owner_id, p_notes,
    now() + v_interval, auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'vendor.registered', 'vendor', v_id::text,
          jsonb_build_object('name', p_name, 'criticality', p_criticality, 'type', p_vendor_type));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assess_vendor(
  p_vendor_id UUID,
  p_security_score INTEGER,
  p_compliance_score INTEGER,
  p_operational_score INTEGER,
  p_findings TEXT[] DEFAULT '{}',
  p_recommendations TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws UUID;
  v_id UUID;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.vendors WHERE id = p_vendor_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'vendor not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_ws) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;

  INSERT INTO public.vendor_assessments(
    vendor_id, assessed_by, security_score, compliance_score, operational_score, findings, recommendations
  ) VALUES (
    p_vendor_id, auth.uid(), p_security_score, p_compliance_score, p_operational_score, p_findings, p_recommendations
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'vendor.assessed', 'vendor', p_vendor_id::text,
          jsonb_build_object('assessment_id', v_id, 'security', p_security_score, 'compliance', p_compliance_score, 'operational', p_operational_score));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.offboard_vendor(
  p_vendor_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws UUID;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.vendors WHERE id = p_vendor_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'vendor not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_ws) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;

  UPDATE public.vendors
    SET status = 'offboarded',
        offboarded_at = now(),
        notes = COALESCE(p_notes, notes),
        updated_at = now()
    WHERE id = p_vendor_id;

  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'vendor.offboarded', 'vendor', p_vendor_id::text,
          jsonb_build_object('notes', p_notes));
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_bcp_test_run()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_crit public.bcp_criticality; v_days INTEGER;
BEGIN
  SELECT criticality INTO v_crit FROM public.business_systems WHERE id = NEW.system_id;
  v_days := CASE v_crit WHEN 'tier_1' THEN 90 WHEN 'tier_2' THEN 180 WHEN 'tier_3' THEN 365 ELSE 730 END;
  UPDATE public.business_systems
    SET last_tested_at = NEW.executed_at,
        next_test_due = NEW.executed_at + (v_days || ' days')::INTERVAL,
        updated_at = now()
    WHERE id = NEW.system_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_business_system(
  p_workspace_id UUID, p_name TEXT, p_description TEXT DEFAULT NULL,
  p_category public.bcp_category DEFAULT 'core',
  p_criticality public.bcp_criticality DEFAULT 'tier_3',
  p_rto_minutes INTEGER DEFAULT 240, p_rpo_minutes INTEGER DEFAULT 60,
  p_mtpd_hours INTEGER DEFAULT 24, p_dependencies TEXT[] DEFAULT '{}',
  p_owner_id UUID DEFAULT NULL, p_recovery_strategy TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_days INTEGER;
BEGIN
  IF NOT public.is_workspace_admin(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  v_days := CASE p_criticality WHEN 'tier_1' THEN 90 WHEN 'tier_2' THEN 180 WHEN 'tier_3' THEN 365 ELSE 730 END;
  INSERT INTO public.business_systems (
    workspace_id, name, description, category, criticality, rto_minutes, rpo_minutes,
    mtpd_hours, dependencies, owner_id, recovery_strategy, next_test_due, created_by
  ) VALUES (
    p_workspace_id, p_name, p_description, p_category, p_criticality, p_rto_minutes, p_rpo_minutes,
    p_mtpd_hours, p_dependencies, p_owner_id, p_recovery_strategy,
    now() + (v_days || ' days')::INTERVAL, auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_bcp_test(
  p_system_id UUID, p_test_type public.bcp_test_type, p_scenario TEXT,
  p_actual_rto_minutes INTEGER DEFAULT NULL, p_actual_rpo_minutes INTEGER DEFAULT NULL,
  p_success BOOLEAN DEFAULT true, p_gaps TEXT[] DEFAULT '{}',
  p_action_items TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_ws UUID;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.business_systems WHERE id = p_system_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'system not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_ws) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  INSERT INTO public.bcp_test_runs (
    system_id, test_type, executed_by, scenario, actual_rto_minutes,
    actual_rpo_minutes, success, gaps, action_items, notes
  ) VALUES (
    p_system_id, p_test_type, auth.uid(), p_scenario, p_actual_rto_minutes,
    p_actual_rpo_minutes, p_success, p_gaps, p_action_items, p_notes
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_freeze_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_freeze RECORD;
BEGIN
  IF NEW.scheduled_for IS NULL OR NEW.status NOT IN ('approved', 'scheduled') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_freeze
  FROM public.freeze_windows
  WHERE workspace_id = NEW.workspace_id
    AND NEW.scheduled_for BETWEEN starts_at AND ends_at
  LIMIT 1;

  IF FOUND THEN
    IF NEW.change_type = 'emergency' AND v_freeze.allow_emergency THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Mudança agendada dentro de janela de freeze ativa: %', v_freeze.name;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_change_request(
  p_workspace_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_change_type public.change_type,
  p_risk_level public.change_risk_level,
  p_affected_systems TEXT[],
  p_scheduled_for TIMESTAMPTZ,
  p_rollback_plan TEXT,
  p_validation_steps TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_workspace_id NOT IN (SELECT public.get_user_workspace_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  INSERT INTO public.change_requests (
    workspace_id, title, description, change_type, risk_level,
    affected_systems, requested_by, status, scheduled_for,
    rollback_plan, validation_steps
  ) VALUES (
    p_workspace_id, p_title, p_description, p_change_type, p_risk_level,
    COALESCE(p_affected_systems, '{}'), auth.uid(), 'pending_approval', p_scheduled_for,
    p_rollback_plan, p_validation_steps
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_change(
  p_change_id UUID,
  p_decision public.change_decision,
  p_comment TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace UUID;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.change_requests WHERE id = p_change_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Mudança não encontrada';
  END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_workspace) THEN
    RAISE EXCEPTION 'Apenas admins podem decidir mudanças';
  END IF;

  INSERT INTO public.change_approvals (change_id, approver_id, decision, comment)
  VALUES (p_change_id, auth.uid(), p_decision, p_comment);

  UPDATE public.change_requests
  SET status = CASE
    WHEN p_decision = 'approve' THEN 'approved'::public.change_status
    WHEN p_decision = 'reject' THEN 'rejected'::public.change_status
    ELSE 'draft'::public.change_status
  END
  WHERE id = p_change_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_change(
  p_change_id UUID,
  p_success BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace UUID;
  v_status public.change_status;
BEGIN
  SELECT workspace_id, status INTO v_workspace, v_status
  FROM public.change_requests WHERE id = p_change_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Mudança não encontrada';
  END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_workspace) THEN
    RAISE EXCEPTION 'Apenas admins executam mudanças';
  END IF;

  IF v_status = 'approved' THEN
    UPDATE public.change_requests
    SET status = 'in_progress', executed_at = now()
    WHERE id = p_change_id;
  ELSIF v_status = 'in_progress' THEN
    UPDATE public.change_requests
    SET status = CASE WHEN p_success THEN 'completed'::public.change_status ELSE 'failed'::public.change_status END,
        completed_at = now()
    WHERE id = p_change_id;
  ELSE
    RAISE EXCEPTION 'Mudança não está em estado executável (atual: %)', v_status;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_change(
  p_change_id UUID,
  p_post_mortem_url TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace UUID;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.change_requests WHERE id = p_change_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Mudança não encontrada';
  END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_workspace) THEN
    RAISE EXCEPTION 'Apenas admins podem fazer rollback';
  END IF;
  IF p_post_mortem_url IS NULL OR length(trim(p_post_mortem_url)) = 0 THEN
    RAISE EXCEPTION 'post_mortem_url é obrigatório para rollback';
  END IF;

  UPDATE public.change_requests
  SET status = 'rolled_back', post_mortem_url = p_post_mortem_url, completed_at = now()
  WHERE id = p_change_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_ir_tabletop()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sev public.ir_severity;
  v_days INTEGER;
  v_when TIMESTAMPTZ;
BEGIN
  v_when := COALESCE(NEW.executed_at, NEW.scheduled_for);
  IF NEW.outcome = 'scheduled' THEN
    RETURN NEW;
  END IF;
  SELECT severity_default INTO v_sev FROM public.ir_playbooks WHERE id = NEW.playbook_id;
  v_days := CASE v_sev WHEN 'critical' THEN 90 WHEN 'high' THEN 180 ELSE 365 END;
  UPDATE public.ir_playbooks
    SET last_reviewed_at = v_when,
        next_review_due = v_when + (v_days || ' days')::INTERVAL,
        updated_at = now()
    WHERE id = NEW.playbook_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.activate_ir_playbook(p_playbook_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ws UUID;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.ir_playbooks WHERE id = p_playbook_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'playbook not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_ws) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  UPDATE public.ir_playbooks
    SET status = 'active', version = version + 1, updated_at = now()
    WHERE id = p_playbook_id;
END $$;

CREATE OR REPLACE FUNCTION public.handle_asset_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.assets
    SET last_seen_at = NEW.audited_at,
        status = NEW.status_after,
        updated_at = now()
    WHERE id = NEW.asset_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.register_asset(
  p_workspace_id UUID,
  p_name TEXT,
  p_asset_type public.asset_type,
  p_classification public.asset_classification DEFAULT 'internal',
  p_environment public.asset_environment DEFAULT 'production',
  p_category TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_vendor TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_serial_number TEXT DEFAULT NULL,
  p_hostname TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_os TEXT DEFAULT NULL,
  p_version TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_purchased_at DATE DEFAULT NULL,
  p_warranty_until DATE DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.is_workspace_admin(auth.uid(), p_workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  INSERT INTO public.assets(
    workspace_id, name, asset_type, classification, environment, category,
    owner_id, vendor, model, serial_number, hostname, ip_address, os, version,
    location, purchased_at, warranty_until, tags, created_by
  ) VALUES (
    p_workspace_id, p_name, p_asset_type, p_classification, p_environment, p_category,
    p_owner_id, p_vendor, p_model, p_serial_number, p_hostname, p_ip_address, p_os, p_version,
    p_location, p_purchased_at, p_warranty_until, p_tags, auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.audit_asset(
  p_asset_id UUID,
  p_findings TEXT,
  p_status_after public.asset_status DEFAULT 'active',
  p_notes TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_ws UUID;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.assets WHERE id = p_asset_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'asset not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_ws) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  INSERT INTO public.asset_audits(asset_id, audited_by, findings, status_after, notes)
  VALUES (p_asset_id, auth.uid(), p_findings, p_status_after, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.decommission_asset(
  p_asset_id UUID,
  p_reason TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ws UUID;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.assets WHERE id = p_asset_id;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'asset not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_ws) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  UPDATE public.assets
    SET status = 'decommissioned', updated_at = now()
    WHERE id = p_asset_id;
  INSERT INTO public.asset_audits(asset_id, audited_by, findings, status_after, notes)
  VALUES (p_asset_id, auth.uid(), 'Decommissioned: ' || p_reason, 'decommissioned', p_reason);
END $$;

CREATE OR REPLACE FUNCTION public.get_workspace_members_full(_workspace_id uuid)
RETURNS TABLE (
  id uuid, workspace_id uuid, user_id uuid, role text,
  email text, name text, invited_at timestamptz, accepted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_workspace_admin(auth.uid(), _workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  RETURN QUERY
    SELECT m.id, m.workspace_id, m.user_id, m.role, m.email, m.name, m.invited_at, m.accepted_at
    FROM public.workspace_members m
    WHERE m.workspace_id = _workspace_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_oncall_with_contacts(_workspace_id uuid)
RETURNS TABLE (
  id uuid, workspace_id uuid, user_id uuid, user_name text, user_email text,
  starts_at timestamptz, ends_at timestamptz, escalation_order int, notes text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_workspace_admin(auth.uid(), _workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  RETURN QUERY
    SELECT o.id, o.workspace_id, o.user_id, o.user_name, o.user_email,
           o.starts_at, o.ends_at, o.escalation_order, o.notes
    FROM public.oncall_schedule o
    WHERE o.workspace_id = _workspace_id
    ORDER BY o.starts_at;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_2fa_status()
RETURNS TABLE (enabled boolean, last_verified_at timestamptz, configured_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT enabled, last_verified_at, created_at
  FROM public.user_2fa
  WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.encrypt_secret_value()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.key_value IS NOT NULL AND NEW.key_value != '' THEN
    NEW.encrypted_value = extensions.pgp_sym_encrypt(
      NEW.key_value,
      current_setting('app.settings.secret_key', true)
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_oncall(p_workspace_id uuid)
RETURNS TABLE(user_id uuid, user_name text, user_email text, escalation_order integer, ends_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    os.user_id,
    os.user_name,
    CASE
      WHEN os.user_id = auth.uid() THEN oce.user_email
      WHEN public.is_workspace_admin(auth.uid(), os.workspace_id) THEN oce.user_email
      ELSE NULL
    END AS user_email,
    os.escalation_order,
    os.ends_at
  FROM public.oncall_schedule os
  LEFT JOIN public.oncall_schedule_emails oce ON oce.schedule_id = os.id
  WHERE os.workspace_id = p_workspace_id
    AND os.starts_at <= now()
    AND os.ends_at > now()
  ORDER BY os.escalation_order ASC
  LIMIT 5;
$function$;

CREATE OR REPLACE FUNCTION public.get_pending_invites_for_email(_email text)
RETURNS TABLE(id uuid, workspace_id uuid, role text, name text, invited_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  IF v_user_email IS NULL OR lower(v_user_email) <> lower(_email) THEN
    RAISE EXCEPTION 'forbidden: can only query own invites';
  END IF;

  RETURN QUERY
    SELECT m.id, m.workspace_id, m.role, m.name, m.invited_at
    FROM public.workspace_members m
    JOIN public.workspace_member_emails wme ON wme.member_id = m.id
    WHERE lower(wme.email) = lower(_email)
      AND m.accepted_at IS NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.invite_workspace_member(
  p_workspace_id uuid,
  p_email text,
  p_role text DEFAULT 'agent_viewer',
  p_name text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member_id uuid;
  v_user_id uuid;
BEGIN
  -- Caller must be admin or workspace owner
  IF NOT (
    public.is_workspace_admin(auth.uid(), p_workspace_id)
    OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = p_workspace_id AND w.owner_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden: only admins can invite members';
  END IF;

  v_user_id := COALESCE(p_user_id, gen_random_uuid());

  INSERT INTO public.workspace_members (workspace_id, user_id, role, name)
  VALUES (p_workspace_id, v_user_id, p_role, p_name)
  RETURNING id INTO v_member_id;

  INSERT INTO public.workspace_member_emails (member_id, workspace_id, user_id, email)
  VALUES (v_member_id, p_workspace_id, v_user_id, p_email);

  RETURN v_member_id;
END $function$;

CREATE OR REPLACE FUNCTION public.touch_user_filter_preferences()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_context_l0(p_query TEXT, p_collection_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    collection_id UUID,
    l0_abstract TEXT,
    l1_overview TEXT,
    l2_content TEXT,
    token_count INTEGER,
    relevance_score FLOAT
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as chunk_id,
        c.document_id,
        (c.metadata->>'collection_id')::uuid as collection_id,
        substring(c.content, 1, 200) as l0_abstract,
        substring(c.content, 1, 2000) as l1_overview,
        '' as l2_content,
        c.token_count,
        ts_rank_cd(to_tsvector('portuguese', c.content), plainto_tsquery('portuguese', p_query)) as relevance_score
    FROM public.chunks c
    WHERE 
        (p_collection_id IS NULL OR (c.metadata->>'collection_id')::uuid = p_collection_id)
        AND to_tsvector('portuguese', c.content) @@ plainto_tsquery('portuguese', p_query)
    ORDER BY relevance_score DESC
    LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_partition_if_not_exists(
    t_name text,
    p_date timestamptz
) RETURNS void AS $$
DECLARE
    p_name text;
    start_date timestamptz;
    end_date timestamptz;
BEGIN
    start_date := date_trunc('month', p_date);
    end_date := start_date + interval '1 month';
    p_name := t_name || '_' || to_char(start_date, 'YYYY_MM');

    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = p_name) THEN
        EXECUTE format('CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
            p_name, t_name, start_date, end_date);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trg_auto_partition()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.create_partition_if_not_exists(TG_TABLE_NAME::text, NEW.created_at);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_mfa_valid_for_role()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Get the user's role in their primary workspace
    SELECT role_key INTO user_role
    FROM public.user_roles
    WHERE user_id = auth.uid()
    LIMIT 1;

    -- If not admin, it's valid (standard auth)
    IF user_role IS NULL OR user_role != 'workspace_admin' THEN
        RETURN TRUE;
    END IF;

    -- If admin, session must be aal2
    RETURN auth.jwt() ->> 'aal' = 'aal2';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_workspace_daily_usage_v2(p_workspace_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (usage_date DATE, total_tokens BIGINT, total_cost_usd NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    created_at::date as usage_date,
    SUM(tokens) as total_tokens,
    SUM(cost_usd) as total_cost_usd
  FROM public.usage_records
  WHERE workspace_id = p_workspace_id
    AND created_at > now() - (p_days || ' days')::interval
  GROUP BY 1
  ORDER BY 1 DESC;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.handle_auth_failure_alert()
RETURNS TRIGGER AS $$
DECLARE
    fail_count INTEGER;
BEGIN
    SELECT count(*) INTO fail_count
    FROM public.auth_attempts
    WHERE ip_address = NEW.ip_address
      AND success = false
      AND created_at > now() - interval '10 minutes';

    IF fail_count >= 5 THEN
        INSERT INTO public.security_alerts (severity, category, message, metadata)
        VALUES (
            'high',
            'auth',
            'Detectadas múltiplas falhas de autenticação do IP: ' || NEW.ip_address,
            jsonb_build_object('ip_address', NEW.ip_address, 'count', fail_count, 'last_email', NEW.email)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

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

CREATE OR REPLACE FUNCTION public.run_prune_traces_retention_monitored(_days integer DEFAULT 90)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run_id uuid;
  started timestamptz := clock_timestamp();
  dropped_rows jsonb := '[]'::jsonb;
  dropped_count int := 0;
BEGIN
  INSERT INTO public.retention_job_runs (job_name, started_at, status)
  VALUES ('prune_traces_retention', started, 'running')
  RETURNING id INTO run_id;

  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb), COUNT(*)::int
      INTO dropped_rows, dropped_count
    FROM public.prune_traces_retention(_days) t;

    UPDATE public.retention_job_runs
       SET finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - started)) * 1000)::int,
           partitions_dropped = dropped_count,
           details = dropped_rows,
           status = 'success'
     WHERE id = run_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.retention_job_runs
       SET finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - started)) * 1000)::int,
           status = 'failed',
           error_message = SQLERRM
     WHERE id = run_id;

    INSERT INTO public.security_alerts (severity, category, message, metadata)
    VALUES (
      'high', 'retention_job',
      format('Falha na retenção de traces (90d): %s', SQLERRM),
      jsonb_build_object('run_id', run_id, 'days', _days)
    );
    RAISE;
  END;

  RETURN run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_retention_job_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_success timestamptz;
  last_run public.retention_job_runs%ROWTYPE;
BEGIN
  SELECT MAX(finished_at) INTO last_success
    FROM public.retention_job_runs
   WHERE job_name = 'prune_traces_retention'
     AND status = 'success';

  SELECT * INTO last_run
    FROM public.retention_job_runs
   WHERE job_name = 'prune_traces_retention'
   ORDER BY started_at DESC
   LIMIT 1;

  IF last_success IS NULL OR last_success < now() - interval '26 hours' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
       WHERE category = 'retention_job_watchdog'
         AND created_at > now() - interval '1 hour'
    ) THEN
      INSERT INTO public.security_alerts (severity, category, message, metadata)
      VALUES (
        'high', 'retention_job_watchdog',
        format('Retenção de traces atrasada (>26h sem sucesso). Última execução: %s. Último status: %s.',
               COALESCE(last_success::text, 'nunca'),
               COALESCE(last_run.status, 'nenhum')),
        jsonb_build_object(
          'last_success', last_success,
          'last_run_id', last_run.id,
          'last_run_status', last_run.status,
          'last_run_error', last_run.error_message
        )
      );
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pg_net_schema()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT extnamespace::regnamespace::text FROM pg_extension WHERE extname = 'pg_net';
$$;

CREATE OR REPLACE FUNCTION public.pg_net_smoke_post(_url text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_catalog
AS $$
DECLARE
  req_id bigint;
BEGIN
  SELECT net.http_post(
    url := _url,
    headers := '{"Content-Type":"application/json","X-Smoke-Test":"pg-net"}'::jsonb,
    body := _body,
    timeout_milliseconds := 8000
  ) INTO req_id;
  RETURN req_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pg_net_smoke_response(_request_id bigint)
RETURNS TABLE (status_code int, error_msg text, content_length int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  SELECT r.status_code, r.error_msg, coalesce(length(r.content), 0)
  FROM net._http_response r
  WHERE r.id = _request_id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_pg_net_smoke_test()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_catalog
AS $$
DECLARE
  req_id bigint;
  started timestamptz := clock_timestamp();
  resp record;
  latency int;
  ok boolean := false;
  target text := 'https://postman-echo.com/post';
BEGIN
  BEGIN
    SELECT net.http_post(
      url := target,
      headers := '{"Content-Type":"application/json","X-Smoke-Test":"pg-net-cron"}'::jsonb,
      body := jsonb_build_object('cron', true, 'ts', now()),
      timeout_milliseconds := 8000
    ) INTO req_id;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.pg_net_smoke_runs(target_url, error_msg, succeeded)
    VALUES (target, 'dispatch_failed: ' || SQLERRM, false);
    INSERT INTO public.security_alerts(severity, category, message, metadata)
    VALUES ('high', 'pg_net_smoke', 'pg_net dispatch failed', jsonb_build_object('error', SQLERRM));
    RETURN;
  END;

  FOR i IN 1..30 LOOP
    PERFORM pg_sleep(0.5);
    SELECT r.status_code, r.error_msg INTO resp
    FROM net._http_response r WHERE r.id = req_id LIMIT 1;
    EXIT WHEN resp.status_code IS NOT NULL OR resp.error_msg IS NOT NULL;
  END LOOP;

  latency := (extract(epoch from (clock_timestamp() - started)) * 1000)::int;
  ok := resp.status_code IS NOT NULL AND resp.status_code BETWEEN 200 AND 399;

  INSERT INTO public.pg_net_smoke_runs(request_id, target_url, status_code, error_msg, latency_ms, succeeded)
  VALUES (req_id, target, resp.status_code, resp.error_msg, latency, ok);

  IF NOT ok THEN
    INSERT INTO public.security_alerts(severity, category, message, metadata)
    VALUES ('high', 'pg_net_smoke',
            format('pg_net smoke test failed: status=%s error=%s', resp.status_code, resp.error_msg),
            jsonb_build_object('request_id', req_id, 'latency_ms', latency, 'target', target));
  ELSIF latency > 5000 THEN
    INSERT INTO public.security_alerts(severity, category, message, metadata)
    VALUES ('medium', 'pg_net_smoke',
            format('pg_net smoke test slow: %sms', latency),
            jsonb_build_object('request_id', req_id, 'latency_ms', latency, 'target', target));
  END IF;

  DELETE FROM public.pg_net_smoke_runs WHERE run_at < now() - interval '30 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_oncall_workspace_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = NEW.workspace_id
      AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'User % is not a member of workspace %', NEW.user_id, NEW.workspace_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = NEW.workspace_id
      AND user_id = NEW.created_by
  ) THEN
    RAISE EXCEPTION 'Creator % is not a member of workspace %', NEW.created_by, NEW.workspace_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_knowledge_graph_health()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.knowledge_graph_health
$$;

CREATE OR REPLACE FUNCTION public.get_knowledge_graph_health(p_workspace_id UUID)
RETURNS TABLE (
  workspace_id UUID,
  orphans_score NUMERIC,
  broken_links_score NUMERIC,
  dedup_score NUMERIC,
  freshness_score NUMERIC,
  coverage_score NUMERIC,
  total_score NUMERIC,
  computed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.workspace_id, h.orphans_score, h.broken_links_score, h.dedup_score,
         h.freshness_score, h.coverage_score, h.total_score, h.computed_at
    FROM public.knowledge_graph_health h
   WHERE h.workspace_id = p_workspace_id
     AND EXISTS (
       SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = p_workspace_id
          AND wm.user_id = auth.uid()
     )
$$;

CREATE OR REPLACE FUNCTION public._fase8_snapshot_as(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(_uid::text,''), true);
  BEGIN
    v := public.get_db_health_snapshot();
    RETURN v;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('__error__', SQLERRM);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.detect_slow_queries_and_alert()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT
      substring(query, 1, 200) AS query_preview,
      calls,
      round(mean_exec_time::numeric, 2) AS mean_ms,
      round(total_exec_time::numeric / 1000, 2) AS total_sec
    FROM extensions.pg_stat_statements
    WHERE calls >= 5
      AND mean_exec_time > 5000  -- > 5s
      AND query NOT ILIKE '%pg_stat_statements%'
      AND query NOT ILIKE '%pg_stat_activity%'
    ORDER BY mean_exec_time DESC
    LIMIT 10
  LOOP
    -- Deduplica: só cria se não houver alerta ativo do mesmo preview nas últimas 24h
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE category = 'performance.slow_query'
        AND is_resolved = false
        AND metadata->>'query_preview' = r.query_preview
        AND created_at > now() - interval '24 hours'
    ) THEN
      INSERT INTO public.security_alerts (severity, category, message, metadata)
      VALUES (
        CASE WHEN r.mean_ms > 10000 THEN 'critical' ELSE 'high' END,
        'performance.slow_query',
        format('Consulta lenta detectada: %s ms/call (%s chamadas)', r.mean_ms, r.calls),
        jsonb_build_object(
          'query_preview', r.query_preview,
          'mean_ms', r.mean_ms,
          'calls', r.calls,
          'total_sec', r.total_sec,
          'detected_at', now()
        )
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_slow_query_alerts_history(_days INT DEFAULT 7)
RETURNS TABLE(
  id UUID,
  severity TEXT,
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.severity, a.message, a.metadata, a.created_at, a.resolved_at
  FROM public.security_alerts a
  WHERE a.category = 'performance.slow_query'
    AND a.created_at > now() - make_interval(days => GREATEST(_days, 1))
    AND public.is_workspace_admin(auth.uid())
  ORDER BY a.created_at DESC
  LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.explain_query_plan(_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan JSONB;
  v_normalized TEXT;
  v_seq_scans INT := 0;
  v_suggestions TEXT[] := ARRAY[]::TEXT[];
  v_node JSONB;
BEGIN
  IF NOT public.is_workspace_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: admin required';
  END IF;

  v_normalized := lower(btrim(_query));
  IF v_normalized !~ '^(select|with)\s' THEN
    RAISE EXCEPTION 'only SELECT/WITH queries are allowed';
  END IF;
  IF v_normalized ~ '\y(insert|update|delete|drop|alter|truncate|grant|revoke|create)\y' THEN
    RAISE EXCEPTION 'mutating keywords are not allowed';
  END IF;

  -- EXPLAIN sem ANALYZE para não executar (planos apenas)
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || _query INTO v_plan;

  -- Heurística: contar Seq Scans em tabelas grandes
  FOR v_node IN
    SELECT jsonb_path_query(v_plan, '$.**."Node Type"')
  LOOP
    IF v_node #>> '{}' = 'Seq Scan' THEN
      v_seq_scans := v_seq_scans + 1;
    END IF;
  END LOOP;

  IF v_seq_scans > 0 THEN
    v_suggestions := array_append(
      v_suggestions,
      format('Detectados %s Seq Scan(s). Avalie criar índice B-Tree nas colunas dos filtros WHERE mais seletivos.', v_seq_scans)
    );
  END IF;

  RETURN jsonb_build_object(
    'plan', v_plan,
    'seq_scans', v_seq_scans,
    'suggestions', to_jsonb(v_suggestions),
    'captured_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_db_health_timeseries(_hours INT DEFAULT 24)
RETURNS TABLE (
  captured_at TIMESTAMPTZ,
  wal_bytes BIGINT,
  connections_used INT,
  connections_max INT,
  connections_pct NUMERIC,
  long_running_count INT,
  top_slow_mean_ms NUMERIC,
  top_slow_preview TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, internal, pg_catalog
AS $$
BEGIN
  IF NOT public.is_workspace_admin(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.captured_at, s.wal_bytes, s.connections_used, s.connections_max,
         s.connections_pct, s.long_running_count, s.top_slow_mean_ms, s.top_slow_preview
  FROM internal.db_health_samples s
  WHERE s.captured_at >= now() - make_interval(hours => GREATEST(1, LEAST(_hours, 168)))
  ORDER BY s.captured_at ASC
  LIMIT 2016;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_detector_slo_status()
RETURNS TABLE(
  job_name text,
  schedule text,
  active boolean,
  last_run_at timestamptz,
  last_status text,
  seconds_since_last_run bigint,
  slo_ok boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, cron, pg_catalog
AS $$
BEGIN
  IF NOT public.is_workspace_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  WITH watched AS (
    SELECT * FROM (VALUES
      ('detect-health-trend-every-15min', 900),      -- SLO: 15min
      ('smoke-test-health-alerts-every-6h', 21600),  -- SLO: 6h
      ('smoke-test-wal-every-6h', 21600),
      ('smoke-test-conn-every-6h', 21600)
    ) AS t(name, slo_sec)
  ),
  latest AS (
    SELECT DISTINCT ON (jrd.jobid)
      jrd.jobid, jrd.start_time, jrd.status
    FROM cron.job_run_details jrd
    ORDER BY jrd.jobid, jrd.start_time DESC
  )
  SELECT
    w.name::text,
    coalesce(j.schedule, 'unscheduled')::text,
    coalesce(j.active, false),
    l.start_time,
    coalesce(l.status, 'unknown')::text,
    CASE WHEN l.start_time IS NULL THEN NULL
         ELSE extract(epoch FROM (now() - l.start_time))::bigint END,
    CASE
      WHEN j.jobid IS NULL OR NOT j.active THEN false
      WHEN l.start_time IS NULL THEN true  -- recém-criado, tolera
      ELSE extract(epoch FROM (now() - l.start_time)) < (w.slo_sec * 2)
    END
  FROM watched w
  LEFT JOIN cron.job j ON j.jobname = w.name
  LEFT JOIN latest l ON l.jobid = j.jobid
  ORDER BY w.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.collections_fill_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.knowledge_base_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM public.knowledge_bases WHERE id = NEW.knowledge_base_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hybrid_memory_search_notebook(
  p_query text,
  p_notebook_id uuid,
  p_limit int DEFAULT 15
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  score float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.document_id, c.content, c.metadata,
         ts_rank(to_tsvector('portuguese', c.content), plainto_tsquery('portuguese', p_query))::float AS score
  FROM public.chunks c
  WHERE c.embedding_status = 'done'
    AND (p_notebook_id IS NULL OR c.metadata->>'collection_id' = p_notebook_id::text)
    AND to_tsvector('portuguese', c.content) @@ plainto_tsquery('portuguese', p_query)
  ORDER BY score DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.tg_notebook_canvases_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_note_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  IF (NEW.title IS DISTINCT FROM OLD.title) OR (NEW.body_md IS DISTINCT FROM OLD.body_md) THEN
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next
      FROM public.notebook_note_versions WHERE note_id = OLD.id;

    INSERT INTO public.notebook_note_versions
      (note_id, workspace_id, title, body_md, tags, version_number, created_by)
    VALUES (OLD.id, OLD.workspace_id, OLD.title, OLD.body_md, OLD.tags, v_next, auth.uid());

    DELETE FROM public.notebook_note_versions
     WHERE note_id = OLD.id
       AND id IN (
         SELECT id FROM public.notebook_note_versions
          WHERE note_id = OLD.id
          ORDER BY version_number DESC OFFSET 50
       );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_dr_drill(p_drill_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_drill public.dr_drills%ROWTYPE;
  v_table TEXT;
  v_validated_tables TEXT[];
  v_count BIGINT;
  v_checksum TEXT;
  v_total_tables INTEGER := 0;
BEGIN
  SELECT * INTO v_drill FROM public.dr_drills WHERE id = p_drill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'drill not found'; END IF;
  IF NOT public.is_workspace_admin(auth.uid(), v_drill.workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required';
  END IF;
  IF v_drill.status NOT IN ('scheduled','failed') THEN
    RAISE EXCEPTION 'drill not in scheduled state (current: %)', v_drill.status;
  END IF;

  UPDATE public.dr_drills
    SET status = 'snapshotting', started_at = now(), executor_id = auth.uid()
    WHERE id = p_drill_id;

  INSERT INTO public.dr_restore_logs(drill_id, step, status, metadata)
  VALUES (p_drill_id, 'snapshot', 'started',
          jsonb_build_object('tables', v_drill.target_tables,
                             'allowed_tables', v_drill.allowed_target_tables));

  -- Validação: rejeita tabelas fora da allowlist
  v_validated_tables := public.validate_table_names_for_drill(
      v_drill.target_tables,
      v_drill.allowed_target_tables
  );

  -- Snapshot row counts + checksums para cada tabela validada
  FOREACH v_table IN ARRAY v_validated_tables LOOP
    BEGIN
      -- %I = identifier (tabela) — AGORA validado acima
      EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_count;
      EXECUTE format(
          'SELECT md5(string_agg(t::text, '''' ORDER BY t::text)) ' ||
          'FROM (SELECT * FROM public.%I LIMIT 1000) t',
          v_table
      ) INTO v_checksum;

      INSERT INTO public.dr_snapshots(drill_id, table_name, row_count, checksum, snapshot_data)
      VALUES (p_drill_id, v_table, COALESCE(v_count, 0), COALESCE(v_checksum, ''),
              jsonb_build_object('captured_at', now(), 'method', 'count+md5'));
      v_total_tables := v_total_tables + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.dr_restore_logs(drill_id, step, status, error_message, metadata)
      VALUES (p_drill_id, 'snapshot', 'failed', SQLERRM,
              jsonb_build_object('table', v_table, 'sqlstate', SQLSTATE));
    END;
  END LOOP;

  INSERT INTO public.dr_restore_logs(drill_id, step, status, ended_at, duration_ms, metadata)
  VALUES (p_drill_id, 'snapshot', 'succeeded', now(), 0,
          jsonb_build_object('tables_snapshotted', v_total_tables));

  RETURN jsonb_build_object(
      'status', 'snapshotting',
      'tables_snapshotted', v_total_tables,
      'started_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_dr_step(
  p_drill_id UUID,
  p_step TEXT,
  p_status TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_error TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_drill_status TEXT;
  -- Whitelist de steps válidos (impede injeção via p_step)
  v_valid_steps TEXT[] := ARRAY['isolate','restore','validate','snapshot',
                                'restore_started','restore_completed','backup'];
BEGIN
  -- Validação: p_step deve estar na whitelist
  IF NOT p_step = ANY(v_valid_steps) THEN
    RAISE EXCEPTION 'Invalid step name: "%". Allowed: %', p_step, v_valid_steps;
  END IF;

  -- Validação: p_status deve ser válido
  IF NOT p_status = ANY(ARRAY['started','succeeded','failed','skipped']) THEN
    RAISE EXCEPTION 'Invalid step status: "%"', p_status;
  END IF;

  INSERT INTO public.dr_restore_logs(drill_id, step, status, ended_at, error_message, metadata)
  VALUES (p_drill_id, p_step, p_status,
          CASE WHEN p_status IN ('succeeded','failed','skipped') THEN now() ELSE NULL END,
          p_error, p_metadata)
  RETURNING id INTO v_id;

  -- Advance drill status based on step (usando CASE, não IF dinâmico)
  v_drill_status := CASE p_step
    WHEN 'isolate' THEN 'restoring'
    WHEN 'restore' THEN 'restoring'
    WHEN 'validate' THEN 'validating'
    ELSE NULL
  END;

  IF v_drill_status IS NOT NULL AND p_status = 'started' THEN
    UPDATE public.dr_drills SET status = v_drill_status WHERE id = p_drill_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.hash_api_key_bcrypt(p_raw_key TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN encode(
        pgcrypto.crypt(
            encode(sha256(p_raw_key::bytea), 'hex'),
            pgcrypto.gen_salt('bf', 12)
        ),
        'hex'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_api_key_bcrypt(
    p_raw_key TEXT,
    p_stored_hash TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- pgcrypto.crypt falha se o hash não estiver no formato bcrypt
    RETURN pgcrypto.crypt_encode(
        encode(sha256(p_raw_key::bytea), 'hex'),
        p_stored_hash
    ) = p_stored_hash;
EXCEPTION WHEN OTHERS THEN
    -- Se não for bcrypt format, retorna false (não vaza informação)
    RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_api_key_bcrypt(
    p_workspace_id UUID,
    p_name TEXT,
    p_scopes TEXT[] DEFAULT ARRAY['read','execute']::TEXT[],
    p_agent_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS TABLE(key_id UUID, raw_key TEXT, key_hash TEXT, key_prefix TEXT) LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_raw_key TEXT := 'nxs_' || encode(gen_random_bytes(32), 'hex');
    v_hash TEXT;
    v_prefix TEXT;
    v_key_id UUID;
BEGIN
    v_prefix := substr(replace(v_raw_key, '-', ''), 1, 8);
    v_hash := public.hash_api_key_bcrypt(v_raw_key);

    INSERT INTO public.api_keys (
        workspace_id, name, key_hash, key_prefix, scopes,
        agent_id, is_active, created_by, key_method
    ) VALUES (
        p_workspace_id, p_name, v_hash, v_prefix, p_scopes,
        p_agent_id, true, p_created_by, 'bcrypt'
    ) RETURNING id INTO v_key_id;

    RETURN QUERY SELECT v_key_id, v_raw_key, v_hash, v_prefix;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_api_key(p_raw_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_key RECORD;
    v_sha256_hash TEXT;
BEGIN
    -- Primeiro tenta bcrypt (novo formato)
    FOR v_key IN
        SELECT id, workspace_id, agent_id, key_hash, key_method
        FROM public.api_keys
        WHERE is_active = true
    LOOP
        IF v_key.key_method = 'bcrypt' THEN
            IF public.verify_api_key_bcrypt(p_raw_key, v_key.key_hash) THEN
                -- Atualiza last_used_at (não bloqueia em caso de erro)
                UPDATE public.api_keys
                SET last_used_at = now()
                WHERE id = v_key.id;
                RETURN jsonb_build_object(
                    'valid', true,
                    'workspace_id', v_key.workspace_id,
                    'agent_id', v_key.agent_id,
                    'key_id', v_key.id
                );
            END IF;
        END IF;
    END LOOP;

    -- Fallback SHA-256 legado (para keys não migradas)
    -- DEPRECADO: Remove quando 100% das keys forem bcrypt
    v_sha256_hash := encode(sha256(p_raw_key::bytea), 'hex');
    FOR v_key IN
        SELECT id, workspace_id, agent_id, key_hash
        FROM public.api_keys
        WHERE is_active = true AND key_method = 'sha256'
    LOOP
        IF v_key.key_hash = v_sha256_hash THEN
            UPDATE public.api_keys SET last_used_at = now() WHERE id = v_key.id;
            RETURN jsonb_build_object(
                'valid', true,
                'workspace_id', v_key.workspace_id,
                'agent_id', v_key.agent_id,
                'key_id', v_key.id,
                'legacy', true
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object('valid', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.make_audit_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only: UPDATE and DELETE are prohibited';
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_audit_log(
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor_id UUID := NULLIF(current_setting('request.jwt.claim.sub', TRUE), '')::UUID;
    v_workspace_id UUID := NULLIF(current_setting('request.jwt.claim.workspace_id', TRUE), '')::UUID;
    v_new_id UUID;
BEGIN
    -- Validação anti-Log-Injection
    PERFORM public.validate_audit_log_fields(p_action, p_entity_type, p_entity_id, p_ip_address);

    INSERT INTO public.audit_log (
        user_id, action, entity_type, entity_id,
        metadata, ip_address, workspace_id
    ) VALUES (
        COALESCE(v_actor_id, auth.uid()),
        p_action,
        p_entity_type,
        p_entity_id,
        p_metadata,
        p_ip_address,
        v_workspace_id
    ) RETURNING id INTO v_new_id;

    RETURN v_new_id;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_audit_log_fields(
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    -- Verifica NULL bytes (indicação de Log Injection)
    IF p_action LIKE '%' || chr(0) || '%' THEN
        RAISE EXCEPTION 'Invalid action: NULL byte detected';
    END IF;
    IF p_entity_type LIKE '%' || chr(0) || '%' THEN
        RAISE EXCEPTION 'Invalid entity_type: NULL byte detected';
    END IF;
    IF p_entity_id LIKE '%' || chr(0) || '%' THEN
        RAISE EXCEPTION 'Invalid entity_id: NULL byte detected';
    END IF;
    IF p_ip_address LIKE '%' || chr(0) || '%' THEN
        RAISE EXCEPTION 'Invalid ip_address: NULL byte detected';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_auth_attempts()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Remove tentativas de login com mais de 90 dias (LGPD)
    DELETE FROM public.auth_attempts
    WHERE created_at < (now() - interval '90 days');

    -- Remove lockouts expirados
    DELETE FROM public.account_lockouts
    WHERE expires_at IS NOT NULL
      AND expires_at < (now() - interval '1 day');

    -- Remove rate limits por IP antigos
    DELETE FROM public.ip_rate_limits
    WHERE last_attempt_at < (now() - interval '24 hours');
END;
$$;

CREATE OR REPLACE FUNCTION public.lgpd_apply_retention_policies()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_policy RECORD;
    v_deleted_count INTEGER := 0;
    v_anonymized_count INTEGER := 0;
    v_table_name TEXT;
    v_id_col TEXT;
    v_workspace_col TEXT;
    v_ts_col TEXT;
BEGIN
    FOR v_policy IN
        SELECT rp.id, rp.workspace_id, rp.data_type, rp.retention_days,
               rp.auto_anonymize, rp.anonymization_method
        FROM public.data_retention_policies rp
        WHERE rp.is_active = true
          AND (
              -- Só processa políticas que têm workspace (null = global/default)
              rp.workspace_id IS NOT NULL
              OR rp.data_type IN ('audit_log', 'auth_attempts', 'idempotency_keys')
          )
    LOOP
        -- Mapeamento: data_type → (table, id_col, workspace_col, ts_col)
        CASE v_policy.data_type
        WHEN 'chat_messages' THEN
            v_table_name := 'chat_messages'; v_id_col := 'id';
            v_workspace_col := 'workspace_id'; v_ts_col := 'created_at';
        WHEN 'agent_traces' THEN
            v_table_name := 'agent_traces'; v_id_col := 'id';
            v_workspace_col := 'workspace_id'; v_ts_col := 'created_at';
        WHEN 'agent_logs' THEN
            v_table_name := 'agent_logs'; v_id_col := 'id';
            v_workspace_col := 'workspace_id'; v_ts_col := 'created_at';
        WHEN 'audit_log' THEN
            v_table_name := 'audit_log'; v_id_col := 'id';
            v_workspace_col := 'workspace_id'; v_ts_col := 'created_at';
        WHEN 'auth_attempts' THEN
            v_table_name := 'auth_attempts'; v_id_col := 'id';
            v_workspace_col := NULL; v_ts_col := 'created_at';
        WHEN 'idempotency_keys' THEN
            v_table_name := 'idempotency_keys'; v_id_col := 'key';
            v_workspace_col := NULL; v_ts_col := 'created_at';
        WHEN 'workflow_runs' THEN
            v_table_name := 'workflow_runs'; v_id_col := 'id';
            v_workspace_col := 'workspace_id'; v_ts_col := 'started_at';
        WHEN 'workflow_executions' THEN
            v_table_name := 'workflow_executions'; v_id_col := 'id';
            v_workspace_col := 'user_id'; v_ts_col := 'started_at';
        WHEN 'agent_memories' THEN
            v_table_name := 'agent_memories'; v_id_col := 'id';
            v_workspace_col := 'workspace_id'; v_ts_col := 'created_at';
        ELSE
            CONTINUE; -- Skip unknown data types
        END CASE;

        -- Verifica se a tabela existe
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = v_table_name
        ) THEN
            CONTINUE;
        END IF;

        -- Executa DELETE ou ANONYMIZE
        IF v_policy.auto_anonymize THEN
            -- Anonimização: substitui campos PII sensíveis
            BEGIN
                EXECUTE format(
                    'UPDATE public.%I SET metadata = jsonb_set(metadata, ''{_anonymized}'', ''true'') ' ||
                    'WHERE %I = $1 AND %I < now() - ($2 || '' days'')::interval ' ||
                    'AND (metadata->>''_anonymized'') IS DISTINCT FROM ''true''',
                    v_table_name,
                    v_workspace_col, v_ts_col
                ) USING v_policy.workspace_id, v_policy.retention_days;
                GET DIAGNOSTICS v_anonymized_count = ROW_COUNT;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Anonymization failed for %.%: %', v_table_name, v_policy.data_type, SQLERRM;
            END;
        ELSE
            -- DELETE direto
            DECLARE
                v_delete_sql TEXT;
            BEGIN
                IF v_policy.workspace_id IS NOT NULL AND v_workspace_col IS NOT NULL THEN
                    v_delete_sql := format(
                        'DELETE FROM public.%I ' ||
                        'WHERE %I = $1 AND %I < now() - ($2 || '' days'')::interval',
                        v_table_name, v_workspace_col, v_ts_col
                    );
                    EXECUTE v_delete_sql USING v_policy.workspace_id, v_policy.retention_days;
                ELSIF v_policy.data_type IN ('auth_attempts', 'idempotency_keys') THEN
                    v_delete_sql := format(
                        'DELETE FROM public.%I WHERE %I < now() - ($1 || '' days'')::interval',
                        v_table_name, v_ts_col
                    );
                    EXECUTE v_delete_sql USING v_policy.retention_days;
                ELSE
                    CONTINUE; -- Não tem workspace e não é global
                END IF;
                GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Retention delete failed for %.%: %', v_table_name, v_policy.data_type, SQLERRM;
            END;
        END IF;

        -- Log no data_breach_log se houve delete massivo
        IF v_deleted_count > 1000 THEN
            INSERT INTO public.data_breach_log (
                workspace_id, breach_type, severity,
                description, affected_data_categories,
                affected_users_count, metadata, status
            ) VALUES (
                v_policy.workspace_id, 'other', 'low',
                format('Automated retention delete: %s rows from %.%s',
                       v_deleted_count, 'public', v_table_name),
                ARRAY[v_policy.data_type]::TEXT[],
                NULL,
                jsonb_build_object('policy_id', v_policy.id, 'retention_days', v_policy.retention_days),
                'resolved'
            );
        END IF;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.lgpd_send_review_reminders()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_register RECORD;
    v_workspace RECORD;
    v_days_until_due INTEGER;
BEGIN
    -- Para cada registro de processamento com review devido em <= 7 dias
    FOR v_register IN
        SELECT dpr.id, dpr.workspace_id, dpr.data_category,
               dpr.data_type, dpr.next_review_due,
               dpr.risk_level, dpr.processing_purpose
        FROM public.data_processing_register dpr
        WHERE dpr.next_review_due IS NOT NULL
          AND dpr.next_review_due <= (now() + interval '7 days')
          AND dpr.next_review_due > now()
    LOOP
        -- Notifica admins do workspace (via lgpd_settings)
        FOR v_workspace IN
            SELECT ls.dpo_email, ls.workspace_id, ls.dpo_name
            FROM public.lgpd_settings ls
            WHERE ls.workspace_id = v_register.workspace_id
              AND ls.dpo_email IS NOT NULL
        LOOP
            -- Insere alert para DPO (vai para a tabela alerts)
            BEGIN
                INSERT INTO public.alerts (
                    workspace_id, title, description, severity, category,
                    is_resolved, metadata
                ) VALUES (
                    v_workspace.workspace_id,
                    'LGPD: Revisão de tratamento pendente',
                    format(
                        'O registro de tratamento "%s" (categoria: %s, finalidade: %s, risco: %s) ' ||
                        'precisa ser revisado até %s. Acesse o módulo LGPD para atualizar.',
                        v_register.data_type,
                        v_register.data_category,
                        v_register.processing_purpose,
                        v_register.risk_level,
                        v_register.next_review_due::date
                    ),
                    CASE v_register.risk_level WHEN 'critical' THEN 'critical'
                                               WHEN 'high' THEN 'high'
                                               ELSE 'medium' END,
                    'lgpd',
                    false,
                    jsonb_build_object(
                        'register_id', v_register.id,
                        'due_date', v_register.next_review_due,
                        'dpo_email', v_workspace.dpo_email
                    )
                );
            EXCEPTION WHEN OTHERS THEN
                -- Não bloqueia o cron se a notificação falhar
                RAISE NOTICE 'Failed to send LGPD review reminder: %', SQLERRM;
            END;
        END LOOP;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.lgpd_check_sar_deadlines()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sar RECORD;
    v_days_remaining INTEGER;
BEGIN
    FOR v_sar IN
        SELECT dsr.id, dsr.user_id, dsr.workspace_id, dsr.request_type,
               dsr.deadline_at, dsr.status
        FROM public.data_subject_requests dsr
        WHERE dsr.status = 'processing'
          AND dsr.deadline_at <= (now() + interval '2 days')
    LOOP
        v_days_remaining := (v_sar.deadline_at - now())::integer;

        INSERT INTO public.alerts (
            workspace_id, title, description, severity, category, is_resolved, metadata
        ) VALUES (
            v_sar.workspace_id,
            'LGPD SAR: prazo crítico',
            format(
                'Solicitação de direito do titular (tipo: %s) está com prazo de ' ||
                'resposta em %s dia(s). prazo final: %s',
                v_sar.request_type,
                v_days_remaining,
                v_sar.deadline_at::date
            ),
            CASE WHEN v_days_remaining <= 0 THEN 'critical' ELSE 'high' END,
            'lgpd',
            false,
            jsonb_build_object(
                'sar_id', v_sar.id,
                'user_id', v_sar.user_id,
                'request_type', v_sar.request_type,
                'deadline_at', v_sar.deadline_at
            )
        ) ON CONFLICT DO NOTHING;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_due_cadence_enrollments(
  p_limit INTEGER DEFAULT 50,
  p_lease_minutes INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  workspace_id UUID,
  cadence_id UUID,
  deal_id UUID,
  contact_id UUID,
  current_step INTEGER,
  attempts INTEGER
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT e.id
    FROM public.crm_cadence_enrollments e
    JOIN public.crm_cadences c ON c.id = e.cadence_id
    WHERE e.status = 'active'
      AND e.next_run_at <= now()
      AND c.is_active
      AND c.deleted_at IS NULL
    ORDER BY e.next_run_at
    LIMIT GREATEST(p_limit, 0)
    FOR UPDATE OF e SKIP LOCKED
  )
  UPDATE public.crm_cadence_enrollments AS e
  SET next_run_at = now() + make_interval(mins => GREATEST(p_lease_minutes, 1)),
      attempts = e.attempts + 1
  FROM due
  WHERE e.id = due.id
  RETURNING e.id, e.workspace_id, e.cadence_id, e.deal_id, e.contact_id,
            e.current_step, e.attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_cron_token(_name TEXT, _token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = internal, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM internal.cron_tokens
    WHERE name = _name AND token = _token AND length(_token) >= 32
  );
$$;

CREATE OR REPLACE FUNCTION public.get_partition_health_snapshot()
RETURNS TABLE(parent_table text, total_partitions integer, future_runway_months integer, latest_partition text, latest_partition_end timestamp with time zone, total_size_bytes bigint, total_size_pretty text, largest_partition text, largest_partition_bytes bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_parents text[] := ARRAY['agent_traces_v2','audit_log_v2','trace_events_v2'];
  v_parent text;
BEGIN
  -- Somente admins podem consultar
  IF NOT public.is_workspace_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  FOREACH v_parent IN ARRAY v_parents LOOP
    RETURN QUERY
    WITH parts AS (
      SELECT
        c.relname AS name,
        pg_relation_size(format('public.%I', c.relname)::regclass) AS bytes,
        substring(c.relname from '(\d{4}_\d{2})$') AS ym
      FROM pg_inherits i
      JOIN pg_class p ON p.oid = i.inhparent
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_namespace n ON n.oid = p.relnamespace
      WHERE n.nspname = 'public' AND p.relname = v_parent
    ),
    parsed AS (
      SELECT name, bytes,
        to_timestamp(ym || '_01', 'YYYY_MM_DD') AT TIME ZONE 'UTC' AS start_at
      FROM parts WHERE ym IS NOT NULL
    ),
    agg AS (
      SELECT
        v_parent AS parent_table,
        count(*)::int AS total_partitions,
        greatest(0, (
          extract(year FROM age(max(start_at), date_trunc('month', now())))::int * 12
          + extract(month FROM age(max(start_at), date_trunc('month', now())))::int
        ))::int AS future_runway_months,
        (SELECT name FROM parsed ORDER BY start_at DESC LIMIT 1) AS latest_partition,
        (max(start_at) + interval '1 month')::timestamptz AS latest_partition_end,
        coalesce(sum(bytes),0)::bigint AS total_size_bytes,
        pg_size_pretty(coalesce(sum(bytes),0)) AS total_size_pretty,
        (SELECT name FROM parsed ORDER BY bytes DESC LIMIT 1) AS largest_partition,
        coalesce(max(bytes),0)::bigint AS largest_partition_bytes
      FROM parsed
    )
    SELECT * FROM agg;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_cron_job_health()
RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean, last_run_at timestamp with time zone, last_status text, last_duration_ms integer, runs_20 integer, success_20 integer, failure_20 integer, success_rate numeric, avg_duration_ms numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $function$
BEGIN
  IF NOT public.is_workspace_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH recent AS (
    SELECT
      d.jobid,
      d.status,
      d.start_time,
      d.end_time,
      EXTRACT(EPOCH FROM (d.end_time - d.start_time))*1000 AS duration_ms,
      row_number() OVER (PARTITION BY d.jobid ORDER BY d.start_time DESC) AS rn
    FROM cron.job_run_details d
    WHERE d.start_time > now() - interval '7 days'
  ),
  agg AS (
    SELECT
      jobid,
      count(*) FILTER (WHERE rn <= 20) AS runs_20,
      count(*) FILTER (WHERE rn <= 20 AND status = 'succeeded') AS success_20,
      count(*) FILTER (WHERE rn <= 20 AND status <> 'succeeded') AS failure_20,
      avg(duration_ms) FILTER (WHERE rn <= 20) AS avg_ms
    FROM recent
    GROUP BY jobid
  ),
  last_run AS (
    SELECT DISTINCT ON (jobid) jobid, status, start_time, duration_ms
    FROM recent
    ORDER BY jobid, start_time DESC
  )
  SELECT
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    lr.start_time,
    lr.status,
    lr.duration_ms::int,
    COALESCE(a.runs_20, 0)::int,
    COALESCE(a.success_20, 0)::int,
    COALESCE(a.failure_20, 0)::int,
    CASE WHEN COALESCE(a.runs_20,0) = 0 THEN NULL
         ELSE round((a.success_20::numeric / a.runs_20) * 100, 2) END,
    round(a.avg_ms::numeric, 2)
  FROM cron.job j
  LEFT JOIN agg a ON a.jobid = j.jobid
  LEFT JOIN last_run lr ON lr.jobid = j.jobid
  ORDER BY j.jobname;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_version_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = TG_TABLE_SCHEMA
    AND table_name = TG_TABLE_NAME
    AND column_name = 'version';

  -- Só incrementa quando a coluna é numérica; caso contrário mantém o valor.
  IF v_type IN ('integer', 'bigint', 'smallint', 'numeric') THEN
    NEW.version := (OLD.version::bigint + 1)::text::int;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.template_skill_links_set_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSE
    NEW.updated_by := COALESCE(auth.uid(), OLD.updated_by);
    -- Marca/limpa o autor da remoção reversível de forma consistente.
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      NEW.deleted_by := COALESCE(auth.uid(), NEW.deleted_by);
    ELSIF NEW.deleted_at IS NULL THEN
      NEW.deleted_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_removed_template_skill_links(_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removidos integer := 0;
BEGIN
  IF _days IS NULL OR _days < 1 THEN
    RAISE EXCEPTION 'janela de retenção inválida: %', _days;
  END IF;

  WITH apagados AS (
    DELETE FROM public.template_skill_links
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - make_interval(days => _days)
    RETURNING 1
  )
  SELECT count(*)::int INTO removidos FROM apagados;

  RETURN removidos;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_purge_template_skill_links_monitored(_days integer DEFAULT 90)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run_id uuid;
  started timestamptz := clock_timestamp();
  removidos integer := 0;
BEGIN
  INSERT INTO public.retention_job_runs (job_name, started_at, status)
  VALUES ('purge_template_skill_links', started, 'running')
  RETURNING id INTO run_id;

  BEGIN
    SELECT public.purge_removed_template_skill_links(_days) INTO removidos;

    UPDATE public.retention_job_runs
       SET finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - started)) * 1000)::int,
           partitions_dropped = removidos,
           details = jsonb_build_object('rows_deleted', removidos, 'days', _days),
           status = 'success'
     WHERE id = run_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.retention_job_runs
       SET finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - started)) * 1000)::int,
           status = 'failed',
           error_message = SQLERRM
     WHERE id = run_id;

    INSERT INTO public.security_alerts (severity, category, title, description, metadata)
    VALUES (
      'medium', 'retention_job',
      'Falha no expurgo de vínculos removidos (90d)',
      format('purge_removed_template_skill_links falhou: %s', SQLERRM),
      jsonb_build_object('run_id', run_id, 'days', _days)
    );
    RAISE;
  END;

  RETURN run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.stamp_skill_curation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.department IS DISTINCT FROM OLD.department
     OR NEW.tags IS DISTINCT FROM OLD.tags
     OR NEW.category IS DISTINCT FROM OLD.category THEN
    NEW.curated_by := auth.uid();
    NEW.curated_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_skill_description(
  _skill_id uuid,
  _description text,
  _confidence numeric,
  _model text DEFAULT '',
  _min_confidence numeric DEFAULT 0.75
)
RETURNS public.skill_registry
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.skill_registry;
  _clean text;
  _limiar numeric;
BEGIN
  IF NOT public.is_workspace_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem aplicar descricoes geradas.'
      USING ERRCODE = '42501';
  END IF;

  -- O piso é do servidor: um `_min_confidence` mais permissivo vindo do
  -- cliente é ignorado. O parâmetro só serve para ENDURECER a regra.
  _limiar := greatest(coalesce(_min_confidence, 0.75), 0.75);

  IF _confidence IS NULL OR _confidence < _limiar THEN
    RAISE EXCEPTION 'Confianca % abaixo do minimo % exigido.', coalesce(_confidence, 0), _limiar
      USING ERRCODE = '55000';
  END IF;

  _clean := btrim(coalesce(_description, ''));
  IF length(_clean) < 40 OR length(_clean) > 600 THEN
    RAISE EXCEPTION 'Descricao gerada fora do tamanho aceitavel (40-600 caracteres).'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.skill_registry WHERE id = _skill_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Skill nao encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF _row.source_repo IS NULL THEN
    RAISE EXCEPTION 'Enriquecimento automatico so vale para skills importadas.'
      USING ERRCODE = '55000';
  END IF;

  -- Guarda de concorrência e de curadoria: se alguém escreveu a descrição
  -- entre o planejamento e a aplicacao, a geracao perde. Texto humano nunca
  -- e sobrescrito por IA.
  IF length(btrim(_row.description)) > 0 THEN
    RAISE EXCEPTION 'A skill ja possui descricao — nada foi sobrescrito.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.skill_registry
     SET description = _clean,
         description_source = 'ia',
         description_confidence = round(_confidence, 3),
         description_model = left(coalesce(_model, ''), 100),
         description_generated_at = now(),
         updated_at = now()
   WHERE id = _skill_id
  RETURNING * INTO _row;

  PERFORM public.log_audit_entry(
    'skill_description_enriched',
    'skill_registry',
    _skill_id::text,
    jsonb_build_object(
      'slug', _row.slug,
      'confidence', round(_confidence, 3),
      'model', left(coalesce(_model, ''), 100),
      'length', length(_clean)
    )
  );

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_stale_harvest_checkpoints(_max_age interval DEFAULT interval '24 hours')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted integer := 0;
BEGIN
  DELETE FROM public.skill_harvest_checkpoints
  WHERE updated_at < now() - _max_age;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_skill_reclassification(
  _review_id UUID,
  _approve BOOLEAN,
  _reason TEXT DEFAULT ''
)
RETURNS public.skill_reclassification_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_review public.skill_reclassification_reviews;
  v_current TEXT;
  v_prev_source TEXT;
  v_prev_conf NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_workspace_admin(v_uid) THEN
    RAISE EXCEPTION 'Apenas administradores podem decidir reclassificacoes' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE: dois admins clicando ao mesmo tempo serializam aqui em vez de
  -- aplicarem a mesma troca duas vezes.
  SELECT * INTO v_review
  FROM public.skill_reclassification_reviews
  WHERE id = _review_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revisao nao encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_review.status <> 'pendente' THEN
    RAISE EXCEPTION 'Revisao ja decidida (%).', v_review.status USING ERRCODE = '55000';
  END IF;

  -- Trava a skill e captura a procedência anterior ANTES de qualquer escrita.
  -- Também roda no caminho de rejeição: precisamos do estado atual para
  -- decidir se a rejeição pode ou não ser tratada como confirmação humana.
  SELECT department, department_source, department_confidence
    INTO v_current, v_prev_source, v_prev_conf
  FROM public.skill_registry
  WHERE id = v_review.skill_id
  FOR UPDATE;

  IF _approve THEN
    -- Guarda de concorrência: o "antes" registrado precisa continuar valendo,
    -- senão estaríamos sobrescrevendo uma curadoria mais recente às cegas.
    IF v_current IS DISTINCT FROM v_review.department_from THEN
      RAISE EXCEPTION 'Conflito: departamento atual (%) difere do analisado (%).',
        COALESCE(v_current, 'sem departamento'),
        COALESCE(v_review.department_from, 'sem departamento')
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.skill_registry
    SET department = v_review.department_to,
        department_source = 'human',
        department_confidence = 1.0,
        curated_by = v_uid,
        curated_at = now(),
        updated_at = now()
    WHERE id = v_review.skill_id;

  ELSIF v_current IS NOT NULL THEN
    -- Rejeição com departamento vigente = confirmação explícita do rótulo
    -- atual. Sem isto, a skill reentraria na fila para sempre, e o custo do
    -- trabalho de revisão seria pago repetidamente sem nunca convergir.
    -- Não mexemos em `department` de propósito: nada mudou, só a procedência.
    UPDATE public.skill_registry
    SET department_source = 'human',
        department_confidence = 1.0,
        curated_by = v_uid,
        curated_at = now(),
        updated_at = now()
    WHERE id = v_review.skill_id
      AND department IS NOT NULL;
  END IF;

  UPDATE public.skill_reclassification_reviews
  SET status = CASE WHEN _approve THEN 'aprovado' ELSE 'rejeitado' END,
      decision_reason = COALESCE(LEFT(_reason, 1000), ''),
      reviewed_by = v_uid,
      reviewed_at = now()
  WHERE id = _review_id
  RETURNING * INTO v_review;

  PERFORM public.log_audit_entry(
    CASE WHEN _approve THEN 'skill_reclassification.approved'
         ELSE 'skill_reclassification.rejected' END,
    'skill_registry',
    v_review.skill_id::TEXT,
    jsonb_build_object(
      'review_id', v_review.id,
      'slug', v_review.skill_slug,
      'department_from', v_review.department_from,
      'department_to', v_review.department_to,
      'confidence', v_review.confidence,
      'margin', v_review.margin,
      'source', v_review.source,
      -- Procedência anterior: distingue "classificador errou" de
      -- "classificador acertou mas com confianca baixa".
      'previous_department_source', COALESCE(v_prev_source, 'unknown'),
      'previous_department_confidence', COALESCE(v_prev_conf, 0),
      'registry_touched', (_approve OR v_current IS NOT NULL),
      'rationale', LEFT(v_review.rationale, 500),
      'decision_reason', v_review.decision_reason
    )
  );

  RETURN v_review;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_skill_department_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Sem departamento não existe decisão da qual duvidar: zera a procedência
  -- para que a skill caia na fila "sem departamento", não na de "revisar".
  IF NEW.department IS NULL THEN
    NEW.department_source := 'unknown';
    NEW.department_confidence := 0;
    RETURN NEW;
  END IF;

  -- Curadoria humana é o topo da hierarquia de evidência: confiança plena,
  -- independentemente do que o cliente enviou (um 0.0 acidental reenfileiraria
  -- para revisão uma decisão que já foi tomada por uma pessoa).
  IF NEW.department_source = 'human' THEN
    NEW.department_confidence := 1.0;
    RETURN NEW;
  END IF;

  -- Departamento preenchido sem procedência declarada = alguém escreveu o
  -- rótulo sem dizer quem decidiu. 'import' é o rótulo honesto: rastreável,
  -- de baixa confiança e visível no filtro de origem do painel.
  IF NEW.department_source = 'unknown' THEN
    NEW.department_source := 'import';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_skill_meta_collection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_meta_collection THEN
    NEW.is_public := false;
    NEW.is_verified := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_secret_rotation_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_interval INTEGER;
BEGIN
  SELECT rotation_interval_days INTO v_interval
    FROM public.managed_secrets WHERE id = NEW.secret_id;

  UPDATE public.managed_secrets
    SET last_rotated_at = NEW.rotated_at,
        next_rotation_due = NEW.rotated_at + (v_interval || ' days')::interval,
        status = 'active',
        updated_at = now()
    WHERE id = NEW.secret_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_risk_review_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_interval INTERVAL;
BEGIN
  v_interval := CASE WHEN NEW.new_residual_score >= 15 THEN interval '30 days' ELSE interval '90 days' END;

  UPDATE public.risk_register
    SET residual_score = COALESCE(NEW.new_residual_score, residual_score),
        next_review_due = NEW.reviewed_at + v_interval,
        status = CASE WHEN status = 'identified' THEN 'assessed' ELSE status END,
        updated_at = now()
    WHERE id = NEW.risk_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_agent_daily_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY internal.agent_daily_metrics;
END;
$$;

-- ============================================================================
-- 5.1 Permissoes de execucao declaradas no repo para estas funcoes
-- ============================================================================

GRANT EXECUTE ON FUNCTION public._fase8_snapshot_as(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.apply_skill_description(uuid, text, numeric, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_skill_description(uuid, text, numeric, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_retention_job_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_due_cadence_enrollments(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_auth_attempts() TO service_role;
GRANT EXECUTE ON FUNCTION public.collections_fill_workspace() TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_skill_reclassification(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.explain_query_plan(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.explain_query_plan(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cron_job_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_job_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_db_health_timeseries(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_detector_slo_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_knowledge_graph_health(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_knowledge_graph_health(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_2fa_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_oncall_with_contacts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_partition_health_snapshot() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pending_invites_for_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_slow_query_alerts_history(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_slow_query_alerts_history(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_members_full(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hybrid_memory_search_notebook(text, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hybrid_memory_search_notebook(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.invite_workspace_member(uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mfa_valid_for_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pg_net_schema() TO service_role;
GRANT EXECUTE ON FUNCTION public.pg_net_smoke_post(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.pg_net_smoke_response(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_traces_retention(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_stale_harvest_checkpoints(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_agent_daily_metrics() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_knowledge_graph_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_pg_net_smoke_test() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_prune_traces_retention_monitored(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.snapshot_note_version() TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_cron_token(TEXT, TEXT) TO service_role;

-- ============================================================================
-- 5.2 Triggers do repo que ainda nao existem. Nenhum trigger e removido ou
--     recriado: o guard consulta pg_trigger pelo nome (public e auth). Se a
--     funcao do trigger nao existir neste banco, o trigger e pulado com NOTICE
--     em vez de abortar a migracao inteira.
-- ============================================================================

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'on_auth_user_created'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger on_auth_user_created nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_agents_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_agents_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_usage_update_budget'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_usage_update_budget
  AFTER INSERT ON public.usage_records
  FOR EACH ROW EXECUTE FUNCTION public.update_budget_on_usage()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_usage_update_budget nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_budget_alert'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_budget_alert
  AFTER UPDATE OF current_usd ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.check_budget_alert()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_budget_alert nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_chunks_search_vector'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_chunks_search_vector
  BEFORE INSERT OR UPDATE OF content ON public.chunks
  FOR EACH ROW EXECUTE FUNCTION public.chunks_search_vector_trigger()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_chunks_search_vector nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_deploy_connections_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_deploy_connections_updated_at BEFORE UPDATE ON public.deploy_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_deploy_connections_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_consent_records_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_consent_records_updated_at BEFORE UPDATE ON public.consent_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_consent_records_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_auto_assign_admin'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE OR REPLACE TRIGGER trg_auto_assign_admin
  AFTER INSERT ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_admin_role()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_auto_assign_admin nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_chunks_bm25'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_chunks_bm25
  BEFORE INSERT OR UPDATE OF content ON public.chunks
  FOR EACH ROW EXECUTE FUNCTION public.chunks_update_bm25()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_chunks_bm25 nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_api_keys_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_api_keys_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_agent_routing_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_agent_routing_updated_at
  BEFORE UPDATE ON public.agent_routing_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_routing_updated_at()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_agent_routing_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_roles_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_roles_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_user_2fa_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_user_2fa_updated_at
  BEFORE UPDATE ON public.user_2fa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_user_2fa_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_ip_whitelist_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_ip_whitelist_updated
  BEFORE UPDATE ON public.ip_whitelist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_ip_whitelist_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'tr_help_centers_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER tr_help_centers_updated BEFORE UPDATE ON public.help_centers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger tr_help_centers_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'tr_kb_articles_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER tr_kb_articles_updated BEFORE UPDATE ON public.kb_articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger tr_kb_articles_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'tr_kb_translations_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER tr_kb_translations_updated BEFORE UPDATE ON public.kb_translations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger tr_kb_translations_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'tr_forum_posts_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER tr_forum_posts_updated BEFORE UPDATE ON public.forum_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger tr_forum_posts_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'tr_kb_article_version'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER tr_kb_article_version BEFORE UPDATE ON public.kb_articles FOR EACH ROW EXECUTE FUNCTION public.kb_article_create_version()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger tr_kb_article_version nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'tr_forum_thread_stats'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER tr_forum_thread_stats AFTER INSERT OR DELETE ON public.forum_posts FOR EACH ROW EXECUTE FUNCTION public.forum_update_thread_stats()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger tr_forum_thread_stats nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'set_automation_rules_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER set_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger set_automation_rules_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_agent_experiments_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_agent_experiments_updated_at
  BEFORE UPDATE ON public.agent_experiments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_agent_experiments_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_agent_eval_datasets_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_agent_eval_datasets_updated_at
  BEFORE UPDATE ON public.agent_eval_datasets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_agent_eval_datasets_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_agent_workflows_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_agent_workflows_updated BEFORE UPDATE ON public.agent_workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_agent_workflows_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_smm_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_smm_updated_at BEFORE UPDATE ON public.skill_marketplace_meta
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_smm_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_recalc_rating'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_recalc_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.skill_reviews
  FOR EACH ROW EXECUTE FUNCTION public.recalc_skill_rating()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_recalc_rating nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_prompt_experiments_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_prompt_experiments_updated_at
  BEFORE UPDATE ON public.prompt_experiments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_prompt_experiments_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'voice_sessions_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER voice_sessions_updated_at
  BEFORE UPDATE ON public.voice_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger voice_sessions_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_agent_graphs_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_agent_graphs_updated BEFORE UPDATE ON public.agent_graphs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_agent_graphs_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_synthetic_checks_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_synthetic_checks_updated_at
BEFORE UPDATE ON public.synthetic_checks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_synthetic_checks_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_workspace_budgets_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_workspace_budgets_updated
  BEFORE UPDATE ON public.workspace_budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_workspace_budgets_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_incident_playbooks_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_incident_playbooks_updated_at
  BEFORE UPDATE ON public.incident_playbooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_incident_playbooks_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_dr_drills_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_dr_drills_updated_at
  BEFORE UPDATE ON public.dr_drills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_dr_drills_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_postmortems_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_postmortems_updated_at
  BEFORE UPDATE ON public.postmortems
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_postmortems_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_pm_action_items_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_pm_action_items_updated_at
  BEFORE UPDATE ON public.postmortem_action_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_pm_action_items_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_compliance_reports_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_compliance_reports_updated
  BEFORE UPDATE ON public.compliance_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_compliance_reports_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_managed_secrets_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_managed_secrets_updated_at
BEFORE UPDATE ON public.managed_secrets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_managed_secrets_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_pentest_finding_due_date'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_pentest_finding_due_date
  BEFORE INSERT OR UPDATE ON public.pentest_findings
  FOR EACH ROW EXECUTE FUNCTION public.set_pentest_finding_due_date()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_pentest_finding_due_date nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_pentest_finding_count'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_pentest_finding_count
  AFTER INSERT OR DELETE ON public.pentest_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_engagement_finding_count()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_pentest_finding_count nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_pentest_engagement_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_pentest_engagement_updated BEFORE UPDATE ON public.pentest_engagements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_pentest_engagement_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_pentest_finding_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_pentest_finding_updated BEFORE UPDATE ON public.pentest_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_pentest_finding_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_risk_register_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_risk_register_updated BEFORE UPDATE ON public.risk_register
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_risk_register_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_vendors_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_vendors_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_vendor_assessment'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_vendor_assessment
  BEFORE INSERT ON public.vendor_assessments
  FOR EACH ROW EXECUTE FUNCTION public.handle_vendor_assessment()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_vendor_assessment nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_business_systems_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_business_systems_updated
  BEFORE UPDATE ON public.business_systems
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_business_systems_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_bcp_test_run_after_insert'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_bcp_test_run_after_insert
  AFTER INSERT ON public.bcp_test_runs
  FOR EACH ROW EXECUTE FUNCTION public.handle_bcp_test_run()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_bcp_test_run_after_insert nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_change_requests_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_change_requests_updated_at
  BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_change_requests_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_change_requests_freeze'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_change_requests_freeze
  BEFORE INSERT OR UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_freeze_window()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_change_requests_freeze nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_ir_playbooks_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_ir_playbooks_updated
BEFORE UPDATE ON public.ir_playbooks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_ir_playbooks_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_ir_tabletop_after_insert'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_ir_tabletop_after_insert
AFTER INSERT ON public.ir_tabletop_exercises
FOR EACH ROW EXECUTE FUNCTION public.handle_ir_tabletop()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_ir_tabletop_after_insert nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_asset_audit'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_asset_audit
AFTER INSERT ON public.asset_audits
FOR EACH ROW EXECUTE FUNCTION public.handle_asset_audit()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_asset_audit nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_assets_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_assets_updated_at
BEFORE UPDATE ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_assets_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_touch_user_filter_preferences'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_touch_user_filter_preferences
  BEFORE UPDATE ON public.user_filter_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_filter_preferences()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_touch_user_filter_preferences nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_audit_log_partition'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_audit_log_partition
    BEFORE INSERT ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.trg_auto_partition()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_audit_log_partition nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_agent_traces_partition'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_agent_traces_partition
    BEFORE INSERT ON public.agent_traces
    FOR EACH ROW EXECUTE FUNCTION public.trg_auto_partition()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_agent_traces_partition nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'increment_agent_graphs_version'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER increment_agent_graphs_version
BEFORE UPDATE ON public.agent_graphs
FOR EACH ROW
EXECUTE FUNCTION public.increment_version_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger increment_agent_graphs_version nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'increment_knowledge_bases_version'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER increment_knowledge_bases_version
BEFORE UPDATE ON public.knowledge_bases
FOR EACH ROW
EXECUTE FUNCTION public.increment_version_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger increment_knowledge_bases_version nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'increment_workspaces_version'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER increment_workspaces_version
BEFORE UPDATE ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.increment_version_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger increment_workspaces_version nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'increment_skill_registry_version'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER increment_skill_registry_version
BEFORE UPDATE ON public.skill_registry
FOR EACH ROW
EXECUTE FUNCTION public.increment_version_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger increment_skill_registry_version nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'increment_agent_installed_skills_version'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER increment_agent_installed_skills_version
BEFORE UPDATE ON public.agent_installed_skills
FOR EACH ROW
EXECUTE FUNCTION public.increment_version_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger increment_agent_installed_skills_version nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'increment_agent_skills_version'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER increment_agent_skills_version
BEFORE UPDATE ON public.agent_skills
FOR EACH ROW
EXECUTE FUNCTION public.increment_version_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger increment_agent_skills_version nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_auth_failure_alert'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_auth_failure_alert
AFTER INSERT ON public.auth_attempts
FOR EACH ROW
WHEN (NEW.success = false)
EXECUTE FUNCTION public.handle_auth_failure_alert()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_auth_failure_alert nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_validate_oncall_workspace'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_validate_oncall_workspace
  BEFORE INSERT OR UPDATE ON public.oncall_schedule
  FOR EACH ROW EXECUTE FUNCTION public.validate_oncall_workspace_consistency()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_validate_oncall_workspace nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_user_research_configs_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_user_research_configs_updated_at
  BEFORE UPDATE ON public.user_research_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_user_research_configs_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_mcp_servers_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_mcp_servers_updated_at
  BEFORE UPDATE ON public.mcp_servers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_mcp_servers_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_openclaw_deployments_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_openclaw_deployments_updated_at
BEFORE UPDATE ON public.openclaw_deployments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_openclaw_deployments_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_openclaw_whatsapp_instances_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_openclaw_whatsapp_instances_updated_at
BEFORE UPDATE ON public.openclaw_whatsapp_instances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_openclaw_whatsapp_instances_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'openclaw_whatsapp_autoreply_ai'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER openclaw_whatsapp_autoreply_ai
AFTER INSERT ON public.openclaw_whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION public.trg_openclaw_whatsapp_autoreply()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger openclaw_whatsapp_autoreply_ai nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_openclaw_agent_templates_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_openclaw_agent_templates_updated_at
  BEFORE UPDATE ON public.openclaw_agent_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_openclaw_agent_templates_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_slack_workspace_config_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_slack_workspace_config_updated_at
  BEFORE UPDATE ON public.slack_workspace_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_slack_workspace_config_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_slack_channel_routes_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_slack_channel_routes_updated_at
  BEFORE UPDATE ON public.slack_channel_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_slack_channel_routes_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_slack_agent_notif_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_slack_agent_notif_updated
  BEFORE UPDATE ON public.slack_agent_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_slack_agent_notif_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_slack_rag_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_slack_rag_updated
  BEFORE UPDATE ON public.slack_rag_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_slack_rag_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_slack_bot_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_slack_bot_updated
  BEFORE UPDATE ON public.slack_bot_bindings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_slack_bot_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_dispatch_security_alert_to_slack'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_dispatch_security_alert_to_slack
  AFTER INSERT ON public.security_alerts
  FOR EACH ROW EXECUTE FUNCTION internal.dispatch_security_alert_to_slack()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_dispatch_security_alert_to_slack nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'collections_fill_workspace_trg'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER collections_fill_workspace_trg
BEFORE INSERT OR UPDATE ON public.collections
FOR EACH ROW EXECUTE FUNCTION public.collections_fill_workspace()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger collections_fill_workspace_trg nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_notebook_notes_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_notebook_notes_updated_at
  BEFORE UPDATE ON public.notebook_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_notebook_notes_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_notebook_podcasts_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_notebook_podcasts_updated_at
  BEFORE UPDATE ON public.notebook_podcasts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_notebook_podcasts_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_notebook_canvases_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_notebook_canvases_updated_at
  BEFORE UPDATE ON public.notebook_canvases
  FOR EACH ROW EXECUTE FUNCTION public.tg_notebook_canvases_updated_at()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_notebook_canvases_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_note_templates_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_note_templates_updated_at
  BEFORE UPDATE ON public.notebook_note_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_note_templates_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_note_snapshot'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_note_snapshot
  BEFORE UPDATE ON public.notebook_notes
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_note_version()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_note_snapshot nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'prevent_audit_log_update'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER prevent_audit_log_update
    BEFORE UPDATE ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.make_audit_log_immutable()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger prevent_audit_log_update nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'prevent_audit_log_delete'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER prevent_audit_log_delete
    BEFORE DELETE ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.make_audit_log_immutable()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger prevent_audit_log_delete nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_data_subject_requests_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_data_subject_requests_at
    BEFORE UPDATE ON public.data_subject_requests
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_data_subject_requests_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_dpr_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_dpr_at
    BEFORE UPDATE ON public.data_processing_register
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_dpr_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_pdi_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_pdi_at
    BEFORE UPDATE ON public.personal_data_inventory
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_pdi_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_dbl_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_dbl_at
    BEFORE UPDATE ON public.data_breach_log
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_dbl_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_lgpd_settings_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_lgpd_settings_at
    BEFORE UPDATE ON public.lgpd_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_lgpd_settings_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_drp_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_drp_at
    BEFORE UPDATE ON public.data_retention_policies
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_drp_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_crm_companies_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_crm_companies_updated_at BEFORE UPDATE ON public.crm_companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_crm_companies_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_crm_contacts_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_crm_contacts_updated_at BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_crm_contacts_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_crm_pipelines_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_crm_pipelines_updated_at BEFORE UPDATE ON public.crm_pipelines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_crm_pipelines_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_crm_stages_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_crm_stages_updated_at BEFORE UPDATE ON public.crm_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_crm_stages_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_crm_deals_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_crm_deals_updated_at BEFORE UPDATE ON public.crm_deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_crm_deals_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_crm_activities_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_crm_activities_updated_at BEFORE UPDATE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_crm_activities_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_crm_icp_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_crm_icp_updated_at
  BEFORE UPDATE ON public.crm_icp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_crm_icp_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_crm_cadences_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_crm_cadences_updated_at
  BEFORE UPDATE ON public.crm_cadences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_crm_cadences_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_crm_cadence_steps_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_crm_cadence_steps_updated_at
  BEFORE UPDATE ON public.crm_cadence_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_crm_cadence_steps_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_crm_cadence_enrollments_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_crm_cadence_enrollments_updated_at
  BEFORE UPDATE ON public.crm_cadence_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_crm_cadence_enrollments_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_task_queues_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_task_queues_updated BEFORE UPDATE ON public.task_queues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_task_queues_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_queue_items_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_queue_items_updated BEFORE UPDATE ON public.queue_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_queue_items_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_cron_schedules_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_cron_schedules_updated BEFORE UPDATE ON public.cron_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_cron_schedules_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_notification_templates_updated'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_notification_templates_updated BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_notification_templates_updated nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_shc_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_shc_updated_at BEFORE UPDATE ON public.skill_harvest_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_shc_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_shr_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_shr_updated_at BEFORE UPDATE ON public.skill_harvest_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_shr_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_template_skill_links_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_template_skill_links_updated_at
BEFORE UPDATE ON public.template_skill_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_template_skill_links_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_template_skill_links_actor'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_template_skill_links_actor
BEFORE INSERT OR UPDATE ON public.template_skill_links
FOR EACH ROW EXECUTE FUNCTION public.template_skill_links_set_actor()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_template_skill_links_actor nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_stamp_skill_curation'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_stamp_skill_curation
  BEFORE UPDATE ON public.skill_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_skill_curation()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_stamp_skill_curation nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_skill_reclass_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_skill_reclass_updated_at
  BEFORE UPDATE ON public.skill_reclassification_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_skill_reclass_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'update_skill_harvest_checkpoints_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER update_skill_harvest_checkpoints_updated_at
  BEFORE UPDATE ON public.skill_harvest_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger update_skill_harvest_checkpoints_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_skill_registry_department_provenance'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_skill_registry_department_provenance
  BEFORE INSERT OR UPDATE OF department, department_source, department_confidence
  ON public.skill_registry
  FOR EACH ROW EXECUTE FUNCTION public.normalize_skill_department_provenance()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_skill_registry_department_provenance nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_skill_registry_meta_collection'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_skill_registry_meta_collection
  BEFORE INSERT OR UPDATE OF is_meta_collection, is_public, is_verified
  ON public.skill_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_skill_meta_collection()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_skill_registry_meta_collection nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_touch_document_ingestions'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_touch_document_ingestions
  BEFORE UPDATE ON public.document_ingestions
  FOR EACH ROW EXECUTE FUNCTION public.touch_document_ingestions()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_touch_document_ingestions nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_log_ingestion_event_ins'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_log_ingestion_event_ins
  AFTER INSERT ON public.document_ingestions FOR EACH ROW EXECUTE FUNCTION public.log_ingestion_event()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_log_ingestion_event_ins nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_log_ingestion_event_upd'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_log_ingestion_event_upd
  AFTER UPDATE ON public.document_ingestions FOR EACH ROW EXECUTE FUNCTION public.log_ingestion_event()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_log_ingestion_event_upd nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_chat_threads_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_chat_threads_updated_at
  BEFORE UPDATE ON public.chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_chat_threads_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_touch_chat_thread'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_touch_chat_thread
  AFTER INSERT OR DELETE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_chat_thread()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_touch_chat_thread nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'game_days_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER game_days_updated_at
BEFORE UPDATE ON public.game_days
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger game_days_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_secret_rotation_event'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_secret_rotation_event
AFTER INSERT ON public.secret_rotation_events
FOR EACH ROW EXECUTE FUNCTION public.handle_secret_rotation_event()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_secret_rotation_event nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_risk_review_event'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_risk_review_event AFTER INSERT ON public.risk_review_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_risk_review_event()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_risk_review_event nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT tg.tgisinternal AND n.nspname IN ('public','auth')
       AND tg.tgname = 'trg_restore_field_presets_updated_at'
  ) THEN
    BEGIN
      EXECUTE $q$CREATE TRIGGER trg_restore_field_presets_updated_at
  BEFORE UPDATE ON public.restore_field_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column()$q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'trigger trg_restore_field_presets_updated_at nao criado: %', SQLERRM;
    END;
  END IF;
END
$do$;

