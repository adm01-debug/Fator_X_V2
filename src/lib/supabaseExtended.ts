import { supabase } from '@/integrations/supabase/client';
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Extended Client
 * Includes additional helpers for schema-safe access and RLS persona testing.
 *
 * ARQUITETURA (dual-client):
 *   - `supabase` (client local) ....... APENAS autenticação.
 *   - `supabaseExternal` .............. TODAS as operações de dados.
 *
 * `fromTable`/`rpcCall` existem só para relaxar a tipagem gerada — NÃO para
 * trocar de banco. Por isso ambos são ancorados no client EXTERNO: um helper
 * de tipagem jamais deve decidir em qual banco a query cai.
 */

// Loosely-typed view of the DATA client. The generated Database types make some
// query chains hit "Type instantiation is excessively deep"; this relaxed
// client lets us address tables/RPCs not present in the generated schema
// without resorting to `any`.
const looseClient = supabaseExternal as unknown as SupabaseClient;

/**
 * Returns a Supabase query builder for a table that may not exist in the
 * generated schema types. Always targets the external (data) database.
 */
export const fromTable = (table: string) => looseClient.from(table);

/**
 * Checks if a user is locked out due to multiple failed login attempts.
 * Auth-related, so it intentionally uses the LOCAL auth client.
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
 * Executes a Supabase RPC call against the external (data) database.
 */
export const rpcCall = async (fnName: string, params?: Record<string, unknown>) => {
  return await looseClient.rpc(fnName, params);
};
