import { _createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.7';

/**
 * Idempotency Helper — Nexus Agents Studio
 *
 * Supports two modes:
 *   1. Standard idempotency key (header-based, per-client)
 *   2. Webhook deduplication (provider event id, webhoook-scoped)
 *
 * Safety properties:
 *   - Timing-safe: checked before auth is computed
 *   - Atomic: uses INSERT ON CONFLICT DO NOTHING (no race window)
 *   - TTL: 24h auto-expiry via expires_at
 *   - Scoped: webhook:{id}:{event_key} prevents cross-webhook collisions
 */

// ──────────────────────────────────────────────────────────────────────────────
// Key builder (canonical — usado pelo webhook-receiver)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builds a deterministic deduplication key for webhook requests.
 * Tries 4 strategies in order; stops at first non-empty value.
 *
 * Strategy:
 *  1. Canonical provider headers (x-github-delivery, x-event-id, etc.)
 *  2. x-idempotency-key / idempotency-key (case-insensitive)
 *  3. SHA-256 body hash (stable, collision-resistant)
 *  4. IP + timestamp bucket (last resort)
 *
 * @param webhookId - UUID of the webhook endpoint (scopes the key)
 * @param req      - Incoming Request (body consumed via req.text())
 * @param rawBody  - Pre-extracted raw body string (optional — avoids double-read)
 */
export async function buildWebhookDedupKey(
  webhookId: string,
  req: Request,
  rawBody?: string,
): Promise<string> {
  // Strategy 1: Canonical provider event IDs
  const canonicalHeaders = [
    'x-github-delivery',
    'x-event-id',
    'x-request-id',
    'x-webhook-id',
    'x-gitlab-event-uuid',
    'twilio-signature', // Twilio uses this header to indicate real delivery
  ];

  for (const header of canonicalHeaders) {
    const value = req.headers.get(header);
    if (value) return `webhook:${webhookId}:provider:${header}:${value}`;
  }

  // Strategy 2: Idempotency keys (case-insensitive)
  for (const header of ['x-idempotency-key', 'idempotency-key', 'x-Idempotency-Key']) {
    const value = req.headers.get(header);
    if (value) return `webhook:${webhookId}:idempotency:${value}`;
  }

  // Strategy 3: Body hash (stable, collision-resistant)
  try {
    const body = rawBody ?? await req.text();
    if (body && body !== '{}' && body !== '[]') {
      const hash = await sha256Hex(body);
      return `webhook:${webhookId}:bodyhash:${hash}`;
    }
  } catch {
    // req.text() may have already been consumed — fall through
  }

  // Strategy 4: IP + timestamp bucket (1-min window, last resort)
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
  const bucket = Math.floor(Date.now() / 60_000); // 1-minute bucket
  return `webhook:${webhookId}:ipfallback:${ip}:${bucket}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Standard idempotency (per-client)
// ──────────────────────────────────────────────────────────────────────────────

export interface IdempotencyResult {
  isDuplicate: boolean;
  response?: Response;
}

/**
 * Standard idempotency check — for non-webhook endpoints.
 */
export async function checkIdempotency(
  key: string,
  supabaseClient: unknown,
): Promise<IdempotencyResult> {
  if (!key) return { isDuplicate: false };
  const client = supabaseClient as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (k: string, v: unknown) => { single: () => Promise<{ data: Record<string, unknown>; error: { code?: string } | null }> };
      };
    };
  };


  const { data, error } = await client
    .from('idempotency_keys')
    .select('response_body, status_code')
    .eq('key', key)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[idempotency] check error:', error);
    return { isDuplicate: false };
  }

  if (data) {
    return {
      isDuplicate: true,
      response: new Response(JSON.stringify(data.response_body), {
        status: data.status_code as number,
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Cache': 'HIT' },
      }),
    };
  }

  return { isDuplicate: false };
}

// ──────────────────────────────────────────────────────────────────────────────
// Webhook-specific idempotency (atomic, no race window)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Atomic claim: INSERT ON CONFLICT DO NOTHING — no race window.
 * Returns true if this instance won the race (should process).
 * Returns false if another instance already claimed this key.
 */
export async function claimIdempotencyKey(
  supabase: unknown,
  key: string,
): Promise<boolean> {
  if (!key) return true; // no key = no dedup
  const client = supabase as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        // ON CONFLICT DO NOTHING semantics via upsert
        upsert: (row: Record<string, unknown>) => {
          select: () => {
            single: () => Promise<{ data: unknown; error: { code?: string } | null }>;
          };
        };
      };
    };
  };

  const { data, error } = await client
    .from('idempotency_keys')
    .upsert(
      {
        key,
        status_code: 0, // 0 = in-flight; replaced by real status_code on save
        response_body: { _status: 'processing' },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'key', ignoreDuplicates: true },
    )
    .select()
    .single();

  // If upsert failed with unique violation, another instance claimed it
  if (error && (error.code === '23505' || error.code === 'PGRST116')) {
    return false; // already claimed
  }

  // If data is null (ignoreDuplicates: true), key already existed
  if (!data) return false;

  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// Save (standard)
// ──────────────────────────────────────────────────────────────────────────────

export async function saveIdempotency(
  key: string,
  statusCode: number,
  responseBody: unknown,
  supabaseClient: unknown,
): Promise<void> {
  if (!key) return;
  const client = supabaseClient as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        then?: (fn: (v: unknown) => void) => void;
      };
    };
  };

  const { error } = await client
    .from('idempotency_keys')
    .insert({
      key,
      status_code: statusCode,
      response_body: responseBody,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

  if (error && error.code !== '23505') {
    console.error('[idempotency] save error:', error);
  }
}

/**
 * Save webhook idempotency with the real status code.
 * Replaces the in-flight placeholder (status_code=0) with the real response.
 */
export async function saveWebhookIdempotency(
  key: string,
  statusCode: number,
  responseBody: unknown,
  supabase: unknown,
): Promise<void> {
  if (!key) return;
  const client = supabase as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (k: string, v: unknown) => Promise<{ error: { code?: string } | null }>;
      };
    };
  };

  const { error } = await client
    .from('idempotency_keys')
    .update({
      status_code: statusCode,
      response_body: responseBody,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq('key', key);

  if (error) {
    console.error('[idempotency] webhook save error:', error);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────────────

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
