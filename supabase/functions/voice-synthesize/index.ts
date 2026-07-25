import { fetchWithTimeout } from "../_shared/retry.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS, requireEnv } from "../_shared/mod.ts";
const InputSchema = z.object({
  user_text: z.string().min(1).max(2048),
  session_id: z.string().uuid().optional(),
  agent_id: z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.heavy);
  if (!rate.success) return createRateLimitResponse(rate.remaining, rate.reset, corsHeaders);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const raw = await req.json().catch(() => null);
    const parsed = InputSchema.safeParse(raw);
    if (!parsed.success) return new Response(JSON.stringify({ error: "Payload inválido", details: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { user_text, session_id, agent_id } = parsed.data;


    let agentPersona = "Você é um assistente conversacional natural e cordial, falando em português do Brasil.";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
    let history: any[] = [];
    if (agent_id) {
      const { data: agent } = await supabase.from("agents").select("persona, mission").eq("id", agent_id).maybeSingle();
      if (agent) agentPersona = `${agent.persona || ""}\n\nMissão: ${agent.mission || ""}\n\nResponda de forma curta e conversacional para áudio (≤2 frases, ~30s falados).`;
    }
    if (session_id) {
      const { data: session } = await supabase.from("voice_sessions").select("transcript").eq("id", session_id).maybeSingle();
      if (session) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
        history = ((session.transcript as any[]) || []).slice(-10).map((t: any) => ({ role: t.role === "user" ? "user" : "assistant", content: t.text }));
      }
    }

    const LOVABLE_API_KEY = requireEnv("LOVABLE_API_KEY");

    const aiResp = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: agentPersona },
          ...history,
          { role: "user", content: user_text },
        ],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit excedido" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Synthesis failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const json = await aiResp.json();
    const reply = (json?.choices?.[0]?.message?.content || "").trim();
    const tokens = json?.usage?.total_tokens || 0;
    const costCents = Math.ceil(tokens * 0.0003); // ~$0.30/1M tokens flash

    if (session_id) {
      const { data: session } = await supabase.from("voice_sessions").select("transcript, cost_cents, audio_out_seconds").eq("id", session_id).maybeSingle();
      if (session) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
        const newTranscript = [...((session.transcript as any[]) || []), { role: "assistant", text: reply, ts: new Date().toISOString() }];
        const approxSpeechSec = Math.max(1, reply.split(/\s+/).length / 2.5); // ~150 wpm
        await supabase.from("voice_sessions").update({
          transcript: newTranscript,
          cost_cents: (session.cost_cents || 0) + costCents,
          audio_out_seconds: Number(session.audio_out_seconds || 0) + approxSpeechSec,
        }).eq("id", session_id);
      }
    }

    return new Response(JSON.stringify({ reply, cost_cents: costCents }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("voice-synthesize error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
