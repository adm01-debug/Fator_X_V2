-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS: policies para 17 tabelas sem policy no banco de produção
-- Auditoria técnica 2026-11-14 (item 4 do plano de correção)
-- ═══════════════════════════════════════════════════════════════════════════════
-- CONTEXTO: o banco de produção tem estas tabelas com RLS ON e 0 policies.
-- Todo INSERT/UPDATE/DELETE/SELECT direto do front falha hoje (deny).
-- Este arquivo cria as policies seguindo o padrão canônico já aplicado em
-- produção pela migration 20260905120000 (get_user_workspace_ids / is_workspace_admin):
--   SELECT : membro do workspace OU linha própria
--   INSERT : membro do workspace (WITH CHECK)
--   UPDATE : linha própria OU admin do workspace
--   DELETE : linha própria OU admin do workspace
--   (exceção: audit_log é só leitura para usuários; ver bloco dela)
-- service_role mantém BYPASSRLS (Edge Functions não afetadas).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ---------- 1. Tabelas com workspace_id (padrão canônico) ----------

-- assets (linha própria = owner_id)
CREATE POLICY assets_member_select ON public.assets
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR owner_id = auth.uid());
CREATE POLICY assets_member_insert ON public.assets
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY assets_member_update ON public.assets
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR owner_id = auth.uid());
CREATE POLICY assets_member_delete ON public.assets
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));

-- audit_log: trilha de auditoria (LGPD). Usuário só LÊ (próprias entradas ou do
-- workspace). Sem policy de INSERT/UPDATE/DELETE: gravar só pelo RPC
-- log_audit_entry (SECURITY DEFINER, user_id = auth.uid()) ou service_role; ninguém
-- apaga ou reescreve o rastro. tests/rls/personas.test.ts exige o INSERT direto bloqueado.
CREATE POLICY audit_log_member_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR user_id = auth.uid());

-- business_systems (linha própria = owner_id)
CREATE POLICY business_systems_member_select ON public.business_systems
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR owner_id = auth.uid());
CREATE POLICY business_systems_member_insert ON public.business_systems
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY business_systems_member_update ON public.business_systems
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR owner_id = auth.uid());
CREATE POLICY business_systems_member_delete ON public.business_systems
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));

-- change_requests (linha própria = requested_by)
CREATE POLICY change_requests_member_select ON public.change_requests
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR requested_by = auth.uid());
CREATE POLICY change_requests_member_insert ON public.change_requests
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY change_requests_member_update ON public.change_requests
  FOR UPDATE TO authenticated
  USING (requested_by = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR requested_by = auth.uid());
CREATE POLICY change_requests_member_delete ON public.change_requests
  FOR DELETE TO authenticated
  USING (requested_by = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));

-- freeze_windows (linha própria = created_by)
CREATE POLICY freeze_windows_member_select ON public.freeze_windows
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR created_by = auth.uid());
CREATE POLICY freeze_windows_member_insert ON public.freeze_windows
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY freeze_windows_member_update ON public.freeze_windows
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR created_by = auth.uid());
CREATE POLICY freeze_windows_member_delete ON public.freeze_windows
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));

-- ir_playbooks (linha própria = owner_id)
CREATE POLICY ir_playbooks_member_select ON public.ir_playbooks
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR owner_id = auth.uid());
CREATE POLICY ir_playbooks_member_insert ON public.ir_playbooks
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY ir_playbooks_member_update ON public.ir_playbooks
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR owner_id = auth.uid());
CREATE POLICY ir_playbooks_member_delete ON public.ir_playbooks
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));

-- ir_tabletop_exercises (sem coluna de dono; UPDATE/DELETE só admin)
CREATE POLICY ir_tabletop_exercises_member_select ON public.ir_tabletop_exercises
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY ir_tabletop_exercises_member_insert ON public.ir_tabletop_exercises
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY ir_tabletop_exercises_member_update ON public.ir_tabletop_exercises
  FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY ir_tabletop_exercises_member_delete ON public.ir_tabletop_exercises
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id));

-- managed_secrets (linha própria = owner_id)
CREATE POLICY managed_secrets_member_select ON public.managed_secrets
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR owner_id = auth.uid());
CREATE POLICY managed_secrets_member_insert ON public.managed_secrets
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY managed_secrets_member_update ON public.managed_secrets
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR owner_id = auth.uid());
CREATE POLICY managed_secrets_member_delete ON public.managed_secrets
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));

-- pentest_findings (linha própria = created_by)
CREATE POLICY pentest_findings_member_select ON public.pentest_findings
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR created_by = auth.uid());
CREATE POLICY pentest_findings_member_insert ON public.pentest_findings
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY pentest_findings_member_update ON public.pentest_findings
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR created_by = auth.uid());
CREATE POLICY pentest_findings_member_delete ON public.pentest_findings
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));

-- risk_register (linha própria = owner_id)
CREATE POLICY risk_register_member_select ON public.risk_register
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR owner_id = auth.uid());
CREATE POLICY risk_register_member_insert ON public.risk_register
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY risk_register_member_update ON public.risk_register
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR owner_id = auth.uid());
CREATE POLICY risk_register_member_delete ON public.risk_register
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));

-- vendors (sem coluna de dono; UPDATE/DELETE só admin)
CREATE POLICY vendors_member_select ON public.vendors
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY vendors_member_insert ON public.vendors
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY vendors_member_update ON public.vendors
  FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())));
CREATE POLICY vendors_member_delete ON public.vendors
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id));

-- ---------- 2. audit_events (escrita principal via supabaseExternal; best-effort sem tenant) ----------

-- Leitura: membro do workspace OU linha própria. Um INSERT sem workspace_id/user_id
-- vem do NotebookWorkspace (deep-link é best-effort) — permitido para não perder
-- trilha; linha órfã não é legível por ninguém além de admin (workspace NULL).
CREATE POLICY audit_events_member_select ON public.audit_events
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR user_id = auth.uid());
CREATE POLICY audit_events_member_insert ON public.audit_events
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR user_id = auth.uid());
CREATE POLICY audit_events_member_update ON public.audit_events
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR user_id = auth.uid());
CREATE POLICY audit_events_member_delete ON public.audit_events
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));

-- ---------- 3. skill_registry (catálogo global: is_public=true lido por todos) ----------

DROP POLICY IF EXISTS skill_registry_public_read ON public.skill_registry;
CREATE POLICY skill_registry_public_read ON public.skill_registry
  FOR SELECT TO authenticated
  USING (is_public = true OR workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR created_by = auth.uid());
-- INSERT: membro do workspace OU publish de skill própria (created_by)
CREATE POLICY skill_registry_member_insert ON public.skill_registry
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR created_by = auth.uid());
CREATE POLICY skill_registry_owner_update ON public.skill_registry
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR created_by = auth.uid() OR is_public = true);
CREATE POLICY skill_registry_owner_delete ON public.skill_registry
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id));

-- ---------- 4. user_2fa / user_filter_preferences (linha própria = user_id) ----------

CREATE POLICY user_2fa_own_select ON public.user_2fa
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY user_2fa_own_insert ON public.user_2fa
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY user_2fa_own_update ON public.user_2fa
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY user_2fa_own_delete ON public.user_2fa
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_filter_preferences_own_select ON public.user_filter_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY user_filter_preferences_own_insert ON public.user_filter_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY user_filter_preferences_own_update ON public.user_filter_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY user_filter_preferences_own_delete ON public.user_filter_preferences
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------- 5. skill_reclassification_reviews (sem workspace; linha própria = requested_by) ----------

CREATE POLICY skill_reclassification_reviews_own_select ON public.skill_reclassification_reviews
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid());
CREATE POLICY skill_reclassification_reviews_own_insert ON public.skill_reclassification_reviews
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());
CREATE POLICY skill_reclassification_reviews_own_update ON public.skill_reclassification_reviews
  FOR UPDATE TO authenticated
  USING (requested_by = auth.uid())
  WITH CHECK (requested_by = auth.uid());
CREATE POLICY skill_reclassification_reviews_own_delete ON public.skill_reclassification_reviews
  FOR DELETE TO authenticated
  USING (requested_by = auth.uid());

-- ---------- 6. skill_harvest_runs (sem workspace; escrita só via Edge Function service_role) ----------

-- Leitura aberta a autenticados: o front (skillHarvestService.listRuns) lista execuções
-- sem filtro de tenant e a tabela não tem coluna de workspace. Escrita permanece
-- exclusiva da edge function (BYPASSRLS) — nenhuma policy de INSERT/UPDATE/DELETE criada.
CREATE POLICY skill_harvest_runs_public_read ON public.skill_harvest_runs
  FOR SELECT TO authenticated
  USING (true);