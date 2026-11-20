import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { handleCorsPreflight, jsonResponse, errorResponse, getCorsHeaders, getRateLimitIdentifier, checkRateLimit, RATE_LIMITS, createRateLimitResponse } from "../_shared/mod.ts";
import { z } from "https://esm.sh/zod@3.23.8";

const OAuthActionSchema = z.enum(['authorize', 'callback']);
const OAuthQuerySchema = z.object({
  action: OAuthActionSchema.optional(),
  code: z.string().min(1).max(2048).optional(),
  state: z.string().max(2048).optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  const identifier = getRateLimitIdentifier(req);
  const rateCheck = checkRateLimit(identifier, RATE_LIMITS.standard);
  if (!rateCheck.allowed) return createRateLimitResponse(rateCheck, getCorsHeaders(req));

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse(req, 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', 500);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const queryParsed = OAuthQuerySchema.safeParse({
      action: url.searchParams.get('action') ?? undefined,
      code: url.searchParams.get('code') ?? undefined,
      state: url.searchParams.get('state') ?? undefined,
    });
    if (!queryParsed.success) return errorResponse(req, 'Parâmetros inválidos', 400);
    const action = queryParsed.data.action ?? 'authorize';
    const clientId = Deno.env.get('BITRIX24_CLIENT_ID');
    const clientSecret = Deno.env.get('BITRIX24_CLIENT_SECRET');
    const bitrixDomain = Deno.env.get('BITRIX24_DOMAIN');

    if (action === 'authorize') {
      if (!clientId || !bitrixDomain) {
        return errorResponse(req, 'Bitrix24 não configurado', 400);
      }
      const redirectUri = `${supabaseUrl}/functions/v1/bitrix24-oauth?action=callback`;
      const authUrl = `https://${bitrixDomain}/oauth/authorize/?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;
      return jsonResponse(req, { auth_url: authUrl });
    }

    if (action === 'callback') {
      if (!bitrixDomain || !clientId || !clientSecret) {
        return errorResponse(req, 'Bitrix24 não configurado', 500);
      }
      const code = url.searchParams.get('code');
      if (!code) return errorResponse(req, 'Missing authorization code', 400);

      const redirectUri = `${supabaseUrl}/functions/v1/bitrix24-oauth?action=callback`;
      const tokenResp = await fetch(`https://${bitrixDomain}/oauth/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResp.ok) return errorResponse(req, 'Token exchange failed', 502);
      const tokens = await tokenResp.json();

      await supabase.from('workspace_secrets').upsert({
        key_name: 'bitrix24_access_token',
        key_value: (tokens as Record<string, string>).access_token,
      });
      await supabase.from('workspace_secrets').upsert({
        key_name: 'bitrix24_refresh_token',
        key_value: (tokens as Record<string, string>).refresh_token,
      });

      const cors = getCorsHeaders(req);
      return new Response('<html><body><h2>Bitrix24 conectado com sucesso!</h2><script>window.close()</script></body></html>', {
        headers: { ...cors, 'Content-Type': 'text/html' },
      });
    }

    if (action === 'status') {
      const { data } = await supabase.from('workspace_secrets')
        .select('key_name').in('key_name', ['bitrix24_access_token', 'bitrix24_refresh_token']);
      return jsonResponse(req, { connected: (data?.length || 0) >= 2, domain: bitrixDomain });
    }

    return errorResponse(req, 'Unknown action', 400);
  } catch (error) {
    console.error('bitrix24-oauth error:', error);
    return errorResponse(req, 'Internal server error', 500);
  }
});
