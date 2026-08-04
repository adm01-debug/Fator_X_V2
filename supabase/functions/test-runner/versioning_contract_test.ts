// Unit-level versioning contract tests — no network calls required.

import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  Bitrix24WebhookContracts,
  LLMGatewayContracts,
  OpenclawWebhookContracts,
  SlackEventsWebhookContracts,
  WebhookReceiverContracts,
} from "../_shared/contracts.ts";
import { parseBody } from "../_shared/validation.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a POST Request with a JSON-serialised body and an optional
 * x-api-version header.  When `version` is omitted the header is not sent,
 * which lets the parseBody fallback logic kick in (defaults to 'v1').
 */
function makeReq(body: unknown, version?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (version !== undefined) {
    headers["x-api-version"] = version;
  }
  return new Request("https://functions.supabase.co/test-versioning", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Assert that `result` represents a 422 validation failure with the canonical
 * unified error shape produced by parseBody / formatZodErrors.
 *
 * Optionally pass `fieldPath` (dot-notation string) to verify that at least
 * one entry in `fields` matches that path exactly.
 *
 * Returns the parsed JSON body for additional assertions in the caller.
 */
// deno-lint-ignore no-explicit-any
async function expect422(result: any, fieldPath?: string): Promise<any> {
  assertEquals(result.data, null, "data must be null on a validation error");
  assertExists(result.error, "error Response must be present");
  assertEquals(result.error.status, 422, "HTTP status must be 422");

  const body = await result.error.json();

  assertEquals(typeof body.error, "string", "body.error must be a string");
  assertEquals(body.code, "VALIDATION_ERROR", "body.code must equal VALIDATION_ERROR");
  assertEquals(typeof body.message, "string", "body.message must be a string");
  assert(Array.isArray(body.fields), "body.fields must be an array");

  for (const f of body.fields) {
    assertEquals(
      typeof f.field,
      "string",
      `fields[n].field must be a string — got: ${JSON.stringify(f)}`,
    );
    assertEquals(
      typeof f.message,
      "string",
      `fields[n].message must be a string — got: ${JSON.stringify(f)}`,
    );
  }

  if (fieldPath !== undefined) {
    const found = body.fields.some(
      (f: { field: string }) => f.field === fieldPath,
    );
    assert(
      found,
      `Expected fieldPath "${fieldPath}" in fields but got: [${
        body.fields.map((f: { field: string }) => f.field).join(", ")
      }]`,
    );
  }

  return body;
}

/**
 * Assert that `result` represents a successful parse (data not null, error null).
 */
// deno-lint-ignore no-explicit-any
function expectSuccess(result: any): void {
  assertEquals(result.error, null, "error must be null on success");
  assertExists(result.data, "data must not be null on success");
}

// ---------------------------------------------------------------------------
// Section 1: WebhookReceiver versioning
// ---------------------------------------------------------------------------

Deno.test(
  "[WebhookReceiver v1→v1] valid v1 payload with x-api-version: v1 → success",
  async () => {
    const result = await parseBody(
      makeReq({ event_type: "order.created" }, "v1"),
      WebhookReceiverContracts,
    );
    expectSuccess(result);
    assertEquals(result.version, "v1");
    // deno-lint-ignore no-explicit-any
    assertEquals((result.data as any).event_type, "order.created");
  },
);

Deno.test(
  "[WebhookReceiver v1→v2] v1 payload with x-api-version: v2 → 422 (missing source/timestamp/payload)",
  async () => {
    // A minimal v1 payload lacks source, required payload, and required timestamp
    const result = await parseBody(
      makeReq({ event_type: "order.created" }, "v2"),
      WebhookReceiverContracts,
    );
    const body = await expect422(result);
    const fieldNames: string[] = body.fields.map((f: { field: string }) => f.field);
    assert(fieldNames.includes("source"), "source must be reported as missing in v2");
    assert(fieldNames.includes("payload"), "payload must be reported as missing in v2");
    assert(fieldNames.includes("timestamp"), "timestamp must be reported as missing in v2");
  },
);

Deno.test(
  "[WebhookReceiver v2→v1] v2 payload sent as v1 → success (v1 is more permissive)",
  async () => {
    // v1 only requires event_type; extra v2-specific fields (source, metadata)
    // are unknown keys and are silently stripped by Zod's default strip mode.
    const v2Payload = {
      event_type: "order.updated",
      payload: { order_id: "abc123", status: "shipped" },
      timestamp: new Date().toISOString(),
      source: "erp-connector",
      metadata: { trace_id: crypto.randomUUID(), attempt: 1 },
    };
    const result = await parseBody(makeReq(v2Payload, "v1"), WebhookReceiverContracts);
    expectSuccess(result);
    assertEquals(result.version, "v1");
    // deno-lint-ignore no-explicit-any
    assertEquals((result.data as any).event_type, "order.updated");
  },
);

Deno.test(
  "[WebhookReceiver v2→v2] valid v2 payload with x-api-version: v2 → success",
  async () => {
    const v2Payload = {
      event_type: "order.completed",
      payload: { order_id: "xyz789", total: 199.9 },
      timestamp: new Date().toISOString(),
      source: "shopify-connector",
      metadata: { trace_id: crypto.randomUUID(), attempt: 1 },
    };
    const result = await parseBody(makeReq(v2Payload, "v2"), WebhookReceiverContracts);
    expectSuccess(result);
    assertEquals(result.version, "v2");
    // deno-lint-ignore no-explicit-any
    const data = result.data as any;
    assertEquals(data.event_type, "order.completed");
    assertEquals(data.source, "shopify-connector");
  },
);

Deno.test(
  "[WebhookReceiver fallback] no x-api-version header → defaults to v1 → success for v1 payload",
  async () => {
    // No version argument → no header → parseBody falls back to 'v1'
    const result = await parseBody(
      makeReq({ event_type: "ping" }),
      WebhookReceiverContracts,
    );
    expectSuccess(result);
    assertEquals(result.version, "v1", "version must default to v1 when header is absent");
  },
);

Deno.test(
  "[WebhookReceiver] unsupported version header (v99) → 400 error",
  async () => {
    // 'v99' does not exist in WebhookReceiverContracts → parseBody returns 400
    const result = await parseBody(
      makeReq({ event_type: "ping" }, "v99"),
      WebhookReceiverContracts,
    );
    assertEquals(result.data, null);
    assertExists(result.error);
    assertEquals(result.error.status, 400, "unsupported API version must return 400 not 422");
    assertEquals(result.version, "v99");
  },
);

// ---------------------------------------------------------------------------
// Section 2: LLMGateway versioning
// ---------------------------------------------------------------------------

const _llmModel = "claude-3-opus-20240229";
const _llmMessages = [{ role: "user" as const, content: "Hello, world!" }];

Deno.test(
  "[LLMGateway v1] valid minimal payload without workspace_id → success (v1 optional)",
  async () => {
    const result = await parseBody(
      makeReq({ model: _llmModel, messages: _llmMessages }, "v1"),
      LLMGatewayContracts,
    );
    expectSuccess(result);
    assertEquals(result.version, "v1");
    // deno-lint-ignore no-explicit-any
    assertEquals((result.data as any).model, _llmModel);
  },
);

Deno.test(
  "[LLMGateway v1→v2] same payload as v1 with x-api-version: v2 → 422 (workspace_id required)",
  async () => {
    // workspace_id and agent_id are optional in v1 but required in v2
    const result = await parseBody(
      makeReq({ model: _llmModel, messages: _llmMessages }, "v2"),
      LLMGatewayContracts,
    );
    const body = await expect422(result);
    const fieldNames: string[] = body.fields.map((f: { field: string }) => f.field);
    assert(fieldNames.includes("workspace_id"), "workspace_id must be flagged as required in v2");
    assert(fieldNames.includes("agent_id"), "agent_id must be flagged as required in v2");
  },
);

Deno.test(
  "[LLMGateway v2] full payload with workspace_id + agent_id + tools → success",
  async () => {
    const payload = {
      model: _llmModel,
      messages: _llmMessages,
      workspace_id: crypto.randomUUID(),
      agent_id: crypto.randomUUID(),
      tools: [
        {
          name: "web_search",
          description: "Search the web for current information",
          parameters: { query: { type: "string" } },
        },
        { name: "calculator", description: "Evaluate arithmetic expressions" },
      ],
      tool_choice: "auto",
    };
    const result = await parseBody(makeReq(payload, "v2"), LLMGatewayContracts);
    expectSuccess(result);
    assertEquals(result.version, "v2");
    // deno-lint-ignore no-explicit-any
    assertEquals((result.data as any).tools?.length, 2);
  },
);

Deno.test(
  "[LLMGateway v2] tools array exceeds 20 items → 422",
  async () => {
    // v2 schema: tools.max(20) — 21 items must fail
    const tooManyTools = Array.from({ length: 21 }, (_, i) => ({
      name: `tool_${String(i).padStart(2, "0")}`,
      description: `Auto-generated tool number ${i}`,
    }));
    const payload = {
      model: _llmModel,
      messages: _llmMessages,
      workspace_id: crypto.randomUUID(),
      agent_id: crypto.randomUUID(),
      tools: tooManyTools,
    };
    const result = await parseBody(makeReq(payload, "v2"), LLMGatewayContracts);
    await expect422(result, "tools");
  },
);

Deno.test(
  "[LLMGateway v2] tool_choice invalid value → 422 with field 'tool_choice'",
  async () => {
    const payload = {
      model: _llmModel,
      messages: _llmMessages,
      workspace_id: crypto.randomUUID(),
      agent_id: crypto.randomUUID(),
      // "always" is not in the enum ['auto', 'none', 'required']
      tool_choice: "always",
    };
    const result = await parseBody(makeReq(payload, "v2"), LLMGatewayContracts);
    await expect422(result, "tool_choice");
  },
);

Deno.test(
  "[LLMGateway backward] v1 clients can still send without workspace_id when header is v1",
  async () => {
    // Confirm v1 backward-compatibility after v2 introduced required workspace_id/agent_id
    const result = await parseBody(
      makeReq({
        model: _llmModel,
        messages: [{ role: "user", content: "Summarise this document." }],
        temperature: 0.5,
        max_tokens: 2000,
        stream: false,
        // workspace_id intentionally absent — valid for v1
      }, "v1"),
      LLMGatewayContracts,
    );
    expectSuccess(result);
    // workspace_id is optional in v1 — absent input means undefined output
    // deno-lint-ignore no-explicit-any
    assertEquals((result.data as any).workspace_id, undefined);
  },
);

// ---------------------------------------------------------------------------
// Section 3: Openclaw versioning
// ---------------------------------------------------------------------------

Deno.test(
  "[OpenclawWebhook v1] only type field → success",
  async () => {
    const result = await parseBody(
      makeReq({ type: "custom.arbitrary.event" }, "v1"),
      OpenclawWebhookContracts,
    );
    expectSuccess(result);
    assertEquals(result.version, "v1");
    // deno-lint-ignore no-explicit-any
    assertEquals((result.data as any).type, "custom.arbitrary.event");
  },
);

Deno.test(
  "[OpenclawWebhook v1] missing type → 422",
  async () => {
    // type is the only required field in v1
    const result = await parseBody(
      makeReq({ event_id: "evt-001", workspace_id: "ws-999" }, "v1"),
      OpenclawWebhookContracts,
    );
    await expect422(result, "type");
  },
);

Deno.test(
  "[OpenclawWebhook v2] full strict payload → success",
  async () => {
    const payload = {
      event_id: "evt-1a2b3c4d5e6f",
      type: "message.inbound",
      workspace_id: crypto.randomUUID(),
      instance_name: "whatsapp-prod-01",
      data: { from: "5511999999999", body: "Olá!" },
    };
    const result = await parseBody(makeReq(payload, "v2"), OpenclawWebhookContracts);
    expectSuccess(result);
    // deno-lint-ignore no-explicit-any
    const data = result.data as any;
    assertEquals(data.type, "message.inbound");
    assertEquals(data.instance_name, "whatsapp-prod-01");
  },
);

Deno.test(
  "[OpenclawWebhook v2] invalid type enum → 422 with field 'type'",
  async () => {
    const payload = {
      event_id: "evt-001",
      // 'connection.opened' is not in the v2 enum
      type: "connection.opened",
      workspace_id: crypto.randomUUID(),
      instance_name: "whatsapp-dev",
      data: { status: "new" },
    };
    const result = await parseBody(makeReq(payload, "v2"), OpenclawWebhookContracts);
    await expect422(result, "type");
  },
);

Deno.test(
  "[OpenclawWebhook v2] workspace_id not UUID → 422 with field 'workspace_id'",
  async () => {
    const payload = {
      event_id: "evt-001",
      type: "instance.status",
      workspace_id: "not-a-valid-uuid-string",
      instance_name: "prod-instance-a",
      data: { connected: true },
    };
    const result = await parseBody(makeReq(payload, "v2"), OpenclawWebhookContracts);
    await expect422(result, "workspace_id");
  },
);

Deno.test(
  "[OpenclawWebhook v1→v2 compat] v2 payload is valid for v1 (extra fields ignored for v1 permissive)",
  async () => {
    // A full v2 payload sent with version header 'v1' must succeed because
    // v1 only requires `type` and silently strips fields it does not know.
    const v2Payload = {
      event_id: "evt-abc123",
      type: "instance.disconnected",
      workspace_id: crypto.randomUUID(),
      instance_name: "backup-instance",
      data: { reason: "network_timeout" },
    };
    const result = await parseBody(makeReq(v2Payload, "v1"), OpenclawWebhookContracts);
    expectSuccess(result);
    // deno-lint-ignore no-explicit-any
    assertEquals((result.data as any).type, "instance.disconnected");
  },
);

// ---------------------------------------------------------------------------
// Section 4: Bitrix24 versioning
// ---------------------------------------------------------------------------

Deno.test(
  "[Bitrix24 v1] empty payload → success (passthrough)",
  async () => {
    // v1 uses .passthrough() and all fields are optional
    const result = await parseBody(makeReq({}, "v1"), Bitrix24WebhookContracts);
    expectSuccess(result);
    assertEquals(result.version, "v1");
  },
);

Deno.test(
  "[Bitrix24 v1] full payload → success",
  async () => {
    const payload = {
      event: "ONCRMDEALUPDATE",
      auth: {
        domain: "example.bitrix24.com",
        application_token: "tok_abc",
        // extra key — preserved by passthrough
        access_token: "at_xyz",
        user_id: "7",
      },
      data: { FIELDS: { ID: "1001", TITLE: "Enterprise Renewal", STAGE_ID: "WON" } },
      ts: "1700000000",
    };
    const result = await parseBody(makeReq(payload, "v1"), Bitrix24WebhookContracts);
    expectSuccess(result);
  },
);

Deno.test(
  "[Bitrix24 v2] missing event → 422 with field 'event'",
  async () => {
    const payload = {
      // event intentionally absent
      auth: { domain: "example.bitrix24.com", application_token: "tok" },
      data: { FIELDS: {} },
      ts: "1700000000",
    };
    const result = await parseBody(makeReq(payload, "v2"), Bitrix24WebhookContracts);
    await expect422(result, "event");
  },
);

Deno.test(
  "[Bitrix24 v2] event empty string → 422 with field 'event'",
  async () => {
    const payload = {
      event: "", // min(1) violation
      auth: { domain: "example.bitrix24.com", application_token: "tok" },
      data: { FIELDS: {} },
    };
    const result = await parseBody(makeReq(payload, "v2"), Bitrix24WebhookContracts);
    await expect422(result, "event");
  },
);

Deno.test(
  "[Bitrix24 v2] missing auth.domain → 422 with field containing 'auth'",
  async () => {
    const payload = {
      event: "ONCRMDEALUPDATE",
      auth: { application_token: "tok_value" }, // domain absent
      data: {},
    };
    const result = await parseBody(makeReq(payload, "v2"), Bitrix24WebhookContracts);
    // Zod error path ['auth', 'domain'] → joined as 'auth.domain' by formatZodErrors
    await expect422(result, "auth.domain");
  },
);

Deno.test(
  "[Bitrix24 v2] full valid payload → success",
  async () => {
    const payload = {
      event: "ONCRMDEALUPDATE",
      auth: {
        domain: "mycompany.bitrix24.com",
        application_token: "secret_token_9abc",
      },
      data: { FIELDS: { ID: "42", STAGE_ID: "WON", OPPORTUNITY: "5000" } },
      ts: "1700000001",
    };
    const result = await parseBody(makeReq(payload, "v2"), Bitrix24WebhookContracts);
    expectSuccess(result);
    assertEquals(result.version, "v2");
    // deno-lint-ignore no-explicit-any
    const data = result.data as any;
    assertEquals(data.event, "ONCRMDEALUPDATE");
    assertEquals(data.auth.domain, "mycompany.bitrix24.com");
  },
);

Deno.test(
  "[Bitrix24 v1→v2 break] v1 clients (no event/auth) are rejected by v2 contract",
  async () => {
    // v1 clients relied on passthrough + all-optional schema.
    // Routing the same payload to v2 must now fail because event and auth are required.
    const v1ClientPayload = {
      data: { FIELDS: { ID: "1" } },
      ts: "1700000000",
      // event and auth absent — fine for v1, invalid for v2
    };
    const result = await parseBody(makeReq(v1ClientPayload, "v2"), Bitrix24WebhookContracts);
    const body = await expect422(result);
    const fieldNames: string[] = body.fields.map((f: { field: string }) => f.field);
    assert(fieldNames.includes("event"), "missing event must be flagged for v2");
    // auth or auth.* must appear — Zod may report 'auth' or nested paths
    assert(
      fieldNames.some((n) => n === "auth" || n.startsWith("auth.")),
      "missing auth must be flagged for v2",
    );
  },
);

// ---------------------------------------------------------------------------
// Section 5: SlackEvents versioning
// ---------------------------------------------------------------------------

Deno.test(
  "[SlackEvents v1] url_verification → success",
  async () => {
    const result = await parseBody(
      makeReq({
        type: "url_verification",
        challenge: "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmd",
      }, "v1"),
      SlackEventsWebhookContracts,
    );
    expectSuccess(result);
    // deno-lint-ignore no-explicit-any
    const data = result.data as any;
    assertEquals(data.type, "url_verification");
    assertEquals(data.challenge, "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmd");
  },
);

Deno.test(
  "[SlackEvents v1] unknown type → 422",
  async () => {
    // 'app_mention' is not in the v1 enum ['url_verification', 'event_callback']
    const result = await parseBody(
      makeReq({ type: "app_mention", team_id: "T0123456" }, "v1"),
      SlackEventsWebhookContracts,
    );
    await expect422(result, "type");
  },
);

Deno.test(
  "[SlackEvents v2] event_callback with typed event → success",
  async () => {
    const payload = {
      type: "event_callback",
      team_id: "T0123456",
      event_id: "Ev0123456",
      event: {
        type: "message",
        channel: "C0123456",
        user: "U0123456",
        text: "Hello from a Slack integration test!",
        ts: "1355517523.000005",
        thread_ts: "1355517523.000001",
      },
      api_app_id: "A0123456",
    };
    const result = await parseBody(makeReq(payload, "v2"), SlackEventsWebhookContracts);
    expectSuccess(result);
    assertEquals(result.version, "v2");
    // deno-lint-ignore no-explicit-any
    const data = result.data as any;
    assertEquals(data.type, "event_callback");
    assertEquals(data.event?.type, "message");
    assertEquals(data.event?.channel, "C0123456");
  },
);

Deno.test(
  "[SlackEvents v2] url_verification with challenge → success",
  async () => {
    const result = await parseBody(
      makeReq({ type: "url_verification", challenge: "verify_me_abc" }, "v2"),
      SlackEventsWebhookContracts,
    );
    expectSuccess(result);
    assertEquals(result.version, "v2");
    // deno-lint-ignore no-explicit-any
    assertEquals((result.data as any).challenge, "verify_me_abc");
  },
);

Deno.test(
  "[SlackEvents v1→v2] v1 has token field (legacy), v2 ignores it → v2 accepts if other fields valid",
  async () => {
    // Older Slack workspaces still send a legacy `token` field.
    // The v2 schema does not declare `token`, so Zod strips it silently
    // (default strip mode). The request must succeed as long as the required
    // v2 fields (`type`) are satisfied.
    const legacyPayload = {
      type: "url_verification",
      challenge: "challenge_xyz_9876",
      token: "legacy_xoxb_verification_token", // v1-only legacy field
    };
    const result = await parseBody(
      makeReq(legacyPayload, "v2"),
      SlackEventsWebhookContracts,
    );
    expectSuccess(result);
    // token must not appear in the parsed output — stripped by Zod
    assertEquals(
      // deno-lint-ignore no-explicit-any
      (result.data as Record<string, any>).token,
      undefined,
      "legacy token field must be stripped by v2 schema",
    );
  },
);

// ---------------------------------------------------------------------------
// Section 6: ErrorResponseFormat
//
// Every 422 from parseBody must produce the same unified shape regardless of
// which contract triggered the failure.
// ---------------------------------------------------------------------------

Deno.test(
  "[422 format] error body has { error: string, code: 'VALIDATION_ERROR', message: string, fields: array }",
  async () => {
    // Trigger a simple min(1) violation so we get a 422
    const result = await parseBody(
      makeReq({ event_type: "" }, "v1"),
      WebhookReceiverContracts,
    );
    assertExists(result.error, "error Response must be present");
    assertEquals(result.error.status, 422);

    const body = await result.error.json();

    // Verify each required top-level key with correct type / value
    assertEquals(typeof body.error, "string");
    assertEquals(body.code, "VALIDATION_ERROR");
    assertEquals(typeof body.message, "string");
    assert(Array.isArray(body.fields), "fields must be an array");
    assert(body.fields.length > 0, "fields must not be empty");
  },
);

Deno.test(
  "[422 format] fields[n] always has { field: string, message: string }",
  async () => {
    // Send a completely empty object to trigger at least one missing-field error
    const result = await parseBody(
      makeReq({}, "v1"),
      WebhookReceiverContracts,
    );
    assertExists(result.error);
    assertEquals(result.error.status, 422);

    const body = await result.error.json();
    assert(Array.isArray(body.fields) && body.fields.length > 0);

    for (const f of body.fields) {
      assertEquals(
        typeof f.field,
        "string",
        `fields[n].field must be a string — got: ${JSON.stringify(f)}`,
      );
      assertEquals(
        typeof f.message,
        "string",
        `fields[n].message must be a string — got: ${JSON.stringify(f)}`,
      );
    }
  },
);

Deno.test(
  "[422 format] field path uses dot notation for nested fields (e.g., 'auth.domain')",
  async () => {
    // Trigger the Bitrix24 v2 auth.domain missing error
    const result = await parseBody(
      makeReq({
        event: "ONCRMDEALUPDATE",
        auth: { application_token: "tok" }, // domain absent
        data: {},
      }, "v2"),
      Bitrix24WebhookContracts,
    );
    assertExists(result.error);
    assertEquals(result.error.status, 422);

    const body = await result.error.json();
    // formatZodErrors joins path with '.' → ['auth','domain'] → 'auth.domain'
    const dotField = body.fields.find(
      (f: { field: string }) => f.field === "auth.domain",
    );
    assertExists(
      dotField,
      "nested path must use dot notation 'auth.domain', not array-style or any other format",
    );
  },
);

Deno.test(
  "[422 format] root-level field validation shows '(root)' as field",
  async () => {
    // JSON null passes JSON.parse but Zod's z.object() rejects it at the root
    // with path=[] → formatZodErrors returns '' || '(root)' → '(root)'
    const result = await parseBody(
      makeReq(null, "v1"),
      WebhookReceiverContracts,
    );
    assertExists(result.error);
    assertEquals(result.error.status, 422);

    const body = await result.error.json();
    const rootField = body.fields.find(
      (f: { field: string }) => f.field === "(root)",
    );
    assertExists(
      rootField,
      "a Zod issue with path=[] must be reported with field '(root)'",
    );
  },
);

Deno.test(
  "[422 format] wrong type error has code matching ZodIssueCode",
  async () => {
    // Pass a number where a string is expected → ZodIssueCode.invalid_type
    const result = await parseBody(
      makeReq({ event_type: 99999 }, "v1"),
      WebhookReceiverContracts,
    );
    assertExists(result.error);
    assertEquals(result.error.status, 422);

    const body = await result.error.json();
    const eventTypeField = body.fields.find(
      (f: { field: string }) => f.field === "event_type",
    );
    assertExists(eventTypeField, "'event_type' field error must appear in fields");
    assertEquals(
      eventTypeField.code,
      "invalid_type",
      "ZodIssueCode for a type mismatch must be 'invalid_type'",
    );
  },
);
