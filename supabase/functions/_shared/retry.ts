/**
 * _shared/retry.ts — retry com backoff exponencial e jitter (full-jitter AWS).
 *
 * - Só re-tenta erros transitórios: network, timeout, 5xx, 429.
 * - Backoff: base * 2^attempt, com cap; jitter uniforme em [0, backoff].
 * - Respeita AbortSignal do chamador (aborta espera imediatamente).
 * - Suporta callback onRetry para telemetria.
 *
 * Uso:
 *   const res = await withRetry(() => fetch(url, { signal }), { attempts: 3 });
 *   const data = await withRetryJson<MyType>(() => fetch(url), { attempts: 3 });
 */

export interface RetryOptions {
  attempts?: number;          // total de tentativas (inclui a primeira). Default 3.
  baseMs?: number;            // delay base. Default 200ms.
  capMs?: number;             // teto do backoff. Default 5000ms.
  retryOn?: (err: unknown, res?: Response) => boolean;
  onRetry?: (info: { attempt: number; delayMs: number; err: unknown; res?: Response }) => void;
  signal?: AbortSignal;
}

export class RetryError extends Error {
  constructor(message: string, public override readonly cause: unknown, public readonly attempts: number) {
    super(message);
    this.name = 'RetryError';
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function defaultRetryOn(err: unknown, res?: Response): boolean {
  if (res) return RETRYABLE_STATUS.has(res.status);
  if (err instanceof DOMException && err.name === 'AbortError') return false; // chamador abortou
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return /network|fetch|timeout|econn|socket|reset|eof|dns/.test(msg);
}

/** Delay com full-jitter (AWS Architecture Blog). */
export function computeDelay(attempt: number, baseMs: number, capMs: number): number {
  const exp = Math.min(capMs, baseMs * Math.pow(2, attempt));
  return Math.floor(Math.random() * exp);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Executa `fn` com retry+backoff+jitter.
 * Se `fn` retornar Response com status retriable, também retenta.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const baseMs = opts.baseMs ?? 200;
  const capMs = opts.capMs ?? 5_000;
  const retryOn = opts.retryOn ?? defaultRetryOn;

  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result = await fn();
      if (result instanceof Response && retryOn(undefined, result) && attempt < attempts - 1) {
        const delay = computeDelay(attempt, baseMs, capMs);
        opts.onRetry?.({ attempt: attempt + 1, delayMs: delay, err: undefined, res: result });
        // Drena o body antes de descartar para evitar leaks.
        try { await result.body?.cancel(); } catch { /* ignore */ }
        await sleep(delay, opts.signal);
        continue;
      }
      return result;
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts - 1 || !retryOn(err)) {
        throw err;
      }
      const delay = computeDelay(attempt, baseMs, capMs);
      opts.onRetry?.({ attempt: attempt + 1, delayMs: delay, err });
      await sleep(delay, opts.signal);
    }
  }
  throw new RetryError('retry_exhausted', lastErr, attempts);
}

/** Açúcar: retry + valida ok + parse JSON. */
export async function withRetryJson<T = unknown>(
  fn: () => Promise<Response>,
  opts: RetryOptions = {},
): Promise<T> {
  const res = await withRetry(fn, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`http_${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** fetch com timeout via AbortSignal.timeout (combinável com signal externo). */
export function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 30_000, signal, ...rest } = init;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const merged = signal
    ? (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any?.([signal, timeoutSignal]) ?? timeoutSignal
    : timeoutSignal;
  return fetch(input, { ...rest, signal: merged });
}
