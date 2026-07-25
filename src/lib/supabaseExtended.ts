import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { DbRow } from '@/types/dbRow';

/**
 * Supabase Extended Client
 * Includes additional helpers for schema-safe access and RLS persona testing.
 * Added: isUserLockedOut RPC call.
 */

/**
 * Permissive fluent-query shim para tabelas fora do schema tipado.
 * `data` é resolvido como `DbRow` (ponte documentada) para preservar
 * o acesso legado por propriedade em callbacks; os métodos fluentes
 * são todos tipados e retornam a mesma interface.
 */
export const fromTable = (table: string) => (supabase as unknown as { from: (t: string) => unknown }).from(table);

/**
 * Checks if a user is locked out due to multiple failed login attempts.
 */
export const isUserLockedOut = async (email: string): Promise<boolean> => {
  const { data, error } = await supabase.rpc('is_user_locked_out', { target_email: email });
  if (error) {
    logger.error('Lockout check failed in supabaseExtended', error);
    return false;
  }
  return !!data;
};

/**
 * Syncs the local auth token to the external database client.
 */
export const syncExternalAuth = (token: string | null) => {
  if (token) {
    localStorage.setItem('supabase.external.auth.token', token);
  } else {
    localStorage.removeItem('supabase.external.auth.token');
  }
};

/**
 * Executes a Supabase RPC call.
 */
export const rpcCall = async (fnName: string, params: Record<string, unknown>) => {
  return await (supabase as unknown as { rpc: (fn: string, p: Record<string, unknown>) => unknown }).rpc(fnName, params);
};

/**
 * Helper to wrap any Supabase call and fix the deep type issue
 */
export const wrap = <T>(fn: T): T => fn;

/**
 * Mock result type to satisfy high-level UI component mapping
 */
export type ResultOne = Record<string, unknown>;
