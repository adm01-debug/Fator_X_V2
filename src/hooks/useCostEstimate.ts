import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { estimateTokens, USD_TO_BRL, LLM_PRICING } from '@/lib/llmPricing';

export interface CostEstimateInput {
  model?: string | null;
  systemPrompt?: string;
  userInput?: string;
  maxTokens?: number;
  toolsCount?: number;
}

export interface CostEstimateResult {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costBrl: number;
  estLatencyMs: number;
  pricing: {
    label: string;
    context_window: number;
  };
  loading: boolean;

  error?: string;
}

/**
 * Estimate cost for a single LLM call using the Edge Function (Single Source of Truth).
 */
export function useCostEstimate(input: CostEstimateInput): CostEstimateResult {
  const [result, setResult] = useState<CostEstimateResult>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    costBrl: 0,
    estLatencyMs: 500,
    pricing: {
      label: 'Gemini 2.5 Flash',
      context_window: 1000000
    },
    loading: false

  });

  useEffect(() => {
    let isMounted = true;
    
    const calculate = async () => {
      const sysTokens = estimateTokens(input.systemPrompt ?? '');
      const userTokens = estimateTokens(input.userInput ?? '');
      const toolsOverhead = (input.toolsCount ?? 0) * 50;
      const inputTokens = sysTokens + userTokens + toolsOverhead;
      const outputTokens = Math.max(100, Math.floor((input.maxTokens ?? 1000) * 0.6));
      const model = input.model || 'google/gemini-2.5-flash';

      setResult(prev => ({ ...prev, loading: true }));

      try {
        const { data, error } = await supabase.functions.invoke('cost-calculator', {
          body: { 
            model, 
            inputTokens, 
            outputTokens 
          }
        });

        if (error) throw error;
        if (!isMounted) return;

        setResult({
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          costUsd: data.costUsd,
          costBrl: data.costBrl,
          estLatencyMs: data.estLatencyMs || 800,
          pricing: {
            label: data.modelLabel || model.split('/').pop() || model,
            context_window: data.contextWindow || 1000000
          },
          loading: false

        });
      } catch (err) {
        console.error('Error calculating cost on backend:', err);
        if (!isMounted) return;
        
        // Fallback to local
        const pricing = LLM_PRICING[model] || LLM_PRICING['google/gemini-2.5-flash'];
        const localInputCost = (inputTokens / 1000) * pricing.input_per_1k;
        const localOutputCost = (outputTokens / 1000) * pricing.output_per_1k;
        const localUsd = localInputCost + localOutputCost;
        
        setResult({
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          costUsd: localUsd,
          costBrl: localUsd * USD_TO_BRL,
          estLatencyMs: pricing.avg_latency_ms,
          pricing: {
            label: pricing.label,
            context_window: pricing.context_window
          },
          loading: false,

          error: 'Using local estimate fallback'
        });
      }
    };

    calculate();
    return () => { isMounted = false; };
  }, [input.model, input.systemPrompt, input.userInput, input.maxTokens, input.toolsCount]);

  return result;
}
