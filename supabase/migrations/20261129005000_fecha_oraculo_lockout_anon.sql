-- ============================================================================
-- Fecha o oraculo de lockout para anonimos.
--
-- Causa: 20260513164034_c690469d (linhas 6-10) revogou EXECUTE de PUBLIC e
-- concedeu a authenticated/service_role. Duas migrations depois,
-- 20260522143208_f7b4c2a0 (linha 44) reconcedeu a anon. Como
-- is_user_locked_out() e SECURITY DEFINER e le auth_attempts (tabela com RLS),
-- qualquer requisicao sem JWT podia chamar a RPC com um e-mail arbitrario e
-- descobrir se aquela conta existe e esta bloqueada -- enumeracao de contas.
--
-- O app chama a RPC em AuthContext.tsx:69, antes do signIn. Sign-in com a anon
-- key carrega o JWT do usuario logado quando ha sessao; a chamada pre-login
-- autenticada nao depende de anon. O papel anon continua sem acesso.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.is_user_locked_out(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_user_locked_out(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_user_locked_out(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_user_locked_out(text) IS
  'Retorna true se o e-mail teve >=5 falhas de login em 15 min. SECURITY DEFINER sobre auth_attempts; execucao restrita a authenticated e service_role (anon revogado em 20261129005000).';