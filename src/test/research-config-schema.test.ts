/**
 * Testes unitários para o schema Zod do ResearchConfig.
 * Cobre ranges, coerção, mensagens PT-BR e agregação de erros por campo.
 */
import { describe, it, expect } from 'vitest';
import {
  researchConfigSchema,
  validateResearchConfig,
} from '@/lib/validations/researchConfig';

const validDraft = {
  defaultDepth: 'standard' as const,
  maxIterations: 5,
  queriesPerIteration: 3,
  strategy: 'balanced' as const,
  synthesisModel: 'claude-sonnet-4-6' as const,
  language: 'pt' as const,
  includeInternal: true,
  stopOnNoGaps: true,
  maxTokens: 50_000,
  maxSources: 20,
  maxLatencySec: 180,
  maxCostUsd: 5,
};

describe('researchConfigSchema — happy path', () => {
  it('aceita um draft válido', () => {
    const result = researchConfigSchema.safeParse(validDraft);
    expect(result.success).toBe(true);
  });

  it('coage strings numéricas via z.coerce', () => {
    const result = researchConfigSchema.safeParse({
      ...validDraft,
      maxIterations: '7',
      queriesPerIteration: '4',
      maxTokens: '10000',
      maxCostUsd: '2.5',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxIterations).toBe(7);
      expect(result.data.maxCostUsd).toBeCloseTo(2.5);
    }
  });
});

describe('researchConfigSchema — ranges e mensagens PT-BR', () => {
  it.each([
    ['maxIterations', 0, 'Mínimo 1 iteração'],
    ['maxIterations', 11, 'Máximo 10 iterações'],
    ['queriesPerIteration', 0, 'Mínimo 1 query'],
    ['queriesPerIteration', 6, 'Máximo 5 queries'],
    ['maxTokens', 999, 'Mínimo 1.000 tokens'],
    ['maxTokens', 500_001, 'Máximo 500.000 tokens'],
    ['maxSources', 4, 'Mínimo 5 fontes'],
    ['maxSources', 51, 'Máximo 50 fontes'],
    ['maxLatencySec', 29, 'Mínimo 30s'],
    ['maxLatencySec', 601, 'Máximo 600s (10min)'],
    ['maxCostUsd', 0.05, 'Mínimo USD 0.10'],
    ['maxCostUsd', 50.01, 'Máximo USD 50.00'],
  ] as const)('%s = %s → "%s"', (field, value, expectedMsg) => {
    const result = validateResearchConfig({ ...validDraft, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[field as keyof typeof result.errors]).toBe(expectedMsg);
    }
  });

  it('rejeita valores não inteiros em campos inteiros', () => {
    const result = validateResearchConfig({ ...validDraft, maxIterations: 3.7 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.maxIterations).toBeDefined();
  });

  it('rejeita enums inválidos', () => {
    const result = validateResearchConfig({ ...validDraft, strategy: 'aggressive' });
    expect(result.success).toBe(false);
  });
});

describe('validateResearchConfig — agregação de erros', () => {
  it('retorna apenas a primeira mensagem por campo', () => {
    const result = validateResearchConfig({
      ...validDraft,
      maxIterations: 999,
      maxSources: 999,
      maxCostUsd: 999,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.errors).sort()).toEqual(
        ['maxCostUsd', 'maxIterations', 'maxSources'].sort(),
      );
    }
  });

  it('não vaza erros de campos válidos', () => {
    const result = validateResearchConfig({ ...validDraft, maxIterations: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.maxIterations).toBeDefined();
      expect(result.errors.queriesPerIteration).toBeUndefined();
      expect(result.errors.maxTokens).toBeUndefined();
    }
  });
});
