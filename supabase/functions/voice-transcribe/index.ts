import { fetchWithTimeout } from '../_shared/retry.ts';
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
const InputSchema = z.object({
  audio_base64: z.string().min(1).max(14_000_000, 'audio too large (max ~10MB)'),
  mime_type: z.string().min(3).max(64).default('audio/webm'),
  session_id: z.string().uuid().optional(),
});

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

    const raw = await req.json().catch(() => null);
    const parsed = InputSchema.safeParse(raw);
    if (!parsed.success)
      return new Response(
        JSON.stringify({ error: 'Payload inválido', details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    const { audio_base64, mime_type, session_id } = parsed.data;

    const LOVABLE_API_KEY = requireEnv('LOVABLE_API_KEY');

    const aiResp = await fetchWithTimeout('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content:
              'You are a transcription engine. Return ONLY the verbatim spoken text in the original language. No commentary, no formatting, no quotes.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Transcreva o áudio a seguir literalmente:' },
              { type: 'image_url', image_url: { url: `data:${mime_type};base64,${audio_base64}` } },
            ],
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      if (aiResp.status === 429)
        return new Response(JSON.stringify({ error: 'Rate limit excedido' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      if (aiResp.status === 402)
        return new Response(JSON.stringify({ error: 'Créditos insuficientes' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      console.error('AI gateway error:', aiResp.status, t);
      return new Response(JSON.stringify({ error: 'Transcription failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const json = await aiResp.json();
    const text = (json?.choices?.[0]?.message?.content || '').trim();

    // Estimar duração (rough): tamanho base64 / ~16kbps webm
    const approxBytes = (audio_base64.length * 3) / 4;
    const approxSeconds = Math.max(0.5, approxBytes / 2000);

    if (session_id) {
      const { data: session } = await supabase
        .from('voice_sessions')
        .select('transcript, audio_in_seconds')
        .eq('id', session_id)
        .maybeSingle();
      if (session) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
        const newTranscript = [
          ...((session.transcript as any[]) || []),
          { role: 'user', text, ts: new Date().toISOString() },
        ];
        await supabase
          .from('voice_sessions')
          .update({
            transcript: newTranscript,
            audio_in_seconds: Number(session.audio_in_seconds || 0) + approxSeconds,
          })
          .eq('id', session_id);
      }
    }

    return new Response(JSON.stringify({ text, duration_seconds: approxSeconds }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('voice-transcribe error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
