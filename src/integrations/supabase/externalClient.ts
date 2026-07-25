/**
 * Nexus Agents Studio — External Supabase Client
 * 
 * This client connects to the EXTERNAL Supabase database (tdprnylgyrogbbhgdoik)
 * where all application data lives.
 * 
 * The original `supabase` client (client.ts) is used ONLY for authentication.
 * All data operations (agents, traces, workspaces, etc.) go through this client.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { logger } from '@/lib/logger';

const EXTERNAL_SUPABASE_URL = import.meta.env.VITE_EXTERNAL_SUPABASE_URL;
const EXTERNAL_SUPABASE_ANON_KEY = import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY;

// Fallback: if external vars are missing, use the local Lovable Cloud DB
const FALLBACK_URL = import.meta.env.VITE_SUPABASE_URL;
const FALLBACK_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const resolvedUrl = EXTERNAL_SUPABASE_URL || FALLBACK_URL;
const resolvedKey = EXTERNAL_SUPABASE_ANON_KEY || FALLBACK_KEY;

const usingFallback = !EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_ANON_KEY;

if (usingFallback && import.meta.env.DEV) {
  logger.warn(
    '⚠️ VITE_EXTERNAL_SUPABASE_URL/ANON_KEY não definidos — usando Lovable Cloud DB como fallback.'
  );
}

/**
 * External Supabase client for ALL data operations.
 * Uses a distinct storageKey to avoid the "Multiple GoTrueClient instances" warning
 * when sharing the same project URL as the auth client.
 */
export const supabaseExternal = createClient<Database>(
  resolvedUrl,
  resolvedKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: 'sb-external-data-client',
    },
  }
);


/**
 * Set the access token on the external client so RLS works.
 * Call this after login or when the session changes.
 */
export async function syncExternalAuth(accessToken: string) {
  try {
    await supabaseExternal.auth.setSession({
      access_token: accessToken,
      refresh_token: '', // Not needed — local client manages refresh
    });
  } catch (e) {
    logger.warn('⚠️ Failed to sync external auth session in externalClient', e);
  }
}
