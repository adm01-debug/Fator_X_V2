import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface AccountLockout {
  id: string;
  email: string | null;
  ip_address: string | null;
  lockout_type: string | null;
  reason: string | null;
  failure_count: number;
  locked_at: string;
  expires_at: string | null;
  unlocked_at: string | null;
}

/**
 * Bloqueios de login do workspace. A RPC é SECURITY DEFINER com guard de
 * administrador: `account_lockouts` não tem `workspace_id` no fluxo pré-JWT,
 * então a policy de SELECT não os expõe pela tabela direta.
 */
export async function listAccountLockouts(workspaceId: string): Promise<AccountLockout[]> {
  const { data, error } = await supabase.rpc('admin_list_account_lockouts', {
    p_workspace: workspaceId,
  });
  if (error) {
    logger.error('listAccountLockouts falhou', error);
    throw error;
  }
  return (data ?? []) as AccountLockout[];
}

/**
 * Libera um bloqueio: carimba `unlocked_at`/`unlocked_by`, zera as falhas
 * recentes do e-mail e grava o evento na trilha de auditoria.
 */
export async function releaseAccountLockout(lockoutId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_release_account_lockout', {
    p_lockout: lockoutId,
  });
  if (error) throw error;
}
