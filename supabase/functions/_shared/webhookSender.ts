/**
 * Nexus Agents Studio — Webhook Sender with HMAC Signature
 *
 * PROBLEMA: workflow-engine-v2 chama webhooks sem assinatura HMAC.
 * Qualquer endpoint pode ser spoofado.
 *
 * SOLUÇÃO: webhookSender() com:
 *   1. HMAC-SHA256 signature (x-hub-signature-256)
 *   2. Retry com backoff exponencial
 *   3. Timeout configurável
 *   4. Idempotency key (x-idempotency-key)
 *   5. Retry-After header respeitado
 */

import { hmacSha256Hex } from "./webhookSignature.ts";

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: unknown;
  metadata?: Record<string, unknown>;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  durationMs: number;
  error?: string;
  retryable: boolean;
  attempts: number;
}

export interface WebhookSenderOptions {
  url: string;
  secret?: string;
  event: string;
  payload: WebhookPayload;
  /** Número de retries (default: 3) */
  retries?: number;
  /** Timeout em ms (default: 10000) */
  timeoutMs?: number;
  /** Headers extras */
  extraHeaders?: Record<string, string>;
  /** Idempotency key para deduplicação */
  idempotencyKey?: string;
}

/**
 * Envia webhook com HMAC-SHA256 signature + retry.
 * Usado por: workflow-engine-v2, cron-executor, notification-sender
 */
export async function deliverWebhook(
  options: WebhookSenderOptions
): Promise<WebhookDeliveryResult> {
  const {
    url, secret, event, payload,
    retries = 3,
    timeoutMs = 10_000,
    extraHeaders = {},
    idempotencyKey,
  } = options;

  const start = Date.now();
  const body = JSON.stringify(payload);
  let attempts = 0;
  let lastError: string | undefined;

  // Gera headers base
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': event,
    'X-Webhook-Timestamp': payload.timestamp,
    'User-Agent': 'NexusAgentsStudio/2.0',
    ...extraHeaders,
  };

  // Idempotency key para deduplicação
  if (idempotencyKey) {
    headers['X-Idempotency-Key'] = idempotencyKey;
  }

  // HMAC signature (se secret fornecido)
  if (secret) {
    const signature = await hmacSha256Hex(secret, body);
    headers['X-Hub-Signature-256'] = `sha256=${signature}`;
  }

  while (attempts <= retries) {
    attempts++;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const durationMs = Date.now() - start;

      // 2xx = sucesso
      if (response.status >= 200 && response.status < 300) {
        return { success: true, statusCode: response.status, durationMs, attempts, retryable: false };
      }

      // 429 = retry after header
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.min(60_000, 2 ** attempts * 1000);
        if (attempts < retries + 1) {
          await sleep(waitMs);
          continue;
        }
        lastError = `Rate limited (429) after ${attempts} attempts`;
        return { success: false, statusCode: 429, durationMs, attempts, retryable: false, error: lastError };
      }

      // 4xx não-retryable (exceto 408 Request Timeout)
      if (response.status >= 400 && response.status < 500 && response.status !== 408) {
        lastError = `Client error: ${response.status} ${response.statusText}`;
        return { success: false, statusCode: response.status, durationMs, attempts, retryable: false, error: lastError };
      }

      // 5xx = retryable
      lastError = `Server error: ${response.status} ${response.statusText}`;
      if (attempts <= retries) {
        const backoff = Math.min(60_000, 2 ** attempts * 1000 + Math.random() * 1000);
        await sleep(backoff);
        continue;
      }

      return { success: false, statusCode: response.status, durationMs, attempts, retryable: true, error: lastError };

    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - start;

      // AbortError = timeout
      if (lastError.includes('aborted') || lastError.includes('Timeout')) {
        if (attempts <= retries) {
          await sleep(2 ** attempts * 1000);
          continue;
        }
        return { success: false, durationMs, attempts, retryable: true, error: `Timeout after ${attempts} attempts` };
      }

      // Erro de rede = retryable
      if (attempts <= retries) {
        const backoff = Math.min(60_000, 2 ** attempts * 1000 + Math.random() * 1000);
        await sleep(backoff);
        continue;
      }

      return { success: false, durationMs, attempts, retryable: true, error: lastError };
    }
  }

  return {
    success: false,
    durationMs: Date.now() - start,
    attempts,
    retryable: false,
    error: lastError ?? 'Max retries exceeded',
  };
}

/**
 * Helper para delivery assíncrono com logging no DB.
 * Registra resultado na tabela webhook_delivery_logs.
 */
export async function deliverWebhookWithLogging(
  options: WebhookSenderOptions,
  supabaseAdmin: import('@supabase/supabase-js').SupabaseClient,
  webhookEndpointId?: string
): Promise<WebhookDeliveryResult> {
  const result = await deliverWebhook(options);

  // Log no DB se endpoint fornecido
  if (webhookEndpointId) {
    try {
      await supabaseAdmin.from('webhook_delivery_logs').insert({
        webhook_endpoint_id: webhookEndpointId,
        event: options.event,
        payload: options.payload,
        status: result.success ? 'delivered' : 'failed',
        status_code: result.statusCode,
        duration_ms: result.durationMs,
        attempts: result.attempts,
        error_message: result.error ?? null,
        response_body: null, // Não armazenamos body por segurança
        delivered_at: result.success ? new Date().toISOString() : null,
      });
    } catch (logErr) {
      // Log failures não devem bloquear o fluxo principal
      console.error('[webhook-sender] Falha ao registrar delivery:', logErr);
    }
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
