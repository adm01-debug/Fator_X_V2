-- Defesa em profundidade: o schema public deste projeto concede
-- privilégios amplos a `anon` por padrão herdado. As políticas de RLS
-- são TO authenticated, então `anon` já não lia nada — mas remover o
-- privilégio elimina a dependência de uma única camada.
REVOKE ALL ON public.chat_threads FROM anon;
REVOKE ALL ON public.chat_messages FROM anon;