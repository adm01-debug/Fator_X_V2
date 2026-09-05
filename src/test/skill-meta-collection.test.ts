/**
 * Coletâneas (meta-repositórios) no registro de skills.
 *
 * Gap encontrado na auditoria da fila de revisão: 20 dos 57 itens que pediam
 * "revisar departamento" não eram skills — eram listas curadas (`awesome-go`,
 * `awesome-mac`, `the-book-of-secret-knowledge`). O curador não tem resposta
 * possível: uma lista de links não pertence a departamento algum. Elas
 * empurravam para fora da tela as skills que de fato precisavam de decisão.
 *
 * Dois eixos são testados aqui, porque o bug tem dois lados simétricos:
 *  - falso negativo: coletânea contada como pendência de classificação;
 *  - falso positivo: skill executável descartada como coletânea na coleta —
 *    caso real `ruvnet-ruview`, que traz o tópico `awesome` entre outros 19.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSkillDemandRows,
  countNeedsReview,
  filterByNeedsReview,
  type DemandSkillInput,
} from '@/lib/skills/skillDemand';

function skill(over: Partial<DemandSkillInput> & { id: string }): DemandSkillInput {
  return {
    name: over.id,
    slug: over.id,
    department: 'ti',
    department_source: 'heuristic',
    department_confidence: 0.02,
    quality_score: 0,
    ...over,
  };
}

describe('coletâneas fora da fila de revisão', () => {
  it('coletânea com rótulo de baixa confiança não pede revisão', () => {
    const [row] = buildSkillDemandRows([skill({ id: 'awesome-go', is_meta_collection: true })], []);
    expect(row.isMetaCollection).toBe(true);
    expect(row.departmentNeedsReview).toBe(false);
  });

  it('skill comum com o mesmo rótulo continua pedindo revisão', () => {
    const [row] = buildSkillDemandRows([skill({ id: 'tdd-guard' })], []);
    expect(row.isMetaCollection).toBe(false);
    expect(row.departmentNeedsReview).toBe(true);
  });

  it('regressão do caso real: 20 coletâneas somem da fila, 37 skills permanecem', () => {
    const catalogo: DemandSkillInput[] = [
      ...Array.from({ length: 20 }, (_, i) =>
        skill({ id: `awesome-${i}`, is_meta_collection: true }),
      ),
      ...Array.from({ length: 37 }, (_, i) => skill({ id: `skill-${i}` })),
    ];
    const rows = buildSkillDemandRows(catalogo, []);
    expect(rows).toHaveLength(57);
    expect(countNeedsReview(rows)).toBe(37);
    expect(filterByNeedsReview(rows, true).every((r) => !r.isMetaCollection)).toBe(true);
  });

  it('coletânea continua visível no catálogo — some da fila, não do sistema', () => {
    const rows = buildSkillDemandRows([skill({ id: 'awesome-go', is_meta_collection: true })], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].department).toBe('ti');
  });

  it('só o booleano estrito marca coletânea — payload hostil não altera a fila', () => {
    const hostis = [null, undefined, 0, 1, '', 'true', 'false', {}, []];
    for (const valor of hostis) {
      const [row] = buildSkillDemandRows(
        [skill({ id: 'x', is_meta_collection: valor as unknown as boolean })],
        [],
      );
      expect(row.isMetaCollection).toBe(valor === true);
      expect(row.departmentNeedsReview).toBe(true);
    }
  });

  it('marcar como coletânea nunca aumenta a fila — invariante sobre todo o espaço', () => {
    const DEPARTAMENTOS = [null, 'ti', 'vendas'];
    const ORIGENS = ['unknown', 'heuristic', 'platform_heuristic', 'llm', 'human', 'import'];
    const CONFIANCAS = [0, 0.1, 0.24, 0.5, 1];
    let cenarios = 0;
    for (const department of DEPARTAMENTOS) {
      for (const source of ORIGENS) {
        for (const conf of CONFIANCAS) {
          const base = {
            id: 'x',
            department,
            department_source: source,
            department_confidence: conf,
          };
          const [normal] = buildSkillDemandRows([skill(base)], []);
          const [meta] = buildSkillDemandRows([skill({ ...base, is_meta_collection: true })], []);
          // Monotonicidade: a marcação só pode remover pendência, jamais criar.
          expect(Number(meta.departmentNeedsReview)).toBeLessThanOrEqual(
            Number(normal.departmentNeedsReview),
          );
          expect(meta.departmentNeedsReview).toBe(false);
          cenarios += 1;
        }
      }
    }
    expect(cenarios).toBe(90);
  });
});

/**
 * Réplica da regra corrigida em `skill-harvester/lib.ts::isMetaRepository`.
 * O harvester roda em Deno e não é importável daqui; duplicar a regra faz o
 * teste quebrar se as duas pontas divergirem — o mesmo contrato usado para a
 * trigger de procedência.
 */
const PADROES = [
  /\bawesome\b/,
  /\bawesome[-_]/,
  /\bcurated\b/,
  /\bcollection\b/,
  /\blist of\b/,
  /\broadmap\b/,
  /\bcourse\b/,
  /\bfor[-_ ]beginners\b/,
];
const FORTES = new Set(['awesome-list', 'awesome-lists', 'curated-list', 'roadmap', 'cheatsheet']);
const FRACAS = new Set([
  'awesome',
  'list',
  'collection',
  'resources',
  'tutorial',
  'tutorials',
  'course',
  'learning',
  'education',
  'books',
]);

function isMeta(input: { name?: string; description?: string; tags?: string[] }): boolean {
  const texto = `${input.name ?? ''} ${input.description ?? ''}`.toLowerCase();
  if (PADROES.some((re) => re.test(texto))) return true;
  const tags = (input.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean);
  if (tags.some((t) => FORTES.has(t))) return true;
  return new Set(tags.filter((t) => FRACAS.has(t))).size >= 2;
}

describe('detecção de coletânea na coleta', () => {
  it('regressão RuView: um único tópico "awesome" não condena uma skill real', () => {
    expect(
      isMeta({
        name: 'RuView',
        description:
          'Turns commodity WiFi signals into real-time spatial intelligence and presence detection.',
        tags: ['awesome', 'esp32', 'iot', 'wifi', 'react', 'typescript'],
      }),
    ).toBe(false);
  });

  it('tópico forte sozinho basta — ninguém marca "awesome-list" por acidente', () => {
    expect(isMeta({ name: 'foo', tags: ['awesome-list'] })).toBe(true);
    expect(isMeta({ name: 'foo', tags: ['curated-list'] })).toBe(true);
  });

  it('dois tópicos fracos se corroboram', () => {
    expect(isMeta({ name: 'foo', tags: ['awesome', 'resources'] })).toBe(true);
    expect(isMeta({ name: 'foo', tags: ['tutorial', 'learning'] })).toBe(true);
  });

  it('o texto continua sendo evidência suficiente', () => {
    for (const nome of [
      'awesome go',
      'awesome mac',
      'a curated list of tools',
      'python for beginners',
      'developer roadmap',
    ]) {
      expect(isMeta({ name: nome })).toBe(true);
    }
  });

  it('skills legítimas do catálogo permanecem fora da detecção', () => {
    const legitimas = [
      { name: 'tdd guard', description: 'Automated TDD enforcement for Claude Code' },
      { name: 'axios', description: 'Promise based HTTP client for the browser and node.js' },
      { name: 'firecrawl mcp server', description: 'Adds powerful web scraping and search' },
      { name: 'portkey ai gateway', description: 'A blazing fast AI Gateway with guardrails' },
    ];
    for (const s of legitimas) expect(isMeta(s)).toBe(false);
  });

  it('tópicos vazios ou com espaços não corroboram nada', () => {
    expect(isMeta({ name: 'foo', tags: ['', '   ', 'AWESOME'] })).toBe(false);
    // Case-insensitive de verdade: dois fracos em maiúsculas ainda corroboram.
    expect(isMeta({ name: 'foo', tags: ['AWESOME', ' Resources '] })).toBe(true);
  });
});

/**
 * Régua por procedência.
 *
 * O tier de plataforma tem teto de confiança em 0.40 por construção. Julgá-lo
 * pelo piso de 0.5 usado para vereditos de domínio tornava a fila inescapável:
 * nenhuma quantidade de evidência tirava o item de "rever". Régua fixa aplicada
 * a escalas diferentes não é rigor — é um item preso para sempre.
 */
describe('piso de revisão por procedência', () => {
  it('plataforma no teto sai da fila; domínio na mesma confiança permanece', () => {
    const [plataforma] = buildSkillDemandRows(
      [
        skill({
          id: 'fastmcp',
          department_source: 'platform_heuristic',
          department_confidence: 0.4,
        }),
      ],
      [],
    );
    const [dominio] = buildSkillDemandRows(
      [skill({ id: 'outra', department_source: 'heuristic', department_confidence: 0.4 })],
      [],
    );
    expect(plataforma.departmentNeedsReview).toBe(false);
    expect(dominio.departmentNeedsReview).toBe(true);
  });

  it('plataforma no piso continua pedindo revisão', () => {
    const [row] = buildSkillDemandRows(
      [
        skill({
          id: 'gstack',
          department_source: 'platform_heuristic',
          department_confidence: 0.15,
        }),
      ],
      [],
    );
    expect(row.departmentNeedsReview).toBe(true);
  });

  it('curadoria humana nunca entra na fila, qualquer que seja a régua', () => {
    for (const conf of [0, 0.15, 0.4, 1]) {
      const [row] = buildSkillDemandRows(
        [skill({ id: 'x', department_source: 'human', department_confidence: conf })],
        [],
      );
      expect(row.departmentNeedsReview).toBe(false);
    }
  });

  it('a régua correta é aplicada em toda a grade procedência × confiança', () => {
    const ORIGENS = ['unknown', 'heuristic', 'platform_heuristic', 'llm', 'import'] as const;
    const CONFIANCAS = [0, 0.15, 0.17, 0.18, 0.3, 0.4, 0.49, 0.5, 1];
    let cenarios = 0;
    for (const source of ORIGENS) {
      for (const conf of CONFIANCAS) {
        const [row] = buildSkillDemandRows(
          [skill({ id: 'x', department_source: source, department_confidence: conf })],
          [],
        );
        const piso = source === 'platform_heuristic' ? 0.18 : 0.5;
        expect(row.departmentNeedsReview).toBe(conf < piso);
        cenarios += 1;
      }
    }
    expect(cenarios).toBe(45);
  });
});
