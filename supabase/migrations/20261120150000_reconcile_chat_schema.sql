-- ============================================================
-- Reconciliacao do schema de chat com o contrato definido pelas
-- migrations registradas como aplicadas mas que nao efetivaram
-- no banco de producao (tabelas criadas pela Lovable com schema
-- generico: id/agent_id/workspace_id/user_id/created_at/updated_at/
-- version).
-- Origem do contrato: 20260728131430 (chat_threads/chat_messages).
-- Idempotente e aditiva: reexecutavel sem erro, nao altera
-- policies RLS existentes.
-- ============================================================

-- ── chat_threads ──────────────────────────────────────────────
ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Nova conversa',
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS message_count INTEGER NOT NULL DEFAULT 0;

-- ── chat_messages ─────────────────────────────────────────────
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'assistant', 'system')),
  ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS tokens_in INTEGER,
  ADD COLUMN IF NOT EXISTS tokens_out INTEGER,
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS failed BOOLEAN NOT NULL DEFAULT false,
  -- Anexos enviados com a mensagem. Array de {name, mime, size_bytes, storage_path}
  -- com caminho sempre sob {user_id}/ e protegido por RLS do bucket.
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── Indices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created
  ON public.chat_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_parent
  ON public.chat_messages (parent_id)
  WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_agent
  ON public.chat_threads (user_id, agent_id, last_message_at DESC)
  WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_chat_threads_id_user
  ON public.chat_threads (id, user_id);

-- ── Triggers (updated_at em chat_threads e contadores) ────────
DROP TRIGGER IF EXISTS trg_chat_threads_updated_at ON public.chat_threads;
CREATE TRIGGER trg_chat_threads_updated_at
  BEFORE UPDATE ON public.chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP FUNCTION IF EXISTS public.touch_chat_thread CASCADE;
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

-- ── Storage bucket chat-attachments + policies por dono ───────
-- Bucket privado. Caminho: {user_id}/{message_id}/{filename}.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chat-attachments') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'chat-attachments',
      'chat-attachments',
      false,
      26214400,
      array['image/png','image/jpeg','image/webp','image/gif',
            'application/pdf','text/plain','text/markdown','text/csv',
            'application/json','application/zip',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    );
  END IF;
END $$;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own chat attachments" ON storage.objects;
CREATE POLICY "Users read own chat attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users upload own chat attachments" ON storage.objects;
CREATE POLICY "Users upload own chat attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own chat attachments" ON storage.objects;
CREATE POLICY "Users delete own chat attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
