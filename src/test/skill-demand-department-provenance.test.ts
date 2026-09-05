/**
 * Procedência da classificação departamental.
 *
 * O selo "Rever depto." é a única barreira entre um palpite heurístico
 * (confiança média observada em produção: 0.14) e um rótulo que o curador
 * trata como verdade. Estes testes fixam as três regras que sustentam o selo:
 * confiança normalizada em [0,1], procedência degradando para `unknown`, e
 * revisão humana que nunca é reaberta.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSkillDemandRows,
  normalizeDepartmentConfidence,
  normalizeDepartmentSource,
  DEPARTMENT_REVIEW_THRESHOLD,
  type DemandSkillInput,
} from '@/lib/skills/skillDemand';

function build(skill: Partial<DemandSkillInput>) {
  return buildSkillDemandRows([{ id: 's1', slug: 's1', department: 'ti', ...skill }], [])[0];
}

describe('normalizeDepartmentConfidence', () => {
  it('aceita numeric vindo como string do PostgREST', () => {
    expect(normalizeDepartmentConfidence('0.137')).toBeCloseTo(0.137, 5);
  });

  it('degrada valores inválidos para 0 em vez de propagar NaN', () => {
    for (const v of [null, undefined, '', 'abc', NaN, {}]) {
      expect(normalizeDepartmentConfidence(v)).toBe(0);
    }
  });

  it('satura fora da faixa [0,1]', () => {
    expect(normalizeDepartmentConfidence(-3)).toBe(0);
    expect(normalizeDepartmentConfidence(9)).toBe(1);
  });
});

describe('normalizeDepartmentSource', () => {
  it('preserva as procedências válidas do CHECK do banco', () => {
    for (const s of ['unknown', 'heuristic', 'llm', 'human', 'import']) {
      expect(normalizeDepartmentSource(s)).toBe(s);
    }
  });

  it('degrada procedência desconhecida para unknown', () => {
    expect(normalizeDepartmentSource('chute')).toBe('unknown');
    expect(normalizeDepartmentSource(null)).toBe('unknown');
  });
});

describe('departmentNeedsReview', () => {
  it('sinaliza heurística de baixa confiança', () => {
    const row = build({ department_source: 'heuristic', department_confidence: 0.14 });
    expect(row.departmentNeedsReview).toBe(true);
  });

  it('não sinaliza acima do limiar', () => {
    const row = build({
      department_source: 'heuristic',
      department_confidence: DEPARTMENT_REVIEW_THRESHOLD,
    });
    expect(row.departmentNeedsReview).toBe(false);
  });

  it('nunca reabre classificação revisada por humano', () => {
    const row = build({ department_source: 'human', department_confidence: 0 });
    expect(row.departmentNeedsReview).toBe(false);
  });

  it('não sinaliza skill sem departamento (já coberta pelo filtro "sem departamento")', () => {
    const row = build({
      department: null,
      department_source: 'heuristic',
      department_confidence: 0,
    });
    expect(row.departmentNeedsReview).toBe(false);
  });

  it('trata ausência total dos campos como unknown/0 sem quebrar', () => {
    const row = build({});
    expect(row.departmentSource).toBe('unknown');
    expect(row.departmentConfidence).toBe(0);
    expect(row.departmentNeedsReview).toBe(true);
  });
});
