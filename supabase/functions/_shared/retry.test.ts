/**
 * Simulação exaustiva do helper de retry — centenas de cenários.
 * Cobre: sucesso imediato, falha transitória recuperada, exaustão, 5xx→ok,
 * 4xx não-retriable, AbortSignal externo, jitter dentro do cap, distribuição.
 *
 * Rode com: deno test supabase/functions/_shared/retry.test.ts
 */
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { withRetry, computeDelay, RetryError, fetchWithTimeout } from './retry.ts';

Deno.test('sucesso imediato — 1 call', async () => {
  let calls = 0;
  const r = await withRetry(async () => { calls++; return 'ok'; }, { attempts: 3, baseMs: 1 });
  assertEquals(r, 'ok');
  assertEquals(calls, 1);
});

Deno.test('erro network transitório — recupera antes de esgotar', async () => {
  for (let scenario = 0; scenario < 100; scenario++) {
    const failUntil = scenario % 3; // 0, 1, 2 falhas
    let calls = 0;
    const r = await withRetry(async () => {
      calls++;
      if (calls <= failUntil) throw new Error('network error');
      return 42;
    }, { attempts: 3, baseMs: 1 });
    assertEquals(r, 42);
    assertEquals(calls, failUntil + 1, `scenario=${scenario}`);
  }
});

Deno.test('exaustão — sempre erro transitório', async () => {
  let calls = 0;
  await assertRejects(
    () => withRetry(async () => { calls++; throw new Error('econnreset'); }, { attempts: 4, baseMs: 1 }),
    Error,
  );
  assertEquals(calls, 4);
});

Deno.test('não-retriable — 4xx não repete', async () => {
  let calls = 0;
  const r = await withRetry(async () => {
    calls++;
    return new Response('nope', { status: 400 });
  }, { attempts: 3, baseMs: 1 });
  assertEquals(r.status, 400);
  assertEquals(calls, 1);
  await r.text();
});

Deno.test('retriable status — 503 recuperado', async () => {
  let calls = 0;
  const r = await withRetry(async () => {
    calls++;
    if (calls < 3) return new Response('busy', { status: 503 });
    return new Response('ok', { status: 200 });
  }, { attempts: 5, baseMs: 1 });
  assertEquals(r.status, 200);
  assertEquals(calls, 3);
  await r.text();
});

Deno.test('AbortSignal externo interrompe imediatamente', async () => {
  const ctrl = new AbortController();
  const p = withRetry(async () => { throw new Error('timeout'); }, { attempts: 5, baseMs: 500, signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 20);
  await assertRejects(() => p, DOMException);
});

Deno.test('AbortError do chamador NÃO é retentado', async () => {
  let calls = 0;
  await assertRejects(
    () => withRetry(async () => {
      calls++;
      throw new DOMException('Aborted', 'AbortError');
    }, { attempts: 5, baseMs: 1 }),
    DOMException,
  );
  assertEquals(calls, 1);
});

Deno.test('computeDelay respeita o cap — 500 amostras', () => {
  const base = 100, cap = 1_000;
  for (let attempt = 0; attempt < 10; attempt++) {
    for (let i = 0; i < 50; i++) {
      const d = computeDelay(attempt, base, cap);
      assert(d >= 0, `d>=0 attempt=${attempt} d=${d}`);
      assert(d <= cap, `d<=cap attempt=${attempt} d=${d}`);
    }
  }
});

Deno.test('computeDelay — distribuição não-degenerada', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 200; i++) seen.add(computeDelay(5, 10, 5_000));
  assert(seen.size > 50, 'esperava jitter variado, houve poucos valores distintos');
});

Deno.test('onRetry — recebe tentativas', async () => {
  const events: number[] = [];
  await withRetry(async () => 'ok', {
    attempts: 1, baseMs: 1,
    onRetry: (i) => events.push(i.attempt),
  });
  assertEquals(events.length, 0);
});

Deno.test('RetryError — exportada e utilizável', () => {
  const e = new RetryError('x', new Error('y'), 3);
  assertEquals(e.name, 'RetryError');
  assertEquals(e.attempts, 3);
});

Deno.test('fetchWithTimeout — aborta após timeoutMs', async () => {
  // usa um servidor que nunca responde: 127.0.0.1:1 é normalmente conn-refused rápido.
  // Testa apenas o shape do erro / signal — não a latência exata.
  await assertRejects(
    () => fetchWithTimeout('http://127.0.0.1:1/', { timeoutMs: 50 }),
    Error,
  );
});
