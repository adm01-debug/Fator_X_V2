/**
 * slack-dlq-retry
 * Cron-invoked. Reprocessa itens pendentes de slack_dispatch_dlq com backoff.
 * Move para resolved_at ao suceder ou incrementa attempts (máx 5) ao falhar.
 */
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { handleCorsPreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { slackApiCall } from "../_shared/slack.ts";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);
  if (req.method !== "POST") return errorResponse(req, "Method not allowed", 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: pending, error } = await supabase
    .from("slack_dispatch_dlq")
    .select("id, workspace_id, alert_id, payload, attempts")
    .is("resolved_at", null)
    .lte("next_retry_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("next_retry_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) return errorResponse(req, "Failed to load DLQ", 500, { details: error.message });
  if (!pending || pending.length === 0) return jsonResponse(req, { processed: 0 });

  let resolved = 0;
  let stillFailing = 0;

  for (const item of pending) {
    try {
      const resp = await slackApiCall(
        "chat.postMessage",
        item.payload as Record<string, unknown>
      );
      if (resp.ok) {
        await supabase
          .from("slack_dispatch_dlq")
          .update({ resolved_at: new Date().toISOString() })
          .eq("id", item.id);
        resolved++;
      } else {
        throw new Error(resp.error ?? "unknown");
      }
    } catch (err) {
      const attempts = (item.attempts ?? 1) + 1;
      const backoffMin = Math.min(60, 5 * Math.pow(2, attempts - 1));
      await supabase
        .from("slack_dispatch_dlq")
        .update({
          attempts,
          error: err instanceof Error ? err.message : String(err),
          next_retry_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
        })
        .eq("id", item.id);
      stillFailing++;
    }
  }

  return jsonResponse(req, { processed: pending.length, resolved, still_failing: stillFailing });
});
