import { describe, it, expect } from 'vitest';
import { computeSkillSelectionDiff } from '@/services/skillsRegistryService';

describe('computeSkillSelectionDiff', () => {
  it('detecta adições e remoções', () => {
    expect(computeSkillSelectionDiff(['a', 'b'], ['b', 'c'])).toEqual({
      toAdd: ['c'],
      toRemove: ['a'],
    });
  });

  it('seleção idêntica é no-op', () => {
    expect(computeSkillSelectionDiff(['a', 'b'], ['b', 'a'])).toEqual({ toAdd: [], toRemove: [] });
  });

  it('limpar a seleção remove tudo', () => {
    expect(computeSkillSelectionDiff(['a', 'b'], [])).toEqual({ toAdd: [], toRemove: ['a', 'b'] });
  });

  it('nunca coloca o mesmo id em toAdd e toRemove', () => {
    const { toAdd, toRemove } = computeSkillSelectionDiff(['a'], ['a', 'a', 'b']);
    expect(toAdd).toEqual(['b']);
    expect(toRemove).toEqual([]);
  });

  it('sanitiza ids inválidos e duplicados', () => {
    const diff = computeSkillSelectionDiff([' a ', '', 'a'] as string[], ['a', ' b '] as string[]);
    expect(diff).toEqual({ toAdd: ['b'], toRemove: [] });
  });

  it('estado inicial vazio instala tudo', () => {
    expect(computeSkillSelectionDiff([], ['x', 'y'])).toEqual({ toAdd: ['x', 'y'], toRemove: [] });
  });
});
