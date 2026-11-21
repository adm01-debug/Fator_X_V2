/**
 * whatsapp-outbound — envia mensagens WhatsApp/Twilio server-side.
 *
 * Int-004: move a leitura de credenciais de provedor do browser para o
 * servidor. O cliente autentica por JWT e envia apenas o destino/conteúdo;
 * a edge resolve workspace_secrets com service-role e chama o provedor.
 *
 * Seguranca:
 *  - Autorizacao obrigatoria (JWT de usuário autenticado).
 *  - O usuário só acessa secrets do workspace do qual é membro
 *    (workspace_id resolvido server-side via workspace_members).
 *  - Nenhum token de provedor sai da edge.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  handleCorsPreflight,
  getCorsHeaders,
  jsonResponse,
  authenticateRequest,
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
  RATE_LIMITS,
  requireEnv,
} from '../_shared/mod.ts';

const BodySchema = z.object({
  to: z.string().min(1).max(32),
  text: z.string().max(8000).optional(),
  imageUrl: z.string().url().optional(),
  documentUrl: z.string().url().optional(),
  documentFilename: z.string().max(255).optional(),
  caption: z.string().max(2000).optional(),
  templateName: z.string().max(255).optional(),
  templateLanguage: z.string().max(20).optional(),
  templateParams: z.array(z.string().max(4000)).max(40).optional(),
});

export type WhatsAppProvider = 'twilio' | 'meta' | 'zapi' | 'evolution';

interface ProviderSecrets {
  provider: WhatsAppProvider;
  config: Record<string, string>;
}

interface SecretsRow {
  key_name: string;
  key_value: string | null;
}

interface SecretsLookup {
  from: (table: 'workspace_secrets') => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        like: (
          col: string,
          pattern: string,
        ) => Promise<{
          data: SecretsRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

async function loadActiveProviderConfig(
  supabase: SecretsLookup,
  workspaceId: string,
): Promise<ProviderSecrets> {
  const { data, error } = await supabase
    .from('workspace_secrets')
    .select('key_name, key_value')
    .eq('workspace_id', workspaceId)
    .like('key_name', 'whatsapp_outbound_%');
  if (error) throw error;

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.key_name] = row.key_value ?? '';
  }

  const provider = (map['whatsapp_outbound_active_provider'] ?? 'meta') as WhatsAppProvider;
  if (!['twilio', 'meta', 'zapi', 'evolution'].includes(provider)) {
    throw new Error(`Unknown active WhatsApp provider: ${provider}`);
  }

  const prefix = `whatsapp_outbound_${provider}_`;
  const config: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith(prefix)) config[k.slice(prefix.length)] = v;
  }

  return { provider, config };
}

function sendResult(
  ok: boolean,
  provider: WhatsAppProvider,
  message_id: string | null,
  raw_response: unknown,
  error?: string,
) {
  return { ok, provider, message_id, raw_response, error };
}

async function sendViaTwilio(config: Record<string, string>, body: z.infer<typeof BodySchema>) {
  const sid = config.account_sid;
  const token = config.auth_token;
  const from = config.from_phone;
  if (!sid || !token || !from) throw new Error('Twilio config incomplete');

  const params = new URLSearchParams();
  params.set('From', `whatsapp:${from}`);
  params.set('To', `whatsapp:${body.to}`);
  if (body.imageUrl) params.set('MediaUrl', body.imageUrl);
  if (body.documentUrl) params.set('MediaUrl', body.documentUrl);
  params.set('Body', body.text ?? body.caption ?? '');

  const auth = btoa(`${sid}:${token}`);
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const data = (await resp.json()) as { sid?: string; message?: string };
  if (!resp.ok) {
    return sendResult(false, 'twilio', null, data, data.message ?? `HTTP ${resp.status}`);
  }
  return sendResult(true, 'twilio', data.sid ?? null, data);
}

async function sendViaMeta(config: Record<string, string>, input: z.infer<typeof BodySchema>) {
  const phoneNumberId = config.phone_number_id;
  const accessToken = config.access_token;
  if (!phoneNumberId || !accessToken) throw new Error('Meta config incomplete');

  let payload: Record<string, unknown>;
  if (input.templateName) {
    payload = {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.templateLanguage ?? 'pt_BR' },
        components:
          input.templateParams && input.templateParams.length > 0
            ? [
                {
                  type: 'body',
                  parameters: input.templateParams.map((text) => ({ type: 'text', text })),
                },
              ]
            : [],
      },
    };
  } else if (input.imageUrl) {
    payload = {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'image',
      image: { link: input.imageUrl, caption: input.caption ?? '' },
    };
  } else if (input.documentUrl) {
    payload = {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'document',
      document: {
        link: input.documentUrl,
        filename: input.documentFilename ?? 'document',
        caption: input.caption ?? '',
      },
    };
  } else {
    payload = {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'text',
      text: { body: input.text ?? '' },
    };
  }

  const resp = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = (await resp.json()) as {
    messages?: Array<{ id?: string }>;
    error?: { message: string };
  };
  if (!resp.ok) {
    return sendResult(false, 'meta', null, data, data.error?.message ?? `HTTP ${resp.status}`);
  }
  return sendResult(true, 'meta', data.messages?.[0]?.id ?? null, data);
}

async function sendViaZapi(config: Record<string, string>, input: z.infer<typeof BodySchema>) {
  const instanceId = config.instance_id;
  const token = config.token;
  if (!instanceId || !token) throw new Error('Z-API config incomplete');

  let endpoint = 'send-text';
  let body: Record<string, unknown> = { phone: input.to, message: input.text ?? '' };
  if (input.imageUrl) {
    endpoint = 'send-image';
    body = { phone: input.to, image: input.imageUrl, caption: input.caption ?? '' };
  } else if (input.documentUrl) {
    endpoint = 'send-document/pdf';
    body = {
      phone: input.to,
      document: input.documentUrl,
      fileName: input.documentFilename ?? 'doc',
    };
  }

  const resp = await fetch(
    `https://api.z-api.io/instances/${instanceId}/token/${token}/${endpoint}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const data = (await resp.json()) as { id?: string; messageId?: string; error?: string };
  if (!resp.ok) {
    return sendResult(false, 'zapi', null, data, data.error ?? `HTTP ${resp.status}`);
  }
  return sendResult(true, 'zapi', data.messageId ?? data.id ?? null, data);
}

async function sendViaEvolution(config: Record<string, string>, input: z.infer<typeof BodySchema>) {
  const baseUrl = config.base_url;
  const instance = config.instance;
  const apikey = config.apikey;
  if (!baseUrl || !instance || !apikey) throw new Error('Evolution config incomplete');

  let endpoint = `/message/sendText/${instance}`;
  let body: Record<string, unknown> = { number: input.to, text: input.text ?? '' };
  if (input.imageUrl) {
    endpoint = `/message/sendMedia/${instance}`;
    body = {
      number: input.to,
      mediatype: 'image',
      media: input.imageUrl,
      caption: input.caption ?? '',
    };
  } else if (input.documentUrl) {
    endpoint = `/message/sendMedia/${instance}`;
    body = {
      number: input.to,
      mediatype: 'document',
      media: input.documentUrl,
      fileName: input.documentFilename ?? 'doc',
    };
  }

  const url = `${baseUrl.replace(/\/$/, '')}${endpoint}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apikey },
    body: JSON.stringify(body),
  });
  const data = (await resp.json()) as { key?: { id?: string }; error?: string };
  if (!resp.ok) {
    return sendResult(false, 'evolution', null, data, data.error ?? `HTTP ${resp.status}`);
  }
  return sendResult(true, 'evolution', data.key?.id ?? null, data);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  const corsHeaders = getCorsHeaders(req);
  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.light);
  if (!rate.allowed) return createRateLimitResponse(rate, corsHeaders);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  const auth = await authenticateRequest(req, { requireWorkspace: true });
  if (auth.error) return auth.error;
  if (!auth.workspaceId) return jsonResponse(req, { error: 'workspace_required' }, 403);

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      req,
      { error: 'Payload inválido', details: parsed.error.flatten().fieldErrors },
      400,
    );
  }

  try {
    const supabase = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } },
    );
    const providerSecrets = await loadActiveProviderConfig(
      supabase as unknown as SecretsLookup,
      auth.workspaceId,
    );

    let result;
    switch (providerSecrets.provider) {
      case 'twilio':
        result = await sendViaTwilio(providerSecrets.config, parsed.data);
        break;
      case 'meta':
        result = await sendViaMeta(providerSecrets.config, parsed.data);
        break;
      case 'zapi':
        result = await sendViaZapi(providerSecrets.config, parsed.data);
        break;
      case 'evolution':
        result = await sendViaEvolution(providerSecrets.config, parsed.data);
        break;
      default:
        throw new Error(`Unsupported provider: ${providerSecrets.provider}`);
    }
    return jsonResponse(req, result, result.ok ? 200 : 502);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse(req, { ok: false, error: msg }, 502);
  }
});
