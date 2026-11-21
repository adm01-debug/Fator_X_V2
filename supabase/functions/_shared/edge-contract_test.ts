// Contract tests para Edge Functions críticas.
//
// Objetivo:
//   1. Preflight OPTIONS retorna CORS válido (Allow-Origin = origem ou "*").
//   2. Payload inválido é rejeitado com 4xx (Zod ativo) e o corpo é JSON com { error }.
//   3. Respostas de erro preservam CORS.
//   4. Origem maliciosa não é refletida com o Origin exato.
//   5. Respostas de erro 422 seguem o contrato { error, code, fields }.
//   6. Versionamento via x-api-version é honrado ou rejeitado com 400.
//
// Local:  deno test --allow-net --allow-env supabase/functions/_shared/edge-contract_test.ts
// CI:     job "edge-contracts" em .github/workflows/ci.yml.
//
// Nota sobre timeouts em CI: funções a frio (cold-start) em ambientes de CI
// podem demorar até 10–15 s na primeira invocação. Considere aumentar o
// timeout padrão do Deno se o runner for lento.

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// Use || (not ??) so empty-string secrets from CI fall through to the fallback.
const SUPABASE_URL =
  Deno.env.get('VITE_SUPABASE_URL') ||
  Deno.env.get('SUPABASE_URL') ||
  'https://qdlnzopxrlsoljcrcmzv.supabase.co';
const ANON =
  Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbG56b3B4cmxzb2xqY3JjbXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MDAwMDAsImV4cCI6MjA5Mzk3NjAwMH0.placeholder';

const ORIGIN = 'https://app.promobrindes.com.br';

type Target = {
  name: string;
  /** Corpo garantidamente inválido para o schema desta função. */
  invalidBody: Record<string, unknown>;
  /** Se true, apenas testa CORS (schema aceita qualquer objeto). */
  corsOnly?: boolean;
};

const TARGETS: Target[] = [
  // ── Targets originais ────────────────────────────────────────────────────
  { name: 'semantic-search', invalidBody: {} },
  { name: 'global-search', invalidBody: { limit: -1 }, corsOnly: true },
  { name: 'kb-analyze-gaps', invalidBody: { knowledge_base_id: 'not-a-uuid' } },
  { name: 'kb-translate-article', invalidBody: { article_id: 'x' } },
  { name: 'voice-transcribe', invalidBody: {} },
  { name: 'voice-synthesize', invalidBody: {} },
  { name: 'graph-execute', invalidBody: { graph_id: 'not-a-uuid' } },
  { name: 'incident-orchestrator', invalidBody: { playbook_id: 'nope' } },
  { name: 'notification-sender', invalidBody: { channel: 'carrier-pigeon' } },
  { name: 'widget-proxy', invalidBody: { message: '' } },
  { name: 'quick-agent-test', invalidBody: {} },

  // ── Novos targets ─────────────────────────────────────────────────────────
  // event_type: "" viola min(1) no WebhookReceiverContracts.v1
  { name: 'webhook-receiver', invalidBody: { event_type: '' } },
  // entry deve ser array segundo WhatsAppWebhookContracts.v2
  { name: 'whatsapp-webhook', invalidBody: { entry: 'not-an-array' } },
  // v1 usa passthrough; qualquer objeto é válido → apenas CORS
  { name: 'bitrix24-webhook', invalidBody: {}, corsOnly: true },
  // type: "" viola z.string() em OpenclawWebhookContracts.v1 (string vazia é inválida no v2 min(1))
  { name: 'openclaw-webhook', invalidBody: { type: '' } },
  // "unknown_type" não pertence ao enum ['url_verification','event_callback']
  { name: 'slack-events-webhook', invalidBody: { type: 'unknown_type' } },
  // messages: [] viola .min(1) em LLMGatewayContracts.v1
  { name: 'llm-gateway', invalidBody: { model: 'x', messages: [] } },
  // geo-code: sem address viola o schema (action geocode exige address)
  { name: 'geo-code', invalidBody: { action: 'geocode' } },
];

const fnUrl = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`;

function assertValidCors(headers: Headers, ctx: string) {
  const allow = headers.get('access-control-allow-origin');
  assert(allow, `${ctx}: Access-Control-Allow-Origin ausente`);
  assert(allow === ORIGIN || allow === '*', `${ctx}: Allow-Origin inesperado (${allow})`);
}

// ── Loop principal: CORS preflight + rejeição de payload inválido ─────────

for (const target of TARGETS) {
  Deno.test(`[CORS preflight] ${target.name}`, async () => {
    const res = await fetch(fnUrl(target.name), {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type, apikey',
      },
    });
    await res.body?.cancel();
    assert([200, 204].includes(res.status), `esperado 200/204, recebido ${res.status}`);
    assertValidCors(res.headers, `preflight ${target.name}`);
    const allowHeaders = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    assert(
      allowHeaders.includes('authorization') && allowHeaders.includes('content-type'),
      `${target.name}: Allow-Headers deve incluir authorization e content-type`,
    );
  });

  if (target.corsOnly) continue;

  Deno.test(`[Zod inválido] ${target.name} rejeita com 4xx + CORS`, async () => {
    const res = await fetch(fnUrl(target.name), {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(target.invalidBody),
    });
    const text = await res.text();
    assert(
      res.status >= 400 && res.status < 500,
      `[${target.name}] status ${res.status} não é 4xx: ${text.slice(0, 200)}`,
    );
    assertValidCors(res.headers, `error ${target.name}`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`[${target.name}] corpo não-JSON: ${text.slice(0, 200)}`);
    }
    assert(
      parsed && typeof parsed === 'object' && 'error' in (parsed as object),
      `[${target.name}] corpo sem campo error: ${text.slice(0, 200)}`,
    );
  });
}

// ── Loop 422: verifica a forma do corpo de erro para funções com Zod ──────
//
// Para targets sem corsOnly, testa que erros 422 seguem o contrato:
//   { error: string, code: "VALIDATION_ERROR", fields: Array<{ field, message }> }
// Para outros 4xx, verifica apenas que há campo `error`.
// Se a função aceitar o payload (status não-4xx), o teste é ignorado.

for (const target of TARGETS) {
  if (target.corsOnly) continue;

  Deno.test(`[422 shape] ${target.name} → error body has { error, code, fields }`, async () => {
    const res = await fetch(fnUrl(target.name), {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(target.invalidBody),
    });
    const text = await res.text();

    // Funções que aceitam corpos desconhecidos podem retornar 2xx;
    // nesse caso não há contrato de erro para verificar.
    if (res.status < 400 || res.status >= 500) {
      console.log(
        `[422 shape] ${target.name}: status ${res.status} — fora da faixa 4xx, pulando verificação de corpo`,
      );
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(
        `[422 shape] ${target.name}: corpo não-JSON (status ${res.status}): ${text.slice(0, 200)}`,
      );
    }

    if (res.status === 422) {
      // Contrato completo: { error: string, code: "VALIDATION_ERROR", fields: Array }
      assert(
        typeof parsed.error === 'string',
        `[422 shape] ${target.name}: 'error' deve ser string, recebido: ${JSON.stringify(parsed.error)}`,
      );
      assert(
        parsed.code === 'VALIDATION_ERROR',
        `[422 shape] ${target.name}: 'code' deve ser "VALIDATION_ERROR", recebido: ${JSON.stringify(parsed.code)}`,
      );
      assert(
        Array.isArray(parsed.fields),
        `[422 shape] ${target.name}: 'fields' deve ser array, recebido: ${JSON.stringify(parsed.fields)}`,
      );
      const fields = parsed.fields as Array<Record<string, unknown>>;
      assert(fields.length > 0, `[422 shape] ${target.name}: 'fields' não pode ser vazio`);
      const first = fields[0];
      assert(
        typeof first.field === 'string',
        `[422 shape] ${target.name}: fields[0].field deve ser string, recebido: ${JSON.stringify(first.field)}`,
      );
      assert(
        typeof first.message === 'string',
        `[422 shape] ${target.name}: fields[0].message deve ser string, recebido: ${JSON.stringify(first.message)}`,
      );
    } else {
      // Qualquer outro 4xx: não é obrigatório usar Zod, mas deve ter { error }
      assert(
        typeof parsed.error === 'string' || 'error' in parsed,
        `[422 shape] ${target.name}: corpo ${res.status} sem campo 'error': ${text.slice(0, 200)}`,
      );
    }
  });
}

// ── Testes de versionamento (webhook-receiver) ────────────────────────────

Deno.test(
  '[Version] webhook-receiver v1 → x-api-version: v1 header + valid v1 body returns non-401/403',
  async () => {
    // Corpo válido para WebhookReceiverContracts.v1
    const validV1Body = {
      event_type: 'test.event',
      payload: { foo: 'bar' },
    };
    const res = await fetch(fnUrl('webhook-receiver'), {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        'Content-Type': 'application/json',
        'x-api-version': 'v1',
      },
      body: JSON.stringify(validV1Body),
    });
    await res.body?.cancel();
    assert(
      res.status !== 401 && res.status !== 403,
      `[Version] webhook-receiver v1: esperado status não-401/403, recebido ${res.status}`,
    );
  },
);

Deno.test('[Version] webhook-receiver → unsupported version returns 400', async () => {
  const res = await fetch(fnUrl('webhook-receiver'), {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      Authorization: `Bearer ${ANON}`,
      apikey: ANON,
      'Content-Type': 'application/json',
      'x-api-version': 'v999',
    },
    body: JSON.stringify({ event_type: 'test.event' }),
  });
  const text = await res.text();
  assert(
    res.status === 400,
    `[Version] webhook-receiver v999: esperado 400, recebido ${res.status}: ${text.slice(0, 200)}`,
  );
});

// ── CORS em respostas de erro com origem desconhecida ─────────────────────

Deno.test(
  '[CORS] error responses from semantic-search do NOT reflect unknown origins',
  async () => {
    const evil = 'https://evil.example.com';
    // Payload inválido para forçar 4xx (o campo 'query' é obrigatório)
    const res = await fetch(fnUrl('semantic-search'), {
      method: 'POST',
      headers: {
        Origin: evil,
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    await res.body?.cancel();
    const allowOrigin = res.headers.get('access-control-allow-origin');
    assert(
      allowOrigin !== evil,
      `[CORS] semantic-search refletiu a origem maliciosa "${evil}" em resposta de erro`,
    );
  },
);

// ── CORS preflight: origem não whitelistada não é refletida ───────────────

Deno.test('[CORS] origem não whitelistada não é refletida', async () => {
  const evil = 'https://evil.example.com';
  const res = await fetch(fnUrl('semantic-search'), {
    method: 'OPTIONS',
    headers: {
      Origin: evil,
      'Access-Control-Request-Method': 'POST',
    },
  });
  await res.body?.cancel();
  assert(res.headers.get('access-control-allow-origin') !== evil, 'CORS refletiu origem maliciosa');
});
