/**
 * ════════════════════════════════════════════════════════════════════
 * WhatsApp Webhook Receiver — Nexus Agents Studio (next-frontier sprint #2)
 * ════════════════════════════════════════════════════════════════════
 *
 * Receives inbound WhatsApp messages from any of the 4 supported
 * providers, normalizes them into a common shape, validates HMAC,
 * routes to the right agent via agent_routing_config, and logs an
 * audit row in whatsapp_webhook_events.
 *
 * verify_jwt: false (providers cannot send JWT)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  handleCorsPreflight,
  getCorsHeaders,
  createAdminClient,
  jsonResponse,
  errorResponse,
  parseBody,
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
  RATE_LIMITS,
  requireEnv,
  constantTimeEqual,
} from '../_shared/mod.ts';
import { WhatsAppWebhookContracts } from '../_shared/contracts.ts';
import { verifyHmac } from '../_shared/webhookSignature.ts';

// Replay protection window: reject signed events with a provider timestamp
// older than 5 minutes (mitigates captured-body replay attacks).
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

/** Extracts a unix-ms timestamp from provider-specific hints, if available. */
function extractProviderTimestampMs(
  provider: Provider,
  headers: Headers,
  parsed: Record<string, unknown>,
): number | null {
  // Generic override header (used by internal replays / tests)
  const generic = headers.get('x-webhook-timestamp');
  if (generic) {
    const n = Number(generic);
    if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
  }
  if (provider === 'meta') {
    const entry = (parsed.entry as Array<Record<string, unknown>> | undefined)?.[0];
    const t = entry?.time;
    if (typeof t === 'number' && Number.isFinite(t)) return t > 1e12 ? t : t * 1000;
  }
  if (provider === 'zapi') {
    const t = parsed.momment ?? parsed.timestamp;
    if (typeof t === 'number' && Number.isFinite(t)) return t > 1e12 ? t : t * 1000;
  }
  if (provider === 'evolution') {
    const data = parsed.data as Record<string, unknown> | undefined;
    const t = data?.messageTimestamp;
    if (typeof t === 'number' && Number.isFinite(t)) return t > 1e12 ? t : t * 1000;
  }
  return null;
}

/** Check whether we already persisted this (provider, message_id) pair. */
async function isReplay(
  client: SupabaseClient,
  provider: Provider,
  messageId: string | null,
): Promise<boolean> {
  if (!messageId) return false;
  const { data } = await client
    .from('whatsapp_webhook_events')
    .select('id')
    .eq('provider', provider)
    .eq('message_id', messageId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Fallback replay-nonce: quando o provedor entrega message_id=null, geramos
 * um hash estável (provider|from|ts|body[:256]) e verificamos janela de 5 min
 * em openclaw_events (kind='wh.nonce'). Retorna true se já visto.
 */
async function isNonceReplay(
  client: SupabaseClient,
  provider: Provider,
  fromPhone: string | null,
  providerTsMs: number | null,
  rawBody: string,
): Promise<{ replay: boolean; hash: string }> {
  const seed = `${provider}|${fromPhone ?? ''}|${providerTsMs ?? ''}|${rawBody.slice(0, 256)}`;
  const buf = new TextEncoder().encode(seed);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data } = await client
    .from('openclaw_events')
    .select('id')
    .eq('kind', 'wh.nonce')
    .contains('payload', { hash })
    .gte('created_at', fiveMinAgo)
    .limit(1)
    .maybeSingle();
  return { replay: !!data, hash };
}

async function recordNonce(
  client: SupabaseClient,
  hash: string,
  provider: Provider,
): Promise<void> {
  await client
    .from('openclaw_events')
    .insert({
      kind: 'wh.nonce',
      level: 'info',
      source: 'webhook',
      payload: { hash, provider },
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

// ─── Trace ID generator ───
function generateTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Form-urlencoded parser (Twilio) ───
function _parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [k, v] of params.entries()) result[k] = v;
  return result;
}

// ─── Provider detection ───
type Provider = 'twilio' | 'meta' | 'zapi' | 'evolution' | 'unknown';

function detectProvider(headers: Headers, parsed: unknown): Provider {
  // Twilio signs with X-Twilio-Signature
  if (headers.get('x-twilio-signature')) return 'twilio';
  // Meta Cloud signs with X-Hub-Signature-256
  if (headers.get('x-hub-signature-256')) return 'meta';
  // Z-API uses an "instanceId" + "messageId" key shape
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if ('instanceId' in obj || 'phone' in obj) return 'zapi';
    if ('event' in obj && 'instance' in obj) return 'evolution';
    if ('object' in obj && obj.object === 'whatsapp_business_account') return 'meta';
  }
  return 'unknown';
}

// ─── Normalized event shape ───
interface NormalizedEvent {
  event_type: string;
  message_id: string | null;
  from_phone: string | null;
  to_phone: string | null;
  body_preview: string | null;
}

function normalizeEvent(provider: Provider, parsed: Record<string, unknown>): NormalizedEvent {
  switch (provider) {
    case 'twilio': {
      // Twilio form fields: MessageSid, From, To, Body, NumMedia
      const numMedia = parseInt(String(parsed.NumMedia ?? '0'), 10);
      let eventType = 'message.text';
      if (numMedia > 0) {
        const ct = String(parsed.MediaContentType0 ?? '');
        if (ct.startsWith('image/')) eventType = 'message.image';
        else if (ct.startsWith('audio/')) eventType = 'message.audio';
        else eventType = 'message.document';
      }
      return {
        event_type: eventType,
        message_id: typeof parsed.MessageSid === 'string' ? parsed.MessageSid : null,
        from_phone: typeof parsed.From === 'string' ? parsed.From.replace(/^whatsapp:/, '') : null,
        to_phone: typeof parsed.To === 'string' ? parsed.To.replace(/^whatsapp:/, '') : null,
        body_preview: typeof parsed.Body === 'string' ? parsed.Body.slice(0, 200) : null,
      };
    }
    case 'meta': {
      // Meta Cloud nested shape
      const entry = (parsed.entry as Array<Record<string, unknown>> | undefined)?.[0];
      const change = (entry?.changes as Array<Record<string, unknown>> | undefined)?.[0];
      const value = change?.value as Record<string, unknown> | undefined;
      const message = (value?.messages as Array<Record<string, unknown>> | undefined)?.[0];
      if (!message) {
        // status update
        const status = (value?.statuses as Array<Record<string, unknown>> | undefined)?.[0];
        return {
          event_type: status ? `status.${String(status.status)}` : 'unknown',
          message_id: status ? String(status.id ?? '') : null,
          from_phone: status ? String(status.recipient_id ?? '') : null,
          to_phone: null,
          body_preview: null,
        };
      }
      const msgType = String(message.type ?? 'text');
      const text = (message.text as Record<string, unknown> | undefined)?.body;
      return {
        event_type: `message.${msgType}`,
        message_id: typeof message.id === 'string' ? message.id : null,
        from_phone: typeof message.from === 'string' ? message.from : null,
        to_phone:
          typeof (value?.metadata as Record<string, unknown> | undefined)?.display_phone_number ===
          'string'
            ? String((value?.metadata as Record<string, unknown>)?.display_phone_number)
            : null,
        body_preview: typeof text === 'string' ? text.slice(0, 200) : null,
      };
    }
    case 'zapi': {
      const text = (parsed.text as Record<string, unknown> | undefined)?.message;
      return {
        event_type: 'message.text',
        message_id: typeof parsed.messageId === 'string' ? parsed.messageId : null,
        from_phone: typeof parsed.phone === 'string' ? parsed.phone : null,
        to_phone: typeof parsed.connectedPhone === 'string' ? parsed.connectedPhone : null,
        body_preview: typeof text === 'string' ? text.slice(0, 200) : null,
      };
    }
    case 'evolution': {
      const data = parsed.data as Record<string, unknown> | undefined;
      const message = data?.message as Record<string, unknown> | undefined;
      const text =
        (message?.conversation as string | undefined) ??
        (message?.extendedTextMessage as Record<string, unknown> | undefined)?.text;
      const key = data?.key as Record<string, unknown> | undefined;
      return {
        event_type: 'message.text',
        message_id: typeof key?.id === 'string' ? key.id : null,
        from_phone: typeof key?.remoteJid === 'string' ? String(key.remoteJid).split('@')[0] : null,
        to_phone: null,
        body_preview: typeof text === 'string' ? text.slice(0, 200) : null,
      };
    }
    default:
      return {
        event_type: 'unknown',
        message_id: null,
        from_phone: null,
        to_phone: null,
        body_preview: null,
      };
  }
}

// ─── HMAC validation per provider ───
async function validateSignature(
  provider: Provider,
  rawBody: string,
  headers: Headers,
  requestUrl: string,
): Promise<boolean> {
  switch (provider) {
    case 'twilio': {
      // Real Twilio HMAC-SHA1: sign (URL + sorted form params) with auth token
      const authToken = Deno.env.get('WHATSAPP_TWILIO_AUTH_TOKEN') ?? '';
      if (!authToken) return false;

      const provided = headers.get('x-twilio-signature');
      if (!provided) return false;

      // Build canonical string: URL + form-params sorted alphabetically (key+value)
      const params: Record<string, string> = {};
      try {
        const urlEncoded = new URLSearchParams(rawBody);
        for (const [k, v] of urlEncoded.entries()) params[k] = v;
      } catch {
        /* body is not form-encoded — sign URL only */
      }

      let canonical = requestUrl;
      for (const k of Object.keys(params).sort()) {
        canonical += k + params[k];
      }

      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(authToken),
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign'],
      );
      const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(canonical));
      const computed = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

      return constantTimeEqual(computed, provided);
    }
    case 'meta': {
      const secret = Deno.env.get('WHATSAPP_META_APP_SECRET') ?? '';
      if (!secret) return false;
      const provided = headers.get('x-hub-signature-256');
      if (!provided) return false;
      return await verifyHmac(secret, rawBody, provided, 'sha256=');
    }
    case 'zapi':
    case 'evolution': {
      const zapiToken = Deno.env.get('WHATSAPP_ZAPI_TOKEN') ?? '';
      const evoToken = Deno.env.get('WHATSAPP_EVOLUTION_TOKEN') ?? '';
      const auth = headers.get('authorization') ?? '';
      const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
      if (zapiToken && constantTimeEqual(bearer, zapiToken)) return true;
      if (evoToken && constantTimeEqual(bearer, evoToken)) return true;
      return false;
    }
    default:
      return false;
  }
}

// ─── Workspace resolution by destination phone or default ───
async function resolveWorkspace(
  client: SupabaseClient,
  toPhone: string | null,
): Promise<string | null> {
  if (!toPhone) return null;
  const { data } = await client
    .from('workspace_secrets')
    .select('workspace_id')
    .eq('key_name', 'whatsapp_phone_number')
    .eq('key_value', toPhone)
    .maybeSingle();
  return (data as { workspace_id?: string } | null)?.workspace_id ?? null;
}

// ─── Routing lookup ───
async function findAgentRoute(
  client: SupabaseClient,
  workspaceId: string,
  eventType: string,
): Promise<string | null> {
  const { data } = await client
    .from('agent_routing_config')
    .select('agent_id')
    .eq('workspace_id', workspaceId)
    .eq('source', 'whatsapp')
    .eq('event_type', eventType)
    .eq('is_enabled', true)
    .maybeSingle();
  return (data as { agent_id?: string } | null)?.agent_id ?? null;
}

// ─── Audit row writer ───
interface AuditRow {
  workspace_id: string | null;
  event_type: string;
  provider: string;
  message_id: string | null;
  from_phone: string | null;
  to_phone: string | null;
  body_preview: string | null;
  raw_payload: Record<string, unknown>;
  signature_valid: boolean;
  routed_agent_id: string | null;
  routing_status: string;
  routing_error: string | null;
  trace_id: string;
  processed_at: string;
}

async function writeAudit(client: SupabaseClient, row: AuditRow): Promise<void> {
  const { error } = await client.from('whatsapp_webhook_events').insert(row);
  if (error) {
    // 23505 = unique violation (duplicate by provider+message_id)
    if (String(error.code) === '23505') {
      console.warn('whatsapp duplicate event ignored', { message_id: row.message_id });
      return;
    }
    console.error('Audit write failed:', error.message);
  }
}

// ─── Main handler ───
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight(req);
  }

  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.light);
  if (!rate.allowed) return createRateLimitResponse(rate, getCorsHeaders(req));

  // Meta verification GET handshake
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && challenge) {
      const expected = requireEnv('WHATSAPP_META_VERIFY_TOKEN');
      if (token === expected) {
        return new Response(challenge, {
          status: 200,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'text/plain' },
        });
      }
    }
    return errorResponse(req, 'Forbidden', 403);
  }

  if (req.method !== 'POST') {
    return errorResponse(req, 'Method not allowed', 405);
  }

  const traceId = generateTraceId();
  const startTime = Date.now();
  let client;
  try {
    client = createAdminClient();
  } catch (err) {
    console.error('Service client init failed', err);
    return errorResponse(req, 'Server configuration error', 500);
  }

  // Parse body with contract validation
  const {
    data: parsed,
    error: validationError,
    rawBody,
  } = await parseBody(req, WhatsAppWebhookContracts, {
    returnRawBody: true,
    defaultVersion: 'v1',
  });

  if (validationError) {
    return validationError;
  }

  if (!parsed || !rawBody) {
    return errorResponse(req, 'Invalid request body', 400);
  }

  const provider = detectProvider(req.headers, parsed);
  const event = normalizeEvent(provider, parsed);
  const signatureValid = await validateSignature(provider, rawBody, req.headers, req.url);
  const workspaceId = await resolveWorkspace(client, event.to_phone);

  const audit: AuditRow = {
    workspace_id: workspaceId,
    event_type: event.event_type,
    provider,
    message_id: event.message_id,
    from_phone: event.from_phone,
    to_phone: event.to_phone,
    body_preview: event.body_preview,
    raw_payload: parsed,
    signature_valid: signatureValid,
    routed_agent_id: null,
    routing_status: 'pending',
    routing_error: null,
    trace_id: traceId,
    processed_at: new Date().toISOString(),
  };

  if (!signatureValid) {
    audit.routing_status = 'invalid_signature';
    audit.routing_error = 'HMAC validation failed';
    await writeAudit(client, audit);
    return jsonResponse(req, { error: 'Invalid signature', trace_id: traceId }, 401);
  }

  // Replay protection: reject events with stale provider timestamps.
  const providerTsMs = extractProviderTimestampMs(provider, req.headers, parsed);
  if (providerTsMs !== null && Math.abs(Date.now() - providerTsMs) > REPLAY_WINDOW_MS) {
    audit.routing_status = 'stale_event';
    audit.routing_error = `Timestamp outside replay window (${REPLAY_WINDOW_MS}ms)`;
    await writeAudit(client, audit);
    return jsonResponse(req, { error: 'Stale event', trace_id: traceId }, 401);
  }

  // Dedupe: silently ack duplicates so providers stop retrying.
  if (await isReplay(client, provider, event.message_id)) {
    return jsonResponse(req, { ok: true, deduped: true, trace_id: traceId }, 200);
  }

  // Fallback nonce-hash: quando o provedor não entrega message_id.
  let nonceHash: string | null = null;
  if (!event.message_id) {
    const { replay, hash } = await isNonceReplay(
      client,
      provider,
      event.from_phone,
      providerTsMs,
      rawBody,
    );
    if (replay) {
      return jsonResponse(req, { ok: true, deduped: true, via: 'nonce', trace_id: traceId }, 200);
    }
    nonceHash = hash;
    // fire-and-forget: registra o nonce para futuras janelas de 5 min
    recordNonce(client, hash, provider);
  }
  void nonceHash;

  if (!workspaceId) {
    audit.routing_status = 'no_route';
    audit.routing_error = `Phone "${event.to_phone ?? 'unknown'}" not registered in workspace_secrets`;
    await writeAudit(client, audit);
    return new Response(
      JSON.stringify({ ok: true, message: 'Logged but no workspace matched', trace_id: traceId }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      },
    );
  }

  let agentId: string | null = null;
  try {
    agentId = await findAgentRoute(client, workspaceId, event.event_type);
  } catch (err) {
    audit.routing_status = 'failed';
    audit.routing_error = err instanceof Error ? err.message : String(err);
    await writeAudit(client, audit);
    return new Response(JSON.stringify({ error: 'Routing lookup failed', trace_id: traceId }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  if (!agentId) {
    audit.routing_status = 'no_route';
    audit.routing_error = `No agent_routing_config for event ${event.event_type}`;
    await writeAudit(client, audit);
    return new Response(
      JSON.stringify({ ok: true, message: `No agent for ${event.event_type}`, trace_id: traceId }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      },
    );
  }

  audit.routed_agent_id = agentId;
  audit.routing_status = 'routed';
  await writeAudit(client, audit);

  // Emit trace_event for MonitoringPage
  try {
    await (client.from('trace_events').insert as unknown as (row: unknown) => Promise<unknown>)({
      event_type: 'whatsapp_webhook',
      data: {
        trace_id: traceId,
        agent_id: agentId,
        workspace_id: workspaceId,
        provider,
        whatsapp_event_type: event.event_type,
        whatsapp_message_id: event.message_id,
        from_phone: event.from_phone,
        duration_ms: Date.now() - startTime,
        status: 'ok',
        spans: [
          {
            span_id: generateTraceId(),
            parent_span_id: null,
            trace_id: traceId,
            name: `whatsapp.${event.event_type}`,
            kind: 'http',
            start_time: startTime,
            end_time: Date.now(),
            duration_ms: Date.now() - startTime,
            status: 'ok',
            attributes: {
              'http.method': 'POST',
              'whatsapp.provider': provider,
              'whatsapp.event': event.event_type,
              'whatsapp.message_id': event.message_id,
              'whatsapp.from': event.from_phone,
            },
            events: [],
          },
        ],
      },
    });
  } catch (err) {
    console.error('trace_events insert failed', err);
  }

  return new Response(
    JSON.stringify({ ok: true, routed_to: agentId, provider, trace_id: traceId }),
    {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    },
  );
});
