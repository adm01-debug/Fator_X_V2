/**
 * Nexus Agents Studio — Shared Edge Function Utilities (UPDATED)
 * Barrel export for all shared modules including new security.ts
 *
 * Usage:
 *   import {
 *     // CORS
 *     getCorsHeaders, handleCorsPreflight, jsonResponse, errorResponse,
 *     // Auth
 *     authenticateRequest, validateApiKey, validateWorkspaceMembership, createAdminClient,
 *     // Rate Limiting (Postgres-backed)
 *     checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS,
 *     // Validation
 *     parseBody, getRawBody, CommonSchemas, z,
 *     // Security
 *     constantTimeEqual, verifyHmacSignature, isIpInCidrRange, redactPII, getClientIp,
 *   } from "../_shared/mod.ts";
 */

// CORS
export {
  getCorsHeaders,
  handleCorsPreflight,
  jsonResponse,
  errorResponse,
} from "./cors.ts";

// Auth
export {
  authenticateRequest,
  createSupabaseClients,
  createAdminClient,
  getAuthUserId,
  validateApiKey,
  validateWorkspaceMembership,
  type AuthResult,
  type AuthError,
  type AuthResponse,
} from "./auth.ts";

// Rate Limiting
export {
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
  withRateLimit,
  RATE_LIMITS,
  type RateLimitConfig,
  type RateLimitResult,
} from "./rate-limiter.ts";

// Validation
export {
  parseBody,
  getRawBody,
  CommonSchemas,
  z,
  MAX_BODY_SIZE,
  type ParseResult,
} from "./validation.ts";

// Safe JSON (LLM output parsing)
export { safeJsonParse, parseJsonStrict } from "./json.ts";

// Security (NEW)
export {
  constantTimeEqual,
  verifyHmacSignature,
  isIpInCidrRange,
  redactPII,
  redactPIIFromObject,
  getClientIp,
  KNOWN_WEBHOOK_CIDRS,
} from "./security.ts";

// Retry / backoff / jitter (P0 audit fix)
export {
  withRetry,
  withRetryJson,
  fetchWithTimeout,
  computeDelay,
  RetryError,
  type RetryOptions,
} from "./retry.ts";

// Environment validation (P0 audit — Etapa 13)
export {
  requireEnv,
  requireEnvDefault,
  requireEnvNumber,
  requireEnvBool,
  requireEnvJson,
  requireEnvUrl,
  requireEnvGroup,
  optionalEnv,
  validateRequiredEnv,
  requireEnvCached,
  clearEnvCache,
  MISSING_ENV_PREFIX,
} from "./requireEnv.ts";

// Webhook Sender with HMAC + retry (P0 audit — Etapa 16)
export {
  deliverWebhook,
  deliverWebhookWithLogging,
  hmacSha256Hex,
} from "./webhookSender.ts";
export type {
  WebhookPayload,
  WebhookDeliveryResult,
  WebhookSenderOptions,
} from "./webhookSender.ts";

// Observability (ETAPAS 46-48)
export {
  runWithObservability,
  tracedFetch,
  estimateLlmCost,
  logLlmMetrics,
} from "./otel-edge.ts";
export type {
  TraceContext,
  ObservabilityOptions,
} from "./otel-edge.ts";
