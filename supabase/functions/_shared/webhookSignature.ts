/**
 * Centralized Webhook Signature Verification
 * 
 * Provides timing-safe HMAC verification for generic and provider-specific
 * webhooks (Meta, Twilio, GitHub, etc.)
 */

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

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
 */
export async function verifyHmac(
  secret: string,
  body: string,
  receivedSignature: string,
  prefix = 'sha256='
): Promise<boolean> {
  if (!receivedSignature) return false;
  
  const signature = receivedSignature.startsWith(prefix) 
    ? receivedSignature.slice(prefix.length) 
    : receivedSignature;
    
  const expected = await hmacSha256Hex(secret, body);
  return timingSafeEqual(expected, signature);
}
