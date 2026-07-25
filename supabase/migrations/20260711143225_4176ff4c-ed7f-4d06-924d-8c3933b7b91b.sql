
-- 1) AUTH_ATTEMPTS
DROP POLICY IF EXISTS "Admins can view auth attempts" ON public.auth_attempts;
CREATE POLICY "Platform admins view auth attempts"
  ON public.auth_attempts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_key = 'platform_admin'));

-- 2) KNOWLEDGE_ENTITIES
DROP POLICY IF EXISTS "Allow authenticated read on knowledge entities" ON public.knowledge_entities;
DROP POLICY IF EXISTS "Users can view knowledge entities" ON public.knowledge_entities;
DROP POLICY IF EXISTS "Users can insert knowledge entities" ON public.knowledge_entities;
DROP POLICY IF EXISTS "Users can update knowledge entities" ON public.knowledge_entities;
DROP POLICY IF EXISTS "Users can delete knowledge entities" ON public.knowledge_entities;

CREATE POLICY "Members read workspace knowledge entities"
  ON public.knowledge_entities FOR SELECT
  USING (workspace_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = knowledge_entities.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Members insert workspace knowledge entities"
  ON public.knowledge_entities FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = knowledge_entities.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Members update workspace knowledge entities"
  ON public.knowledge_entities FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = knowledge_entities.workspace_id AND user_id = auth.uid()));
CREATE POLICY "Members delete workspace knowledge entities"
  ON public.knowledge_entities FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = knowledge_entities.workspace_id AND user_id = auth.uid()));

-- 3) KNOWLEDGE_RELATIONS
DROP POLICY IF EXISTS "Allow authenticated read on knowledge relations" ON public.knowledge_relations;
DROP POLICY IF EXISTS "Users can view knowledge relations" ON public.knowledge_relations;
DROP POLICY IF EXISTS "Users can insert knowledge relations" ON public.knowledge_relations;
DROP POLICY IF EXISTS "Users can update knowledge relations" ON public.knowledge_relations;
DROP POLICY IF EXISTS "Users can delete knowledge relations" ON public.knowledge_relations;

CREATE POLICY "Members read workspace knowledge relations"
  ON public.knowledge_relations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.knowledge_entities e JOIN public.workspace_members m ON m.workspace_id = e.workspace_id WHERE e.id = knowledge_relations.source_id AND m.user_id = auth.uid()));
CREATE POLICY "Members insert workspace knowledge relations"
  ON public.knowledge_relations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.knowledge_entities e JOIN public.workspace_members m ON m.workspace_id = e.workspace_id WHERE e.id = knowledge_relations.source_id AND m.user_id = auth.uid()));
CREATE POLICY "Members update workspace knowledge relations"
  ON public.knowledge_relations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.knowledge_entities e JOIN public.workspace_members m ON m.workspace_id = e.workspace_id WHERE e.id = knowledge_relations.source_id AND m.user_id = auth.uid()));
CREATE POLICY "Members delete workspace knowledge relations"
  ON public.knowledge_relations FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.knowledge_entities e JOIN public.workspace_members m ON m.workspace_id = e.workspace_id WHERE e.id = knowledge_relations.source_id AND m.user_id = auth.uid()));

-- 4) AGENT_MEMORIES_V2
DROP POLICY IF EXISTS "Allow authenticated read on agent memories" ON public.agent_memories_v2;
CREATE POLICY "Members read workspace agent memories"
  ON public.agent_memories_v2 FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.agents a JOIN public.workspace_members m ON m.workspace_id = a.workspace_id WHERE a.id = agent_memories_v2.agent_id AND m.user_id = auth.uid()));

-- 5) AUDIT_LOG
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_log;
CREATE POLICY "Workspace admins view scoped audit logs"
  ON public.audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_key IN ('workspace_admin','platform_admin')));
