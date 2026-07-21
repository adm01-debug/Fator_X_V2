import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCorsPreflight, getCorsHeaders, getRateLimitIdentifier, checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/mod.ts";
import { getBreaker } from "../_shared/circuitBreaker.ts";
import { withRetry, fetchWithTimeout } from "../_shared/retry.ts";
import { checkIdempotency, saveIdempotency } from "../_shared/idempotency.ts";

// Ações mutativas que exigem idempotência
const MUTATING_ACTIONS = new Set(['whatsapp.send', 'agent.publish', 'agent.create', 'agent.update', 'agent.delete', 'skill.deploy', 'whatsapp.pair']);

// Emissão de eventos (best-effort, service-role)
function makeAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
async function emitEvent(kind: string, level: 'info'|'warn'|'error', payload: Record<string, unknown>, workspaceId?: string | null) {
  try {
    const supabase = makeAdmin();
    if (!supabase) return;
    await supabase.from('openclaw_events').insert({ workspace_id: workspaceId ?? null, kind, level, source: 'proxy', payload });
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
          hint: 'Atualize a secret OPENCLAW_URL em Backend → Secrets.',
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!openclawToken) {
      return new Response(
        JSON.stringify({ error: 'missing_openclaw_token', message: 'Secret OPENCLAW_API_TOKEN não configurada.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Workspace scoping para circuit breaker (isolamento multi-tenant)
    const workspaceId = (payload?.workspace_id as string) ?? req.headers.get('x-workspace-id') ?? 'global';
    const breaker = getBreaker(`openclaw:${workspaceId}`, { failureThreshold: 5, openMs: 60_000, halfOpenMax: 2 });

    if (!breaker.canRequest()) {
      await emitEvent('breaker_reject', 'warn', { action, workspace_id: workspaceId }, workspaceId);
      return new Response(
        JSON.stringify({ error: 'circuit_open', message: 'OpenClaw upstream em cooldown (circuit breaker por workspace).', workspace_id: workspaceId }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Idempotência para ações mutativas
    const idempotencyKey = req.headers.get('idempotency-key') ?? req.headers.get('x-idempotency-key') ?? '';
    const admin = makeAdmin();
    if (MUTATING_ACTIONS.has(action) && idempotencyKey && admin) {
      const scoped = `openclaw:${workspaceId}:${action}:${idempotencyKey}`;
      const check = await checkIdempotency(scoped, admin);
      if (check.isDuplicate && check.response) {
        const cloned = check.response;
        return new Response(await cloned.text(), {
          status: cloned.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Idempotency-Cache': 'hit' },
        });
      }
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

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openclawToken}`,
    };
    if (idempotencyKey && MUTATING_ACTIONS.has(action)) {
      requestHeaders['Idempotency-Key'] = idempotencyKey;
    }

    // Retry apenas para GETs (safe) e ações não-mutativas; mutativas com idempotency-key também podem retry
    const canRetry = endpoint.method === 'GET' || (MUTATING_ACTIONS.has(action) && !!idempotencyKey);
    const attempts = canRetry ? 3 : 1;

    const response = await withRetry(() => fetchWithTimeout(`${openclawUrl}${endpoint.path}`, {
      method: endpoint.method,
      headers: requestHeaders,
      body: ['POST', 'PUT', 'PATCH'].includes(endpoint.method) && payload ? JSON.stringify(payload) : undefined,
      timeoutMs: 30_000,
    }), {
      attempts, baseMs: 400, capMs: 4_000,
      onRetry: (info) => emitEvent('upstream_retry', 'warn', { action, attempt: info.attempt, delay_ms: info.delayMs, status: info.res?.status }, workspaceId),
    });

    const data = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));

    if (response.ok) {
      breaker.recordSuccess();
    } else if (response.status >= 500) {
      breaker.recordFailure(`upstream_${response.status}`);
      const snap = breaker.snapshot();
      if (snap.state === 'open') await emitEvent('breaker_open', 'error', { action, status: response.status, workspace_id: workspaceId }, workspaceId);
      else await emitEvent('upstream_error', 'warn', { action, status: response.status, workspace_id: workspaceId }, workspaceId);
    }

    const responseBody = { success: response.ok, status: response.status, action, data };

    // Salva idempotência (only 2xx para evitar cache de falhas transitórias)
    if (MUTATING_ACTIONS.has(action) && idempotencyKey && admin && response.ok) {
      const scoped = `openclaw:${workspaceId}:${action}:${idempotencyKey}`;
      await saveIdempotency(scoped, response.status, responseBody, admin);
    }

    return new Response(JSON.stringify(responseBody), {
      status: response.ok ? 200 : response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    const workspaceId = (req.headers.get('x-workspace-id')) ?? 'global';
    const breaker = getBreaker(`openclaw:${workspaceId}`);
    breaker.recordFailure(error);
    const snap = breaker.snapshot();
    if (snap.state === 'open') await emitEvent('breaker_open', 'error', { reason: isTimeout ? 'timeout' : 'exception', workspace_id: workspaceId }, workspaceId);
    else await emitEvent(isTimeout ? 'upstream_timeout' : 'upstream_exception', 'error', { message: error instanceof Error ? error.message : 'Proxy error', workspace_id: workspaceId }, workspaceId);
    return new Response(
      JSON.stringify({
        error: isTimeout ? 'OpenClaw request timed out (30s)' : (error instanceof Error ? error.message : 'Proxy error'),
      }),
      { status: isTimeout ? 504 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
