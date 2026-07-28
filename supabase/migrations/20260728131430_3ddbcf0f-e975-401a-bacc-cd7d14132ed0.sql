-- ============================================================
-- Conversas persistentes do AgentTalk
-- Antes: histórico só em localStorage (teto de 50 msgs, preso a
-- um navegador, invisível para auditoria). Agora: Postgres com
-- RLS por dono e suporte nativo a ramificação (parent_id).
-- ============================================================

CREATE TABLE public.chat_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nova conversa',
  is_archived BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.chat_threads IS
  'Conversas do AgentTalk. Um agente pode ter N threads por usuário.';

CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  -- Ramificação: aponta para a mensagem imediatamente anterior no caminho.
  -- NULL = raiz da thread. Permite múltiplos filhos = branches alternativos.
  parent_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  failed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.chat_messages.parent_id IS
  'Mensagem anterior no caminho. Múltiplos filhos = ramificação da conversa.';

-- ---------- GRANTS (PostgREST não concede por padrão) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

-- ---------- RLS ----------
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários gerenciam as próprias conversas"
  ON public.chat_threads FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Mensagens herdam o dono da thread. EXISTS com índice em (id, user_id)
-- é resolvido por index-only scan, sem custo relevante por linha.
CREATE POLICY "Usuários gerenciam mensagens das próprias conversas"
  ON public.chat_messages FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_threads t
      WHERE t.id = chat_messages.thread_id
        AND t.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_threads t
      WHERE t.id = chat_messages.thread_id
        AND t.user_id = (SELECT auth.uid())
    )
  );

-- ---------- Índices ----------
-- Listagem da sidebar: threads do usuário para um agente, mais recentes primeiro.
CREATE INDEX idx_chat_threads_user_agent
  ON public.chat_threads (user_id, agent_id, last_message_at DESC)
  WHERE is_archived = false;

-- Suporte ao EXISTS da política de mensagens (index-only scan).
CREATE INDEX idx_chat_threads_id_user ON public.chat_threads (id, user_id);

-- Carregamento cronológico de uma thread.
CREATE INDEX idx_chat_messages_thread_created
  ON public.chat_messages (thread_id, created_at);

-- Travessia de ramificações (filhos de uma mensagem).
CREATE INDEX idx_chat_messages_parent
  ON public.chat_messages (parent_id)
  WHERE parent_id IS NOT NULL;

-- ---------- Triggers ----------
CREATE TRIGGER trg_chat_threads_updated_at
  BEFORE UPDATE ON public.chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mantém last_message_at/message_count coerentes sem round-trip extra
-- do cliente. SECURITY INVOKER: roda sob o RLS de quem inseriu.
CREATE OR REPLACE FUNCTION public.touch_chat_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.chat_threads
       SET last_message_at = NEW.created_at,
           message_count = message_count + 1
     WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.chat_threads
       SET message_count = GREATEST(0, message_count - 1)
     WHERE id = OLD.thread_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_touch_chat_thread
  AFTER INSERT OR DELETE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_chat_thread();