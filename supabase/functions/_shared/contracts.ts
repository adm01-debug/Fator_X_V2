import { z } from "https://esm.sh/zod@3.23.8";

/**
 * Webhook Receiver Contracts
 */
export const WebhookReceiverContracts = {
  v1: z.object({
    event_type: z.string().min(1),
    payload: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime().optional(),
  }),
  v2: z.object({
    event_type: z.string().min(1),
    payload: z.record(z.unknown()),
    timestamp: z.string().datetime(),
    source: z.string().min(1), // Required in v2
    metadata: z.object({
      trace_id: z.string().uuid().optional(),
      attempt: z.number().int().min(1).optional(),
    }).optional(),
  }),
};

/**
 * WhatsApp Webhook Contracts
 */
export const WhatsAppWebhookContracts = {
  v1: z.any(), // Legacy ANY for v1 compatibility
  v2: z.object({
    object: z.literal('whatsapp_business_account').optional(),
    entry: z.array(z.object({
      id: z.string(),
      changes: z.array(z.object({
        value: z.object({
          messaging_product: z.literal('whatsapp'),
          metadata: z.object({
            display_phone_number: z.string(),
            phone_number_id: z.string(),
          }),
          contacts: z.array(z.any()).optional(),
          messages: z.array(z.any()).optional(),
          statuses: z.array(z.any()).optional(),
        }),
        field: z.literal('messages'),
      })),
    })),
  }),
};

/**
 * LLM Gateway Contracts
 */
export const LLMGatewayContracts = {
  v1: z.object({
    model: z.string().min(2).max(200),
    messages: z.array(z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool']),
      content: z.string().min(1),
      name: z.string().optional(),
    })).min(1).max(100),
    temperature: z.number().min(0).max(2).default(0.7),
    max_tokens: z.number().int().min(1).max(128000).default(4000),
    stream: z.boolean().default(false),
    workspace_id: z.string().uuid().optional(),
    agent_id: z.string().uuid().optional(),
    session_id: z.string().uuid().optional(),
  }),
  /** v2: workspace_id and agent_id are required; adds tools and tool_choice */
  v2: z.object({
    model: z.string().min(2).max(200),
    messages: z.array(z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool']),
      content: z.string().min(1),
      name: z.string().optional(),
    })).min(1).max(100),
    temperature: z.number().min(0).max(2).default(0.7),
    max_tokens: z.number().int().min(1).max(128000).default(4000),
    stream: z.boolean().default(false),
    workspace_id: z.string().uuid(), // Required in v2
    agent_id: z.string().uuid(),     // Required in v2
    session_id: z.string().uuid().optional(),
    tools: z.array(z.object({
      name: z.string(),
      description: z.string().optional(),
      parameters: z.record(z.unknown()).optional(),
    })).max(20).optional(),
    tool_choice: z.enum(['auto', 'none', 'required']).optional(),
  }),
};

/**
 * Common Error Response Contract
 */
export const ErrorResponseContract = z.object({
  error: z.string(),
  code: z.string().optional(),
  message: z.string().optional(),
  fields: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string().optional(),
  })).optional(),
});

/**
 * Bitrix24 Webhook Contracts
 *
 * v1: loose / passthrough schema for legacy integrations that send
 *     arbitrary payloads from older Bitrix24 versions.
 * v2: strict typed schema aligned with the current Bitrix24 event format.
 */
export const Bitrix24WebhookContracts = {
  /** Legacy – accepts any extra keys via passthrough */
  v1: z.object({
    event: z.string().max(120).optional(),
    auth: z.record(z.unknown()).optional(),
    data: z.record(z.unknown()).optional(),
    ts: z.union([z.string(), z.number()]).optional(),
  }).passthrough(),
  /** Strict – enforces required fields and known shape */
  v2: z.object({
    event: z.string().min(1).max(120),
    auth: z.object({
      domain: z.string(),
      application_token: z.string(),
    }),
    data: z.object({
      FIELDS: z.record(z.unknown()).optional(),
    }),
    ts: z.union([z.string(), z.number()]).optional(),
  }),
};

/**
 * Openclaw Webhook Contracts
 *
 * v1: permissive schema, all optional except `type`.
 * v2: strict schema with enum-validated type, UUID workspace_id, and
 *     bounded instance_name.
 */
export const OpenclawWebhookContracts = {
  /** Permissive – only `type` is required */
  v1: z.object({
    event_id: z.string().optional(),
    type: z.string(),
    workspace_id: z.string().optional(),
    instance_name: z.string().optional(),
    data: z.record(z.unknown()).optional(),
  }),
  /** Strict – all identifiers required and type is an enum */
  v2: z.object({
    event_id: z.string().min(1),
    type: z.enum([
      'message.inbound',
      'instance.status',
      'instance.disconnected',
    ]),
    workspace_id: z.string().uuid(),
    instance_name: z.string().min(1).max(100),
    data: z.record(z.unknown()),
  }),
};

/**
 * Slack Events API Webhook Contracts
 *
 * v1: matches the minimal shape Slack sends for both url_verification
 *     challenges and event_callback payloads; retains the legacy `token`
 *     field for workspaces that have not migrated to signing secrets.
 * v2: strict schema that drops the legacy token, narrows the `event`
 *     object, and adds `api_app_id` verification.
 */
export const SlackEventsWebhookContracts = {
  /** Permissive – supports legacy token and unknown event shapes */
  v1: z.object({
    type: z.enum(['url_verification', 'event_callback']),
    challenge: z.string().optional(),
    team_id: z.string().optional(),
    event_id: z.string().optional(),
    event: z.record(z.unknown()).optional(),
    token: z.string().optional(), // Legacy verification token
  }),
  /** Strict – uses signing secret verification; event has typed fields */
  v2: z.object({
    type: z.enum(['url_verification', 'event_callback']),
    challenge: z.string().optional(),
    team_id: z.string().optional(),
    event_id: z.string().optional(),
    event: z.object({
      type: z.string(),
      subtype: z.string().optional(),
      channel: z.string().optional(),
      user: z.string().optional(),
      text: z.string().max(10000).optional(),
      ts: z.string().optional(),
      thread_ts: z.string().optional(),
      bot_id: z.string().optional(),
    }).optional(),
    api_app_id: z.string().optional(),
  }),
};

/**
 * Bitrix Webhook Error Response Contract
 *
 * Represents a structured error body returned by Bitrix24 REST API
 * endpoints when a request fails.
 */
export const BitrixWebhookErrorResponseContract = z.object({
  error: z.string(),
  code: z.string().optional(),
  message: z.string().optional(),
  fields: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string().optional(),
  })).optional(),
});
