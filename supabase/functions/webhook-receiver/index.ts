import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  handleCorsPreflight,
  getCorsHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
  createRateLimitResponse,
  RATE_LIMITS,
  createAdminClient,
  jsonResponse,
  errorResponse,
  parseBody,
} from '../_shared/mod.ts';
import { WebhookReceiverContracts } from '../_shared/contracts.ts';
import { verifyHmac } from '../_shared/webhookSignature.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  const corsHeaders = getCorsHeaders(req);

  const identifier = getRateLimitIdentifier(req);
  const rateLimit = await checkRateLimit(identifier, RATE_LIMITS.standard);
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit, corsHeaders);

  try {
    const url = new URL(req.url);
    const webhookPath = url.searchParams.get('path');

    if (!webhookPath) {
      return errorResponse(req, 'Missing webhook path parameter', 400);
    }

    const supabase = createAdminClient();

    // Find webhook endpoint
    const { data: webhook, error: fetchError } = await supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('path', webhookPath)
      .eq('status', 'active')
      .single();

    if (fetchError || !webhook) {
      return errorResponse(req, 'Webhook not found or inactive', 404);
    }

    // Verify method
    if (!webhook.methods.includes(req.method)) {
      return errorResponse(req, `Method ${req.method} not allowed`, 405);
    }

    // Parse body with versioned contract validation
    const {
      data: body,
      error: validationError,
      rawBody,
      _version,
    } = await parseBody(req, WebhookReceiverContracts, {
      returnRawBody: true,
      defaultVersion: 'v1',
    });

    if (validationError) {
      return validationError;
    }

    // Parse query params
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      if (k !== 'path') queryParams[k] = v;
    });

    // Get headers
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      headers[k] = v;
    });

    // IP check
    const sourceIp = headers['x-forwarded-for']?.split(',')[0] || headers['x-real-ip'] || 'unknown';
    if (webhook.ip_whitelist && webhook.ip_whitelist.length > 0) {
      if (!webhook.ip_whitelist.includes(sourceIp)) {
        await logEvent(
          supabase,
          webhook.id,
          req.method,
          headers,
          queryParams,
          body,
          sourceIp,
          'rejected',
          403,
        );
        return errorResponse(req, 'IP not whitelisted', 403);
      }
    }

    // Auth verification (HMAC is mandatory for 10/10 if configured)
    if (webhook.auth_type === 'hmac_sha256') {
      const signature = headers['x-hub-signature-256'] || headers['x-signature'] || '';
      if (!signature || !webhook.secret) {
        await logEvent(
          supabase,
          webhook.id,
          req.method,
          headers,
          queryParams,
          body,
          sourceIp,
          'rejected',
          401,
        );
        return errorResponse(req, 'Missing signature or secret', 401);
      }
      const valid = await verifyHmac(webhook.secret, rawBody, signature);
      if (!valid) {
        await logEvent(
          supabase,
          webhook.id,
          req.method,
          headers,
          queryParams,
          body,
          sourceIp,
          'rejected',
          401,
        );
        return errorResponse(req, 'Invalid signature', 401);
      }
    } else if (webhook.auth_type === 'bearer') {
      const authHeader = headers['authorization'] || '';
      const token = authHeader.replace('Bearer ', '');
      if (!token || token !== webhook.secret) {
        await logEvent(
          supabase,
          webhook.id,
          req.method,
          headers,
          queryParams,
          body,
          sourceIp,
          'rejected',
          401,
        );
        return errorResponse(req, 'Invalid bearer token', 401);
      }
    } else if (webhook.auth_type === 'api_key') {
      const apiKey = headers['x-api-key'] || url.searchParams.get('api_key') || '';
      if (!apiKey || apiKey !== webhook.secret) {
        await logEvent(
          supabase,
          webhook.id,
          req.method,
          headers,
          queryParams,
          body,
          sourceIp,
          'rejected',
          401,
        );
        return errorResponse(req, 'Invalid API key', 401);
      }
    } else {
      // For 10/10 security, reject any webhook without auth_type if not public
      if (!webhook.is_public) {
        await logEvent(
          supabase,
          webhook.id,
          req.method,
          headers,
          queryParams,
          body,
          sourceIp,
          'rejected',
          401,
        );
        return errorResponse(req, 'Authentication required', 401);
      }
    }

    // Dedupe: se o provedor enviou um event id conhecido, ignora duplicatas.
    const externalEventId =
      headers['x-github-delivery'] ||
      headers['x-event-id'] ||
      headers['x-request-id'] ||
      headers['x-idempotency-key'] ||
      (typeof body === 'object' && body !== null
        ? ((body as Record<string, unknown>).id as string | undefined)
        : undefined) ||
      null;

    if (externalEventId) {
      const { data: existing } = await supabase
        .from('webhook_events')
        .select('id')
        .eq('webhook_id', webhook.id)
        .eq('external_event_id', externalEventId)
        .maybeSingle();
      if (existing) {
        return jsonResponse(req, { success: true, deduped: true, webhook_id: webhook.id });
      }
    }

    // Log event
    const startTime = Date.now();
    await logEvent(
      supabase,
      webhook.id,
      req.method,
      headers,
      queryParams,
      body,
      sourceIp,
      'processed',
      200,
      externalEventId,
    );

    // Update counter
    await supabase.rpc('increment_webhook_counter', { webhook_uuid: webhook.id });

    const processingTime = Date.now() - startTime;

    return jsonResponse(req, {
      success: true,
      webhook_id: webhook.id,
      processing_time_ms: processingTime,
      target: { type: webhook.target_type, id: webhook.target_id },
    });
  } catch (error) {
    return errorResponse(req, error instanceof Error ? error.message : 'Internal error', 500);
  }
});

async function logEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
  supabase: any,
  webhookId: string,
  method: string,
  headers: Record<string, string>,
  queryParams: Record<string, string>,
  body: Record<string, unknown>,
  sourceIp: string,
  status: string,
  responseCode: number,
  externalEventId: string | null = null,
) {
  await supabase.from('webhook_events').insert({
    webhook_id: webhookId,
    method,
    headers,
    query_params: queryParams,
    body,
    source_ip: sourceIp,
    status,
    response_code: responseCode,
    external_event_id: externalEventId,
  });
}
