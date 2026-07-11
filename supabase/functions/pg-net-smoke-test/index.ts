// Smoke test para pg_net: dispara net.http_post via RPC, aguarda resposta e mede latência.
// Uso: POST /pg-net-smoke-test  (opcional body: { "url": "https://httpbin.org/post", "timeout_ms": 8000 })
// Retorna: { ok, request_id, status_code, latency_ms, extension_schema, phase }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  url: z.string().url().optional(),
  timeout_ms: z.number().int().min(500).max(30_000).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const raw = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const targetUrl = parsed.data.url ?? "https://httpbin.org/post";
    const timeoutMs = parsed.data.timeout_ms ?? 8000;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // 1. Descobre em qual schema o pg_net está
    const { data: schemaRow, error: schemaErr } = await supabase.rpc("pg_net_schema");
    if (schemaErr) return json({ error: "schema_lookup_failed", details: schemaErr.message }, 500);
    const extensionSchema = schemaRow as string;

    // 2. Dispara POST via pg_net
    const started = Date.now();
    const { data: reqIdData, error: postErr } = await supabase.rpc("pg_net_smoke_post", {
      _url: targetUrl,
      _body: { smoke_test: true, ts: new Date().toISOString() },
    });
    if (postErr) {
      return json({
        ok: false,
        phase: "dispatch",
        extension_schema: extensionSchema,
        error: postErr.message,
      }, 500);
    }
    const requestId = reqIdData as number;

    // 3. Polling da resposta (net._http_response é preenchido async pelo worker)
    let statusCode: number | null = null;
    let errorMsg: string | null = null;
    const deadline = started + timeoutMs;
    while (Date.now() < deadline) {
      const { data: resp } = await supabase.rpc("pg_net_smoke_response", { _request_id: requestId });
      const row = Array.isArray(resp) && resp.length > 0 ? resp[0] : null;
      if (row?.status_code != null || row?.error_msg != null) {
        statusCode = row.status_code ?? null;
        errorMsg = row.error_msg ?? null;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    const latencyMs = Date.now() - started;
    const ok = statusCode !== null && statusCode >= 200 && statusCode < 400;

    return json({
      ok,
      phase: ok ? "delivered" : (statusCode === null ? "timeout" : "http_error"),
      request_id: requestId,
      status_code: statusCode,
      error_msg: errorMsg,
      latency_ms: latencyMs,
      timeout_ms: timeoutMs,
      extension_schema: extensionSchema,
      target: targetUrl,
    }, ok ? 200 : 502);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
