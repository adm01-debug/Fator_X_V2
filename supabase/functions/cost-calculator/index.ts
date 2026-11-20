import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  handleCorsPreflight,
  jsonResponse,
  errorResponse,
  createAdminClient,
  z,
  parseBody,
  getCorsHeaders,
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
  RATE_LIMITS,
} from '../_shared/mod.ts';

/**
 * Edge Function to calculate LLM costs based on centralized pricing.
 * Single source of truth for both frontend and backend.
 */

const CostRequestSchema = z.object({
  model: z.string(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
});

const DEFAULT_PRICING = {
  input_cost_per_1k: 0.003,
  output_cost_per_1k: 0.015,
  provider: 'unknown',
  avg_latency_ms: 1000,
  context_window: 128000,
  label: 'Unknown Model',
};

const USD_TO_BRL = 5.75; // Updated to match current service value

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  const rateCheck = await checkRateLimit(getRateLimitIdentifier(req), RATE_LIMITS.heavy);
  if (!rateCheck.allowed) return createRateLimitResponse(rateCheck, getCorsHeaders(req));

  try {
    const parsed = await parseBody(req, CostRequestSchema);
    if (parsed.error) return parsed.error;

    const { model, inputTokens, outputTokens } = parsed.data;

    const supabaseAdmin = createAdminClient();
    const { data: pricingList } = await supabaseAdmin
      .from('model_pricing')
      .select(
        'model_pattern, input_cost_per_1k, output_cost_per_1k, avg_latency_ms, context_window, label',
      );

    let pricing = { ...DEFAULT_PRICING };

    if (pricingList) {
      // Sort by pattern length DESC to match most specific pattern first
      const sorted = [...pricingList].sort(
        (a, b) => b.model_pattern.length - a.model_pattern.length,
      );
      const match = sorted.find((p) => model.toLowerCase().includes(p.model_pattern.toLowerCase()));

      if (match) {
        pricing = {
          input_cost_per_1k: Number(match.input_cost_per_1k),
          output_cost_per_1k: Number(match.output_cost_per_1k),
          provider: model.split('/')[0] || 'unknown',
          avg_latency_ms: Number(match.avg_latency_ms || 1000),
          context_window: Number(match.context_window || 128000),
          label: match.label || model,
        };
      }
    }

    const inputCost = (inputTokens / 1000) * pricing.input_cost_per_1k;
    const outputCost = (outputTokens / 1000) * pricing.output_cost_per_1k;
    const costUsd = inputCost + outputCost;
    const estLatencyMs = pricing.avg_latency_ms + Math.floor(outputTokens / 50) * 10;

    return jsonResponse(req, {
      costUsd,
      costBrl: costUsd * USD_TO_BRL,
      estLatencyMs,
      modelLabel: pricing.label,
      contextWindow: pricing.context_window,
      model,
      provider: pricing.provider,

      tokens: inputTokens + outputTokens,
      breakdown: {
        inputCost,
        outputCost,
      },
    });
  } catch (err) {
    return errorResponse(req, err instanceof Error ? err.message : 'Unknown error');
  }
});
