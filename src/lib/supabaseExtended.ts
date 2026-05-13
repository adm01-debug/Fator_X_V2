/**
 * Supabase Extended Client
 * Includes additional helpers for schema-safe access and RLS persona testing.
 * Added: isUserLockedOut RPC call.
 */
import { supabase } from '@/integrations/supabase/client';

export const fromTable = (table: string) => supabase.from(table);

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
    // Local storage or state management for the token if needed for cross-origin
    localStorage.setItem('supabase.external.auth.token', token);
  } else {
    localStorage.removeItem('supabase.external.auth.token');
  }
};
