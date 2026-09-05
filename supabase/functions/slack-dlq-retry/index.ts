/**
 * slack-dlq-retry
 * Cron-invoked. Reprocessa itens pendentes de slack_dispatch_dlq com backoff.
 * Fase 7: erros permanentes são curto-circuitados (attempts=MAX_ATTEMPTS) para drenar rápido.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import {
  getCorsHeaders,
  handleCorsPreflight,
  jsonResponse,
  errorResponse,
} from '../_shared/cors.ts';
import {
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
  RATE_LIMITS,
  requireEnv,
} from '../_shared/mod.ts';
import { slackApiCall } from '../_shared/slack.ts';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

/**
 * Erros permanentes do Slack — não faz sentido retentar.
 * Fonte: https://api.slack.com/methods/chat.postMessage#errors
 */
const PERMANENT_ERRORS = new Set([
  'channel_not_found',
  'not_in_channel',
  'is_archived',
  'invalid_auth',
  'token_revoked',
  'token_expired',
  'account_inactive',
  'no_permission',
  'restricted_action',
  'msg_too_long',
  'no_text',
  'invalid_blocks',
  'invalid_blocks_format',
  'team_access_not_granted',
  'not_authed',
]);

function isPermanent(errMsg: string): boolean {
  for (const code of PERMANENT_ERRORS) {
    if (errMsg.includes(code)) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.standard);
  if (!rate.allowed) return createRateLimitResponse(rate, getCorsHeaders(req));
  if (req.method !== 'POST') return errorResponse(req, 'Method not allowed', 405);

  const supabase = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: pending, error } = await supabase
    .from('slack_dispatch_dlq')
    .select('id, workspace_id, alert_id, payload, attempts')
    .is('resolved_at', null)
    .lte('next_retry_at', new Date().toISOString())
    .lt('attempts', MAX_ATTEMPTS)
    .order('next_retry_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) return errorResponse(req, 'Failed to load DLQ', 500, { details: error.message });
  if (!pending || pending.length === 0) return jsonResponse(req, { processed: 0 });

  let resolved = 0;
  let stillFailing = 0;
  let deadPermanent = 0;

  for (const item of pending) {
    try {
      const resp = await slackApiCall('chat.postMessage', item.payload as Record<string, unknown>);
      if (resp.ok) {
        await supabase
          .from('slack_dispatch_dlq')
          .update({ resolved_at: new Date().toISOString() })
          .eq('id', item.id);
        resolved++;
      } else {
        throw new Error(resp.error ?? 'unknown');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const permanent = isPermanent(errMsg);
      const attempts = permanent ? MAX_ATTEMPTS : (item.attempts ?? 1) + 1;
      const backoffMin = Math.min(60, 5 * Math.pow(2, attempts - 1));
      await supabase
        .from('slack_dispatch_dlq')
        .update({
          attempts,
          error: permanent ? `permanent:${errMsg}` : errMsg,
          next_retry_at: permanent
            ? new Date().toISOString()
            : new Date(Date.now() + backoffMin * 60_000).toISOString(),
        })
        .eq('id', item.id);
      if (permanent) deadPermanent++;
      else stillFailing++;
    }
  }

  return jsonResponse(req, {
    processed: pending.length,
    resolved,
    still_failing: stillFailing,
    dead_permanent: deadPermanent,
  });
});
