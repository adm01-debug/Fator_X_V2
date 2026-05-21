import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Extended Client
 * Includes additional helpers for schema-safe access and RLS persona testing.
 * Added: isUserLockedOut RPC call.
 */

// Loosely-typed view of the client. The generated Database types make some
// query chains hit "Type instantiation is excessively deep"; this relaxed
// client lets us address tables/RPCs not present in the generated schema
// without resorting to `any`.
const looseClient = supabase as unknown as SupabaseClient;

/**
 * Returns a Supabase query builder for a table that may not exist in the
 * generated schema types.
 */
export const fromTable = (table: string) => looseClient.from(table);

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
export const rpcCall = async (fnName: string, params?: Record<string, unknown>) => {
  return await looseClient.rpc(fnName, params);
};
