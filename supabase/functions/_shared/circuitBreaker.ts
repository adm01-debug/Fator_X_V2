/**
 * Circuit Breaker — proteção contra provedores instáveis.
 * Estados: closed (normal) → open (bloqueado) → half-open (teste).
 *
 * Uso:
 *   const cb = getBreaker('openai');
 *   if (!cb.canRequest()) throw new Error('circuit_open');
 *   try { const r = await call(); cb.recordSuccess(); return r; }
 *   catch (e) { cb.recordFailure(); throw e; }
 *
 * Instância viva por isolate da Edge Function (compartilhada entre requisições
 * do mesmo worker). Reset automático após `openMs`.
 */

export interface BreakerOptions {
  failureThreshold: number; // falhas consecutivas p/ abrir
  openMs: number;           // tempo em open antes de half-open
  halfOpenMax: number;      // requisições de teste em half-open
}

export interface BreakerSnapshot {
  key: string;
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  openedAt: number | null;
  lastError: string | null;
}

const DEFAULTS: BreakerOptions = { failureThreshold: 5, openMs: 30_000, halfOpenMax: 2 };

class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private openedAt: number | null = null;
  private halfOpenInFlight = 0;
  private lastError: string | null = null;

  constructor(public readonly key: string, private readonly opts: BreakerOptions) {}

  canRequest(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (this.openedAt !== null && Date.now() - this.openedAt >= this.opts.openMs) {
        this._transitionedTo = 'half-open';
        this.state = 'half-open';
        this.halfOpenInFlight = 0;
      } else return false;
    }
    // half-open
    if (this.halfOpenInFlight >= this.opts.halfOpenMax) return false;
    this.halfOpenInFlight++;
    return true;
  }

  /** Drena e retorna o último evento de transição (para observabilidade). */
  _drainTransition(): 'closed' | 'open' | 'half-open' | null {
    const t = this._transitionedTo;
    this._transitionedTo = null;
    return t;
  }

  recordSuccess() {
    const wasHalfOpen = this.state === 'half-open';
    this.failures = 0;
    this.openedAt = null;
    this.lastError = null;
    this.state = 'closed';
    this.halfOpenInFlight = 0;
    if (wasHalfOpen) this._transitionedTo = 'closed';
  }

  recordFailure(err?: unknown) {
    this.failures++;
    this.lastError = err instanceof Error ? err.message : String(err ?? 'unknown');
    if (this.state === 'half-open' || this.failures >= this.opts.failureThreshold) {
      const wasOpen = this.state === 'open';
      this.state = 'open';
      this.openedAt = Date.now();
      this.halfOpenInFlight = 0;
      if (!wasOpen) this._transitionedTo = 'open';
    }
  }

  snapshot(): BreakerSnapshot {
    return { key: this.key, state: this.state, failures: this.failures, openedAt: this.openedAt, lastError: this.lastError };
  }
}

const registry = new Map<string, CircuitBreaker>();

export function getBreaker(key: string, opts: Partial<BreakerOptions> = {}): CircuitBreaker {
  let cb = registry.get(key);
  if (!cb) {
    cb = new CircuitBreaker(key, { ...DEFAULTS, ...opts });
    registry.set(key, cb);
  }
  return cb;
}

export function snapshotAll(): BreakerSnapshot[] {
  return Array.from(registry.values()).map((b) => b.snapshot());
}
