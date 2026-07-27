/**
 * slack-rag-sync
 *
 * Sincroniza mensagens de canais Slack como fonte RAG em `agent_memories_v2`.
 * Chamada:
 *   - por cron (todos os canais habilitados do workspace)
 *   - manualmente com { source_id: uuid } para sincronizar um único canal
 *
 * Estratégia:
 *   1. Lista canais habilitados (ou o `source_id` informado).
 *   2. Pagina `conversations.history` desde `oldest_ts`.
 *   3. Sanitiza texto simples (remove tokens tipo email/phone).
 *   4. Insere chunks em `agent_memories_v2` com `source_type='slack'` e
 *      `source_ref = {channel_id, ts}` para evitar duplicatas.
 *   5. Atualiza `oldest_ts`, `last_synced_at`, `message_count`.
 *
 * Limite de segurança: 500 mensagens por canal por execução (evita timeout).
 */

import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { z } from "npm:zod@3.23.8";
import { getCorsHeaders, handleCorsPreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS, requireEnv } from "../_shared/mod.ts";
import { slackApiCall } from "../_shared/slack.ts";

const BodySchema = z
  .object({
    workspace_id: z.string().uuid().optional(),
    source_id: z.string().uuid().optional(),
  })
  .refine((v) => v.workspace_id || v.source_id, {
    message: "workspace_id ou source_id é obrigatório",
  });

const MAX_MESSAGES_PER_RUN = 500;
const PAGE_SIZE = 200;

function sanitize(text: string): string {
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/\+?\d{2}?\s?\(?\d{2,3}\)?\s?\d{4,5}-?\d{4}/g, "[PHONE]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[CARD]")
    .slice(0, 8000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);
  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.medium);
  if (!rate.allowed) return createRateLimitResponse(rate, getCorsHeaders(req));
  if (req.method !== "POST") return errorResponse(req, "Method not allowed", 405);

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return errorResponse(req, "Invalid payload", 400, {
      details: err instanceof z.ZodError ? err.flatten() : String(err),
    });
  }

  if (!requireEnv("SLACK_BOT_TOKEN")) {
    return errorResponse(req, "SLACK_BOT_TOKEN não configurado", 503);
  }

  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const query = supabase
    .from("slack_rag_sources")
    .select("id, workspace_id, channel_id, channel_name, oldest_ts, message_count")
    .eq("enabled", true);

  if (body.source_id) query.eq("id", body.source_id);
  else if (body.workspace_id) query.eq("workspace_id", body.workspace_id);

  const { data: sources, error: srcErr } = await query;
  if (srcErr) return errorResponse(req, "Failed to load sources", 500, { details: srcErr.message });
  if (!sources || sources.length === 0) {
    return jsonResponse(req, { skipped: true, reason: "no_sources" });
  }

  const results: Array<{
    source_id: string;
    channel: string;
    ingested: number;
    error?: string;
  }> = [];

  for (const src of sources) {
    try {
      let cursor: string | undefined;
      let ingested = 0;
      let newestSeen = src.oldest_ts ?? "0";

      pageLoop: while (ingested < MAX_MESSAGES_PER_RUN) {
        const params = new URLSearchParams({
          channel: src.channel_id,
          limit: String(PAGE_SIZE),
          oldest: src.oldest_ts ?? "0",
        });
        if (cursor) params.set("cursor", cursor);

        const resp = await slackApiCall<{
          messages: Array<{ ts: string; user?: string; text?: string; subtype?: string; bot_id?: string }>;
          has_more?: boolean;
          response_metadata?: { next_cursor?: string };
        }>("conversations.history", params);

        if (!resp.ok) {
          throw new Error(resp.error || "conversations.history failed");
        }

        type SlackMsg = { subtype?: string; bot_id?: string; text?: string; ts: string; user?: string };
        type HistoryResp = { messages?: SlackMsg[]; response_metadata?: { next_cursor?: string }; has_more?: boolean };
        const r = resp as unknown as HistoryResp;
        const messages: SlackMsg[] = r.messages ?? [];
        if (messages.length === 0) break;

        const rows = messages
          .filter((m) => !m.subtype && !m.bot_id && m.text && m.text.length > 0)
          .map((m) => {
            if (m.ts > newestSeen) newestSeen = m.ts;
            return {
              workspace_id: src.workspace_id,
              content: sanitize(m.text!),
              source_type: "slack",
              source_ref: { channel_id: src.channel_id, ts: m.ts, user: m.user ?? null },
              importance: 0.5,
              tier: "warm",
            };
          });

        if (rows.length > 0) {
          const { error: insErr } = await supabase
            .from("agent_memories_v2")
            .upsert(rows, { onConflict: "workspace_id,source_type,source_ref", ignoreDuplicates: true });
          if (insErr) {
            // Tabela pode não ter a constraint; loga e prossegue sem duplicar-checar
            console.warn("[slack-rag-sync] insert warning:", insErr.message);
          }
          ingested += rows.length;
        }

        cursor = r.response_metadata?.next_cursor;
        if (!cursor || !r.has_more) break pageLoop;
      }

      await supabase
        .from("slack_rag_sources")
        .update({
          oldest_ts: newestSeen,
          last_synced_at: new Date().toISOString(),
          last_sync_status: "ok",
          last_sync_error: null,
          message_count: (src.message_count ?? 0) + ingested,
        })
        .eq("id", src.id);

      results.push({ source_id: src.id, channel: src.channel_id, ingested });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase
        .from("slack_rag_sources")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_status: "error",
          last_sync_error: msg.slice(0, 500),
        })
        .eq("id", src.id);
      results.push({ source_id: src.id, channel: src.channel_id, ingested: 0, error: msg });
    }
  }

  return jsonResponse(req, { synced: results.length, results });
});
