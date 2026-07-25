/**
 * slack-dlq-discard
 * Admin-only. Marca itens "mortos" (attempts >= 5) como resolvidos com nota de descarte.
 */
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { z } from "npm:zod@3.23.8";
import { handleCorsPreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS, requireEnv } from "../_shared/mod.ts";

const MAX_ATTEMPTS = 5;

const BodySchema = z.object({
  workspace_id: z.string().uuid(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);
  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.light);
  if (!rate.success) return createRateLimitResponse(rate.remaining, rate.reset, getCorsHeaders(req));
  if (req.method !== "POST") return errorResponse(req, "Method not allowed", 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return errorResponse(req, "Missing bearer token", 401);

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  // Autentica user
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return errorResponse(req, "Unauthorized", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, "Invalid JSON body", 400);
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(req, "Invalid input", 400, { details: parsed.error.flatten() });
  }
  const { workspace_id } = parsed.data;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verifica se é admin do workspace
  const { data: isAdmin } = await admin.rpc("is_workspace_admin", { p_workspace_id: workspace_id });
  if (!isAdmin) return errorResponse(req, "Forbidden — admin only", 403);

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from("slack_dispatch_dlq")
    .update({ resolved_at: nowIso, error: "discarded_by_admin" })
    .eq("workspace_id", workspace_id)
    .is("resolved_at", null)
    .gte("attempts", MAX_ATTEMPTS)
    .select("id");

  if (updErr) return errorResponse(req, "Failed to discard", 500, { details: updErr.message });

  return jsonResponse(req, { discarded: updated?.length ?? 0 });
});
