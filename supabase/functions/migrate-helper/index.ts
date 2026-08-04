import { getCorsHeaders, handleCorsPreflight } from '../_shared/mod.ts';
import {
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
  RATE_LIMITS,
} from '../_shared/mod.ts';

Deno.serve((req: Request): Response | Promise<Response> => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  const identifier = getRateLimitIdentifier(req);
  const rate = checkRateLimit(identifier, RATE_LIMITS.light);
  if (!rate.allowed) return createRateLimitResponse(rate, corsHeaders);

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const action = new URL(req.url).searchParams.get('action') ?? 'ping';
  if (action !== 'ping') {
    return new Response(JSON.stringify({ error: 'unknown_action' }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  return new Response(JSON.stringify({ ok: true, function: 'migrate-helper' }), {
    status: 200,
    headers: jsonHeaders,
  });
});
