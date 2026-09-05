import { describe, it, expect } from 'vitest';
import { normalizeSkillIdList, MAX_BULK_INSTALL } from '@/services/skillsRegistryService';
import { simulateCurrentBulkInstall } from '@/services/skillsSimulationService';

describe('normalizeSkillIdList', () => {
  it('remove duplicatas, vazios e não-strings', () => {
    expect(normalizeSkillIdList(['a', 'a', ' b ', '', '   ', 42, null, undefined])).toEqual([
      'a',
      'b',
    ]);
  });
  it('aplica limite máximo', () => {
    const many = Array.from({ length: MAX_BULK_INSTALL + 30 }, (_, i) => `s${i}`);
    expect(normalizeSkillIdList(many)).toHaveLength(MAX_BULK_INSTALL);
  });
  it('lista vazia é no-op', () => {
    expect(normalizeSkillIdList([])).toEqual([]);
  });
});

describe('bulk install — semântica idempotente', () => {
  it('reinstalar skill já instalada não falha e não duplica', () => {
    expect(simulateCurrentBulkInstall(['s1'], ['s1'])).toEqual({
      inserted: [],
      skipped: ['s1'],
      failed: false,
    });
  });
  it('colisão parcial não bloqueia as inéditas', () => {
    const r = simulateCurrentBulkInstall(['s1'], ['s1', 's2']);
    expect(r.inserted).toEqual(['s2']);
    expect(r.failed).toBe(false);
  });
  it('lote com id repetido instala uma vez', () => {
    expect(simulateCurrentBulkInstall([], ['s1', 's1']).inserted).toEqual(['s1']);
  });
});
