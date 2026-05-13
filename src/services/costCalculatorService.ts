/**
 * Nexus Agents Studio — Cost Calculator Service
 *
 * Tracks and estimates costs for LLM usage across all providers.
 * Features:
 * - Pre-execution cost estimation
 * - Post-execution actual cost tracking
 * - Per-node cost breakdown in workflows
 * - Budget alerts and limits
 * - Provider/model pricing database
 * - BRL conversion support
 */



export type { ModelPricing, CostEstimate, CostBreakdownItem, ActualCost, BudgetConfig, BudgetStatus } from './types/costCalculatorTypes';
import type { ModelPricing, CostEstimate, CostBreakdownItem, ActualCost, BudgetConfig, BudgetStatus } from './types/costCalculatorTypes';
import { supabase } from '@/integrations/supabase/client';

// ──────── Pricing ────────

/**
 * Get pricing for a specific model from DB via edge function or direct query
 */
export async function getModelPricingFromDB(model: string): Promise<ModelPricing | null> {
  const { data: pricingList, error } = await supabase
    .from('model_pricing')
    .select('*');
  
  if (error || !pricingList) return null;

  const sorted = [...pricingList].sort((a, b) => b.model_pattern.length - a.model_pattern.length);
  const match = sorted.find(p => model.toLowerCase().includes(p.model_pattern.toLowerCase()));
  
  if (!match) return null;

  return {
    provider: model.split('/')[0] || 'unknown',
    model: match.model_pattern,
    inputPricePerMToken: Number(match.input_cost_per_1k) * 1000,
    outputPricePerMToken: Number(match.output_cost_per_1k) * 1000,
    lastUpdated: new Date().toISOString()
  };
}

// BRL exchange rate
let USD_TO_BRL = 5.75;

// ──────── Core Functions ────────

/**
 * Calculate cost calling the edge function (Single Source of Truth)
 */
export async function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<ActualCost> {
  if (inputTokens < 0 || outputTokens < 0) {
    throw new Error('Token counts must be non-negative');
  }

  const fullModel = model.includes('/') ? model : `${provider}/${model}`;

  try {
    const { data, error } = await supabase.functions.invoke('cost-calculator', {
      body: { 
        model: fullModel,
        inputTokens,
        outputTokens
      }
    });

    if (error) throw error;

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCostUsd: data.breakdown.inputCost,
      outputCostUsd: data.breakdown.outputCost,
      totalCostUsd: data.costUsd,
      totalCostBrl: data.costBrl,
      durationMs: 0,
      provider: data.provider,
      model: data.model,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Failed to call cost-calculator edge function, falling back to local calc:', err);
    // Fallback to local calculation if edge function fails
    const pricing = await getModelPricingFromDB(fullModel);
    const inputRate = (pricing?.inputPricePerMToken ?? 3.0) / 1000;
    const outputRate = (pricing?.outputPricePerMToken ?? 15.0) / 1000;

    const inputCostUsd = (inputTokens / 1000) * inputRate;
    const outputCostUsd = (outputTokens / 1000) * outputRate;
    const totalCostUsd = inputCostUsd + outputCostUsd;

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCostUsd,
      outputCostUsd,
      totalCostUsd,
      totalCostBrl: totalCostUsd * USD_TO_BRL,
      durationMs: 0,
      provider,
      model,
      timestamp: new Date().toISOString(),
    };
  }
}


// ──────── Pre-Execution Estimation ────────

/**
 * Estimate cost BEFORE executing a workflow.
 * Analyzes nodes and estimates token usage per node.
 */
export function estimateWorkflowCost(
  nodes: Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
  }>,
  defaultProvider: string,
  defaultModel: string
): CostEstimate {
  const breakdown: CostBreakdownItem[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  for (const node of nodes) {
    const nodeProvider = (node.data.provider as string) ?? defaultProvider;
    const nodeModel = (node.data.model as string) ?? defaultModel;
    const nodeType = node.type;

    // Estimate tokens based on node type
    const estimate = estimateNodeTokens(nodeType, node.data);
    totalInput += estimate.input;
    totalOutput += estimate.output;

    const cost = calculateCost(nodeProvider, nodeModel, estimate.input, estimate.output);

    breakdown.push({
      label: (node.data.name as string) ?? nodeType,
      nodeId: node.id,
      nodeType,
      inputTokens: estimate.input,
      outputTokens: estimate.output,
      costUsd: cost.totalCostUsd,
      provider: nodeProvider,
      model: nodeModel,
    });
  }

  const total = calculateCost(defaultProvider, defaultModel, totalInput, totalOutput);

  return {
    provider: defaultProvider,
    model: defaultModel,
    estimatedInputTokens: totalInput,
    estimatedOutputTokens: totalOutput,
    inputCostUsd: total.inputCostUsd,
    outputCostUsd: total.outputCostUsd,
    totalCostUsd: total.totalCostUsd,
    totalCostBrl: total.totalCostBrl,
    confidence: nodes.length > 10 ? 'low' : nodes.length > 3 ? 'medium' : 'high',
    breakdown,
  };
}

/**
 * Estimate tokens for a single node based on its type
 */
function estimateNodeTokens(
  nodeType: string,
  nodeData: Record<string, unknown>
): { input: number; output: number } {
  // Base estimates per node type (averages from production data)
  const estimates: Record<string, { input: number; output: number }> = {
    'llm': { input: 2000, output: 1000 },
    'llm-call': { input: 2000, output: 1000 },
    'rag-search': { input: 1500, output: 500 },
    'tool-call': { input: 500, output: 200 },
    'condition': { input: 200, output: 50 },
    'transform': { input: 300, output: 300 },
    'input': { input: 100, output: 0 },
    'output': { input: 0, output: 100 },
    'webhook': { input: 200, output: 200 },
    'code': { input: 1000, output: 500 },
    'oracle': { input: 8000, output: 4000 },  // Multi-LLM uses more
    'guardrails': { input: 500, output: 100 },
    'memory': { input: 300, output: 100 },
    'handoff': { input: 1000, output: 200 },
  };

  const base = estimates[nodeType] ?? { input: 500, output: 300 };

  // Adjust based on node data hints
  const maxTokens = Number(nodeData.max_tokens ?? 0);
  if (maxTokens > 0) {
    return { input: base.input, output: Math.min(maxTokens, base.output * 3) };
  }

  // If system prompt is long, increase input estimate
  const systemPrompt = String(nodeData.system_prompt ?? '');
  if (systemPrompt.length > 500) {
    const extraTokens = Math.floor(systemPrompt.length / 4);
    return { input: base.input + extraTokens, output: base.output };
  }

  return base;
}

// ──────── Budget Management ────────

const DEFAULT_BUDGET: BudgetConfig = {
  maxCostPerRequestUsd: 1.0,
  maxCostPerDayUsd: 50.0,
  maxCostPerMonthUsd: 500.0,
  alertThresholdPercent: 80,
};

let currentBudget: BudgetConfig = { ...DEFAULT_BUDGET };

/**
 * Set budget configuration
 */
export function setBudget(budget: Partial<BudgetConfig>): BudgetConfig {
  currentBudget = { ...currentBudget, ...budget };
  return currentBudget;
}

/**
 * Get current budget configuration
 */
export function getBudget(): BudgetConfig {
  return { ...currentBudget };
}

/**
 * Check if a cost would exceed the per-request budget
 */
export function checkRequestBudget(estimatedCostUsd: number): {
  allowed: boolean;
  maxAllowed: number;
  estimated: number;
  overage: number;
} {
  const allowed = estimatedCostUsd <= currentBudget.maxCostPerRequestUsd;
  return {
    allowed,
    maxAllowed: currentBudget.maxCostPerRequestUsd,
    estimated: estimatedCostUsd,
    overage: allowed ? 0 : estimatedCostUsd - currentBudget.maxCostPerRequestUsd,
  };
}

/**
 * Calculate budget status from spending data
 */
export function calculateBudgetStatus(
  dailySpentUsd: number,
  monthlySpentUsd: number
): BudgetStatus {
  const dailyPercent = (dailySpentUsd / currentBudget.maxCostPerDayUsd) * 100;
  const monthlyPercent = (monthlySpentUsd / currentBudget.maxCostPerMonthUsd) * 100;

  return {
    dailySpentUsd,
    monthlySpentUsd,
    dailyBudgetUsd: currentBudget.maxCostPerDayUsd,
    monthlyBudgetUsd: currentBudget.maxCostPerMonthUsd,
    dailyPercent,
    monthlyPercent,
    isOverDailyBudget: dailySpentUsd > currentBudget.maxCostPerDayUsd,
    isOverMonthlyBudget: monthlySpentUsd > currentBudget.maxCostPerMonthUsd,
    shouldAlert:
      dailyPercent >= currentBudget.alertThresholdPercent ||
      monthlyPercent >= currentBudget.alertThresholdPercent,
  };
}

// ──────── Formatting Helpers ────────

/**
 * Format cost for display (with currency)
 */
export function formatCostUsd(usd: number): string {
  if (usd < 0.001) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Format cost in BRL
 */
export function formatCostBrl(usd: number): string {
  const brl = usd * USD_TO_BRL;
  if (brl < 0.01) return 'R$ 0,00';
  return `R$ ${brl.toFixed(2).replace('.', ',')}`;
}

/**
 * Format token count for display
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

/**
 * Get a cost comparison across providers for the same token count
 */
export function compareCosts(
  inputTokens: number,
  outputTokens: number
): Array<{
  provider: string;
  model: string;
  costUsd: number;
  costBrl: number;
}> {
  return PRICING_DB.map((pricing) => {
    const cost = calculateCost(pricing.provider, pricing.model, inputTokens, outputTokens);
    return {
      provider: pricing.provider,
      model: pricing.model,
      costUsd: cost.totalCostUsd,
      costBrl: cost.totalCostBrl,
    };
  }).sort((a, b) => a.costUsd - b.costUsd);
}
