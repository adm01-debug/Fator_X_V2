import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCorsPreflight, getCorsHeaders, getRateLimitIdentifier, checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/mod.ts";

// ============================================================
// Circuit Breaker (in-memory, isolate-scoped)
// ============================================================
type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
const BREAKER = {
  state: 'CLOSED' as BreakerState,
  failures: [] as number[],   // timestamps
  openedAt: 0,
  window: 30_000,
  threshold: 5,
  cooldown: 60_000,
};

function breakerAllow(): boolean {
  const now = Date.now();
  if (BREAKER.state === 'OPEN') {
    if (now - BREAKER.openedAt >= BREAKER.cooldown) {
      BREAKER.state = 'HALF_OPEN';
      return true;
    }
    return false;
  }
  return true;
}
function breakerOnSuccess() {
  BREAKER.failures = [];
  BREAKER.state = 'CLOSED';
}
function breakerOnFailure(): boolean {
  const now = Date.now();
  BREAKER.failures = BREAKER.failures.filter(t => now - t < BREAKER.window);
  BREAKER.failures.push(now);
  if (BREAKER.state === 'HALF_OPEN' || BREAKER.failures.length >= BREAKER.threshold) {
    BREAKER.state = 'OPEN';
    BREAKER.openedAt = now;
    return true; // opened
  }
  return false;
}

// Emissão de eventos (best-effort, service-role)
async function emitEvent(kind: string, level: 'info'|'warn'|'error', payload: Record<string, unknown>) {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return;
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    await supabase.from('openclaw_events').insert({ kind, level, source: 'proxy', payload });
  } catch { /* ignore */ }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  const corsHeaders = getCorsHeaders(req);

  const identifier = getRateLimitIdentifier(req);
  const rateCheck = checkRateLimit(identifier, RATE_LIMITS.standard);
  if (!rateCheck.allowed) return createRateLimitResponse(rateCheck, corsHeaders);

  try {
    const rawUrl = (Deno.env.get('OPENCLAW_URL') ?? '').trim();
    const openclawToken = (Deno.env.get('OPENCLAW_API_TOKEN') ?? '').trim();

    const urlValid = /^https?:\/\/[^\s]+$/i.test(rawUrl);
    if (!rawUrl || !urlValid) {
      return new Response(
        JSON.stringify({
          error: 'invalid_openclaw_url',
          message: !rawUrl
            ? 'Secret OPENCLAW_URL não configurada.'
            : `OPENCLAW_URL inválida ("${rawUrl}"): deve começar com http:// ou https://.`,
          hint: 'Atualize a secret OPENCLAW_URL em Backend → Secrets (ex.: https://openclaw.exemplo.com).',
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!openclawToken) {
      return new Response(
        JSON.stringify({
          error: 'missing_openclaw_token',
          message: 'Secret OPENCLAW_API_TOKEN não configurada.',
          hint: 'Defina OPENCLAW_API_TOKEN em Backend → Secrets.',
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!breakerAllow()) {
      return new Response(
        JSON.stringify({ error: 'circuit_open', message: 'OpenClaw upstream em cooldown (circuit breaker).' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openclawUrl = rawUrl.replace(/\/+$/, '');
    const body = await req.json().catch(() => ({}));
    const { action, payload } = body as { action?: string; payload?: Record<string, unknown> };

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Missing action parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const endpoints: Record<string, { method: string; path: string }> = {
      'health':          { method: 'GET',  path: '/api/health' },
      'chat':            { method: 'POST', path: '/api/v1/chat' },
      'agents':          { method: 'GET',  path: '/api/v1/agents' },
      'agent.create':    { method: 'POST', path: '/api/v1/agents' },
      'agent.update':    { method: 'PUT',  path: `/api/v1/agents/${payload?.agent_id ?? ''}` },
      'agent.delete':    { method: 'DELETE', path: `/api/v1/agents/${payload?.agent_id ?? ''}` },
      'agent.publish':   { method: 'POST', path: '/api/v1/agents/publish' },
      'skills':          { method: 'GET',  path: '/api/v1/skills' },
      'skill.deploy':    { method: 'POST', path: '/api/v1/skills' },
      'whatsapp.pair':   { method: 'POST', path: '/api/v1/whatsapp/pair' },
      'whatsapp.status': { method: 'GET',  path: `/api/v1/whatsapp/status/${payload?.instance_name ?? ''}` },
      'whatsapp.send':   { method: 'POST', path: '/api/v1/whatsapp/send' },
    };

    const endpoint = endpoints[action];
    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}`, available: Object.keys(endpoints) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fetchOptions: RequestInit = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openclawToken}`,
      },
      signal: AbortSignal.timeout(30000),
    };

    if (['POST', 'PUT', 'PATCH'].includes(endpoint.method) && payload) {
      fetchOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(`${openclawUrl}${endpoint.path}`, fetchOptions);
    const data = await response.json().catch(async () => ({ raw: await response.text() }));

    if (response.ok) {
      breakerOnSuccess();
    } else if (response.status >= 500) {
      const opened = breakerOnFailure();
      if (opened) await emitEvent('breaker_open', 'error', { action, status: response.status });
      else await emitEvent('upstream_error', 'warn', { action, status: response.status });
    }

    return new Response(
      JSON.stringify({
        success: response.ok,
        status: response.status,
        action,
        data,
      }),
      {
        status: response.ok ? 200 : response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    const opened = breakerOnFailure();
    if (opened) await emitEvent('breaker_open', 'error', { reason: isTimeout ? 'timeout' : 'exception' });
    else await emitEvent(isTimeout ? 'upstream_timeout' : 'upstream_exception', 'error', {
      message: error instanceof Error ? error.message : 'Proxy error',
    });
    return new Response(
      JSON.stringify({
        error: isTimeout ? 'OpenClaw request timed out (30s)' : (error instanceof Error ? error.message : 'Proxy error'),
        hint: 'Verify OpenClaw is running: ssh root@187.77.151.129 "cd /docker/openclaw-sbem && docker compose ps"',
      }),
      { status: isTimeout ? 504 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
