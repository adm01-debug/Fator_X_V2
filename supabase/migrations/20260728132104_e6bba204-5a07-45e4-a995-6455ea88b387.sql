-- Temporário: habilita o papel do sandbox a executar o teste de
-- integridade dos gatilhos. Revogado na migração seguinte.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
        GRANT UPDATE, DELETE ON public.chat_threads TO sandbox_exec;
        GRANT UPDATE, DELETE ON public.chat_messages TO sandbox_exec;
    END IF;
END;
$$;
