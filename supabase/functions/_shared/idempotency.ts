import { _createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.7';

/**
 * Idempotency Helper
 * Ensures that the same request processed multiple times results in the same outcome.
 * Uses a dedicated 'idempotency_keys' table in the database.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
export async function checkIdempotency(key: string, supabaseClient: any) {
  if (!key) return { isDuplicate: false };

  // Check if the key already exists
  const { data, error } = await supabaseClient
    .from('idempotency_keys')
    .select('response_body, status_code')
    .eq('key', key)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Idempotency check error:', error);
    return { isDuplicate: false };
  }

  if (data) {
    return { 
      isDuplicate: true, 
      response: new Response(JSON.stringify(data.response_body), {
        status: data.status_code,
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Cache': 'hit' }
      })
    };
  }

  return { isDuplicate: false };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
export async function saveIdempotency(key: string, statusCode: number, responseBody: any, supabaseClient: any) {
  if (!key) return;

  const { error } = await supabaseClient
    .from('idempotency_keys')
    .insert({
      key,
      status_code: statusCode,
      response_body: responseBody,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h expiration
    });

  if (error) {
    console.error('Failed to save idempotency key:', error);
  }
}
