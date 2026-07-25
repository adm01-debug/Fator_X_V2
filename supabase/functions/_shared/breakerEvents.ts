/**
 * _shared/breakerEvents.ts — persistência de transições do circuit breaker.
 *
 * Grava eventos em public.openclaw_events (source='other', kind='breaker.<state>')
 * para dar observabilidade sem criar nova tabela. Fire-and-forget: nunca
 * bloqueia o caller nem lança exceção.
 *
 * Uso:
 *   const cb = getBreaker('openai');
 *   if (!cb.canRequest()) throw new Error('circuit_open');
 *   try { const r = await call(); cb.recordSuccess(); }
 *   catch (e) { cb.recordFailure(e); throw e; }
 *   finally { drainBreakerTransition(cb, { function: 'llm-gateway' }); }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import type { BreakerSnapshot } from "./circuitBreaker.ts";

interface Breaker {
  snapshot(): BreakerSnapshot;
  _drainTransition(): unknown;
}

let _client: ReturnType<typeof createClient> | null = null;
function admin() {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

export function drainBreakerTransition(
  cb: Breaker,
  ctx: { function?: string; workspaceId?: string | null } = {},
): void {
  const transitioned = cb._drainTransition();
  if (!transitioned) return;
  const snap = cb.snapshot();
  const level = transitioned === "open" ? "error" : transitioned === "half-open" ? "warn" : "info";
  const client = admin();
  if (!client) return;
  // fire-and-forget
  void client.from("openclaw_events").insert({
    workspace_id: ctx.workspaceId ?? null,
    kind: `breaker.${transitioned}`,
    level,
    source: "other",
    payload: {
      breaker_key: snap.key,
      state: snap.state,
      failures: snap.failures,
      last_error: snap.lastError,
      function: ctx.function ?? null,
      opened_at: snap.openedAt,
      ts: new Date().toISOString(),
    },
  }).then(() => {}, () => {});
}
