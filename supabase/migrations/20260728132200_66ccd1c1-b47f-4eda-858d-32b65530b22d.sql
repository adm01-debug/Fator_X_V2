-- Encerrada a validação dos gatilhos, o papel do sandbox volta ao
-- privilégio mínimo (apenas leitura/inserção herdadas do schema).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
        REVOKE UPDATE, DELETE ON public.chat_threads FROM sandbox_exec;
        REVOKE UPDATE, DELETE ON public.chat_messages FROM sandbox_exec;
    END IF;
END;
$$;
