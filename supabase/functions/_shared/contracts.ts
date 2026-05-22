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
