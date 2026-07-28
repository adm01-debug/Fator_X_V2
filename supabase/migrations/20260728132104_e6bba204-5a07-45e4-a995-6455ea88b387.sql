-- Temporário: habilita o papel do sandbox a executar o teste de
-- integridade dos gatilhos. Revogado na migração seguinte.
GRANT UPDATE, DELETE ON public.chat_threads TO sandbox_exec;
GRANT UPDATE, DELETE ON public.chat_messages TO sandbox_exec;