/**
 * Unit-level versioning compatibility tests.
 * No network calls — validates Zod schemas directly.
 */
import { assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  WebhookReceiverContracts,
  LLMGatewayContracts,
  OpenclawWebhookContracts,
  Bitrix24WebhookContracts,
  SlackEventsWebhookContracts,
  ErrorResponseContract,
} from "../_shared/contracts.ts";

// ---------------------------------------------------------------------------
// WebhookReceiver
// ---------------------------------------------------------------------------
Deno.test("WebhookReceiver – v1 accepts minimal payload (event_type only)", () => {
  const r = WebhookReceiverContracts.v1.safeParse({ event_type: "test" });
  assertEquals(r.success, true);
});

Deno.test("WebhookReceiver – v1 rejects empty event_type", () => {
  const r = WebhookReceiverContracts.v1.safeParse({ event_type: "" });
  assertFalse(r.success);
});

Deno.test("WebhookReceiver – v2 requires source (v1 payload without source fails v2)", () => {
  const r = WebhookReceiverContracts.v2.safeParse({
    event_type: "test",
    payload: {},
    timestamp: new Date().toISOString(),
  });
  assertFalse(r.success);
});

Deno.test("WebhookReceiver – v2 accepts full payload with source", () => {
  const r = WebhookReceiverContracts.v2.safeParse({
    event_type: "test",
    payload: { key: "value" },
    timestamp: new Date().toISOString(),
    source: "myapp",
  });
  assertEquals(r.success, true);
});

Deno.test("WebhookReceiver – v1 still valid when v2 contract exists", () => {
  const payload = { event_type: "legacy_event", payload: { old: true } };
  const v1 = WebhookReceiverContracts.v1.safeParse(payload);
  const v2 = WebhookReceiverContracts.v2.safeParse(payload);
  assertEquals(v1.success, true, "v1 must still accept legacy payloads");
  assertFalse(v2.success, "v2 must reject v1-only payloads");
});

// ---------------------------------------------------------------------------
// LLMGateway
// ---------------------------------------------------------------------------
Deno.test("LLMGateway – v1 workspace_id and agent_id are optional", () => {
  const r = LLMGatewayContracts.v1.safeParse({
    model: "claude-sonnet-5",
    messages: [{ role: "user", content: "Hello" }],
  });
  assertEquals(r.success, true);
});

Deno.test("LLMGateway – v2 requires workspace_id and agent_id", () => {
  const r = LLMGatewayContracts.v2.safeParse({
    model: "claude-sonnet-5",
    messages: [{ role: "user", content: "Hello" }],
  });
  assertFalse(r.success);
  if (!r.success) {
    const paths = r.error.issues.map(i => i.path.join("."));
    assertEquals(paths.includes("workspace_id"), true);
    assertEquals(paths.includes("agent_id"), true);
  }
});

Deno.test("LLMGateway – v1 payload still accepted by v1 when v2 deployed", () => {
  const v1Payload = {
    model: "claude-sonnet-5",
    messages: [{ role: "user", content: "Hi" }],
  };
  assertEquals(LLMGatewayContracts.v1.safeParse(v1Payload).success, true);
  assertFalse(LLMGatewayContracts.v2.safeParse(v1Payload).success);
});

Deno.test("LLMGateway – v2 accepts tools and tool_choice", () => {
  const r = LLMGatewayContracts.v2.safeParse({
    model: "claude-sonnet-5",
    messages: [{ role: "user", content: "Use a tool" }],
    workspace_id: "00000000-0000-0000-0000-000000000001",
    agent_id: "00000000-0000-0000-0000-000000000002",
    tools: [{ name: "search", description: "Search the web" }],
    tool_choice: "auto",
  });
  assertEquals(r.success, true);
});

Deno.test("LLMGateway – v2 rejects invalid tool_choice value", () => {
  const r = LLMGatewayContracts.v2.safeParse({
    model: "claude-sonnet-5",
    messages: [{ role: "user", content: "Hi" }],
    workspace_id: "00000000-0000-0000-0000-000000000001",
    agent_id: "00000000-0000-0000-0000-000000000002",
    tool_choice: "invalid_value",
  });
  assertFalse(r.success);
});

// ---------------------------------------------------------------------------
// Openclaw Webhook
// ---------------------------------------------------------------------------
Deno.test("Openclaw – v1 accepts payload with type only", () => {
  const r = OpenclawWebhookContracts.v1.safeParse({ type: "message.inbound" });
  assertEquals(r.success, true);
});

Deno.test("Openclaw – v1 accepts unknown type strings", () => {
  const r = OpenclawWebhookContracts.v1.safeParse({ type: "custom.event" });
  assertEquals(r.success, true);
});

Deno.test("Openclaw – v2 requires event_id, workspace_id, instance_name, data", () => {
  const r = OpenclawWebhookContracts.v2.safeParse({ type: "message.inbound" });
  assertFalse(r.success);
  if (!r.success) {
    const paths = r.error.issues.map(i => i.path.join("."));
    assertEquals(paths.includes("event_id"), true);
    assertEquals(paths.includes("workspace_id"), true);
    assertEquals(paths.includes("instance_name"), true);
    assertEquals(paths.includes("data"), true);
  }
});

Deno.test("Openclaw – v2 rejects unknown type enum value", () => {
  const r = OpenclawWebhookContracts.v2.safeParse({
    event_id: "evt_001",
    type: "custom.event",
    workspace_id: "00000000-0000-0000-0000-000000000001",
    instance_name: "bot",
    data: {},
  });
  assertFalse(r.success);
});

Deno.test("Openclaw – v2 rejects non-UUID workspace_id", () => {
  const r = OpenclawWebhookContracts.v2.safeParse({
    event_id: "evt_001",
    type: "message.inbound",
    workspace_id: "not-a-uuid",
    instance_name: "bot",
    data: {},
  });
  assertFalse(r.success);
  if (!r.success) {
    const paths = r.error.issues.map(i => i.path.join("."));
    assertEquals(paths.includes("workspace_id"), true);
  }
});

Deno.test("Openclaw – v2 full valid payload", () => {
  const r = OpenclawWebhookContracts.v2.safeParse({
    event_id: "evt_abc123",
    type: "instance.status",
    workspace_id: "00000000-0000-0000-0000-000000000001",
    instance_name: "promo-brindes",
    data: { status: "connected", phone_number: "+5511999999999" },
  });
  assertEquals(r.success, true);
});

// ---------------------------------------------------------------------------
// Bitrix24 Webhook
// ---------------------------------------------------------------------------
Deno.test("Bitrix24 – v1 accepts empty object (passthrough)", () => {
  const r = Bitrix24WebhookContracts.v1.safeParse({});
  assertEquals(r.success, true);
});

Deno.test("Bitrix24 – v1 accepts any extra keys via passthrough", () => {
  const r = Bitrix24WebhookContracts.v1.safeParse({
    event: "ONCRMLEADADD",
    random_extra_key: 42,
  });
  assertEquals(r.success, true);
});

Deno.test("Bitrix24 – v2 requires event (missing → fails)", () => {
  const r = Bitrix24WebhookContracts.v2.safeParse({
    auth: { domain: "example.bitrix24.com", application_token: "tok" },
    data: {},
  });
  assertFalse(r.success);
  if (!r.success) {
    const paths = r.error.issues.map(i => i.path.join("."));
    assertEquals(paths.includes("event"), true);
  }
});

Deno.test("Bitrix24 – v2 requires auth.domain and auth.application_token", () => {
  const r = Bitrix24WebhookContracts.v2.safeParse({
    event: "ONCRMLEADADD",
    auth: {},
    data: {},
  });
  assertFalse(r.success);
  if (!r.success) {
    const paths = r.error.issues.map(i => i.path.join("."));
    assertEquals(paths.includes("auth.domain"), true);
    assertEquals(paths.includes("auth.application_token"), true);
  }
});

Deno.test("Bitrix24 – v1 payload fails v2 (backward-compat boundary)", () => {
  const v1Payload = { event: "ONCRMLEADADD", auth: { something: "old" } };
  assertFalse(Bitrix24WebhookContracts.v2.safeParse(v1Payload).success);
  assertEquals(Bitrix24WebhookContracts.v1.safeParse(v1Payload).success, true);
});

Deno.test("Bitrix24 – v2 full valid payload", () => {
  const r = Bitrix24WebhookContracts.v2.safeParse({
    event: "ONCRMLEADADD",
    auth: { domain: "example.bitrix24.com", application_token: "token123" },
    data: { FIELDS: { ID: "123" } },
    ts: "1690000000",
  });
  assertEquals(r.success, true);
});

// ---------------------------------------------------------------------------
// Slack Events Webhook
// ---------------------------------------------------------------------------
Deno.test("Slack – v1 accepts url_verification with challenge", () => {
  const r = SlackEventsWebhookContracts.v1.safeParse({
    type: "url_verification",
    challenge: "abc123",
  });
  assertEquals(r.success, true);
});

Deno.test("Slack – v1 accepts legacy token field", () => {
  const r = SlackEventsWebhookContracts.v1.safeParse({
    type: "event_callback",
    token: "legacy_token_value",
    event: { type: "message" },
  });
  assertEquals(r.success, true);
});

Deno.test("Slack – v1 rejects unknown type enum", () => {
  const r = SlackEventsWebhookContracts.v1.safeParse({ type: "unknown_type" });
  assertFalse(r.success);
});

Deno.test("Slack – v2 accepts typed event object", () => {
  const r = SlackEventsWebhookContracts.v2.safeParse({
    type: "event_callback",
    team_id: "T123",
    event_id: "Ev001",
    event: {
      type: "app_mention",
      channel: "C001",
      user: "U001",
      text: "Hello bot",
      ts: "1690000000.000100",
    },
    api_app_id: "A001",
  });
  assertEquals(r.success, true);
});

Deno.test("Slack – v2 event text max 10000 chars enforced", () => {
  const r = SlackEventsWebhookContracts.v2.safeParse({
    type: "event_callback",
    event: { type: "message", text: "x".repeat(10001) },
  });
  assertFalse(r.success);
});

// ---------------------------------------------------------------------------
// ErrorResponseContract
// ---------------------------------------------------------------------------
Deno.test("ErrorResponseContract – minimal valid body (error only)", () => {
  const r = ErrorResponseContract.safeParse({ error: "Not found" });
  assertEquals(r.success, true);
});

Deno.test("ErrorResponseContract – full body with fields array", () => {
  const r = ErrorResponseContract.safeParse({
    error: "Validation failed",
    code: "VALIDATION_ERROR",
    message: "The payload is invalid.",
    fields: [
      { field: "workspace_id", message: "Invalid UUID", code: "invalid_string" },
    ],
  });
  assertEquals(r.success, true);
});

Deno.test("ErrorResponseContract – rejects missing error field", () => {
  const r = ErrorResponseContract.safeParse({
    code: "VALIDATION_ERROR",
    message: "Something went wrong",
  });
  assertFalse(r.success);
});

Deno.test("ErrorResponseContract – fields entry without code is valid", () => {
  const r = ErrorResponseContract.safeParse({
    error: "Validation failed",
    fields: [{ field: "name", message: "Too short" }],
  });
  assertEquals(r.success, true);
});
