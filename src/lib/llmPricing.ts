/**
 * LLM Pricing Table — USD per 1K tokens.
 * DEPRECATED: Use the cost-calculator Edge Function for real-time math.
 * Keeping for offline estimation if needed.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ModelPrice {
  model: string;
  label: string;
  provider: 'google' | 'openai' | 'anthropic';
  input_per_1k: number;
  output_per_1k: number;
  avg_latency_ms: number;
  context_window: number;
}

export const LLM_PRICING: Record<string, ModelPrice> = {
  // Google Gemini
  'google/gemini-2.5-flash': {
    model: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google',
    input_per_1k: 0.00015, output_per_1k: 0.0006, avg_latency_ms: 800, context_window: 1_000_000,
  },
  // ... more models
};

export const USD_TO_BRL = 5.0;

export function getModelPrice(modelId: string | undefined | null): ModelPrice {
  if (modelId && LLM_PRICING[modelId]) return LLM_PRICING[modelId];
  return LLM_PRICING['google/gemini-2.5-flash'];
}

/**
 * Server-side cost calculation via Edge Function.
 */
export async function calculateCostOnBackend(model: string, inputTokens: number, outputTokens: number) {
  const { data, error } = await supabase.functions.invoke('cost-calculator', {
    body: { model, inputTokens, outputTokens }
  });
  if (error) throw error;
  return data;
}

/** Rough char→token estimation. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

