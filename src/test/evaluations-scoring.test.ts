/**
 * evaluationsService — scoring CLEAR (funções puras) + acesso a dados.
 *
 * Antes só as funções puras eram cobertas; o `from: vi.fn()` devolvia
 * `undefined`, deixando toda a camada de dados sem rede. O caso mais delicado
 * é `updateDatasetCaseCount`, que faz um COUNT `head:true` e reescreve
 * `case_count` — se o count vier `null` e virar `NaN`/`undefined`, o dataset
 * passa a mentir sobre quantos casos tem e a avaliação roda incompleta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('evaluations-local').client };
});
vi.mock('@/integrations/supabase/externalClient', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabaseExternal: m.getSharedSupabaseMock('evaluations-external').client };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  scoreDeterministic,
  scoreStatistical,
  listAgentsForSelect,
  updateDatasetCaseCount,
  deleteTestCase,
} from '@/services/evaluationsService';

const ext = getSharedSupabaseMock('evaluations-external');

describe('scoreDeterministic', () => {
  it('returns 0 for empty inputs', () => {
    expect(scoreDeterministic('', 'foo')).toBe(0);
    expect(scoreDeterministic('foo', '')).toBe(0);
    expect(scoreDeterministic('', '')).toBe(0);
  });

  it('returns high score for exact match (normalized)', () => {
    const s = scoreDeterministic('Hello World', '  hello   world  ');
    expect(s).toBeGreaterThan(0.5);
  });

  it('rewards JSON key overlap', () => {
    const expected = JSON.stringify({ a: 1, b: 2, c: 3 });
    const actual = JSON.stringify({ a: 9, b: 8, c: 7 });
    const s = scoreDeterministic(expected, actual);
    expect(s).toBeGreaterThan(0.4);
  });

  it('penalizes wildly different lengths', () => {
    const expected = 'short';
    const actual = 'x'.repeat(1000);
    const s = scoreDeterministic(expected, actual);
    expect(s).toBeLessThan(0.5);
  });

  it('returns a number between 0 and 1', () => {
    for (let i = 0; i < 5; i++) {
      const s = scoreDeterministic('expected text here', 'some actual text');
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('scoreStatistical (ROUGE-L blend)', () => {
  it('returns 0 for empty inputs', () => {
    expect(scoreStatistical('', 'word')).toBe(0);
    expect(scoreStatistical('word', '')).toBe(0);
  });

  it('returns ~1 for identical strings', () => {
    const s = scoreStatistical('the quick brown fox', 'the quick brown fox');
    expect(s).toBeGreaterThan(0.95);
  });

  it('returns intermediate score for partial overlap', () => {
    const s = scoreStatistical('the quick brown fox jumps', 'the slow brown dog jumps');
    expect(s).toBeGreaterThan(0.3);
    expect(s).toBeLessThan(0.9);
  });

  it('returns low score for unrelated text', () => {
    const s = scoreStatistical('the quick brown fox', 'completely unrelated phrase here');
    expect(s).toBeLessThan(0.3);
  });

  it('handles ordering — LCS rewards sequence', () => {
    const inOrder = scoreStatistical('alpha beta gamma delta', 'alpha beta gamma delta');
    const reversed = scoreStatistical('alpha beta gamma delta', 'delta gamma beta alpha');
    expect(inOrder).toBeGreaterThan(reversed);
  });

  it('always returns value in [0, 1]', () => {
    const cases = [
      ['hello world', 'hello'],
      ['a b c d e', 'e d c b a'],
      ['only one match', 'totally different'],
      ['x x x x', 'x x x x x x'],
    ];
    for (const [a, b] of cases) {
      const s = scoreStatistical(a, b);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('evaluationsService — acesso a dados', () => {
  beforeEach(() => {
    ext.reset();
    ext.setResult({ data: [], error: null, count: null });
  });

  it('listAgentsForSelect traz apenas id/name ordenados (payload mínimo p/ combo)', async () => {
    ext.setTableResult('agents', { data: [{ id: 'a1', name: 'Alfa' }], error: null });
    const agents = await listAgentsForSelect();

    expect(agents).toEqual([{ id: 'a1', name: 'Alfa' }]);
    expect(ext.calls.select).toHaveBeenCalledWith('id, name');
    expect(ext.calls.order).toHaveBeenCalledWith('name');
  });

  it('listAgentsForSelect propaga erro em vez de devolver combo vazio', async () => {
    ext.setTableResult('agents', { data: null, error: { message: 'rls' } });
    await expect(listAgentsForSelect()).rejects.toMatchObject({ message: 'rls' });
  });

  it('updateDatasetCaseCount usa COUNT head:true e grava o total no dataset', async () => {
    ext.setTableResult('test_cases', { data: null, error: null, count: 7 });
    await updateDatasetCaseCount('ds-1');

    expect(ext.calls.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(ext.calls.eq).toHaveBeenCalledWith('dataset_id', 'ds-1');
    expect(ext.calls.update).toHaveBeenCalledWith({ case_count: 7 });
    expect(ext.calls.eq).toHaveBeenCalledWith('id', 'ds-1');
  });

  it('count nulo vira 0, nunca null/NaN (case_count é NOT NULL)', async () => {
    ext.setTableResult('test_cases', { data: null, error: null, count: null });
    await updateDatasetCaseCount('ds-2');
    expect(ext.calls.update).toHaveBeenCalledWith({ case_count: 0 });
  });

  it('falha no COUNT aborta antes de gravar um total errado', async () => {
    ext.setTableResult('test_cases', { data: null, error: { message: 'timeout' }, count: null });
    await expect(updateDatasetCaseCount('ds-3')).rejects.toMatchObject({ message: 'timeout' });
    expect(ext.calls.update).not.toHaveBeenCalled();
  });

  it('deleteTestCase remove exatamente o id informado', async () => {
    await deleteTestCase('tc-1');
    expect(ext.calls.delete).toHaveBeenCalled();
    expect(ext.calls.eq).toHaveBeenCalledWith('id', 'tc-1');
  });
});
