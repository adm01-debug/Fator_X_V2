-- ============================================================================
-- Dicionario de esquema: fecha acesso a anon e libera leitura para admin
-- (auditoria 2026-11-27)
--
-- Achado: `semantic_dictionary` (2972 objetos: 2681 colunas, 278 tabelas,
-- 13 schemas, todos com descricao) e `managed_schema_dictionary`
-- (571 objetos) sao o MESMO trabalho, com esquema identico e sem nenhuma
-- referencia em src/, edge function ou migration. Foram criadas fora do
-- versionamento, entao nao existe DDL no repo para elas e um banco novo
-- nao as tem.
--
-- Estado de seguranca medido no catalogo de producao: as duas tem RLS
-- habilitada com ZERO policies e `anon` com SELECT concedido. O conteudo e
-- metadado de esquema (nome de constraint, de indice, owner), mas inclui a
-- estrutura de `vault.secrets` e `auth.refresh_tokens` -- informacao de
-- reconhecimento que nao precisa estar ao alcance de visitante anonimo.
--
-- Correcao: revoga SELECT de anon e cria policy de leitura para admin.
-- Nao apaga dado nenhum: as linhas ficam intactas para quando a tela de
-- dicionario for construida.
--
-- Idempotente e tolerante a ausencia: cada bloco so age se a tabela existir,
-- para que ambientes onde as tabelas nasceram fora do versionamento (banco
-- novo, preview, CI) apliquem sem erro.
-- ============================================================================

DO $$
DECLARE
  t text;
  existe boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['semantic_dictionary', 'managed_schema_dictionary']
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) INTO existe;

    IF NOT existe THEN
      RAISE NOTICE 'public.% nao existe neste ambiente; nada a fazer', t;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_read_dictionary ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY admin_read_dictionary ON public.%I '
      'FOR SELECT TO authenticated '
      'USING (public.is_workspace_admin(auth.uid()))', t);

    RAISE NOTICE 'public.%: anon revogado, policy admin_read_dictionary criada', t;
  END LOOP;
END $$;