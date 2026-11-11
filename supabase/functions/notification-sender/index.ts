import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  handleCorsPreflight,
  getCorsHeaders,
  getRateLimitIdentifier,
  checkRateLimit,
  createRateLimitResponse,
  RATE_LIMITS,
} from '../_shared/mod.ts';

const InputSchema = z
  .object({
    channel: z.enum(['email', 'whatsapp', 'slack', 'in_app', 'webhook']),
    recipient: z.string().min(1).max(500),
    subject: z.string().max(500).optional(),
    message: z.string().max(20000).optional(),
    template_id: z.string().uuid().optional(),
    template_vars: z.record(z.unknown()).optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine((d) => d.message || d.template_id, { message: 'message ou template_id é obrigatório' });

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  const corsHeaders = getCorsHeaders(req);

  // Require Authorization header — function uses service_role internally and
  // must not be reachable by anonymous callers.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized', code: 'MISSING_AUTH' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const token = authHeader.slice(7);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  let authorized = false;
  if (token === serviceKey) {
    // Internal / server-to-server call with service role key.
    authorized = true;
  } else {
    // Validate as a signed user JWT.
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
    } = await caller.auth.getUser();
    if (user) authorized = true;
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized', code: 'INVALID_TOKEN' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const identifier = getRateLimitIdentifier(req);
  const rateCheck = checkRateLimit(identifier, RATE_LIMITS.standard);
  if (!rateCheck.allowed) return createRateLimitResponse(rateCheck, corsHeaders);

  try {
    const raw = await req.json().catch(() => null);
    const parsedIn = InputSchema.safeParse(raw);
    if (!parsedIn.success) {
      return new Response(
        JSON.stringify({ error: 'Payload inválido', details: parsedIn.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const { channel, recipient, subject, message, template_id, template_vars, priority, metadata } =
      parsedIn.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resolve template
    let finalSubject = subject ?? '';
    let finalMessage = message ?? '';

    if (template_id) {
      const { data: tpl } = await supabase
        .from('notification_templates')
        .select('*')
        .eq('id', template_id)
        .single();

      if (tpl) {
        const vars = template_vars ?? {};
        finalSubject = renderTemplate(tpl.subject_template, vars);
        finalMessage = renderTemplate(tpl.body_template, vars);
      }
    }

    // Send via channel
    let sendResult: { success: boolean; error?: string } = { success: false };

    switch (channel) {
      case 'email':
        sendResult = await sendEmail(finalSubject, finalMessage, recipient);
        break;
      case 'whatsapp':
        sendResult = await sendWhatsApp(finalMessage, recipient);
        break;
      case 'slack':
        sendResult = await sendSlack(finalMessage, recipient);
        break;
      case 'in_app':
        sendResult = { success: true };
        break;
      case 'webhook':
        sendResult = await sendWebhook(finalMessage, recipient, metadata);
        break;
      default:
        sendResult = { success: true }; // Log only for unsupported channels
    }

    // Record notification
    const { data: notification, error: insertError } = await supabase
      .from('notifications')
      .insert({
        channel,
        priority: priority ?? 'normal',
        status: sendResult.success ? 'sent' : 'failed',
        recipient_address: recipient,
        subject: finalSubject,
        body: finalMessage,
        template_id: template_id ?? null,
        template_vars: template_vars ?? {},
        metadata: metadata ?? {},
        sent_at: sendResult.success ? new Date().toISOString() : null,
        failed_at: !sendResult.success ? new Date().toISOString() : null,
        error: sendResult.error ?? null,
        source_type: 'system',
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        success: sendResult.success,
        notification_id: notification?.id,
        channel,
        error: sendResult.error,
      }),
      {
        status: sendResult.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('notification-sender error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
    const parts = path.split('.');
    let value: unknown = vars;
    for (const p of parts) {
      if (value && typeof value === 'object' && p in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[p];
      } else {
        return `{{${path}}}`;
      }
    }
    return String(value ?? '');
  });
}

async function sendEmail(
  subject: string,
  body: string,
  to: string,
): Promise<{ success: boolean; error?: string }> {
  // Resend (domínio promobrindes.com.br verificado). Remetente sobrescrevível por EMAIL_FROM.
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return { success: false, error: 'Email API not configured' };
  const from = Deno.env.get('EMAIL_FROM') || 'Fator X <noreply@promobrindes.com.br>';

  try {
    const { withRetry, fetchWithTimeout } = await import('../_shared/retry.ts');
    const resp = await withRetry(
      () =>
        fetchWithTimeout('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ from, to: [to], subject: subject || 'Notificação', text: body }),
          timeoutMs: 15_000,
        }),
      { attempts: 2, baseMs: 400, capMs: 3_000 },
    );
    if (!resp.ok) return { success: false, error: `Email API returned ${resp.status}` };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Email send failed' };
  }
}

async function sendWhatsApp(
  message: string,
  to: string,
): Promise<{ success: boolean; error?: string }> {
  const apiUrl = Deno.env.get('WHATSAPP_API_URL');
  const apiKey = Deno.env.get('WHATSAPP_API_KEY');
  const instance = Deno.env.get('WHATSAPP_INSTANCE');

  if (!apiUrl || !apiKey) {
    return { success: false, error: 'WhatsApp API not configured' };
  }

  try {
    const { withRetry, fetchWithTimeout } = await import('../_shared/retry.ts');
    const resp = await withRetry(
      () =>
        fetchWithTimeout(`${apiUrl}/message/sendText/${instance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
          body: JSON.stringify({ number: to, text: message }),
          timeoutMs: 15_000,
        }),
      { attempts: 2, baseMs: 400, capMs: 3_000 },
    );
    if (!resp.ok) return { success: false, error: `WhatsApp API returned ${resp.status}` };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'WhatsApp send failed' };
  }
}

async function sendSlack(
  message: string,
  channel: string,
): Promise<{ success: boolean; error?: string }> {
  const token = Deno.env.get('SLACK_BOT_TOKEN');
  if (!token) return { success: false, error: 'Slack token not configured' };

  try {
    const { withRetry, fetchWithTimeout } = await import('../_shared/retry.ts');
    const resp = await withRetry(
      () =>
        fetchWithTimeout('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ channel, text: message }),
          timeoutMs: 10_000,
        }),
      { attempts: 3, baseMs: 300, capMs: 3_000 },
    );
    const data = await resp.json();
    if (!data.ok) return { success: false, error: data.error ?? 'Slack send failed' };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Slack send failed' };
  }
}

// Private IP ranges and link-local addresses that must never be reached (SSRF prevention)
const PRIVATE_IP_PATTERN =
  /^(https?:\/\/)(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|fc00:|fe80:)/i;

function isValidWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    if (PRIVATE_IP_PATTERN.test(raw)) return false;
    // Reject bare IP addresses (allows only hostnames)
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function sendWebhook(
  message: string,
  url: string,
  metadata?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  if (!isValidWebhookUrl(url)) {
    return { success: false, error: 'Invalid or disallowed webhook URL' };
  }
  try {
    const { withRetry, fetchWithTimeout } = await import('../_shared/retry.ts');
    const resp = await withRetry(
      () =>
        fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, ...metadata }),
          timeoutMs: 15_000,
        }),
      { attempts: 3, baseMs: 300, capMs: 4_000 },
    );
    if (!resp.ok) return { success: false, error: `Webhook returned ${resp.status}` };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Webhook failed' };
  }
}
