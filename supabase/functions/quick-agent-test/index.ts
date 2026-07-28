import { fetchWithTimeout } from "../_shared/retry.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import { checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS, requireEnv } from "../_shared/mod.ts";

import { getCorsHeaders } from "../_shared/cors.ts";
import { appendSkillsToPrompt } from "../_shared/skills.ts";
const BodySchema = z.object({
  system_prompt: z.string().min(10).max(20_000),
  user_message: z.string().min(1).max(4000),
  model: z.string().min(2).max(120).default('gpt-4o'),
  /**
   * Skills instaladas enviadas pelo cliente (já filtradas por RLS na leitura).
   * São re-sanitizadas no servidor antes de entrar no prompt.
   */
  skills: z
    .array(
      z.object({
        id: z.string().max(64).optional(),
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        category: z.string().max(64).optional(),
      }),
    )
    .max(100)
    .optional(),
});
// Quick Agent Test — runs a single LLM call against Lovable AI Gateway
// for the wizard's "test before save" feature.

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Map the wizard's friendly model id to a model supported by Lovable AI Gateway. */
function mapModel(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('gpt-4o') || m.includes('gpt-4-turbo')) return 'openai/gpt-5-mini';
  if (m.includes('claude-3-opus')) return 'google/gemini-2.5-pro';
  if (m.includes('claude-3.5-sonnet') || m.includes('claude')) return 'google/gemini-2.5-pro';
  if (m.includes('gemini-1.5-pro') || m.includes('gemini-2.5-pro')) return 'google/gemini-2.5-pro';
  if (m.includes('gemini')) return 'google/gemini-2.5-flash';
  if (m.includes('llama')) return 'google/gemini-2.5-flash-lite';
  return 'google/gemini-3-flash-preview';
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.heavy);
  if (!rate.allowed) return createRateLimitResponse(rate, corsHeaders);

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const apiKey = requireEnv('LOVABLE_API_KEY');

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten().fieldErrors }, 400);
    }
    const { system_prompt: rawSystemPrompt, user_message: userMessage, model, skills } = parsed.data;
    // Mesma seção determinística do preview/runtime — sem duplicar se já existir.
    const systemPrompt = appendSkillsToPrompt(rawSystemPrompt, skills);


    const mapped = mapModel(model);
    const startedAt = Date.now();

    const upstream = await fetchWithTimeout('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: mapped,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 800,
      }),
    });

    const latencyMs = Date.now() - startedAt;

    if (upstream.status === 429) {
      return jsonResponse(
        { error: 'Limite de requisições atingido. Aguarde alguns segundos e tente novamente.' },
        429,
      );
    }
    if (upstream.status === 402) {
      return jsonResponse(
        { error: 'Sem créditos disponíveis. Adicione créditos em Configurações > Workspace > Uso.' },
        402,
      );
    }
    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('AI gateway error', upstream.status, text);
      return jsonResponse({ error: `Erro do gateway (${upstream.status})` }, 502);
    }

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const usage = data?.usage ?? {};

    return jsonResponse({
      response: typeof content === 'string' ? content : JSON.stringify(content),
      latency_ms: latencyMs,
      input_tokens: Number(usage.prompt_tokens ?? 0),
      output_tokens: Number(usage.completion_tokens ?? 0),
      total_tokens: Number(usage.total_tokens ?? 0),
      model_used: mapped,
      requested_model: model,
    });
  } catch (e) {
    console.error('quick-agent-test error', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'Erro inesperado' },
      500,
    );
  }
});
