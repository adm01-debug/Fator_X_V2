/**
 * slack-events-webhook (verify_jwt=false)
 *
 * Recebe eventos do Slack (Events API), valida HMAC v0, dedup por event_id,
 * roteia app_mention / message.im para o agente configurado e responde na thread.
 */
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS, requireEnv } from "../_shared/mod.ts";
import { getCorsHeaders, handleCorsPreflight, jsonResponse, errorResponse } from "../_shared/mod.ts";
import { verifySlackSignature, slackApiCall, isDuplicateEvent } from "../_shared/slack.ts";
import { SlackEventsWebhookContracts } from "../_shared/contracts.ts";

interface SlackEventEnvelope {
  type: "url_verification" | "event_callback";
  challenge?: string;
  team_id?: string;
  event_id?: string;
  event?: {
    type: string;
    subtype?: string;
    channel?: string;
    user?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    bot_id?: string;
  };
}

async function callLlmGateway(text: string, agentId: string | null): Promise<string> {
  try {
    const url = `${requireEnv("SUPABASE_URL")}/functions/v1/llm-gateway`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${requireEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: text }],
        agent_id: agentId,
        max_tokens: 800,
      }),
    });
    if (!res.ok) return `Desculpe, não consegui processar (HTTP ${res.status}).`;
    const data = await res.json();
    return data.content ?? data.text ?? data.message ?? "…";
  } catch (err) {
    return `Erro interno: ${err instanceof Error ? err.message : String(err)}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);
  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.light);
  if (!rate.allowed) return createRateLimitResponse(rate, getCorsHeaders(req));
  if (req.method !== "POST") return errorResponse(req, "Method not allowed", 405);

  const signingSecret = requireEnv("SLACK_SIGNING_SECRET");
  const verification = await verifySlackSignature(req, signingSecret);
  if (!verification.isValid) {
    return errorResponse(req, verification.reason ?? "Invalid signature", 401);
  }

  let rawEnvelope: unknown;
  try {
    rawEnvelope = JSON.parse(verification.body!);
  } catch {
    return errorResponse(req, "Invalid JSON", 400);
  }

  const slackValidation = SlackEventsWebhookContracts.v1.safeParse(rawEnvelope);
  if (!slackValidation.success) {
    const corsHeaders = getCorsHeaders(req);
    return new Response(JSON.stringify({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      message: 'The request payload is invalid.',
      fields: slackValidation.error.issues.map(i => ({
        field: i.path.join('.') || '(root)',
        message: i.message,
        code: i.code,
      })),
    }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const envelope: SlackEventEnvelope = slackValidation.data as SlackEventEnvelope;

  if (envelope.type === "url_verification") {
    return new Response(envelope.challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (envelope.type !== "event_callback" || !envelope.event) {
    return jsonResponse(req, { ok: true, ignored: "unknown_type" });
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Dedupe (best-effort)
  if (envelope.event_id && envelope.team_id) {
    try {
      const dup = await isDuplicateEvent(
        supabaseUrl,
        serviceKey,
        envelope.event_id,
        envelope.event.type,
        envelope.team_id
      );
      if (dup) return jsonResponse(req, { ok: true, deduped: true });
    } catch (err) {
      console.warn("[slack-events-webhook] dedupe error:", err);
    }
  }

  const ev = envelope.event;

  // Ignora bot messages e subtypes editados
  if (ev.bot_id || ev.subtype === "bot_message" || ev.subtype === "message_changed") {
    return jsonResponse(req, { ok: true, ignored: "bot_or_edit" });
  }
  if (ev.type !== "app_mention" && ev.type !== "message") {
    return jsonResponse(req, { ok: true, ignored: `unsupported:${ev.type}` });
  }
  if (ev.type === "message" && ev.channel && !ev.channel.startsWith("D")) {
    // só DMs no tipo "message" (canais viriam via app_mention)
    return jsonResponse(req, { ok: true, ignored: "not_dm" });
  }
  if (!ev.text || !ev.channel) {
    return jsonResponse(req, { ok: true, ignored: "empty" });
  }

  // Descobre workspace pelo team_id
  const { data: wsCfg } = await supabase
    .from("slack_workspace_config")
    .select("workspace_id, bot_user_id")
    .eq("slack_team_id", envelope.team_id!)
    .maybeSingle();

  if (!wsCfg) {
    return jsonResponse(req, { ok: true, ignored: "unknown_team" });
  }
  if (ev.user && ev.user === wsCfg.bot_user_id) {
    return jsonResponse(req, { ok: true, ignored: "self" });
  }

  const { data: binding } = await supabase
    .from("slack_bot_bindings")
    .select("default_agent_id, channel_overrides, enabled")
    .eq("workspace_id", wsCfg.workspace_id)
    .maybeSingle();

  if (!binding || !binding.enabled) {
    return jsonResponse(req, { ok: true, ignored: "bot_disabled" });
  }

  const overrides = (binding.channel_overrides as Record<string, string>) ?? {};
  const agentId = overrides[ev.channel] ?? binding.default_agent_id ?? null;

  // Limpa menção "<@BOTID>" do texto
  const cleanText = ev.text.replace(/<@[A-Z0-9]+>/g, "").trim();
  const reply = await callLlmGateway(cleanText || "Olá!", agentId);

  try {
    await slackApiCall("chat.postMessage", {
      channel: ev.channel,
      thread_ts: ev.thread_ts ?? ev.ts,
      text: reply.slice(0, 3900),
    });
  } catch (err) {
    console.error("[slack-events-webhook] reply failed:", err);
  }

  await supabase.from("audit_events").insert({
    workspace_id: wsCfg.workspace_id,
    event_type: "slack_integration",
    action: "bot_replied",
    resource_type: "slack_message",
    resource_id: ev.ts ?? null,
    metadata: { channel: ev.channel, agent_id: agentId, event_type: ev.type },
  });

  return jsonResponse(req, { ok: true, replied: true });
});
