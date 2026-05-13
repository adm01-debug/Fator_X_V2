import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  handleCorsPreflight, 
  jsonResponse, 
  errorResponse, 
  createAdminClient,
  z,
  parseBody
} from "../_shared/mod.ts";

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
  input_cost_per_1k: 0.003, // Default to Sonnet-like
  output_cost_per_1k: 0.015,
  provider: 'unknown'
};

const USD_TO_BRL = 5.75; // Updated to match current service value

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  try {
    const parsed = await parseBody(req, CostRequestSchema);
    if (parsed.error) return parsed.error;
    
    const { model, inputTokens, outputTokens } = parsed.data;
    
    const supabaseAdmin = createAdminClient();
    const { data: pricingList } = await supabaseAdmin
      .from('model_pricing')
      .select('model_pattern, input_cost_per_1k, output_cost_per_1k');
    
    let pricing = { ...DEFAULT_PRICING };
    
    if (pricingList) {
      // Sort by pattern length DESC to match most specific pattern first
      const sorted = [...pricingList].sort((a, b) => b.model_pattern.length - a.model_pattern.length);
      const match = sorted.find(p => model.toLowerCase().includes(p.model_pattern.toLowerCase()));
      
      if (match) {
        pricing = {
          input_cost_per_1k: Number(match.input_cost_per_1k),
          output_cost_per_1k: Number(match.output_cost_per_1k),
          provider: model.split('/')[0] || 'unknown'
        };
      }
    }
    
    const inputCost = (inputTokens / 1000) * pricing.input_cost_per_1k;
    const outputCost = (outputTokens / 1000) * pricing.output_cost_per_1k;
    const costUsd = inputCost + outputCost;

    return jsonResponse(req, {
      costUsd,
      costBrl: costUsd * USD_TO_BRL,
      model,
      provider: pricing.provider,
      tokens: inputTokens + outputTokens,
      breakdown: {
        inputCost,
        outputCost
      }
    });
  } catch (err) {
    return errorResponse(req, err instanceof Error ? err.message : 'Unknown error');
  }
});
