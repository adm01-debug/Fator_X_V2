-- Encerrada a validação dos gatilhos, o papel do sandbox volta ao
-- privilégio mínimo (apenas leitura/inserção herdadas do schema).
REVOKE UPDATE, DELETE ON public.chat_threads FROM sandbox_exec;
REVOKE UPDATE, DELETE ON public.chat_messages FROM sandbox_exec;