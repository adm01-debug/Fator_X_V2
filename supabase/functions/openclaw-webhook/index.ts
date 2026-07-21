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
import { verifyHmacSignature, constantTimeEqual } from '../_shared/security.ts';

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

  const secret = Deno.env.get('OPENCLAW_WEBHOOK_SECRET') ?? '';
  if (!secret) return json(500, { error: 'webhook_secret_not_configured' });

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY) return json(413, { error: 'payload_too_large' });

  const signature = req.headers.get('x-openclaw-signature') ?? '';
  if (!signature) return json(401, { error: 'missing_signature' });

  const valid = await verifyHmacSignature(rawBody, signature, secret);
  if (!valid) return json(401, { error: 'invalid_signature' });

  let payload: {
    event_id?: string;
    type?: string;
    workspace_id?: string;
    instance_name?: string;
    data?: Record<string, unknown>;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const { event_id, type, workspace_id, instance_name, data } = payload;
  if (!event_id || !type || !workspace_id) {
    return json(400, { error: 'missing_required_fields' });
  }

  // Guard extra contra falsificação de tipos primitivos
  if (typeof event_id !== 'string' || !constantTimeEqual(event_id.slice(0, 3), event_id.slice(0, 3))) {
    return json(400, { error: 'invalid_event_id' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Dedupe: procura evento pelo external_event_id
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('external_event_id', event_id)
    .maybeSingle();
  if (existing) return json(200, { ok: true, deduped: true });

  // Localiza a instância WhatsApp
  const { data: instance } = await supabase
    .from('openclaw_whatsapp_instances')
    .select('id, workspace_id')
    .eq('workspace_id', workspace_id)
    .eq('instance_name', instance_name ?? '')
    .maybeSingle();

  // Registra o evento (idempotência)
  await supabase.from('webhook_events').insert({
    external_event_id: event_id,
    method: 'POST',
    headers: {},
    body: payload as unknown as Record<string, unknown>,
    status: 'received',
    response_code: 200,
  });

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

  return json(200, { ok: true, event_id });
});
