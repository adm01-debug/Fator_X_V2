/**
 * WhatsApp Outbound Service — Nexus Agents Studio (sprint #4)
 *
 * Companion to whatsappWebhookService (which handles inbound). This
 * module provides a unified sendMessage interface that abstracts the
 * 4 supported providers (Twilio / Meta Cloud API / Z-API / Evolution).
 *
 * Architecture (Int-004):
 *   - Credenciais de provedor NÃO transitam pelo browser. Elas ficam em
 *     workspace_secrets e são resolvidas server-side pela edge function
 *     `whatsapp-outbound` (service-role).
 *   - O service apenas autentica (JWT do usuário), envia o destino/conteúdo
 *     e devolve o resultado do provedor.
 *   - Every send is wrapped in a trace span via the existing tracer,
 *     so outbound messages show up in MonitoringPage > Traces
 *     alongside inbound webhooks for end-to-end visibility.
 */
import { logger } from '@/lib/logger';
import { withTrace } from '@/lib/tracing';
import { supabase } from '@/integrations/supabase/client';

export type WhatsAppProvider = 'twilio' | 'meta' | 'zapi' | 'evolution';

export interface WhatsAppMessageInput {
  to: string; // E.164 phone number
  text?: string; // Plain text body
  imageUrl?: string; // Public URL to image
  documentUrl?: string; // Public URL to document
  documentFilename?: string; // Display name for document
  caption?: string; // Caption for image/document
  templateName?: string; // Meta template name
  templateLanguage?: string; // Meta template language code (e.g., 'pt_BR')
  templateParams?: string[]; // Positional template params
}

export interface WhatsAppSendResult {
  ok: boolean;
  provider: WhatsAppProvider;
  message_id: string | null;
  raw_response?: unknown;
  error?: string;
}

async function invokeOutbound(input: WhatsAppMessageInput): Promise<WhatsAppSendResult> {
  const { data, error } = await supabase.functions.invoke('whatsapp-outbound', {
    body: input,
  });
  if (error) throw error;
  return data as WhatsAppSendResult;
}

/**
 * Send a WhatsApp message via the configured active provider (server-side).
 * Wrapped in a trace span so the operation appears in MonitoringPage.
 */
export async function sendWhatsAppMessage(
  input: WhatsAppMessageInput,
): Promise<WhatsAppSendResult> {
  return withTrace('whatsapp.outbound.send', async (_addSpan, ctx) => {
    return ctx.withSpan('whatsapp.outbound.dispatch', 'tool', async (span) => {
      span.setAttribute('whatsapp.to', input.to);
      span.setAttribute('whatsapp.has_text', !!input.text);
      span.setAttribute('whatsapp.has_image', !!input.imageUrl);
      span.setAttribute('whatsapp.has_document', !!input.documentUrl);
      span.setAttribute('whatsapp.is_template', !!input.templateName);

      try {
        const result = await invokeOutbound(input);
        span.setAttribute('whatsapp.provider', result.provider);
        if (result.ok) {
          span.setAttribute('whatsapp.message_id', result.message_id ?? '');
          return result;
        }
        span.setStatus('error', result.error ?? 'unknown');
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('sendWhatsAppMessage failed', { error: msg });
        span.setStatus('error', msg);
        return { ok: false, provider: 'meta', message_id: null, error: msg };
      }
    });
  });
}

/**
 * Convenience wrapper for plain text messages.
 */
export async function sendWhatsAppText(to: string, text: string): Promise<WhatsAppSendResult> {
  return sendWhatsAppMessage({ to, text });
}

/**
 * Convenience wrapper for image messages with optional caption.
 */
export async function sendWhatsAppImage(
  to: string,
  imageUrl: string,
  caption?: string,
): Promise<WhatsAppSendResult> {
  return sendWhatsAppMessage({ to, imageUrl, caption });
}

/**
 * Convenience wrapper for document messages.
 */
export async function sendWhatsAppDocument(
  to: string,
  documentUrl: string,
  filename?: string,
  caption?: string,
): Promise<WhatsAppSendResult> {
  return sendWhatsAppMessage({ to, documentUrl, documentFilename: filename, caption });
}

/**
 * Send a Meta template message (only works when active provider = meta).
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  params: string[] = [],
  language: string = 'pt_BR',
): Promise<WhatsAppSendResult> {
  return sendWhatsAppMessage({
    to,
    templateName,
    templateParams: params,
    templateLanguage: language,
  });
}
