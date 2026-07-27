/**
 * Nexus Agents Studio — Shared Rate Limiter
 * In-memory sliding window rate limiter for Edge Functions.
 * Each function instance has its own state — good enough for single-instance Deno Deploy.
 */

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  name?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
  retryAfterMs: number;
}

export const RATE_LIMITS = {
  standard: { windowMs: 60_000, maxRequests: 30, name: 'standard' } as RateLimitConfig,
  llm:      { windowMs: 60_000, maxRequests: 15, name: 'llm' } as RateLimitConfig,
  heavy:    { windowMs: 60_000, maxRequests: 5,  name: 'heavy' } as RateLimitConfig,
  auth:     { windowMs: 300_000, maxRequests: 10, name: 'auth' } as RateLimitConfig,
  webhook:  { windowMs: 60_000, maxRequests: 60, name: 'webhook' } as RateLimitConfig,
  datahub:  { windowMs: 60_000, maxRequests: 20, name: 'datahub' } as RateLimitConfig,
  oracle:   { windowMs: 60_000, maxRequests: 3,  name: 'oracle' } as RateLimitConfig,
  // `light` e `moderate` já eram usados por 8 funções (webhooks Bitrix/Slack/
  // WhatsApp, smoke tests, rechunk) e não existiam aqui: o acesso resolvia
  // para `undefined` e `checkRateLimit` lia `windowMs` de undefined —
  // TypeError no primeiro request. Formalizados com os valores que o uso
  // pressupõe: `light` para endpoints baratos de alta frequência (webhooks),
  // `moderate` para trabalho de custo médio.
  light:    { windowMs: 60_000, maxRequests: 60, name: 'light' } as RateLimitConfig,
  moderate: { windowMs: 60_000, maxRequests: 20, name: 'moderate' } as RateLimitConfig,
} as const;


// In-memory store: identifier -> timestamps[]
const store = new Map<string, number[]>();
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, timestamps] of store) {
    const filtered = timestamps.filter(t => now - t < 300_000);
    if (filtered.length === 0) store.delete(key);
    else store.set(key, filtered);
  }
}

/**
 * Extract rate limit identifier from request.
 */
export function getRateLimitIdentifier(req: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`;
  const apiKey = req.headers.get('x-api-key') || req.headers.get('apikey');
  if (apiKey) return `key:${apiKey.substring(0, 16)}`;
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}

/**
 * Check rate limit — identifier-based (canonical).
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RATE_LIMITS.standard,
): RateLimitResult {
  const now = Date.now();
  cleanup(now);

  const timestamps = store.get(identifier) || [];
  const windowStart = now - config.windowMs;
  const recent = timestamps.filter(t => t > windowStart);

  if (recent.length >= config.maxRequests) {
    const oldest = recent[0];
    const resetAt = oldest + config.windowMs;
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      limit: config.maxRequests,
      retryAfterMs: Math.max(0, resetAt - now),
    };
  }

  recent.push(now);
  store.set(identifier, recent);

  return {
    allowed: true,
    remaining: config.maxRequests - recent.length,
    resetAt: now + config.windowMs,
    limit: config.maxRequests,
    retryAfterMs: 0,
  };
}

/**
 * Check rate limit — Request-based convenience overload.
 * Extracts identifier from Authorization header (user JWT) or IP.
 */
export function checkRateLimitFromRequest(
  req: Request,
  options: { preset: keyof typeof RATE_LIMITS } | { config: RateLimitConfig } = { preset: 'standard' },
): RateLimitResult {
  const config = 'preset' in options
    ? RATE_LIMITS[options.preset]
    : options.config;
  const identifier = getRateLimitIdentifier(req);
  return checkRateLimit(identifier, config);
}

/**
 * Create 429 response with standard headers.
 */
export function createRateLimitResponse(
  result: RateLimitResult,
  corsHeaders: Record<string, string> = {},
): Response {
  const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded',
      message: `Too many requests. Retry after ${retryAfterSeconds} seconds.`,
      limit: result.limit,
      remaining: result.remaining,
      retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}

/**
 * Envelopa um handler aplicando rate limit antes de executá-lo.
 *
 * Existe porque o barril `mod.ts` já anunciava este símbolo: a falta dele
 * derrubava o boot de TODA Edge Function que importa o barril, não só de quem
 * usava rate limit. Preferi implementar o contrato prometido a apagá-lo — o
 * padrão "limite antes do trabalho" é o correto para funções caras.
 */
export function withRateLimit(
  handler: (req: Request) => Promise<Response> | Response,
  options: { preset: keyof typeof RATE_LIMITS } | { config: RateLimitConfig } = { preset: 'standard' },
  corsHeaders: Record<string, string> = {},
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    // Preflight não consome cota: navegador não escolhe emitir OPTIONS.
    if (req.method === 'OPTIONS') return await handler(req);

    const result = checkRateLimitFromRequest(req, options);
    if (!result.allowed) return createRateLimitResponse(result, corsHeaders);
    return await handler(req);
  };
}
