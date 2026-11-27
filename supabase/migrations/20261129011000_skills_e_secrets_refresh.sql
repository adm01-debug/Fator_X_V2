-- ============================================================================
-- 1) increment_skill_installs: contador de instalacoes escopado ao instalador
--
-- Causa: SECURITY DEFINER sobre skill_registry sem nenhum filtro (20261126230000:303).
-- Via heranca de PUBLIC (pg_default_acl) qualquer autenticado chamava a RPC
-- informando o id de uma skill qualquer e inflava o contador de destaques.
-- Chamador unico: src/services/skillsRegistryService.ts:148, disparado logo apos
-- o UPSERT em agent_installed_skills (linha 134) com os skill_id realmente
-- inseridos para o agente que o usuario acabou de instalar.
--
-- Correcao: a RPC so incrementa uma skill que esta instalada num agente do
-- proprio chamador (agents.user_id) ou do workspace dele. service_role
-- (auth.uid() NULL) mantem o comportamento global antigo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_skill_installs(p_skill_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  -- Fora do servidor, so conta instalacao que pertence ao proprio chamador.
  IF v_uid IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.agent_installed_skills ais
    JOIN public.agents a ON a.id = ais.agent_id
    WHERE ais.skill_id = p_skill_id
      AND (
        a.user_id = v_uid
        OR a.workspace_id IN (SELECT public.get_user_workspace_ids(v_uid))
      )
  ) THEN
    RETURN;  -- silencioso: contador e metrica, nao acao de negocio
  END IF;

  UPDATE public.skill_registry
     SET install_count = install_count + 1
   WHERE id = p_skill_id;
END;
$$;

COMMENT ON FUNCTION public.increment_skill_installs(uuid) IS
  'Incrementa install_count apenas para skill instalada em agente do chamador. service_role sem escopo (rotinas de sistema).';

-- ============================================================================
-- 2) refresh_secrets_status: rotina interna volta a ser so service_role
--
-- 20260722115838_d10e0c3c:22-53 declarou esta funcao como interna
-- ("so service_role executa; frontend nunca chama") e aplicou
--   REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated
--   GRANT  EXECUTE ... TO service_role
--
-- A restauracao de 20261126230000:1575 recriou a funcao com SECURITY DEFINER
-- mas o bloco 5.1 do mesmo arquivo (linhas 4408-4442) nao repetiu nenhum dos
-- dois comandos. Resultado em producao: sem REVOKE, o EXECUTE herdado de
-- PUBLIC voltou e o GRANT so para service_role sumiu.
--
-- Efeito do furo: a funcao percorre public.managed_secrets SEM filtro de
-- workspace e reescreve status/updated_at de segredos de todos os tenants.
-- Um clique em Refresh na tela de Rotacao (SecretsRotationPage.tsx:78)
-- podia marcar como overdue segredo alheio, e o retorno expunha a contagem.
--
-- O botao da tela continua funcionando: o status e derivado de
-- next_rotation_due < now(), que a listagem ja mostra por RLS. Nenhum dado
-- novo aparece para o usuario; o botao apenas recalcula (idempotente).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.refresh_secrets_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_secrets_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_secrets_status() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_secrets_status() TO service_role;

COMMENT ON FUNCTION public.refresh_secrets_status() IS
  'Internal (cron). Hardened: only service_role. Recalcula status de managed_secrets de todos os workspaces.';