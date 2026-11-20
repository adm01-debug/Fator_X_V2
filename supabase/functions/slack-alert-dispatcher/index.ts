// deno-lint-ignore-file no-explicit-any
/**
 * slack-alert-dispatcher
 *
 * Consumes newly created rows in `security_alerts` and forwards them to Slack
 * according to configured `slack_channel_routes`.
 *
 * Invocation modes:
 *  A) Trigger via pg_net.http_post from an AFTER INSERT trigger on security_alerts.
 *     Payload: { record: { id, workspace_id, category, severity, title, description, ... } }
 *  B) Manual test from UI: { alert: { workspace_id, category, severity, title, description, action_url? } }
 *
 * Requires SLACK_BOT_TOKEN (secret).
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

const SEVERITY_RANK = { info: 0, warning: 1, error: 2, critical: 3 } as const;
type Severity = keyof typeof SEVERITY_RANK;

const AlertSchema = z.object({
  id: z.string().uuid().optional(),
  workspace_id: z.string().uuid(),
  category: z.string().min(1).max(128),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  title: z.string().min(1).max(300),
  description: z.string().max(3000).optional(),
  action_url: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const BodySchema = z
  .object({
    record: AlertSchema.optional(),
    alert: AlertSchema.optional(),
    test: z.boolean().optional(),
  })
  .refine((v) => v.record || v.alert, { message: 'record or alert is required' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.heavy);
  if (!rate.allowed) return createRateLimitResponse(rate, getCorsHeaders(req));
  if (req.method !== 'POST') return errorResponse(req, 'Method not allowed', 405);

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    return errorResponse(req, 'Invalid payload', 400, {
      details: err instanceof z.ZodError ? err.flatten() : String(err),
    });
  }

  const alert = (parsed.record ?? parsed.alert)!;
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Fetch active routes for this workspace matching the category (or 'custom' fallback)
  const { data: routes, error: routesErr } = await supabase
    .from('slack_channel_routes')
    .select('id, channel_id, channel_name, min_severity, mention_users, category')
    .eq('workspace_id', alert.workspace_id)
    .eq('enabled', true)
    .in('category', [alert.category, 'custom']);

  if (routesErr) {
    console.error('[slack-alert-dispatcher] routes query failed', routesErr);
    return errorResponse(req, 'Failed to load routes', 500);
  }

  if (!routes || routes.length === 0) {
    return jsonResponse(req, { skipped: true, reason: 'no_matching_routes' });
  }

  const alertRank = SEVERITY_RANK[alert.severity];
  const results: Array<{ channel: string; ok: boolean; error?: string }> = [];

  for (const route of routes) {
    const routeMin = SEVERITY_RANK[(route.min_severity as Severity) ?? 'warning'];
    if (alertRank < routeMin) {
      results.push({ channel: route.channel_id, ok: false, error: 'below_min_severity' });
      continue;
    }

    const payload = buildAlertPayload(route.channel_id, {
      title: alert.title,
      description: alert.description,
      severity: alert.severity,
      category: alert.category,
      actionUrl: alert.action_url,
      mentionUsers: (route.mention_users as string[] | null) ?? [],
      fields: alert.metadata
        ? Object.entries(alert.metadata)
            .slice(0, 6)
            .map(([k, v]) => ({ label: k, value: String(v).slice(0, 500) }))
        : undefined,
    });

    try {
      const resp = await slackApiCall('chat.postMessage', payload);
      results.push({
        channel: route.channel_id,
        ok: resp.ok,
        error: resp.ok ? undefined : resp.error,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push({ channel: route.channel_id, ok: false, error: errMsg });
      // Enfileirar na DLQ para reprocesso automático
      await supabase
        .from('slack_dispatch_dlq')
        .insert({
          workspace_id: alert.workspace_id,
          alert_id: alert.id ?? null,
          payload,
          error: errMsg,
        })
        .then(({ error }) => {
          if (error) console.warn('[slack-alert-dispatcher] dlq insert failed', error.message);
        });
    }
  }

  // Audit
  await supabase
    .from('audit_events')
    .insert({
      workspace_id: alert.workspace_id,
      event_type: 'slack_integration',
      action: 'alert_dispatched',
      resource_type: 'security_alert',
      resource_id: alert.id ?? null,
      metadata: {
        severity: alert.severity,
        routes: results.length,
        successes: results.filter((r) => r.ok).length,
        failures: results.filter((r) => !r.ok).length,
      },
    })
    .then(({ error }) => {
      if (error) console.warn('[slack-alert-dispatcher] audit insert failed', error.message);
    });

  return jsonResponse(req, { dispatched: results.length, results });
});
