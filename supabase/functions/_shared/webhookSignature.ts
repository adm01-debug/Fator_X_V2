/**
 * Centralized Webhook Signature Verification
 * 
 * Provides timing-safe HMAC verification for generic and provider-specific
 * webhooks (Meta, Twilio, GitHub, etc.)
 */

import { constantTimeEqual } from "./security.ts";

/**
 * Generates a SHA-256 HMAC hex string.
 */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verifies a SHA-256 HMAC signature.
 * Enforces timing-safe comparison.
 */
export async function verifyHmac(
  secret: string,
  body: string,
  receivedSignature: string,
  prefix = 'sha256='
): Promise<boolean> {
  if (!receivedSignature || !secret) return false;
  
  const signature = receivedSignature.startsWith(prefix) 
    ? receivedSignature.slice(prefix.length) 
    : receivedSignature;
    
  const expected = await hmacSha256Hex(secret, body);
  return constantTimeEqual(expected, signature);
}

/**
 * Validates HMAC signature with mandatory secret presence check.
 */
export async function validateWebhookRequest(
  req: Request,
  secretEnvVar: string,
  signatureHeader = 'x-hub-signature-256'
): Promise<{ isValid: boolean; body?: string }> {
  const secret = Deno.env.get(secretEnvVar);
  if (!secret) {
    return { isValid: false };
  }

  const signature = req.headers.get(signatureHeader);
  if (!signature) {
    return { isValid: false };
  }

  const body = await req.text();
  const isValid = await verifyHmac(secret, body, signature);
  
  return { isValid, body };
}
