// Contract tests para Edge Functions críticas.
//
// Objetivo:
//   1. Preflight OPTIONS retorna CORS válido (Allow-Origin = origem ou "*").
//   2. Payload inválido é rejeitado com 4xx (Zod ativo) e o corpo é JSON com { error }.
//   3. Respostas de erro preservam CORS.
//   4. Origem maliciosa não é refletida com o Origin exato.
//
// Local:  deno test --allow-net --allow-env supabase/functions/_shared/edge-contract_test.ts
// CI:     job "edge-contracts" em .github/workflows/ci.yml.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, _assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL =
  Deno.env.get("VITE_SUPABASE_URL") ??
  Deno.env.get("SUPABASE_URL") ??
  "https://fqdohnmgmtaycfwsioik.supabase.co";
const ANON =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZG9obm1nbXRheWNmd3Npb2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDMzNjAsImV4cCI6MjA5NDA3OTM2MH0.yj2LQHGB0uE4pOams3Uf4taYTMdMJDAJtWCZsaRwVVM";

const ORIGIN = "https://app.promobrindes.com.br";

type Target = {
  name: string;
  /** Corpo garantidamente inválido para o schema desta função. */
  invalidBody: Record<string, unknown>;
  /** Se true, apenas testa CORS (schema aceita qualquer objeto). */
  corsOnly?: boolean;
};

const TARGETS: Target[] = [
  { name: "semantic-search",       invalidBody: {} },
  { name: "global-search",         invalidBody: { limit: -1 }, corsOnly: true },
  { name: "kb-analyze-gaps",       invalidBody: { knowledge_base_id: "not-a-uuid" } },
  { name: "kb-translate-article",  invalidBody: { article_id: "x" } },
  { name: "voice-transcribe",      invalidBody: {} },
  { name: "voice-synthesize",      invalidBody: {} },
  { name: "graph-execute",         invalidBody: { graph_id: "not-a-uuid" } },
  { name: "incident-orchestrator", invalidBody: { playbook_id: "nope" } },
  { name: "notification-sender",   invalidBody: { channel: "carrier-pigeon" } },
  { name: "widget-proxy",          invalidBody: { message: "" } },
  { name: "quick-agent-test",      invalidBody: {} },
];

const fnUrl = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`;

function assertValidCors(headers: Headers, ctx: string) {
  const allow = headers.get("access-control-allow-origin");
  assert(allow, `${ctx}: Access-Control-Allow-Origin ausente`);
  assert(
    allow === ORIGIN || allow === "*",
    `${ctx}: Allow-Origin inesperado (${allow})`,
  );
}

for (const target of TARGETS) {
  Deno.test(`[CORS preflight] ${target.name}`, async () => {
    const res = await fetch(fnUrl(target.name), {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type, apikey",
      },
    });
    await res.body?.cancel();
    assert(
      [200, 204].includes(res.status),
      `esperado 200/204, recebido ${res.status}`,
    );
    assertValidCors(res.headers, `preflight ${target.name}`);
    const allowHeaders = (res.headers.get("access-control-allow-headers") ?? "")
      .toLowerCase();
    assert(
      allowHeaders.includes("authorization") && allowHeaders.includes("content-type"),
      `${target.name}: Allow-Headers deve incluir authorization e content-type`,
    );
  });

  if (target.corsOnly) continue;

  Deno.test(`[Zod inválido] ${target.name} rejeita com 4xx + CORS`, async () => {
    const res = await fetch(fnUrl(target.name), {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        "Content-Type": "application/json",
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
      parsed && typeof parsed === "object" && "error" in (parsed as object),
      `[${target.name}] corpo sem campo error: ${text.slice(0, 200)}`,
    );
  });
}

Deno.test("[CORS] origem não whitelistada não é refletida", async () => {
  const evil = "https://evil.example.com";
  const res = await fetch(fnUrl("semantic-search"), {
    method: "OPTIONS",
    headers: {
      Origin: evil,
      "Access-Control-Request-Method": "POST",
    },
  });
  await res.body?.cancel();
  assert(
    res.headers.get("access-control-allow-origin") !== evil,
    "CORS refletiu origem maliciosa",
  );
});
