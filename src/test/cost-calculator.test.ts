/**
 * costCalculatorService tests (next-frontier coverage expansion #1)
 *
 * Targets: pure function service, ~266 lines, 0% → ~85% coverage.
 * Covers: pricing lookup, cost calculation, workflow estimation,
 * budget checks, formatting helpers, cost comparison.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getModelPricing,
  getAllPricing,
  setExchangeRate,
  getExchangeRate,
  calculateCost,
  estimateWorkflowCost,
  setBudget,
  getBudget,
  checkRequestBudget,
  calculateBudgetStatus,
  formatCostUsd,
  formatCostBrl,
  formatTokenCount,
  compareCosts,
} from '@/services/costCalculatorService';

// Mock supabase functions invoke
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          data: [
            { model_pattern: 'anthropic/claude-sonnet', input_cost_per_1k: 0.003, output_cost_per_1k: 0.015 },
            { model_pattern: 'openai/gpt-4o', input_cost_per_1k: 0.0025, output_cost_per_1k: 0.01 },
          ],
          error: null
        })),
        single: vi.fn(() => ({ data: { model_pattern: 'anthropic/claude-sonnet', input_cost_per_1k: 0.003, output_cost_per_1k: 0.015 }, error: null })),
        eq: vi.fn().mockReturnThis(),
      })),
    })),
    functions: {
      invoke: vi.fn(async (_fn, { body }) => {
        const inputRate = body.model.includes('sonnet') ? 0.003 : 0.0025;
        const outputRate = body.model.includes('sonnet') ? 0.015 : 0.01;
        const inputCost = (body.inputTokens / 1000) * inputRate;
        const outputCost = (body.outputTokens / 1000) * outputRate;
        return {
          data: {
            costUsd: inputCost + outputCost,
            costBrl: (inputCost + outputCost) * 5.75,
            model: body.model,
            provider: body.model.split('/')[0],
            breakdown: { inputCost, outputCost }
          },
          error: null
        };
      })
    }
  }
}));

describe('costCalculatorService — pricing lookup', () => {
  it('getAllPricing returns a promise that resolves to an array', async () => {
    const all = await getAllPricing();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
  });

  it('getModelPricing returns null for unknown provider', async () => {
    const found = await getModelPricing('unknown-provider', 'gpt-5');
    expect(found).toBeNull();
  });

  it('getModelPricing finds a model', async () => {
    const found = await getModelPricing('anthropic', 'claude-sonnet');
    expect(found).not.toBeNull();
    expect(found?.provider).toBe('anthropic');
  });
});

describe('costCalculatorService — exchange rate', () => {
  beforeEach(() => {
    setExchangeRate(5.0);
  });

  it('getExchangeRate returns the current rate', () => {
    expect(getExchangeRate()).toBe(5.0);
  });

  it('setExchangeRate updates the value', () => {
    setExchangeRate(5.5);
    expect(getExchangeRate()).toBe(5.5);
  });
});

describe('costCalculatorService — calculateCost', () => {
  beforeEach(() => setExchangeRate(5.0));

  it('throws when token counts are negative', async () => {
    await expect(calculateCost('anthropic', 'sonnet', -1, 100)).rejects.toThrow(/non-negative/);
    await expect(calculateCost('anthropic', 'sonnet', 100, -1)).rejects.toThrow(/non-negative/);
  });

  it('returns zero cost for zero tokens', async () => {
    const c = await calculateCost('anthropic', 'sonnet', 0, 0);
    expect(c.inputCostUsd).toBe(0);
    expect(c.outputCostUsd).toBe(0);
    expect(c.totalCostUsd).toBe(0);
    expect(c.totalCostBrl).toBe(0);
  });

  it('returns cost calling edge function', async () => {
    const c = await calculateCost('anthropic', 'claude-sonnet', 1000, 1000);
    // 1000 input = 0.003, 1000 output = 0.015. Total = 0.018
    expect(c.totalCostUsd).toBe(0.018);
  });

  it('returns ActualCost shape with all required fields', async () => {
    const c = await calculateCost('anthropic', 'sonnet', 100, 50);
    expect(c).toHaveProperty('inputTokens', 100);
    expect(c).toHaveProperty('outputTokens', 50);
    expect(c).toHaveProperty('totalTokens', 150);
    expect(c).toHaveProperty('inputCostUsd');
    expect(c).toHaveProperty('outputCostUsd');
    expect(c).toHaveProperty('totalCostUsd');
    expect(c).toHaveProperty('totalCostBrl');
    expect(c).toHaveProperty('timestamp');
  });
});

describe('costCalculatorService — estimateWorkflowCost', () => {
  it('returns zero for empty node array', async () => {
    const e = await estimateWorkflowCost([], 'anthropic', 'sonnet');
    expect(e.estimatedInputTokens).toBe(0);
    expect(e.estimatedOutputTokens).toBe(0);
    expect(e.totalCostUsd).toBe(0);
  });

  it('estimates a single node', async () => {
    const e = await estimateWorkflowCost(
      [{ id: 'n1', type: 'llm', data: {} }],
      'anthropic',
      'sonnet'
    );
    expect(e.estimatedInputTokens).toBeGreaterThan(0);
    expect(e.totalCostUsd).toBeGreaterThan(0);
    expect(Array.isArray(e.breakdown)).toBe(true);
  });

  it('breakdown has one entry per node', async () => {
    const nodes = [
      { id: 'n1', type: 'llm', data: {} },
      { id: 'n2', type: 'tool-call', data: {} },
      { id: 'n3', type: 'rag-search', data: {} },
    ];
    const e = await estimateWorkflowCost(nodes, 'anthropic', 'sonnet');
    expect(e.breakdown?.length).toBe(3);
  });

  it('respects per-node provider/model overrides in node.data', async () => {
    const nodes = [
      { id: 'n1', type: 'llm', data: { provider: 'openai', model: 'gpt-4o' } },
    ];
    const e = await estimateWorkflowCost(nodes, 'anthropic', 'sonnet');
    expect(e.breakdown?.[0].provider).toBe('openai');
    expect(e.breakdown?.[0].model).toBe('openai/gpt-4o');
  });
});

describe('costCalculatorService — budget config', () => {
  beforeEach(() => {
    setBudget({
      maxCostPerRequestUsd: 1.0,
      maxCostPerDayUsd: 50.0,
      maxCostPerMonthUsd: 1000.0,
      alertThresholdPercent: 80,
    });
  });

  it('setBudget returns the merged config', () => {
    const updated = setBudget({ maxCostPerRequestUsd: 2.0 });
    expect(updated.maxCostPerRequestUsd).toBe(2.0);
    expect(updated.maxCostPerDayUsd).toBe(50.0);
  });

  it('getBudget returns a copy', () => {
    const b = getBudget();
    b.maxCostPerRequestUsd = 999;
    const b2 = getBudget();
    expect(b2.maxCostPerRequestUsd).toBe(1.0);
  });

  it('checkRequestBudget allows under-limit cost', () => {
    const r = checkRequestBudget(0.5);
    expect(r.allowed).toBe(true);
  });

  it('checkRequestBudget rejects over-limit cost', () => {
    const r = checkRequestBudget(1.5);
    expect(r.allowed).toBe(false);
  });
});

describe('costCalculatorService — calculateBudgetStatus', () => {
  it('reports zero spending correctly', () => {
    const s = calculateBudgetStatus(0, 0);
    expect(s.dailyPercent).toBe(0);
    expect(s.shouldAlert).toBe(false);
  });

  it('flags shouldAlert when daily reaches threshold', () => {
    setBudget({ maxCostPerDayUsd: 100, alertThresholdPercent: 80 });
    const s = calculateBudgetStatus(80, 0);
    expect(s.dailyPercent).toBe(80);
    expect(s.shouldAlert).toBe(true);
  });
});

describe('costCalculatorService — formatters', () => {
  it('formatCostUsd handles tiny amounts', () => {
    expect(formatCostUsd(0.0001)).toBe('$0.00');
    expect(formatCostUsd(0.005)).toBe('$0.0050');
    expect(formatCostUsd(1.234)).toBe('$1.23');
  });

  it('formatCostBrl applies exchange', () => {
    setExchangeRate(5.0);
    expect(formatCostBrl(1.0)).toBe('R$ 5,00');
  });

  it('formatTokenCount uses K/M abbreviations', () => {
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(1500)).toBe('1.5K');
    expect(formatTokenCount(2_500_000)).toBe('2.5M');
  });
});

describe('costCalculatorService — compareCosts', () => {
  it('returns sorted entries', async () => {
    const cmp = await compareCosts(1000, 500);
    expect(cmp.length).toBeGreaterThan(0);
    for (let i = 1; i < cmp.length; i++) {
      expect(cmp[i].costUsd).toBeGreaterThanOrEqual(cmp[i - 1].costUsd);
    }
  });

  it('zero tokens produces zero cost', async () => {
    const cmp = await compareCosts(0, 0);
    cmp.forEach((entry) => {
      expect(entry.costUsd).toBe(0);
    });
  });
});
