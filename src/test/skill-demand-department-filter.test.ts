/**
 * Simulação exaustiva do filtro por departamento do painel de demanda.
 *
 * Objetivo: provar que o novo recorte é TOTAL (nunca lança), COMPOSICIONAL
 * (comuta com o filtro de faixa) e CONSERVATIVO (a união dos recortes por
 * departamento reconstrói exatamente o universo). Entradas hostis — strings
 * com espaço, caixa alta, departamento inexistente, valores não-string —
 * degradam para `all` em vez de produzir um recorte vazio inexplicável.
 */
import { describe, expect, it } from 'vitest';
import { SKILL_DEPARTMENTS } from '@/config/skill-departments';
import {
  buildSkillDemandRows,
  countByDepartment,
  filterByDemand,
  filterByDepartment,
  normalizeDepartmentFilter,
  DEMAND_TIERS,
  type DemandLinkInput,
  type DemandSkillInput,
} from '@/lib/skills/skillDemand';

const ALLOWED = [...SKILL_DEPARTMENTS];

/** Gera um catálogo determinístico e reprodutível de N skills. */
function buildCatalog(size: number): { skills: DemandSkillInput[]; links: DemandLinkInput[] } {
  const skills: DemandSkillInput[] = [];
  const links: DemandLinkInput[] = [];
  for (let i = 0; i < size; i += 1) {
    // 1 em cada 4 fica sem departamento — reproduz o bolsão real de dívida.
    const dept = i % 4 === 0 ? null : ALLOWED[i % ALLOWED.length];
    skills.push({
      id: `skill-${i}`,
      name: `Skill ${i}`,
      slug: `skill-${i}`,
      department: dept,
      quality_score: i % 11,
      description: `Descrição ${i}`,
      tags: [`tag-${i % 7}`],
    });
    // Demanda variável de 0 a 7 templates, cobrindo todas as faixas.
    for (let t = 0; t < i % 8; t += 1) links.push({ skill_id: `skill-${i}`, template_id: `tpl-${t}` });
  }
  return { skills, links };
}

const { skills, links } = buildCatalog(400);
const rows = buildSkillDemandRows(skills, links);

describe('normalizeDepartmentFilter', () => {
  it('aceita a taxonomia canônica e os dois sentinelas', () => {
    expect(normalizeDepartmentFilter('all', ALLOWED)).toBe('all');
    expect(normalizeDepartmentFilter('none', ALLOWED)).toBe('none');
    for (const dept of ALLOWED) {
      expect(normalizeDepartmentFilter(dept, ALLOWED)).toBe(dept);
    }
  });

  it('normaliza caixa e espaços sem perder o alvo', () => {
    expect(normalizeDepartmentFilter('  TRANSVERSAL ', ALLOWED)).toBe('transversal');
    expect(normalizeDepartmentFilter('Ti', ALLOWED)).toBe('ti');
  });

  it('degrada entradas hostis para all em vez de lançar', () => {
    const hostis: unknown[] = [null, undefined, 42, {}, [], '', '   ', 'inexistente', '../../etc'];
    for (const valor of hostis) {
      expect(normalizeDepartmentFilter(valor, ALLOWED)).toBe('all');
    }
  });
});

describe('filterByDepartment — invariantes sobre 400 skills', () => {
  it('all preserva o universo e não muta a entrada', () => {
    const antes = rows.length;
    const saida = filterByDepartment(rows, 'all');
    expect(saida).toHaveLength(antes);
    expect(saida).not.toBe(rows);
    expect(rows).toHaveLength(antes);
  });

  it('none isola exatamente as skills sem classificação', () => {
    const semDept = filterByDepartment(rows, 'none');
    expect(semDept.every((r) => r.department === null)).toBe(true);
    expect(semDept).toHaveLength(rows.filter((r) => r.department === null).length);
    expect(semDept.length).toBeGreaterThan(0);
  });

  it('a união dos recortes reconstrói o universo sem sobreposição', () => {
    let soma = filterByDepartment(rows, 'none').length;
    for (const dept of ALLOWED) soma += filterByDepartment(rows, dept).length;
    expect(soma).toBe(rows.length);
  });

  it('countByDepartment coincide com a cardinalidade de cada recorte', () => {
    const contagem = countByDepartment(rows);
    expect(contagem.none ?? 0).toBe(filterByDepartment(rows, 'none').length);
    for (const dept of ALLOWED) {
      expect(contagem[dept] ?? 0).toBe(filterByDepartment(rows, dept).length);
    }
  });

  it('transversal é recortável e nunca captura skills de domínio', () => {
    const transversais = filterByDepartment(rows, 'transversal');
    expect(transversais.length).toBeGreaterThan(0);
    expect(transversais.every((r) => r.department === 'transversal')).toBe(true);
  });

  it('comuta com o filtro de faixa em todas as combinações (12 x 4)', () => {
    const alvos = ['none', ...ALLOWED] as const;
    for (const tier of DEMAND_TIERS) {
      for (const dept of alvos) {
        const a = filterByDepartment(filterByDemand(rows, tier), dept);
        const b = filterByDemand(filterByDepartment(rows, dept), tier);
        expect(a.map((r) => r.skillId)).toEqual(b.map((r) => r.skillId));
      }
    }
  });

  it('é total diante de linhas degeneradas', () => {
    const degeneradas = buildSkillDemandRows(
      [
        { id: 'a', department: '   ' as unknown as string },
        { id: 'b', department: null },
        { id: 'c' },
      ],
      null,
    );
    expect(() => filterByDepartment(degeneradas, 'none')).not.toThrow();
    expect(filterByDepartment(degeneradas, 'all')).toHaveLength(3);
  });
});
