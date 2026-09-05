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
import { supabase } from './client';

const EXTERNAL_SUPABASE_URL = import.meta.env.VITE_EXTERNAL_SUPABASE_URL;
const EXTERNAL_SUPABASE_ANON_KEY = import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY;

// Fallback: if external vars are missing, use the local Lovable Cloud DB
const FALLBACK_URL = import.meta.env.VITE_SUPABASE_URL;
const FALLBACK_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Always provide valid placeholder URLs so createClient never throws at module load time
// (e.g. in CI where secrets may be absent). Requests against placeholder URLs will fail
// gracefully at runtime; the app guards against Supabase calls via isSupabaseConfigured.
const resolvedUrl = EXTERNAL_SUPABASE_URL || FALLBACK_URL || 'https://placeholder.supabase.co';
const resolvedKey = EXTERNAL_SUPABASE_ANON_KEY || FALLBACK_KEY || 'placeholder-anon-key';

const usingFallback = !EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_ANON_KEY;

if (usingFallback && import.meta.env.DEV) {
  logger.warn(
    '⚠️ VITE_EXTERNAL_SUPABASE_URL/ANON_KEY não definidos — usando Lovable Cloud DB como fallback.',
  );
}

/**
 * External Supabase client for ALL data operations.
 * Uses a distinct storageKey to avoid the "Multiple GoTrueClient instances" warning
 * when sharing the same project URL as the auth client.
 */
export const supabaseExternal = createClient<Database>(resolvedUrl, resolvedKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    storageKey: 'sb-external-data-client',
  },
});

/**
 * Set the access token on the external client so RLS works.
 * Gets session directly from the main auth client.
 */
export async function syncExternalAuth() {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) {
      await supabaseExternal.auth.setSession({
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
      });
    }
  } catch (e) {
    logger.warn('⚠️ Failed to sync external auth session in externalClient', e);
  }
}
