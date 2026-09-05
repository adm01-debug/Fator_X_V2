/**
 * Nexus Agents Studio — Edge Function Observability Layer
 *
 * PROBLEMA: Edge Functions sem tracing consistente não aparecem no dashboard.
 * Cada function usa console.error() de forma inconsistente.
 *
 * SOLUÇÃO: runWithObservability() — wrapper que:
 *   1. Gera trace_id automaticamente (UUID v4)
 *   2. Tracka duração, status code, tokens, custo
 *   3. Loga para console (formato JSON estruturado)
 *   4. Captura erros com stack trace
 *   5. Propaga trace_id via headers (correlation)
 */

export interface TraceContext {
  traceId: string;
  spanId: string;
  functionName: string;
  startTime: number;
  userId?: string;
  workspaceId?: string;
}

export interface ObservabilityOptions {
  /** Nome da function para o trace */
  functionName: string;
  /** Usuário autenticado (capturado do auth) */
  userId?: string;
  workspaceId?: string;
  /** Headers da requisição (para extrair traceparent W3C) */
  reqHeaders?: Headers;
  /** Callback para custom attributes (ex: model, tokens, cost) */
  onComplete?: (
    ctx: TraceContext,
    result: { status: number; durationMs: number; tokens?: number; costBrl?: number },
  ) => void;
  /** Callback para erros */
  onError?: (ctx: TraceContext, error: Error) => void;
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getTraceparent(traceId: string, spanId: string, sampled = true): string {
  const flags = sampled ? '01' : '00';
  return `00-${traceId}-${spanId}-${flags}`;
}

/**
 * Executa um handler com observabilidade completa.
 *
 * Uso:
 *   return await runWithObservability({ functionName: 'llm-gateway', userId, workspaceId }, async (ctx) => {
 *     const result = await llmGatewayCall(req);
 *     return result;
 *   });
 */
export async function runWithObservability<T>(
  options: ObservabilityOptions,
  handler: (ctx: TraceContext) => Promise<T>,
): Promise<T> {
  const traceId = generateId();
  const spanId = randomSpanId();
  const startTime = Date.now();

  const ctx: TraceContext = {
    traceId,
    spanId,
    functionName: options.functionName,
    startTime,
    userId: options.userId,
    workspaceId: options.workspaceId,
  };

  // Extrai traceparent da requisição (W3C context propagation)
  const incomingTraceparent = options.reqHeaders?.get('traceparent');
  let sampled = true;
  if (incomingTraceparent) {
    const parts = incomingTraceparent.split('-');
    if (parts.length >= 4) sampled = parts[3] === '01';
  }

  const log = (level: 'INFO' | 'WARN' | 'ERROR', msg: string, extra?: Record<string, unknown>) => {
    const durationMs = Date.now() - startTime;
    const logEntry = {
      level,
      timestamp: new Date().toISOString(),
      function: options.functionName,
      traceId,
      spanId,
      userId: options.userId,
      workspaceId: options.workspaceId,
      durationMs,
      message: msg,
      ...extra,
    };
    if (level === 'ERROR') {
      console.error(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  };

  log('INFO', 'start', {
    traceparent: getTraceparent(traceId, spanId, sampled),
    environment: Deno.env.get('DENO_ENV') ?? Deno.env.get('ENVIRONMENT') ?? 'production',
  });

  try {
    const result = await handler(ctx);
    const durationMs = Date.now() - startTime;

    log('INFO', 'complete', { durationMs });

    if (options.onComplete) {
      options.onComplete(ctx, {
        status: 200,
        durationMs,
      });
    }

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));

    log('ERROR', 'error', {
      // A duração também importa no caminho de erro: distingue falha imediata
      // (validação) de timeout, que exigem investigações completamente diferentes.
      durationMs,
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack?.split('\n').slice(0, 5).join('\n'), // Primeiras 5 linhas do stack
    });

    if (options.onError) {
      options.onError(ctx, err);
    }

    throw error;
  }
}

/**
 * Wrapper para fetch com tracing — adiciona headers de correlation.
 */
export async function tracedFetch(
  url: string,
  options: RequestInit & { traceCtx?: TraceContext } = {},
): Promise<Response> {
  const traceId = options.traceCtx?.traceId ?? generateId();
  const spanId = randomSpanId();

  const headers = new Headers(options.headers);
  headers.set('traceparent', getTraceparent(traceId, spanId, true));
  headers.set('X-Trace-Id', traceId);

  const start = Date.now();
  try {
    const response = await fetch(url, { ...options, headers });
    const durationMs = Date.now() - start;

    console.log(
      JSON.stringify({
        level: 'INFO',
        timestamp: new Date().toISOString(),
        event: 'downstream_call',
        traceId,
        spanId,
        url,
        method: options.method ?? 'GET',
        status: response.status,
        durationMs,
      }),
    );

    return response;
  } catch (err) {
    const durationMs = Date.now() - start;
    console.error(
      JSON.stringify({
        level: 'ERROR',
        timestamp: new Date().toISOString(),
        event: 'downstream_call_failed',
        traceId,
        spanId,
        url,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    throw err;
  }
}

/**
 * Estima custo BRL de uma chamada LLM (usado no onComplete).
 * Modelos suportados (preços por 1M tokens input/output em USD, convertidos BRL).
 */
const USD_TO_BRL = 5.8;

const MODEL_PRICES: Record<string, [number, number]> = {
  'google/gemini-2.5-flash': [0.075, 0.3],
  'google/gemini-2.5-flash-lite': [0.0375, 0.15],
  'google/gemini-2.5-pro': [1.25, 5.0],
  'google/gemini-3-flash-preview': [0.1, 0.4],
  'openai/gpt-5': [2.5, 10.0],
  'openai/gpt-5-mini': [0.25, 1.0],
  'openai/gpt-5-nano': [0.05, 0.2],
  'anthropic/claude-sonnet-4': [3.0, 15.0],
  'anthropic/claude-haiku-4': [0.8, 4.0],
};

export function estimateLlmCost(model: string, inputTokens: number, outputTokens: number): number {
  const prices = MODEL_PRICES[model];
  if (!prices) return 0;
  const [inputPer1M, outputPer1M] = prices;
  const costUsd = (inputTokens / 1_000_000) * inputPer1M + (outputTokens / 1_000_000) * outputPer1M;
  return costUsd * USD_TO_BRL;
}

/**
 * Cria um event listener para Edge Function que loga métricas de custo no DB.
 */
export async function logLlmMetrics(
  supabaseAdmin: import('@supabase/supabase-js').SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costBrl: number;
    durationMs: number;
    success: boolean;
    errorMessage?: string;
  },
): Promise<void> {
  try {
    await supabaseAdmin.from('agent_usage').insert({
      workspace_id: params.workspaceId,
      agent_id: null, // LLM gateway não é específico de agente
      user_id: params.userId,
      date: new Date().toISOString().split('T')[0],
      total_calls: 1,
      total_input_tokens: params.inputTokens,
      total_output_tokens: params.outputTokens,
      total_cost_brl: params.costBrl,
      total_duration_ms: params.durationMs,
      success: params.success,
      error_message: params.errorMessage ?? null,
    });
  } catch {
    // Não bloqueia o fluxo — logging é best-effort
    console.error('[otel] Falha ao registrar métricas LLM:', params.workspaceId);
  }
}
