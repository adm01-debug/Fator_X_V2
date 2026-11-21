-- Restaura key_value em workspace_secrets (fix Int-001)
--
-- 20260405225419 dropou a coluna plaintext para converger para criptografia,
-- mas o esquema nunca foi concluido: a trigger encrypt_secret_value() nunca
-- foi criada e o GUC app.settings.secret_key nunca foi setado. Resultado:
-- encrypted_value permanece NULL e 12 edge functions + 3 services do front
-- leem workspace_secrets.key_value (inexistente), quebrando toda API key
-- de workspace desde 26/04.
--
-- Decisao: restaurar o contrato funcional key_value (TEXT). O consumo do
-- sistema e 100% via key_value; manter encrypted_value como legacy NULL.

ALTER TABLE public.workspace_secrets
  ADD COLUMN IF NOT EXISTS key_value TEXT;

COMMENT ON COLUMN public.workspace_secrets.key_value IS
  'Valor da chave em texto. Restaurado em 2026-11-21 (Int-001): o esquema de criptografia (encrypted_value) nunca entrou em producao.';
