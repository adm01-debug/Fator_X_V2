/**
 * ═══════════════════════════════════════════════════════════════
 * Nexus Agents Studio — Widget Proxy
 * ═══════════════════════════════════════════════════════════════
 * Widget de chat embutível em site de cliente (sem login).
 *   GET  /widget-proxy/widget/{agent_id}.js → script que desenha o chat (lê window.NEXUS_WIDGET_CONFIG)
 *   POST /widget-proxy/chat                 → { agent_id, message, session_id? } → { response, session_id }
 * Acesso ao chat: agente em produção/monitoramento (público), ou x-api-key ativa do mesmo workspace,
 * ou usuário logado membro do workspace (teste no painel). Deploy com verify_jwt=false (config.toml).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  checkRateLimit,
  createAdminClient,
  createRateLimitResponse,
  getRateLimitIdentifier,
  RATE_LIMITS,
  validateApiKey,
  validateWorkspaceMembership,
} from '../_shared/mod.ts';
import { AI_API_KEY_ENV, AI_CHAT_COMPLETIONS_URL, aiModel } from '../_shared/ai-provider.ts';
import { fetchWithTimeout } from '../_shared/retry.ts';

// Widget roda em domínio de cliente: CORS aberto, sem cookies/credenciais.
const WIDGET_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-api-key, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const PUBLIC_STATUSES = new Set(['production', 'monitoring']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ChatInputSchema = z.object({
  message: z.string().min(1).max(8000),
  agent_id: z.string().uuid(),
  session_id: z.string().min(1).max(100).optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...WIDGET_CORS, 'Content-Type': 'application/json' },
  });
}

function widgetScript(agentId: string, chatUrl: string): string {
  return `(function(){
  if (window.__nexusWidget_${agentId.replace(/-/g, '')}) return;
  window.__nexusWidget_${agentId.replace(/-/g, '')} = true;
  var C = window.NEXUS_WIDGET_CONFIG || {};
  var T = C.theme || {};
  var from = T.from || '#4D96FF', to = T.to || '#6BCB77';
  var left = C.position === 'bottom-left';
  var side = left ? 'left:20px;' : 'right:20px;';
  var KEY = 'nexus-widget-session-${agentId}';
  var sid = null; try { sid = sessionStorage.getItem(KEY); } catch (e) { sid = null; }
  function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text) e.textContent = text; return e; }
  var btn = el('button', 'position:fixed;bottom:20px;' + side + 'width:56px;height:56px;border-radius:28px;border:none;cursor:pointer;z-index:100000;font-size:24px;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.25);background:linear-gradient(135deg,' + from + ',' + to + ')', C.emoji || '💬');
  btn.setAttribute('aria-label', 'Abrir chat');
  var panel = el('div', 'position:fixed;bottom:88px;' + side + 'width:360px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 120px);display:none;flex-direction:column;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.25);z-index:99999;overflow:hidden;font:14px system-ui,sans-serif;color:#111');
  var head = el('div', 'padding:14px 16px;color:#fff;background:linear-gradient(135deg,' + from + ',' + to + ')');
  head.appendChild(el('div', 'font-weight:600', C.title || 'Assistente'));
  if (C.subtitle) head.appendChild(el('div', 'font-size:12px;opacity:.9', C.subtitle));
  var list = el('div', 'flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f7f7f8');
  var form = el('form', 'display:flex;gap:8px;padding:10px;border-top:1px solid #eee');
  var input = el('input', 'flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font:inherit');
  input.placeholder = 'Digite sua mensagem…'; input.maxLength = 8000;
  var send = el('button', 'padding:0 14px;border:none;border-radius:8px;color:#fff;cursor:pointer;background:' + from, 'Enviar');
  form.appendChild(input); form.appendChild(send);
  panel.appendChild(head); panel.appendChild(list); panel.appendChild(form);
  function add(text, mine) {
    var b = el('div', 'max-width:85%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;word-break:break-word;' + (mine ? 'align-self:flex-end;color:#fff;background:' + from : 'align-self:flex-start;background:#fff;border:1px solid #eee'), text);
    list.appendChild(b); list.scrollTop = list.scrollHeight; return b;
  }
  if (C.greeting) add(C.greeting, false);
  btn.onclick = function () { panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex'; if (panel.style.display === 'flex') input.focus(); };
  form.onsubmit = function (ev) {
    ev.preventDefault();
    var msg = input.value.trim(); if (!msg) return;
    input.value = ''; add(msg, true); send.disabled = true;
    var wait = add('…', false);
    fetch(${JSON.stringify(chatUrl)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: ${JSON.stringify(agentId)}, message: msg, session_id: sid || undefined }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (x.d && x.d.session_id) { sid = x.d.session_id; try { sessionStorage.setItem(KEY, sid); } catch (e) { void e; } }
        wait.textContent = x.ok ? (x.d.response || 'Sem resposta') : 'Não foi possível responder agora.';
      })
      .catch(function () { wait.textContent = 'Falha de conexão. Tente novamente.'; })
      .then(function () { send.disabled = false; });
  };
  function mount() { document.body.appendChild(panel); document.body.appendChild(btn); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: WIDGET_CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*?\/widget-proxy\/?/, '/');

  // Script do widget
  const jsMatch = req.method === 'GET' ? path.match(/^\/widget\/([0-9a-fA-F-]{36})\.js$/) : null;
  if (jsMatch && UUID_RE.test(jsMatch[1])) {
    const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
    const chatUrl = `${base}/functions/v1/widget-proxy/chat`;
    return new Response(widgetScript(jsMatch[1].toLowerCase(), chatUrl), {
      headers: {
        ...WIDGET_CORS,
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  // Chat
  if (req.method === 'POST' && path === '/chat') {
    const rateCheck = checkRateLimit(getRateLimitIdentifier(req), RATE_LIMITS.standard);
    if (!rateCheck.allowed) return createRateLimitResponse(rateCheck, WIDGET_CORS);

    try {
      const parsed = ChatInputSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return json({ error: 'Payload inválido' }, 400);
      const { message, agent_id } = parsed.data;
      const sessionId = parsed.data.session_id ?? crypto.randomUUID();

      const admin = createAdminClient();
      const { data: agent } = await admin
        .from('agents')
        .select('id, name, status, model, config, workspace_id')
        .eq('id', agent_id)
        .maybeSingle();
      if (!agent) return json({ error: 'Agente não encontrado' }, 404);

      let allowed = PUBLIC_STATUSES.has(String(agent.status));
      if (!allowed) {
        const key = await validateApiKey(req);
        allowed =
          key.valid &&
          key.workspaceId === agent.workspace_id &&
          (!key.agentId || key.agentId === agent.id);
      }
      if (!allowed) {
        const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
        if (token) {
          const { data: u } = await admin.auth.getUser(token);
          if (u?.user && agent.workspace_id) {
            allowed = await validateWorkspaceMembership(admin, u.user.id, agent.workspace_id);
          }
        }
      }
      if (!allowed) return json({ error: 'Agente não publicado' }, 403);

      const aiKey = Deno.env.get(AI_API_KEY_ENV);
      if (!aiKey) return json({ error: 'IA não configurada' }, 503);

      const config = (agent.config ?? {}) as Record<string, unknown>;
      const systemPrompt =
        typeof config.system_prompt === 'string' && config.system_prompt
          ? config.system_prompt
          : `Você é ${agent.name ?? 'um assistente'}. Responda em português, de forma clara e objetiva.`;

      const resp = await fetchWithTimeout(AI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        timeoutMs: 60_000,
        headers: { Authorization: `Bearer ${aiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: aiModel(agent.model),
          max_tokens: 1024,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
        }),
      });
      if (!resp.ok) {
        console.error('widget-proxy ai error:', resp.status, (await resp.text()).slice(0, 300));
        return json({ error: 'Falha ao gerar resposta' }, 502);
      }
      const data = await resp.json();
      const answer = data?.choices?.[0]?.message?.content;
      return json({ response: typeof answer === 'string' && answer ? answer : 'Sem resposta', session_id: sessionId });
    } catch (error) {
      console.error('widget-proxy error:', error);
      return json({ error: 'Chat failed' }, 500);
    }
  }

  return json({ error: 'Not found' }, 404);
});
