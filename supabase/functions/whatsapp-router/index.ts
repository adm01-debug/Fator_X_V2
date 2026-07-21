/**
 * whatsapp-router — orquestra a resposta automática de mensagens WhatsApp
 * inbound. É invocada por um trigger AFTER INSERT em
 * openclaw_whatsapp_messages (via pg_net) e opera com service-role.
 *
 * Segurança: `verify_jwt=false`. Como o body só carrega `message_id`,
 * validamos que a mensagem existe, é `inbound`, foi criada há menos de
 * 5 minutos e que a instância tem `auto_reply=true` + `agent_id`. Sem
 * essas condições, ignora silenciosamente. Também aceita `X-Router-Token`
 * quando `WHATSAPP_ROUTER_TOKEN` estiver configurada (defense-in-depth).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsPreflight, getCorsHeaders } from '../_shared/cors.ts';
import { constantTimeEqual } from '../_shared/security.ts';
import { repairAlternation, type ChatTurn } from '../_shared/alternation.ts';
import { withRetry, fetchWithTimeout } from '../_shared/retry.ts';

const CONTEXT_TURNS = 10;
const MAX_INBOUND_AGE_MS = 5 * 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const expectedToken = (Deno.env.get('WHATSAPP_ROUTER_TOKEN') ?? '').trim();
  if (expectedToken) {
    const got = req.headers.get('x-router-token') ?? '';
    if (!got || !constantTimeEqual(got, expectedToken)) {
      return json(401, { error: 'invalid_router_token' });
    }
  }

  let body: { message_id?: string };
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }
  const messageId = body?.message_id;
  if (!messageId || typeof messageId !== 'string') {
    return json(400, { error: 'missing_message_id' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const emit = async (kind: string, level: 'info'|'warn'|'error', payload: Record<string, unknown>, workspaceId?: string) => {
    try {
      await supabase.from('openclaw_events').insert({
        workspace_id: workspaceId ?? null,
        kind, level, source: 'router', payload,
      });
    } catch { /* observability best-effort */ }
  };

  const { data: msg, error: msgErr } = await supabase
    .from('openclaw_whatsapp_messages')
    .select('id, workspace_id, instance_id, remote_phone, direction, body, created_at, handled_by')
    .eq('id', messageId)
    .maybeSingle();

  if (msgErr) return json(500, { error: 'msg_lookup_failed', detail: msgErr.message });
  if (!msg) return json(404, { error: 'message_not_found' });
  if (msg.direction !== 'inbound') return json(200, { ok: true, skipped: 'not_inbound' });
  if (msg.handled_by) return json(200, { ok: true, skipped: 'already_handled' });
  if (Date.now() - new Date(msg.created_at as string).getTime() > MAX_INBOUND_AGE_MS) {
    return json(200, { ok: true, skipped: 'stale' });
  }

  const { data: instance } = await supabase
    .from('openclaw_whatsapp_instances')
    .select('id, workspace_id, instance_name, agent_id, auto_reply')
    .eq('id', msg.instance_id)
    .maybeSingle();
  if (!instance || !instance.auto_reply || !instance.agent_id) {
    return json(200, { ok: true, skipped: 'auto_reply_off' });
  }

  // Contexto: últimos N turnos da mesma conversa (workspace + instance + phone).
  // Filtrar por instance_id evita cruzar conversas quando o mesmo número
  // fala com múltiplas instâncias do workspace.
  const { data: history } = await supabase
    .from('openclaw_whatsapp_messages')
    .select('direction, body, created_at')
    .eq('workspace_id', msg.workspace_id)
    .eq('instance_id', msg.instance_id)
    .eq('remote_phone', msg.remote_phone)
    .order('created_at', { ascending: false })
    .limit(CONTEXT_TURNS);
  const rawContext: ChatTurn[] = (history ?? []).reverse().map((h) => ({
    role: h.direction === 'inbound' ? 'user' : 'assistant',
    content: h.body ?? '',
  }));
  // repairAlternation elimina o bug clássico do WhatsApp em que várias
  // mensagens `user` chegam em sequência antes do assistant responder —
  // Anthropic/OpenAI/Gemini rejeitam sequências de roles repetidos.
  const context = repairAlternation(rawContext, { endWithUser: true });

  // Marca em processamento (evita corrida se dois routers dispararem)
  const { error: lockErr } = await supabase
    .from('openclaw_whatsapp_messages')
    .update({ handled_by: instance.agent_id, status: 'routing' })
    .eq('id', msg.id)
    .is('handled_by', null);
  if (lockErr) await emit('router_lock_failed', 'warn', { message_id: msg.id, err: lockErr.message }, msg.workspace_id as string);

  // Invoca o proxy internamente (chat)
  const proxyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/openclaw-proxy`;
  let replyText = '';
  try {
    const r = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        action: 'chat',
        payload: {
          agent_id: instance.agent_id,
          message: msg.body ?? '',
          context: { history: context, remote_phone: msg.remote_phone },
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const j = await r.json().catch(() => ({}));
    replyText = String(j?.data?.reply ?? j?.reply ?? '').trim();
    if (!r.ok || !replyText) {
      await emit('router_chat_failed', 'error', { status: r.status, body: j }, msg.workspace_id as string);
      await supabase.from('openclaw_whatsapp_messages')
        .update({ status: 'failed' }).eq('id', msg.id);
      return json(502, { error: 'chat_failed' });
    }
  } catch (e) {
    await emit('router_chat_exception', 'error', { err: e instanceof Error ? e.message : String(e) }, msg.workspace_id as string);
    return json(502, { error: 'chat_exception' });
  }

  // Persiste outbound
  const { data: outbound } = await supabase.from('openclaw_whatsapp_messages').insert({
    workspace_id: msg.workspace_id,
    instance_id: msg.instance_id,
    agent_id: instance.agent_id,
    remote_phone: msg.remote_phone,
    direction: 'outbound',
    body: replyText,
    status: 'sending',
    metadata: { reply_to: msg.id },
  }).select('id').maybeSingle();

  // Envia via proxy
  try {
    const r = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        action: 'whatsapp.send',
        payload: {
          instance_name: instance.instance_name,
          to: msg.remote_phone,
          body: replyText,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      await emit('router_send_failed', 'error', { status: r.status, body: j }, msg.workspace_id as string);
      if (outbound?.id) await supabase.from('openclaw_whatsapp_messages')
        .update({ status: 'failed' }).eq('id', outbound.id);
      return json(502, { error: 'send_failed' });
    }
    if (outbound?.id) await supabase.from('openclaw_whatsapp_messages')
      .update({ status: 'sent', external_message_id: j?.data?.message_id ?? null })
      .eq('id', outbound.id);
    await supabase.from('openclaw_whatsapp_messages')
      .update({ status: 'answered' }).eq('id', msg.id);
    await emit('router_replied', 'info', { message_id: msg.id, reply_id: outbound?.id }, msg.workspace_id as string);
    return json(200, { ok: true, reply_id: outbound?.id });
  } catch (e) {
    await emit('router_send_exception', 'error', { err: e instanceof Error ? e.message : String(e) }, msg.workspace_id as string);
    return json(502, { error: 'send_exception' });
  }
});
