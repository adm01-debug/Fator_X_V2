/**
 * Recorte "Rever depto." — a fila de trabalho da curadoria.
 *
 * O risco deste filtro não é mostrar demais, é esconder demais: um valor
 * corrompido no storage remoto que ligue o recorte sozinho faria o curador ver
 * um painel quase vazio e concluir que o catálogo sumiu. Os testes abaixo
 * fixam a composição com os outros filtros e a rigidez da desserialização.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSkillDemandRows,
  filterByNeedsReview,
  filterByDepartment,
  countNeedsReview,
  normalizeDemandPreferences,
  type DemandPreferences,
} from '@/lib/skills/skillDemand';

const DEPARTAMENTOS = ['ti', 'vendas', 'marketing'] as const;
const PADRAO: DemandPreferences = {
  tier: 'zero',
  department: 'all',
  search: '',
  confidenceThreshold: 0.25,
  onlyNeedsReview: false,
  source: 'all',
};

function rows() {
  return buildSkillDemandRows(
    [
      {
        id: 'a',
        slug: 'a',
        department: 'ti',
        department_source: 'heuristic',
        department_confidence: 0.1,
      },
      {
        id: 'b',
        slug: 'b',
        department: 'ti',
        department_source: 'human',
        department_confidence: 1,
      },
      {
        id: 'c',
        slug: 'c',
        department: 'vendas',
        department_source: 'llm',
        department_confidence: 0.2,
      },
      {
        id: 'd',
        slug: 'd',
        department: null,
        department_source: 'heuristic',
        department_confidence: 0,
      },
    ],
    [],
  );
}

describe('filterByNeedsReview', () => {
  it('desligado devolve o conjunto intacto (e uma cópia, não a referência)', () => {
    const base = rows();
    const out = filterByNeedsReview(base, false);
    expect(out).toHaveLength(base.length);
    expect(out).not.toBe(base);
  });

  it('ligado mantém só os rótulos automáticos de baixa confiança', () => {
    expect(filterByNeedsReview(rows(), true).map((r) => r.slug)).toEqual(['a', 'c']);
  });

  it('compõe por interseção com o filtro de departamento', () => {
    const out = filterByNeedsReview(filterByDepartment(rows(), 'ti'), true);
    expect(out.map((r) => r.slug)).toEqual(['a']);
  });

  it('"sem departamento" + "rever depto." é vazio por construção, não por bug', () => {
    expect(filterByNeedsReview(filterByDepartment(rows(), 'none'), true)).toHaveLength(0);
  });

  it('countNeedsReview casa exatamente com o tamanho do recorte', () => {
    const base = rows();
    expect(countNeedsReview(base)).toBe(filterByNeedsReview(base, true).length);
  });

  it('é idempotente: reaplicar não estreita mais', () => {
    const uma = filterByNeedsReview(rows(), true);
    expect(filterByNeedsReview(uma, true)).toHaveLength(uma.length);
  });
});

describe('normalizeDemandPreferences — onlyNeedsReview', () => {
  it('preserva o boolean legítimo', () => {
    expect(
      normalizeDemandPreferences({ onlyNeedsReview: true }, DEPARTAMENTOS, PADRAO).onlyNeedsReview,
    ).toBe(true);
  });

  it('rejeita "false" string, que é truthy em JS e esconderia o catálogo', () => {
    expect(
      normalizeDemandPreferences({ onlyNeedsReview: 'false' }, DEPARTAMENTOS, PADRAO)
        .onlyNeedsReview,
    ).toBe(false);
  });

  it('rejeita 1/0 e objetos vindos de storage legado', () => {
    for (const v of [1, 0, {}, [], null]) {
      expect(
        normalizeDemandPreferences({ onlyNeedsReview: v }, DEPARTAMENTOS, PADRAO).onlyNeedsReview,
      ).toBe(false);
    }
  });

  it('payload não-objeto degrada para o padrão sem lançar', () => {
    for (const v of [null, undefined, 'x', 42, []]) {
      expect(normalizeDemandPreferences(v, DEPARTAMENTOS, PADRAO).onlyNeedsReview).toBe(false);
    }
  });
});
