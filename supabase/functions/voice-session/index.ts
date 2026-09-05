import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';

import { getCorsHeaders } from '../_shared/cors.ts';
import {
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
  RATE_LIMITS,
  requireEnv,
} from '../_shared/mod.ts';
const VoiceSessionBodySchema = z
  .object({
    action: z.enum(['start', 'end', 'append', 'get']),
    agent_id: z.string().uuid().nullable().optional(),
    session_id: z.string().uuid().optional(),
  })
  .passthrough();

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.heavy);
  if (!rate.allowed) return createRateLimitResponse(rate, corsHeaders);
  try {
    const auth = req.headers.get('Authorization');
    if (!auth)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: auth } },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    const rawBody = await req.json().catch(() => null);
    const parsedBody = VoiceSessionBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({
          error: 'Payload inválido',
          details: parsedBody.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const { action, agent_id, session_id } = parsedBody.data;

    if (action === 'start') {
      const { data: ws } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle();
      const { data, error } = await supabase
        .from('voice_sessions')
        .insert({
          user_id: user.id,
          workspace_id: ws?.id || null,
          agent_id: agent_id || null,
          status: 'active',
        })
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'end') {
      if (!session_id)
        return new Response(JSON.stringify({ error: 'session_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      const { data: session } = await supabase
        .from('voice_sessions')
        .select('started_at')
        .eq('id', session_id)
        .maybeSingle();
      const duration_ms = session ? Date.now() - new Date(session.started_at).getTime() : 0;
      const { data, error } = await supabase
        .from('voice_sessions')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
          duration_ms,
        })
        .eq('id', session_id)
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('voice-session error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
