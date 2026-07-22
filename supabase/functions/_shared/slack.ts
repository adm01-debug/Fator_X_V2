/**
 * Slack integration shared helpers
 * — HMAC signature verification (v0 scheme)
 * — Web API client wrapper with retry + circuit breaker
 * — Blocks Kit builders for alerts and agent notifications
 */

import { hmacSha256Hex } from "./webhookSignature.ts";
import { constantTimeEqual } from "./security.ts";
import { withRetry } from "./retry.ts";
import { getBreaker } from "./circuitBreaker.ts";

export const SLACK_API_BASE = "https://slack.com/api";
const SIGNATURE_VERSION = "v0";
const REPLAY_WINDOW_SEC = 60 * 5;

// ---------- HMAC (v0) ----------

export interface SlackSignatureVerification {
  isValid: boolean;
  reason?: string;
  body?: string;
}

export async function verifySlackSignature(
  req: Request,
  signingSecret: string | undefined
): Promise<SlackSignatureVerification> {
  if (!signingSecret) {
    return { isValid: false, reason: "SLACK_SIGNING_SECRET is not configured" };
  }

  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");
  if (!timestamp || !signature) {
    return { isValid: false, reason: "Missing Slack signature headers" };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { isValid: false, reason: "Invalid timestamp" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > REPLAY_WINDOW_SEC) {
    return { isValid: false, reason: "Timestamp outside replay window" };
  }

  const body = await req.text();
  const baseString = `${SIGNATURE_VERSION}:${timestamp}:${body}`;
  const expected = `${SIGNATURE_VERSION}=${await hmacSha256Hex(signingSecret, baseString)}`;

  return {
    isValid: constantTimeEqual(expected, signature),
    body,
    reason: constantTimeEqual(expected, signature) ? undefined : "Signature mismatch",
  };
}

// ---------- Web API client ----------

export interface SlackCallOptions {
  botToken?: string;
  timeoutMs?: number;
}

export interface SlackApiResponse<T = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  response_metadata?: { next_cursor?: string; warnings?: string[] };
  [key: string]: unknown;
}

/**
 * Calls Slack Web API with retry + circuit breaker.
 * Slack always returns HTTP 200 — real success/failure is in `ok`.
 */
export async function slackApiCall<T = Record<string, unknown>>(
  method: string,
  payload: Record<string, unknown> | URLSearchParams,
  opts: SlackCallOptions = {}
): Promise<SlackApiResponse<T>> {
  const botToken = opts.botToken ?? Deno.env.get("SLACK_BOT_TOKEN");
  if (!botToken) {
    throw new Error("SLACK_BOT_TOKEN is not configured");
  }

  const breaker = getCircuitBreaker(`slack:${method}`, {
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
  });

  const isForm = payload instanceof URLSearchParams;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${botToken}`,
    "Content-Type": isForm
      ? "application/x-www-form-urlencoded"
      : "application/json; charset=utf-8",
  };
  const body = isForm ? payload.toString() : JSON.stringify(payload);

  const doCall = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
    try {
      const res = await fetch(`${SLACK_API_BASE}/${method}`, {
        method: "POST",
        headers,
        body,
        signal: ctrl.signal,
      });
      const text = await res.text();
      let json: SlackApiResponse<T>;
      try {
        json = JSON.parse(text) as SlackApiResponse<T>;
      } catch {
        throw new Error(
          `Slack ${method} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`
        );
      }
      if (!json.ok) {
        // Some Slack errors are non-retriable; throw to trigger breaker only for transient ones
        const transient = new Set(["ratelimited", "service_unavailable", "internal_error"]);
        if (transient.has(json.error ?? "")) {
          throw new Error(`Slack ${method} transient: ${json.error}`);
        }
      }
      return json;
    } finally {
      clearTimeout(t);
    }
  };

  return await breaker.execute(() =>
    withRetry(doCall, { retries: 3, baseDelayMs: 400, maxDelayMs: 3000 })
  );
}

// ---------- Alert payload builder (Blocks Kit) ----------

export interface AlertBlockInput {
  title: string;
  description?: string;
  severity: "info" | "warning" | "error" | "critical";
  category?: string;
  fields?: Array<{ label: string; value: string }>;
  actionUrl?: string;
  actionLabel?: string;
  mentionUsers?: string[];
}

const SEVERITY_COLORS: Record<AlertBlockInput["severity"], string> = {
  info: "#3B82F6",
  warning: "#F59E0B",
  error: "#EF4444",
  critical: "#B91C1C",
};

const SEVERITY_ICONS: Record<AlertBlockInput["severity"], string> = {
  info: "ℹ️",
  warning: "⚠️",
  error: "🔴",
  critical: "🚨",
};

export function buildAlertPayload(channel: string, input: AlertBlockInput): Record<string, unknown> {
  const icon = SEVERITY_ICONS[input.severity];
  const color = SEVERITY_COLORS[input.severity];
  const mentions =
    input.mentionUsers && input.mentionUsers.length > 0
      ? input.mentionUsers.map((u) => `<@${u}>`).join(" ") + " "
      : "";

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${icon} ${input.title}`.slice(0, 150) },
    },
  ];

  if (input.description) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `${mentions}${input.description}`.slice(0, 3000) },
    });
  }

  if (input.fields && input.fields.length > 0) {
    blocks.push({
      type: "section",
      fields: input.fields.slice(0, 10).map((f) => ({
        type: "mrkdwn",
        text: `*${f.label}*\n${f.value}`.slice(0, 2000),
      })),
    });
  }

  if (input.category || input.severity) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Categoria: *${input.category ?? "sistema"}* · Severidade: *${input.severity.toUpperCase()}*`,
        },
      ],
    });
  }

  if (input.actionUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: input.actionLabel ?? "Abrir no Nexus" },
          url: input.actionUrl,
          style: input.severity === "critical" ? "danger" : "primary",
        },
      ],
    });
  }

  return {
    channel,
    text: `${icon} ${input.title}`, // fallback for notifications
    attachments: [
      {
        color,
        blocks,
      },
    ],
  };
}

// ---------- Idempotent event dedupe ----------

export async function isDuplicateEvent(
  supabaseUrl: string,
  serviceKey: string,
  eventId: string,
  eventType: string,
  teamId: string
): Promise<boolean> {
  // Attempt insert; unique PK violation => duplicate
  const res = await fetch(`${supabaseUrl}/rest/v1/slack_event_dedupe`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({ event_id: eventId, event_type: eventType, team_id: teamId }),
  });
  const text = await res.text();
  if (res.status === 201) return false; // fresh
  if (res.status === 200 || res.status === 409) return true; // duplicate
  throw new Error(`dedupe insert failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
}
