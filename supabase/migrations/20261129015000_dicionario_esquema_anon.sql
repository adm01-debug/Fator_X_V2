-- ============================================================================
-- Dicionario de esquema: fecha acesso a anon e libera leitura para admin
-- (auditoria 2026-11-27)
--
-- Achado: `semantic_dictionary` (2972 objetos: 2681 colunas, 278 tabelas,
-- 13 schemas, todos com descricao) e `managed_schema_dictionary`
-- (571 objetos) sao o MESMO trabalho, com esquema identico e sem nenhuma
-- referencia em src/, edge function ou migration. Foram criadas fora do
-- versionamento, entao nao existe DDL no repo para elas.
--
-- Estado de seguranca medido no catalogo: as duas tem RLS habilitada com
-- ZERO policies e `anon` com SELECT concedido. O conteudo e metadado de
-- esquema (nome de constraint, de indice, owner), mas inclui a estrutura
-- de `vault.secrets` e `auth.refresh_tokens` -- informacao de
-- reconhecimento que nao precisa estar ao alcance de visitante anonimo.
--
-- Correcao: revoga SELECT de anon e cria policy de leitura para admin.
-- Nao apaga dado nenhum: as linhas ficam intactas para quando a tela de
-- dicionario for construida.
-- ============================================================================

REVOKE SELECT ON public.semantic_dictionary FROM anon;
REVOKE SELECT ON public.managed_schema_dictionary FROM anon;

-- RLS ligada sem nenhuma policy = nem authenticated le hoje. O publico
-- legitimo de um dicionario interno do banco e o admin da plataforma.
DROP POLICY IF EXISTS admin_read_dictionary ON public.semantic_dictionary;
CREATE POLICY admin_read_dictionary ON public.semantic_dictionary
  FOR SELECT TO authenticated
  USING (public.is_workspace_admin(auth.uid()));

DROP POLICY IF EXISTS admin_read_dictionary ON public.managed_schema_dictionary;
CREATE POLICY admin_read_dictionary ON public.managed_schema_dictionary
  FOR SELECT TO authenticated
  USING (public.is_workspace_admin(auth.uid()));