/**
 * Simulação exaustiva do medidor de demanda de skills.
 *
 * Estratégia: gerar centenas de catálogos sintéticos (incluindo entradas
 * hostis) e provar invariantes em vez de casos pontuais.
 */
import { describe, it, expect } from 'vitest';
import {
  DEMAND_TIERS,
  buildSkillDemandRows,
  classifyDemand,
  demandRowsToCsv,
  filterByDemand,
  normalizeDemandFilter,
  summarizeSkillDemand,
  type DemandLinkInput,
  type DemandSkillInput,
} from '@/lib/skills/skillDemand';

/** PRNG determinístico (mulberry32) — a simulação precisa ser reprodutível. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeScenario(seed: number) {
  const rand = rng(seed);
  const skillCount = 1 + Math.floor(rand() * 30);
  const skills: DemandSkillInput[] = [];
  for (let i = 0; i < skillCount; i += 1) {
    skills.push({
      id: `s${i}`,
      name: rand() < 0.1 ? '' : `Skill ${i}`,
      slug: rand() < 0.1 ? null : `slug-${i}`,
      department: rand() < 0.2 ? null : `dep-${Math.floor(rand() * 5)}`,
      quality_score: rand() < 0.1 ? null : Math.floor(rand() * 101),
      source_repo: rand() < 0.5 ? `owner/repo-${i}` : null,
    });
  }
  const links: DemandLinkInput[] = [];
  const linkCount = Math.floor(rand() * 80);
  for (let i = 0; i < linkCount; i += 1) {
    links.push({
      // 15% dos vínculos apontam para skills inexistentes (órfãos)
      skill_id: rand() < 0.15 ? `ghost-${i}` : `s${Math.floor(rand() * skillCount)}`,
      template_id: `t${Math.floor(rand() * 10)}`,
    });
  }
  return { skills, links };
}

describe('classifyDemand', () => {
  it('particiona o eixo numérico sem sobreposição', () => {
    expect(classifyDemand(0)).toBe('zero');
    expect(classifyDemand(1)).toBe('baixa');
    expect(classifyDemand(2)).toBe('baixa');
    expect(classifyDemand(3)).toBe('media');
    expect(classifyDemand(5)).toBe('media');
    expect(classifyDemand(6)).toBe('alta');
    expect(classifyDemand(999)).toBe('alta');
  });

  it('degrada entradas inválidas para zero', () => {
    for (const value of [-1, -999, Number.NaN, Number.POSITIVE_INFINITY * 0, 0.4]) {
      expect(classifyDemand(value)).toBe('zero');
    }
    // Infinito não é um valor de contagem legítimo: degrada para zero.
    expect(classifyDemand(Number.POSITIVE_INFINITY)).toBe('zero');
  });
});

describe('buildSkillDemandRows — 400 cenários simulados', () => {
  it('mantém todas as invariantes', () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const { skills, links } = makeScenario(seed);
      const rows = buildSkillDemandRows(skills, links);

      // I1 — uma linha por skill única do catálogo
      expect(rows.length).toBe(new Set(skills.map((s) => s.id)).size);

      // I2 — nenhuma linha duplicada
      expect(new Set(rows.map((r) => r.skillId)).size).toBe(rows.length);

      // I3 — contagem é de templates DISTINTOS e nunca negativa
      for (const row of rows) {
        const distintos = new Set(
          links.filter((l) => l.skill_id === row.skillId).map((l) => l.template_id),
        ).size;
        expect(row.templateCount).toBe(distintos);
        expect(row.templateCount).toBeGreaterThanOrEqual(0);
        expect(row.tier).toBe(classifyDemand(row.templateCount));
      }

      // I4 — ordenação crescente por demanda
      for (let i = 1; i < rows.length; i += 1) {
        expect(rows[i - 1].templateCount).toBeLessThanOrEqual(rows[i].templateCount);
      }

      // I5 — determinismo
      expect(buildSkillDemandRows(skills, links)).toEqual(rows);

      // I6 — filtros formam partição exata do conjunto
      const soma = DEMAND_TIERS.reduce((acc, t) => acc + filterByDemand(rows, t).length, 0);
      expect(soma).toBe(rows.length);
      expect(filterByDemand(rows, 'all')).toEqual(rows);

      // I7 — resumo coerente
      const resumo = summarizeSkillDemand(rows);
      expect(resumo.total).toBe(rows.length);
      expect(Object.values(resumo.byTier).reduce((a, b) => a + b, 0)).toBe(rows.length);
      expect(resumo.coveragePct).toBeGreaterThanOrEqual(0);
      expect(resumo.coveragePct).toBeLessThanOrEqual(100);

      // I8 — campos textuais nunca vazios
      for (const row of rows) {
        expect(row.name.length).toBeGreaterThan(0);
        expect(row.slug.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('entradas hostis', () => {
  it('tolera nulos e formatos inesperados', () => {
    expect(buildSkillDemandRows(null, null)).toEqual([]);
    expect(buildSkillDemandRows(undefined, undefined)).toEqual([]);
    expect(buildSkillDemandRows([{ id: '' }], [])).toEqual([]);
    const rows = buildSkillDemandRows(
      [{ id: 'a' }, { id: 'a', name: 'duplicada' }],
      [
        { skill_id: 'a', template_id: 't1' },
        { skill_id: 'a', template_id: 't1' },
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].templateCount).toBe(1);
  });

  it('ignora vínculos apontando para skills inexistentes', () => {
    const rows = buildSkillDemandRows([{ id: 'a' }], [{ skill_id: 'z', template_id: 't1' }]);
    expect(rows[0].templateCount).toBe(0);
    expect(rows[0].tier).toBe('zero');
  });
});

describe('normalizeDemandFilter', () => {
  it('é total e idempotente', () => {
    const entradas: unknown[] = [
      'all',
      'zero',
      'ZERO',
      ' baixa ',
      'media',
      'alta',
      'inexistente',
      '',
      null,
      undefined,
      42,
      {},
      [],
      Symbol.iterator.toString(),
      '__proto__',
      'x'.repeat(5000),
    ];
    for (const entrada of entradas) {
      const primeiro = normalizeDemandFilter(entrada);
      expect(['all', ...DEMAND_TIERS]).toContain(primeiro);
      expect(normalizeDemandFilter(primeiro)).toBe(primeiro);
    }
    expect(normalizeDemandFilter('ZERO')).toBe('zero');
    expect(normalizeDemandFilter('inexistente')).toBe('all');
  });
});

describe('demandRowsToCsv', () => {
  it('emite BOM, cabeçalho e escapa aspas', () => {
    const rows = buildSkillDemandRows(
      [{ id: 'a', name: 'Skill "X"', slug: 'skill-x', quality_score: 80 }],
      [],
    );
    const csv = demandRowsToCsv(rows);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Skill ""X"""');
    expect(csv.split('\r\n')).toHaveLength(2);
  });

  it('gera apenas cabeçalho quando não há linhas', () => {
    expect(demandRowsToCsv([]).split('\r\n')).toHaveLength(1);
  });
});
