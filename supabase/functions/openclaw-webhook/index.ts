/**
 * openclaw-webhook — recebe eventos do runtime OpenClaw (WhatsApp inbound,
 * status de instância, disconnects) com HMAC obrigatório e idempotência.
 *
 * Contrato do body (JSON):
 * {
 *   "event_id": "evt_...",           // dedupe key
 *   "type": "message.inbound" | "instance.status" | "instance.disconnected",
 *   "workspace_id": "uuid",
 *   "instance_name": "promo-brindes",
 *   "data": { ... }
 * }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsPreflight, getCorsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/security.ts';
import {
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
} from '../_shared/rate-limiter.ts';
import { OpenclawWebhookContracts } from '../_shared/contracts.ts';

/** Format Zod validation issues into the unified 422 body. */
function formatZodError(issues: { path: (string | number)[]; message: string; code: string }[]): {
  error: string;
  code: string;
  message: string;
  fields: { field: string; message: string; code: string }[];
} {
  return {
    error: 'Validation failed',
    code: 'VALIDATION_ERROR',
    message: 'The request payload is invalid.',
    fields: issues.map((i) => ({
      field: i.path.join('.') || '(root)',
      message: i.message,
      code: i.code,
    })),
  };
}

const WEBHOOK_LIMIT = { windowMs: 60_000, maxRequests: 300, name: 'openclaw-webhook' };

async function emitEvent(
  supabase: ReturnType<typeof createClient>,
  kind: string,
  level: 'info' | 'warn' | 'error',
  payload: Record<string, unknown>,
  workspaceId?: string | null,
) {
  try {
    await supabase.from('openclaw_events').insert({
      workspace_id: workspaceId ?? null,
      kind,
      level,
      source: 'webhook',
      payload,
    });
  } catch {
    /* best-effort */
  }
}

const MAX_BODY = 1024 * 1024; // 1MB

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // Rate limit por IP (defense-in-depth junto ao HMAC)
  const rl = checkRateLimit(getRateLimitIdentifier(req), WEBHOOK_LIMIT);
  if (!rl.allowed) return createRateLimitResponse(rl, corsHeaders);

  const secret = Deno.env.get('OPENCLAW_WEBHOOK_SECRET') ?? '';
  if (!secret) return json(500, { error: 'webhook_secret_not_configured' });

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY) return json(413, { error: 'payload_too_large' });

  const signature = req.headers.get('x-openclaw-signature') ?? '';
  if (!signature) return json(401, { error: 'missing_signature' });

  // Replay protection: x-openclaw-timestamp (unix ms) is MANDATORY, window ±5min.
  // Omitting the timestamp header is rejected to prevent replay attacks.
  const tsHeader = req.headers.get('x-openclaw-timestamp');
  if (!tsHeader) {
    return json(401, { error: 'missing_timestamp' });
  }
  const REPLAY_WINDOW_MS = 5 * 60 * 1000;
  const ts = Number(tsHeader);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    return json(401, { error: 'stale_or_invalid_timestamp' });
  }

  const supabaseAudit = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Assinatura cobre timestamp+body para prevenir replay com body reutilizado
  const signedPayload = `${tsHeader}.${rawBody}`;
  const valid = await verifyHmacSignature(signedPayload, signature, secret);
  if (!valid) {
    await emitEvent(supabaseAudit, 'hmac_invalid', 'warn', { ip: getRateLimitIdentifier(req) });
    return json(401, { error: 'invalid_signature' });
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const validation = OpenclawWebhookContracts.v2.safeParse(rawPayload);
  if (!validation.success) {
    return json(422, formatZodError(validation.error.issues));
  }
  const { event_id, type, workspace_id, instance_name, data } = validation.data;

  const supabase = supabaseAudit;

  // Dedupe atômico: INSERT + ON CONFLICT (source, external_event_id).
  // Elimina race condition do padrão check-then-insert.
  const { data: inserted, error: insertErr } = await supabase
    .from('webhook_events')
    .insert({
      source: 'openclaw',
      external_event_id: event_id,
      method: 'POST',
      headers: {},
      body: rawPayload as unknown as Record<string, unknown>,
      status: 'received',
      response_code: 200,
    })
    .select('id')
    .maybeSingle();

  if (insertErr) {
    // Código 23505 = unique_violation → duplicata legítima
    const code = (insertErr as { code?: string }).code;
    if (code === '23505') {
      await emitEvent(
        supabase,
        'webhook_deduped',
        'info',
        { event_id, source: 'openclaw' },
        workspace_id,
      );
      return json(200, { ok: true, deduped: true });
    }
    await emitEvent(
      supabase,
      'webhook_persist_error',
      'error',
      { event_id, message: insertErr.message },
      workspace_id,
    );
    return json(500, { error: 'persist_failed' });
  }
  if (!inserted) {
    return json(200, { ok: true, deduped: true });
  }

  // Localiza a instância WhatsApp
  const { data: instance } = await supabase
    .from('openclaw_whatsapp_instances')
    .select('id, workspace_id')
    .eq('workspace_id', workspace_id)
    .eq('instance_name', instance_name ?? '')
    .maybeSingle();

  if (type === 'message.inbound' && instance) {
    const d = (data ?? {}) as Record<string, unknown>;
    await supabase.from('openclaw_whatsapp_messages').insert({
      workspace_id,
      instance_id: instance.id,
      agent_id: (d.agent_id as string) ?? null,
      external_message_id: (d.message_id as string) ?? null,
      remote_phone: String(d.from ?? 'unknown'),
      direction: 'inbound',
      body: (d.body as string) ?? null,
      media_url: (d.media_url as string) ?? null,
      status: 'received',
      metadata: d,
    });
  } else if (type === 'instance.status' && instance) {
    const d = (data ?? {}) as Record<string, unknown>;
    await supabase
      .from('openclaw_whatsapp_instances')
      .update({
        status: (d.status as string) ?? 'connected',
        phone_number: (d.phone_number as string) ?? null,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', instance.id);
  } else if (type === 'instance.disconnected' && instance) {
    await supabase
      .from('openclaw_whatsapp_instances')
      .update({ status: 'disconnected', last_seen_at: new Date().toISOString() })
      .eq('id', instance.id);
  }

  await emitEvent(supabase, `received:${type}`, 'info', { event_id, instance_name }, workspace_id);
  return json(200, { ok: true, event_id });
});
