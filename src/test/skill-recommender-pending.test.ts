import { describe, it, expect } from 'vitest';
import { computePendingSkillIds } from '@/services/skillRecommenderService';

const rec = (id: string) => ({ skill: { id } });

describe('computePendingSkillIds', () => {
  it('filtra as já instaladas', () => {
    expect(computePendingSkillIds([rec('a'), rec('b')], new Set(['a']))).toEqual(['b']);
  });

  it('preserva a ordem de ranking', () => {
    expect(computePendingSkillIds([rec('c'), rec('a'), rec('b')], new Set())).toEqual(['c', 'a', 'b']);
  });

  it('remove duplicatas', () => {
    expect(computePendingSkillIds([rec('a'), rec('a')], new Set())).toEqual(['a']);
  });

  it('ignora ids vazios ou inválidos', () => {
    const bad = [rec('  '), { skill: { id: null } }, rec(' a ')] as never[];
    expect(computePendingSkillIds(bad, new Set())).toEqual(['a']);
  });

  it('tudo instalado resulta em lista vazia', () => {
    expect(computePendingSkillIds([rec('a')], new Set(['a']))).toEqual([]);
  });

  it('entrada vazia é segura', () => {
    expect(computePendingSkillIds([], new Set())).toEqual([]);
  });
});
