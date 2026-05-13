import { supabase } from '@/integrations/supabase/client';

/**
 * Supabase Extended Client
 * Includes additional helpers for schema-safe access and RLS persona testing.
 * Added: isUserLockedOut RPC call.
 */

/**
 * Returns a typed Supabase client for a specific table.
 * Using 'any' for table name to avoid deep type instantiation issues in build.
 */
export const fromTable = (table: string) => (supabase as any).from(table);

/**
 * Checks if a user is locked out due to multiple failed login attempts.
 */
export const isUserLockedOut = async (email: string): Promise<boolean> => {
  const { data, error } = await supabase.rpc('is_user_locked_out', { target_email: email });
  if (error) {
    console.error('Lockout check failed:', error);
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
export const rpcCall = async (fnName: string, params: any) => {
  return await (supabase as any).rpc(fnName, params);
};

/**
 * Helper to wrap any Supabase call and fix the deep type issue
 */
export const wrap = (fn: any) => fn as any;

/**
 * Mock result type to satisfy high-level UI component mapping
 */
export type ResultOne = Record<string, any>;
