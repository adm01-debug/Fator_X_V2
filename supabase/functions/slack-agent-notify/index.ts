/**
 * slack-agent-notify
 *
 * Fired at the end of agent/graph/eval executions (via pg_net.http_post from server
 * code or triggers) to notify Slack channels about agent runs.
 *
 * Payload:
 *   {
 *     agent_id: uuid,
 *     workspace_id: uuid,
 *     status: 'success' | 'failure',
 *     duration_ms?: number,
 *     cost_usd?: number,
 *     trace_id?: string,
 *     agent_name?: string,
 *     error?: string
 *   }
 */

import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { z } from 'npm:zod@3.23.8';
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
import { slackApiCall, buildAlertPayload } from '../_shared/slack.ts';

const PayloadSchema = z.object({
  agent_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  status: z.enum(['success', 'failure']),
  duration_ms: z.number().int().nonnegative().optional(),
  cost_usd: z.number().nonnegative().optional(),
  trace_id: z.string().optional(),
  agent_name: z.string().max(300).optional(),
  error: z.string().max(2000).optional(),
});

const DEFAULT_TEMPLATE =
  '*{{agent_name}}* finalizou com status *{{status}}*.\n' +
  'Duração: {{duration_ms}} ms · Custo: US$ {{cost_usd}}\n' +
  '{{trace_url}}';

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.heavy);
  if (!rate.allowed) return createRateLimitResponse(rate, getCorsHeaders(req));
  if (req.method !== 'POST') return errorResponse(req, 'Method not allowed', 405);

  let payload: z.infer<typeof PayloadSchema>;
  try {
    payload = PayloadSchema.parse(await req.json());
  } catch (err) {
    return errorResponse(req, 'Invalid payload', 400, {
      details: err instanceof z.ZodError ? err.flatten() : String(err),
    });
  }

  if (!requireEnv('SLACK_BOT_TOKEN')) {
    return errorResponse(req, 'SLACK_BOT_TOKEN não configurado', 503);
  }

  const supabase = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: rules, error: rulesErr } = await supabase
    .from('slack_agent_notifications')
    .select('id, channel_id, channel_name, notify_on, template, enabled')
    .eq('workspace_id', payload.workspace_id)
    .eq('agent_id', payload.agent_id)
    .eq('enabled', true);

  if (rulesErr) {
    console.error('slack-agent-notify rules query failed', rulesErr);
    return errorResponse(req, 'Failed to load rules', 500);
  }

  if (!rules || rules.length === 0) {
    return jsonResponse(req, { skipped: true, reason: 'no_rules' });
  }

  const vars: Record<string, string> = {
    agent_name: payload.agent_name ?? payload.agent_id.slice(0, 8),
    status: payload.status,
    duration_ms: String(payload.duration_ms ?? 0),
    cost_usd: (payload.cost_usd ?? 0).toFixed(4),
    trace_url: payload.trace_id
      ? `https://nexus.promobrindes.com.br/traces/${payload.trace_id}`
      : '',
    error: payload.error ?? '',
  };

  const results: Array<{ channel: string; ok: boolean; error?: string }> = [];

  for (const rule of rules) {
    if (rule.notify_on !== 'both' && rule.notify_on !== payload.status) {
      continue;
    }
    const description = renderTemplate(rule.template || DEFAULT_TEMPLATE, vars);
    const severity: 'info' | 'error' = payload.status === 'success' ? 'info' : 'error';

    const msg = buildAlertPayload(rule.channel_id, {
      title: `Agente ${vars.agent_name} — ${payload.status.toUpperCase()}`,
      description,
      severity,
      event_type: 'agent_execution',
      actionUrl: vars.trace_url || undefined,
      actionLabel: 'Ver trace',
    });

    try {
      const resp = await slackApiCall('chat.postMessage', msg);
      results.push({
        channel: rule.channel_id,
        ok: resp.ok,
        error: resp.ok ? undefined : resp.error,
      });
    } catch (err) {
      results.push({
        channel: rule.channel_id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await supabase.from('audit_events').insert({
    workspace_id: payload.workspace_id,
    event_type: 'slack_integration',
    action: 'agent_notified',
    resource_type: 'agent',
    resource_id: payload.agent_id,
    metadata: {
      status: payload.status,
      routes: results.length,
      successes: results.filter((r) => r.ok).length,
      failures: results.filter((r) => !r.ok).length,
    },
  });

  return jsonResponse(req, { notified: results.length, results });
});
