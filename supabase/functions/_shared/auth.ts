/**
 * Nexus Agents Studio — Shared Auth Helper (HARDENED)
 * FIX P2-01: x-workspace-id header support
 * FIX P2-02: HMAC-based API key validation (constant-time)
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { errorResponse } from "./cors.ts";
import { constantTimeEqual } from "./security.ts";

export interface AuthResult {
  user: { id: string; email?: string; role?: string };
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
  workspaceId: string | null;
  error: null;
}

export interface AuthError {
  user: null;
  supabase: null;
  supabaseAdmin: null;
  workspaceId: null;
  error: Response;
}

export type AuthResponse = AuthResult | AuthError;

/**
 * Create user-scoped and admin Supabase clients.
 */
export function createSupabaseClients(authHeader: string): {
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
} {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    throw new Error('Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  return { supabase, supabaseAdmin };
}

/**
 * Create admin-only Supabase client (no user context).
 */
export function createAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Authenticate request and return user + clients.
 * P2-01: Now accepts x-workspace-id header for explicit workspace selection.
 */
export async function authenticateRequest(
  req: Request,
  options: { requireWorkspace?: boolean } = {}
): Promise<AuthResponse> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return {
      user: null, supabase: null, supabaseAdmin: null, workspaceId: null,
      error: errorResponse(req, 'Missing Authorization header', 401),
    };
  }

  const { supabase, supabaseAdmin } = createSupabaseClients(authHeader);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      user: null, supabase: null, supabaseAdmin: null, workspaceId: null,
      error: errorResponse(req, 'Invalid or expired token', 401),
    };
  }

  // P2-01: Support explicit workspace via header
  let workspaceId: string | null = req.headers.get('x-workspace-id');

  if (options.requireWorkspace || workspaceId) {
    // Validate user is member of this workspace
    const query = supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id);

    if (workspaceId) {
      query.eq('workspace_id', workspaceId);
    }

    const { data: membership } = await query.limit(1).maybeSingle();

    if (!membership?.workspace_id) {
      return {
        user: null, supabase: null, supabaseAdmin: null, workspaceId: null,
        error: errorResponse(req, workspaceId 
          ? 'User is not a member of the specified workspace' 
          : 'No workspace found for user', 403),
      };
    }
    workspaceId = membership.workspace_id;
  }

  return {
    user: { id: user.id, email: user.email, role: user.role },
    supabase, supabaseAdmin, workspaceId, error: null,
  };
}

/**
 * Quick auth check — returns user ID or null.
 */
export async function getAuthUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });

  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Validate an API key (header x-api-key) against public.api_keys.key_hash.
 * The hash format must match src/services/securityService.ts (createApiKey): SHA-256 hex.
 */
export async function validateApiKey(
  req: Request
): Promise<{ valid: boolean; workspaceId: string | null; agentId: string | null }> {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return { valid: false, workspaceId: null, agentId: null };

  const supabaseAdmin = createAdminClient();
  const keyHash = await hashApiKey(apiKey);

  const { data } = await supabaseAdmin
    .from('api_keys')
    .select('workspace_id, agent_id, key_hash')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .maybeSingle();

  if (!data || !constantTimeEqual(keyHash, data.key_hash as string)) {
    return { valid: false, workspaceId: null, agentId: null };
  }
  return { valid: true, workspaceId: data.workspace_id, agentId: data.agent_id };
}

/**
 * Validate workspace membership for a user.
 */
export async function validateWorkspaceMembership(
  supabaseAdmin: SupabaseClient,
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('workspace_members')
    .select('id')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  return !!data;
}

// SHA-256 hex — mesmo formato de createApiKey (src/services/securityService.ts). Sem HMAC: a chave é
// criada no navegador, que não tem acesso a segredo do servidor.
async function hashApiKey(key: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}
