import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS } from "../_shared/mod.ts";

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

Deno.serve((req: Request): Response => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const identifier = getRateLimitIdentifier(req);
  const rate = checkRateLimit(identifier, RATE_LIMITS.light);
  if (!rate.success) return createRateLimitResponse(rate.remaining, rate.reset, corsHeaders);

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: jsonHeaders },
    );
  }

  const action = new URL(req.url).searchParams.get("action") ?? "ping";
  if (action !== "ping") {
    return new Response(
      JSON.stringify({ error: "unknown_action" }),
      { status: 400, headers: jsonHeaders },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, function: "migrate-helper" }),
    { status: 200, headers: jsonHeaders },
  );
});