import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Edge Function to calculate LLM costs based on centralized pricing.
 * Mover logic from frontend to ensure single source of truth.
 */

const LLM_PRICING: Record<string, any> = {
  'google/gemini-2.5-flash': {
    model: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google',
    input_per_1k: 0.00015, output_per_1k: 0.0006, avg_latency_ms: 800, context_window: 1_000_000,
  },
  'google/gemini-2.5-flash-lite': {
    model: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'google',
    input_per_1k: 0.00010, output_per_1k: 0.0004, avg_latency_ms: 500, context_window: 1_000_000,
  },
  'google/gemini-2.5-pro': {
    model: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google',
    input_per_1k: 0.00125, output_per_1k: 0.010, avg_latency_ms: 2200, context_window: 2_000_000,
  },
  'openai/gpt-5': {
    model: 'openai/gpt-5', label: 'GPT-5', provider: 'openai',
    input_per_1k: 0.00250, output_per_1k: 0.0100, avg_latency_ms: 2800, context_window: 400_000,
  }
};

const USD_TO_BRL = 5.0;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const { model, inputTokens, outputTokens } = await req.json();
    const pricing = LLM_PRICING[model] || LLM_PRICING['google/gemini-2.5-flash'];
    
    const inputCost = (inputTokens / 1000) * pricing.input_per_1k;
    const outputCost = (outputTokens / 1000) * pricing.output_per_1k;
    const costUsd = inputCost + outputCost;

    return new Response(
      JSON.stringify({
        costUsd,
        costBrl: costUsd * USD_TO_BRL,
        model: pricing.label,
        provider: pricing.provider
      }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400 });
  }
});
