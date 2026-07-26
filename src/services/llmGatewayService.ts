/**
 * Nexus Agents Studio — LLM Gateway Service
 * Centralized access to Edge Functions, with race-safe tracing.
 *
 * Every invoke* wrapper goes through tracedInvoke() which:
 *  - Starts a TraceContext per call (no shared state)
 *  - Records input/output, duration, status, cost (if available)
 *  - Sets OTel GenAI semantic conventions on the span
 *  - Fire-and-forget exports trace to Supabase + Langfuse + usage_records
 */
import { supabase } from '@/integrations/supabase/client';
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import { startTrace, type SpanKind } from '@/lib/tracing';
import type { DbRow } from '@/types/dbRow';

/**
 * Wraps a Supabase Edge Function invoke with a complete trace.
 * Returns the function result on success, throws on error.
 */
async function tracedInvoke<T = unknown>(
  functionName: string,
  body: DbRow,
  options: {
    spanKind?: SpanKind;
    agentId?: string;
    sessionId?: string;
    workflowId?: string;
    extractCostUsd?: (data: DbRow) => number | undefined;
    extractTokens?: (data: DbRow) => { input?: number; output?: number } | undefined;
    extractModel?: (body: DbRow) => string | undefined;
  } = {}
): Promise<T> {
  const ctx = startTrace({
    agentId: options.agentId,
    sessionId: options.sessionId,
    workflowId: options.workflowId,
  });

  const span = ctx.startSpan(`edge.${functionName}`, options.spanKind ?? 'http');
  span.setAttribute('http.url', `supabaseExternal/functions/${functionName}`);
  span.setAttribute('gen_ai.system', 'nexus');
  const model = options.extractModel?.(body);
  if (model) span.setAttribute('gen_ai.request.model', model);
  span.setInput(body);

  try {
    // Propagate W3C traceparent so edge function can continue the same trace (Sprint 26)
    // Format: 00-{32 hex traceId}-{16 hex spanId}-{2 hex flags}
    const traceId = typeof ctx.traceId === 'string' && ctx.traceId.length > 0
      ? ctx.traceId
      : crypto.randomUUID().replace(/-/g, '');
    const spanId = typeof span.id === 'string' && span.id.length > 0
      ? span.id
      : crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const traceparent = `00-${traceId.padEnd(32, '0').slice(0, 32)}-${spanId.padEnd(16, '0').slice(0, 16)}-01`;
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: body as Record<string, unknown>,
      headers: { traceparent },
    });
    if (error) {
      span.setStatus('error', error.message);
      ctx.endSpan(span, 'error');
      ctx.end('error');
      logger.error(`${functionName} failed`, { error: error.message, trace_id: ctx.traceId });
      throw error;
    }

    // Capture cost / tokens if extractors provided
    const cost = options.extractCostUsd?.(data);
    if (cost != null) span.setAttribute('cost.usd', cost);
    const tokens = options.extractTokens?.(data);
    if (tokens?.input != null) span.setAttribute('gen_ai.usage.input_tokens', tokens.input);
    if (tokens?.output != null) span.setAttribute('gen_ai.usage.output_tokens', tokens.output);

    span.setOutput(data);
    ctx.endSpan(span, 'ok');
    ctx.end('ok');
    return data as T;
  } catch (err) {
    if (span.snapshot().status !== 'error') {
      span.setStatus('error', err instanceof Error ? err.message : String(err));
      ctx.endSpan(span, 'error');
      ctx.end('error');
    }
    throw err;
  }
}

// ═══ Public API ═══

export async function invokeLLMGateway(body: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  agentId?: string;
  sessionId?: string;
}) {
  const retryLimit = 2;
  const fallbacks = ["gpt-4o-mini", "claude-3-haiku-20240307", "gemini-1.5-flash"];
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retryLimit) {
    const currentModel = attempt === 0 ? body.model : fallbacks[attempt - 1] || body.model;
    const currentBody = { ...body, model: currentModel };

    try {
      if (attempt > 0) {
        logger.warn(`Self-Healing: Triggering fallback model due to previous failure`, { 
          original_model: body.model, 
          fallback_model: currentModel,
          attempt 
        });
      }

      return await tracedInvoke('llm-gateway', currentBody, {
        spanKind: 'llm',
        agentId: body.agentId,
        sessionId: body.sessionId,
        extractModel: (b) => (b as { model: string }).model,
        extractCostUsd: (d) => (d as { cost_usd?: number })?.cost_usd,
        extractTokens: (d) => {
          const r = d as { usage?: { input_tokens?: number; output_tokens?: number } };
          return r?.usage ? { input: r.usage.input_tokens, output: r.usage.output_tokens } : undefined;
        },
      });
    } catch (err) {
      attempt++;
      lastError = err;
      if (attempt <= retryLimit) {
        const backoff = Math.pow(2, attempt) * 500; // Faster backoff for self-healing
        logger.warn(`llm-gateway attempt ${attempt} failed, retrying with self-healing...`, { 
          error: (err as Error).message,
          next_model: fallbacks[attempt - 1] || body.model
        });
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  throw lastError;
}

export async function invokeGuardrailsEngine(body: Record<string, unknown>) {
  return tracedInvoke('guardrails-engine', body, { spanKind: 'guardrail' });
}

export async function invokeOracleResearch(body: Record<string, unknown>) {
  return tracedInvoke('oracle-research', body, {
    spanKind: 'llm',
    extractCostUsd: (d) => (d as { metrics?: { total_cost_usd?: number } })?.metrics?.total_cost_usd,
    extractTokens: (d) => {
      const m = (d as { metrics?: { total_tokens?: number } })?.metrics;
      return m?.total_tokens ? { input: m.total_tokens, output: 0 } : undefined;
    },
  });
}

export async function invokeA2AServer(body: Record<string, unknown>) {
  return tracedInvoke('a2a-server', body, { spanKind: 'http' });
}

export async function invokeBitrix24OAuth(body: Record<string, unknown>) {
  return tracedInvoke('bitrix24-oauth', body, { spanKind: 'http' });
}

export async function invokeBitrix24Api(body: Record<string, unknown>) {
  return tracedInvoke('bitrix24-api', body, { spanKind: 'http' });
}

export async function invokeTestRunner(body: Record<string, unknown>) {
  return tracedInvoke('test-runner', body, { spanKind: 'tool' });
}

/**
 * Generic traced invoke for callers that need to instrument arbitrary
 * Edge Functions without adding a wrapper here. Public so workflowStore,
 * oracleStore etc. can route through the same tracer.
 */
export async function invokeTracedFunction<T = unknown>(
  functionName: string,
  body: DbRow,
  options?: Parameters<typeof tracedInvoke>[2]
): Promise<T> {
  return tracedInvoke<T>(functionName, body, options);
}

export async function saveWorkspaceSecret(wsId: string, keyName: string, value: string, isUpdate: boolean) {
  try {
    if (isUpdate) {
      const { error } = await supabaseExternal.from('workspace_secrets').update({ key_value: value, updated_at: new Date().toISOString() } as never)
        .eq('workspace_id', wsId).eq('key_name', keyName);
      if (error) throw error;
    } else {
      const { error } = await supabaseExternal.from('workspace_secrets').insert({ workspace_id: wsId, key_name: keyName, key_value: value } as never);
      if (error) throw error;
    }
  } catch (err) {
    logger.error('saveWorkspaceSecret failed', { keyName, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export async function getMaskedSecrets(wsId: string) {
  const { data, error } = await supabaseExternal.rpc('get_masked_secrets', { p_workspace_id: wsId });
  if (error) { logger.error('getMaskedSecrets failed', { error: error.message }); throw error; }
  return data ?? [];
}
