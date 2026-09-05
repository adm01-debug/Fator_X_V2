import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  WebhookReceiverContracts,
  WhatsAppWebhookContracts,
  LLMGatewayContracts,
  Bitrix24WebhookContracts,
  OpenclawWebhookContracts,
  SlackEventsWebhookContracts,
  ErrorResponseContract,
} from '../_shared/contracts.ts';
import { parseBody } from '../_shared/validation.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a POST Request with optional x-api-version header. */
function mkReq(body: unknown, version?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (version) headers['x-api-version'] = version;
  return new Request('https://example.com', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Assert that a parseBody result is a 422 VALIDATION_ERROR, then return the
 * parsed response body for further field-level assertions.
 */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function expect422(result: any): Promise<any> {
  assertEquals(result.data, null);
  assertExists(result.error, 'Expected a non-null error response');
  assertEquals(result.error.status, 422);
  const body = await result.error.json();
  assertEquals(body.code, 'VALIDATION_ERROR');
  assertExists(body.fields, 'Expected fields array in 422 body');
  return body;
}

/** Return true when any entry in the fields array matches the given dot-path. */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasField(fields: any[], name: string): boolean {
  return fields.some((f: { field: string }) => f.field === name);
}

// ── Existing tests (preserved exactly) ───────────────────────────────────────

Deno.test('WebhookReceiver Contract - v1 valid payload', async () => {
  const payload = {
    event_type: 'test.event',
    payload: { key: 'value' },
    timestamp: new Date().toISOString(),
  };

  const req = new Request('https://example.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-version': 'v1' },
    body: JSON.stringify(payload),
  });

  const result = await parseBody(req, WebhookReceiverContracts);
  assertEquals(result.error, null);
  assertEquals(result.version, 'v1');
  if (result.data) {
    assertEquals(result.data.event_type, 'test.event');
  } else {
    throw new Error('Data should not be null');
  }
});

Deno.test('WebhookReceiver Contract - v2 missing source (invalid)', async () => {
  const payload = {
    event_type: 'test.event',
    payload: { key: 'value' },
    timestamp: new Date().toISOString(),
    // missing 'source'
  };

  const req = new Request('https://example.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-version': 'v2' },
    body: JSON.stringify(payload),
  });

  const result = await parseBody(req, WebhookReceiverContracts);
  assertEquals(result.data, null);
  assertEquals(result.version, 'v2');
  if (result.error) {
    assertEquals(result.error.status, 422);
    const errorBody = await result.error.json();
    const validation = ErrorResponseContract.safeParse(errorBody);
    assertEquals(validation.success, true);
    assertEquals(errorBody.code, 'VALIDATION_ERROR');
  } else {
    throw new Error('Error should not be null');
  }
});

Deno.test('WhatsApp Webhook Contract - v2 valid meta payload', async () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry_id',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '123456789',
                phone_number_id: 'phone_id',
              },
              messages: [{ id: 'msg_id', from: 'sender', text: { body: 'hello' } }],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };

  const req = new Request('https://example.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-version': 'v2' },
    body: JSON.stringify(payload),
  });

  const result = await parseBody(req, WhatsAppWebhookContracts);
  assertEquals(result.error, null);
  assertEquals(result.version, 'v2');
});

Deno.test('Validation Error Format - 422 fields validation', async () => {
  const req = new Request('https://example.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-version': 'v1' },
    body: JSON.stringify({ event_type: '' }), // Invalid: min(1)
  });

  const result = await parseBody(req, WebhookReceiverContracts);
  if (result.error) {
    assertEquals(result.error.status, 422);
    const errorBody = await result.error.json();
    assertEquals(errorBody.fields[0].field, 'event_type');
    assertEquals(typeof errorBody.fields[0].message, 'string');
  } else {
    throw new Error('Error should not be null');
  }
});

// ── WebhookReceiver - Additional cases ────────────────────────────────────────

Deno.test('WebhookReceiver - v1 valid - minimal payload (only event_type)', async () => {
  const result = await parseBody(
    mkReq({ event_type: 'order.created' }, 'v1'),
    WebhookReceiverContracts,
  );
  assertEquals(result.error, null);
  if (result.data) {
    assertEquals(result.data.event_type, 'order.created');
  } else {
    throw new Error('Data should not be null');
  }
});

Deno.test('WebhookReceiver - v1 invalid - empty event_type string', async () => {
  const result = await parseBody(mkReq({ event_type: '' }, 'v1'), WebhookReceiverContracts);
  const body = await expect422(result);
  assertEquals(body.fields[0].field, 'event_type');
});

Deno.test('WebhookReceiver - v1 invalid - event_type is number not string', async () => {
  const result = await parseBody(mkReq({ event_type: 123 }, 'v1'), WebhookReceiverContracts);
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'event_type'), true);
});

Deno.test('WebhookReceiver - v1 invalid - completely empty body {}', async () => {
  const result = await parseBody(mkReq({}, 'v1'), WebhookReceiverContracts);
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'event_type'), true);
});

Deno.test('WebhookReceiver - v2 invalid - missing timestamp', async () => {
  const result = await parseBody(
    mkReq({ event_type: 'order.created', payload: { x: 1 }, source: 'shopify' }, 'v2'),
    WebhookReceiverContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'timestamp'), true);
});

Deno.test('WebhookReceiver - v2 invalid - missing payload', async () => {
  const result = await parseBody(
    mkReq(
      {
        event_type: 'order.created',
        timestamp: '2024-01-01T00:00:00.000Z',
        source: 'shopify',
      },
      'v2',
    ),
    WebhookReceiverContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'payload'), true);
});

Deno.test('WebhookReceiver - v2 invalid - source is empty string', async () => {
  const result = await parseBody(
    mkReq(
      {
        event_type: 'order.created',
        payload: { x: 1 },
        timestamp: '2024-01-01T00:00:00.000Z',
        source: '',
      },
      'v2',
    ),
    WebhookReceiverContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'source'), true);
});

Deno.test('WebhookReceiver - v2 valid - full payload with metadata', async () => {
  const result = await parseBody(
    mkReq(
      {
        event_type: 'order.created',
        payload: { order_id: 'ORD-001', amount: 149.99 },
        timestamp: '2024-06-01T12:00:00.000Z',
        source: 'shopify',
        metadata: {
          trace_id: '550e8400-e29b-41d4-a716-446655440000',
          attempt: 1,
        },
      },
      'v2',
    ),
    WebhookReceiverContracts,
  );
  assertEquals(result.error, null);
  assertEquals(result.version, 'v2');
  assertExists(result.data);
});

Deno.test(
  'WebhookReceiver - v2 backward compat: v1 payload sent with x-api-version: v1',
  async () => {
    // v1 schema is still present and valid even though v2 exists
    const result = await parseBody(
      mkReq({ event_type: 'order.created' }, 'v1'),
      WebhookReceiverContracts,
    );
    assertEquals(result.error, null);
    assertEquals(result.version, 'v1');
    if (result.data) {
      assertEquals(result.data.event_type, 'order.created');
    } else {
      throw new Error('Data should not be null');
    }
  },
);

Deno.test(
  'WebhookReceiver - version fallback: no x-api-version header defaults to v1',
  async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'order.created' }),
    });
    const result = await parseBody(req, WebhookReceiverContracts);
    assertEquals(result.error, null);
    assertEquals(result.version, 'v1');
  },
);

// ── LLMGateway - Additional cases ─────────────────────────────────────────────

Deno.test('LLMGateway - v1 valid - minimal payload (model + messages)', async () => {
  const result = await parseBody(
    mkReq(
      {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
      },
      'v1',
    ),
    LLMGatewayContracts,
  );
  assertEquals(result.error, null);
  assertEquals(result.version, 'v1');
  assertExists(result.data);
});

Deno.test('LLMGateway - v1 invalid - empty messages array', async () => {
  const result = await parseBody(
    mkReq({ model: 'claude-sonnet-4-6', messages: [] }, 'v1'),
    LLMGatewayContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'messages'), true);
});

Deno.test('LLMGateway - v1 invalid - message role is invalid enum value', async () => {
  const result = await parseBody(
    mkReq(
      {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'admin', content: 'Hello' }],
      },
      'v1',
    ),
    LLMGatewayContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'messages.0.role'), true);
});

Deno.test('LLMGateway - v1 invalid - model is too short', async () => {
  const result = await parseBody(
    mkReq(
      {
        model: 'a', // min(2) violation
        messages: [{ role: 'user', content: 'Hello' }],
      },
      'v1',
    ),
    LLMGatewayContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'model'), true);
});

Deno.test('LLMGateway - v1 invalid - temperature out of range', async () => {
  const result = await parseBody(
    mkReq(
      {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 3.0, // max(2) violation
      },
      'v1',
    ),
    LLMGatewayContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'temperature'), true);
});

Deno.test('LLMGateway - v2 invalid - missing workspace_id', async () => {
  const result = await parseBody(
    mkReq(
      {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
        agent_id: '660e8400-e29b-41d4-a716-446655440001',
      },
      'v2',
    ),
    LLMGatewayContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'workspace_id'), true);
});

Deno.test('LLMGateway - v2 invalid - missing agent_id', async () => {
  const result = await parseBody(
    mkReq(
      {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
        workspace_id: '550e8400-e29b-41d4-a716-446655440000',
      },
      'v2',
    ),
    LLMGatewayContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'agent_id'), true);
});

Deno.test('LLMGateway - v2 invalid - tool_choice invalid value', async () => {
  const result = await parseBody(
    mkReq(
      {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
        workspace_id: '550e8400-e29b-41d4-a716-446655440000',
        agent_id: '660e8400-e29b-41d4-a716-446655440001',
        tool_choice: 'force', // not in enum: auto | none | required
      },
      'v2',
    ),
    LLMGatewayContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'tool_choice'), true);
});

Deno.test('LLMGateway - v2 valid - full payload with tools and tool_choice', async () => {
  const result = await parseBody(
    mkReq(
      {
        model: 'claude-sonnet-4-6',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Search for recent AI news.' },
        ],
        workspace_id: '550e8400-e29b-41d4-a716-446655440000',
        agent_id: '660e8400-e29b-41d4-a716-446655440001',
        session_id: '770e8400-e29b-41d4-a716-446655440002',
        temperature: 0.5,
        max_tokens: 2048,
        stream: false,
        tools: [
          {
            name: 'web_search',
            description: 'Search the web for information',
            parameters: { query: { type: 'string' } },
          },
        ],
        tool_choice: 'auto',
      },
      'v2',
    ),
    LLMGatewayContracts,
  );
  assertEquals(result.error, null);
  assertEquals(result.version, 'v2');
  assertExists(result.data);
});

// ── Bitrix24Webhook - New test section ────────────────────────────────────────

Deno.test(
  'Bitrix24Webhook - v1 valid - empty passthrough payload (no fields required)',
  async () => {
    const result = await parseBody(mkReq({}, 'v1'), Bitrix24WebhookContracts);
    assertEquals(result.error, null);
    assertEquals(result.version, 'v1');
  },
);

Deno.test('Bitrix24Webhook - v1 valid - full event payload', async () => {
  const result = await parseBody(
    mkReq(
      {
        event: 'ONCRMLEADADD',
        auth: {
          domain: 'test.bitrix24.com',
          application_token: 'tok_abc123',
          member_id: 'mem_001',
          user_id: '42',
        },
        data: { FIELDS: { ID: '99', TITLE: 'VIP Lead' } },
        ts: '1700000000',
      },
      'v1',
    ),
    Bitrix24WebhookContracts,
  );
  assertEquals(result.error, null);
});

Deno.test('Bitrix24Webhook - v2 invalid - missing event field', async () => {
  const result = await parseBody(
    mkReq(
      {
        auth: { domain: 'test.bitrix24.com', application_token: 'tok_abc123' },
        data: {},
      },
      'v2',
    ),
    Bitrix24WebhookContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'event'), true);
});

Deno.test('Bitrix24Webhook - v2 invalid - missing auth.domain', async () => {
  const result = await parseBody(
    mkReq(
      {
        event: 'ONCRMLEADADD',
        auth: { application_token: 'tok_abc123' }, // domain omitted
        data: {},
      },
      'v2',
    ),
    Bitrix24WebhookContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'auth.domain'), true);
});

Deno.test('Bitrix24Webhook - v2 invalid - event is empty string', async () => {
  const result = await parseBody(
    mkReq(
      {
        event: '', // min(1) violation
        auth: { domain: 'test.bitrix24.com', application_token: 'tok_abc123' },
        data: {},
      },
      'v2',
    ),
    Bitrix24WebhookContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'event'), true);
});

Deno.test('Bitrix24Webhook - v2 valid - full strict payload', async () => {
  const result = await parseBody(
    mkReq(
      {
        event: 'ONCRMLEADADD',
        auth: {
          domain: 'test.bitrix24.com',
          application_token: 'tok_abc123',
        },
        data: { FIELDS: { ID: '42', TITLE: 'Enterprise Lead' } },
        ts: 1700000000,
      },
      'v2',
    ),
    Bitrix24WebhookContracts,
  );
  assertEquals(result.error, null);
  assertEquals(result.version, 'v2');
  assertExists(result.data);
});

// ── OpenclawWebhook - New test section ────────────────────────────────────────

Deno.test('OpenclawWebhook - v1 valid - only type field (rest optional)', async () => {
  const result = await parseBody(
    mkReq({ type: 'message.inbound' }, 'v1'),
    OpenclawWebhookContracts,
  );
  assertEquals(result.error, null);
  if (result.data) {
    assertEquals(result.data.type, 'message.inbound');
  } else {
    throw new Error('Data should not be null');
  }
});

Deno.test('OpenclawWebhook - v1 invalid - type is missing', async () => {
  // type is z.string() (not optional) in v1
  const result = await parseBody(mkReq({}, 'v1'), OpenclawWebhookContracts);
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'type'), true);
});

Deno.test('OpenclawWebhook - v2 invalid - workspace_id not a UUID', async () => {
  const result = await parseBody(
    mkReq(
      {
        event_id: 'evt_001',
        type: 'message.inbound',
        workspace_id: 'not-a-valid-uuid',
        instance_name: 'my-instance',
        data: {},
      },
      'v2',
    ),
    OpenclawWebhookContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'workspace_id'), true);
});

Deno.test('OpenclawWebhook - v2 invalid - type is unknown enum value', async () => {
  const result = await parseBody(
    mkReq(
      {
        event_id: 'evt_001',
        type: 'unknown.event_type', // not in enum
        workspace_id: '550e8400-e29b-41d4-a716-446655440000',
        instance_name: 'my-instance',
        data: {},
      },
      'v2',
    ),
    OpenclawWebhookContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'type'), true);
});

Deno.test('OpenclawWebhook - v2 invalid - missing event_id', async () => {
  const result = await parseBody(
    mkReq(
      {
        // event_id omitted — required in v2
        type: 'message.inbound',
        workspace_id: '550e8400-e29b-41d4-a716-446655440000',
        instance_name: 'my-instance',
        data: {},
      },
      'v2',
    ),
    OpenclawWebhookContracts,
  );
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'event_id'), true);
});

Deno.test('OpenclawWebhook - v2 valid - full strict payload', async () => {
  const result = await parseBody(
    mkReq(
      {
        event_id: 'evt_abc123',
        type: 'instance.status',
        workspace_id: '550e8400-e29b-41d4-a716-446655440000',
        instance_name: 'production-bot',
        data: { status: 'connected', since: '2024-06-01T12:00:00.000Z' },
      },
      'v2',
    ),
    OpenclawWebhookContracts,
  );
  assertEquals(result.error, null);
  assertEquals(result.version, 'v2');
  assertExists(result.data);
});

// ── SlackEventsWebhook - New test section ─────────────────────────────────────

Deno.test('SlackEventsWebhook - v1 valid - url_verification challenge', async () => {
  const result = await parseBody(
    mkReq(
      {
        type: 'url_verification',
        challenge: '3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXFvin',
        token: 'legacy_slack_token_xyz',
      },
      'v1',
    ),
    SlackEventsWebhookContracts,
  );
  assertEquals(result.error, null);
  if (result.data) {
    assertEquals(result.data.type, 'url_verification');
  } else {
    throw new Error('Data should not be null');
  }
});

Deno.test('SlackEventsWebhook - v1 invalid - type is invalid', async () => {
  // type must be 'url_verification' | 'event_callback'
  const result = await parseBody(mkReq({ type: 'app_mention' }, 'v1'), SlackEventsWebhookContracts);
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'type'), true);
});

Deno.test('SlackEventsWebhook - v2 valid - event_callback with typed event', async () => {
  const result = await parseBody(
    mkReq(
      {
        type: 'event_callback',
        team_id: 'T123ABC',
        event_id: 'Ev123ABC',
        event: {
          type: 'message',
          channel: 'C123ABC',
          user: 'U123ABC',
          text: 'Hello from Slack!',
          ts: '1234567890.000001',
          thread_ts: '1234567890.000000',
        },
        api_app_id: 'A123ABC',
      },
      'v2',
    ),
    SlackEventsWebhookContracts,
  );
  assertEquals(result.error, null);
  assertEquals(result.version, 'v2');
  assertExists(result.data);
});

Deno.test('SlackEventsWebhook - v2 invalid - type missing', async () => {
  // type is required and not optional in v2
  const result = await parseBody(mkReq({}, 'v2'), SlackEventsWebhookContracts);
  const body = await expect422(result);
  assertEquals(hasField(body.fields, 'type'), true);
});

// ── ErrorResponseFormat - Unified 422 format validation ───────────────────────

Deno.test(
  'ErrorResponseFormat - 422 body has error, code=VALIDATION_ERROR, message, and fields array',
  async () => {
    const result = await parseBody(mkReq({ event_type: '' }, 'v1'), WebhookReceiverContracts);
    assertExists(result.error);
    assertEquals(result.error.status, 422);
    const body = await result.error.json();
    assertEquals(typeof body.error, 'string');
    assertEquals(body.code, 'VALIDATION_ERROR');
    assertEquals(typeof body.message, 'string');
    assertEquals(Array.isArray(body.fields), true);
    assertEquals(body.fields.length > 0, true);
  },
);

Deno.test(
  'ErrorResponseFormat - fields entries have field, message, and code properties',
  async () => {
    const result = await parseBody(mkReq({ event_type: '' }, 'v1'), WebhookReceiverContracts);
    assertExists(result.error);
    const body = await result.error.json();
    const f = body.fields[0];
    assertExists(f, 'Expected at least one field entry');
    assertEquals(typeof f.field, 'string');
    assertEquals(typeof f.message, 'string');
    assertEquals(typeof f.code, 'string');
  },
);

Deno.test(
  'ErrorResponseFormat - missing required field produces entry with correct path',
  async () => {
    // Completely empty body → event_type is missing → field path "event_type"
    const result = await parseBody(mkReq({}, 'v1'), WebhookReceiverContracts);
    assertExists(result.error);
    assertEquals(result.error.status, 422);
    const body = await result.error.json();
    assertEquals(hasField(body.fields, 'event_type'), true);
  },
);

Deno.test('ErrorResponseFormat - wrong type error references the typed field', async () => {
  // event_type is number instead of expected string → field path "event_type"
  const result = await parseBody(mkReq({ event_type: 42 }, 'v1'), WebhookReceiverContracts);
  assertExists(result.error);
  assertEquals(result.error.status, 422);
  const body = await result.error.json();
  assertEquals(hasField(body.fields, 'event_type'), true);
});

Deno.test('ErrorResponseFormat - empty required string produces validation error', async () => {
  const result = await parseBody(mkReq({ event_type: '' }, 'v1'), WebhookReceiverContracts);
  assertExists(result.error);
  assertEquals(result.error.status, 422);
  const body = await result.error.json();
  assertEquals(body.code, 'VALIDATION_ERROR');
  const f = body.fields.find((entry: { field: string }) => entry.field === 'event_type');
  assertExists(f, 'Expected a field entry for event_type');
  assertEquals(typeof f.message, 'string');
});

// ── ContractVersioning - Backward compatibility ───────────────────────────────

Deno.test(
  'ContractVersioning - WebhookReceiver: v1 contract still valid when v2 exists',
  async () => {
    const v1Payload = { event_type: 'order.shipped' };
    const result = await parseBody(mkReq(v1Payload, 'v1'), WebhookReceiverContracts);
    assertEquals(result.error, null);
    assertEquals(result.version, 'v1');
    if (result.data) {
      assertEquals(result.data.event_type, 'order.shipped');
    } else {
      throw new Error('Data should not be null');
    }
  },
);

Deno.test('ContractVersioning - WebhookReceiver: v2 contract rejects v1 payload', async () => {
  // A minimal v1 payload (missing source, payload, timestamp) must fail v2 schema
  const v1Payload = { event_type: 'order.shipped' };
  const result = await parseBody(mkReq(v1Payload, 'v2'), WebhookReceiverContracts);
  assertEquals(result.data, null);
  assertExists(result.error);
  assertEquals(result.error.status, 422);
  const body = await result.error.json();
  assertEquals(body.code, 'VALIDATION_ERROR');
  // v2 requires source, payload, and timestamp — at least one should appear
  const v2RequiredFields = ['source', 'payload', 'timestamp'];
  const hasMissing = v2RequiredFields.some((f) => hasField(body.fields, f));
  assertEquals(hasMissing, true);
});

Deno.test('ContractVersioning - LLMGateway: v1 contract still valid when v2 exists', async () => {
  const v1Payload = {
    model: 'claude-haiku-3-5',
    messages: [{ role: 'user', content: 'Ping' }],
  };
  const result = await parseBody(mkReq(v1Payload, 'v1'), LLMGatewayContracts);
  assertEquals(result.error, null);
  assertEquals(result.version, 'v1');
});

Deno.test(
  'ContractVersioning - LLMGateway: v2 requires workspace_id and agent_id that v1 does not',
  async () => {
    // Same payload: passes v1, fails v2
    const sharedPayload = {
      model: 'claude-haiku-3-5',
      messages: [{ role: 'user', content: 'Ping' }],
    };

    const v1Result = await parseBody(mkReq(sharedPayload, 'v1'), LLMGatewayContracts);
    assertEquals(v1Result.error, null, 'v1 should accept payload without workspace_id / agent_id');

    const v2Result = await parseBody(mkReq(sharedPayload, 'v2'), LLMGatewayContracts);
    assertExists(v2Result.error);
    assertEquals(v2Result.error.status, 422);
    const body = await v2Result.error.json();
    const v2RequiredIds = ['workspace_id', 'agent_id'];
    const hasMissing = v2RequiredIds.some((f) => hasField(body.fields, f));
    assertEquals(hasMissing, true);
  },
);

Deno.test('ContractVersioning - Unsupported version returns 400', async () => {
  const result = await parseBody(mkReq({ event_type: 'test' }, 'v99'), WebhookReceiverContracts);
  assertEquals(result.data, null);
  assertExists(result.error);
  assertEquals(result.error.status, 400);
});
