/**
 * Filtro por procedência da classificação departamental.
 *
 * Cenário que motivou o teste: o motor passou a gravar `platform_heuristic`
 * (tier de jargão de plataforma) e `lexical` sobreviveu como rótulo legado.
 * Nenhum dos dois estava na lista de procedências aceitas, então
 * `normalizeDepartmentSource` os degradava para `unknown` — a UI mostrava
 * "sem origem" para 12 decisões automáticas reais e nenhum recorte conseguia
 * auditar o lote. Os testes abaixo travam esse contrato.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSkillDemandRows,
  countBySource,
  DEPARTMENT_SOURCES,
  DEPARTMENT_SOURCE_LABEL,
  demandRowsToCsv,
  filterBySource,
  normalizeDemandPreferences,
  normalizeDepartmentSource,
  normalizeSourceFilter,
  type DemandPreferences,
  type DemandSkillInput,
  type DepartmentSource,
} from '@/lib/skills/skillDemand';

const ALLOWED = ['ti', 'vendas', 'marketing'] as const;
const PADRAO: DemandPreferences = {
  tier: 'zero',
  department: 'all',
  search: '',
  confidenceThreshold: 0.25,
  onlyNeedsReview: false,
  source: 'all',
};

function skill(id: string, source: string, confidence = 0.15): DemandSkillInput {
  return {
    id,
    name: `Skill ${id}`,
    slug: `skill-${id}`,
    department: 'ti',
    department_source: source,
    department_confidence: confidence,
  };
}

describe('procedências reconhecidas', () => {
  it('preserva todas as procedências gravadas pelo banco', () => {
    for (const source of ['heuristic', 'lexical', 'platform_heuristic', 'llm', 'human', 'import']) {
      expect(normalizeDepartmentSource(source)).toBe(source);
    }
  });

  it('inclui platform_heuristic e lexical na lista canônica', () => {
    expect(DEPARTMENT_SOURCES).toContain('platform_heuristic');
    expect(DEPARTMENT_SOURCES).toContain('lexical');
  });

  it('rotula toda procedência em pt-BR, sem chave órfã', () => {
    for (const source of DEPARTMENT_SOURCES) {
      expect(DEPARTMENT_SOURCE_LABEL[source]).toMatch(/\S/);
    }
    expect(Object.keys(DEPARTMENT_SOURCE_LABEL).sort()).toEqual([...DEPARTMENT_SOURCES].sort());
  });

  it('degrada valores hostis para unknown sem lançar', () => {
    for (const hostile of [null, undefined, 42, {}, [], 'HEURISTIC ', 'plataforma']) {
      expect(DEPARTMENT_SOURCES).toContain(normalizeDepartmentSource(hostile));
    }
  });

  it('o tier de plataforma segue marcado para revisão (confiança baixa)', () => {
    const [row] = buildSkillDemandRows([skill('a', 'platform_heuristic', 0.15)], []);
    expect(row.departmentSource).toBe('platform_heuristic');
    expect(row.departmentNeedsReview).toBe(true);
  });
});

describe('filterBySource', () => {
  const rows = buildSkillDemandRows(
    [
      skill('a', 'platform_heuristic'),
      skill('b', 'platform_heuristic'),
      skill('c', 'heuristic'),
      skill('d', 'human', 1),
      skill('e', 'lixo-desconhecido'),
    ],
    [],
  );

  it('all devolve cópia com todas as linhas', () => {
    const out = filterBySource(rows, 'all');
    expect(out).toHaveLength(5);
    expect(out).not.toBe(rows);
  });

  it('isola exatamente o lote do tier de plataforma', () => {
    expect(
      filterBySource(rows, 'platform_heuristic')
        .map((r) => r.slug)
        .sort(),
    ).toEqual(['skill-a', 'skill-b']);
  });

  it('a união das partições reconstrói o total, sem sobreposição', () => {
    const soma = DEPARTMENT_SOURCES.reduce(
      (acc, source) => acc + filterBySource(rows, source).length,
      0,
    );
    expect(soma).toBe(rows.length);
  });

  it('countBySource devolve todas as chaves, inclusive zeradas', () => {
    const contagem = countBySource(rows);
    expect(Object.keys(contagem).sort()).toEqual([...DEPARTMENT_SOURCES].sort());
    expect(contagem.platform_heuristic).toBe(2);
    expect(contagem.unknown).toBe(1); // 'lixo-desconhecido' degradado
    expect(contagem.llm).toBe(0);
  });
});

describe('normalizeSourceFilter', () => {
  it('aceita as procedências canônicas e all', () => {
    expect(normalizeSourceFilter('all')).toBe('all');
    for (const s of DEPARTMENT_SOURCES) expect(normalizeSourceFilter(s)).toBe(s);
  });

  it('normaliza caixa e espaços', () => {
    expect(normalizeSourceFilter('  Platform_Heuristic ')).toBe('platform_heuristic');
  });

  it('degrada entrada hostil para all — nunca produz recorte vazio inexplicável', () => {
    for (const hostile of [null, undefined, 7, {}, [], 'sql injection', '']) {
      expect(normalizeSourceFilter(hostile)).toBe('all');
    }
  });
});

describe('persistência das preferências', () => {
  it('preferência antiga (sem o campo) abre em "todas as origens"', () => {
    const out = normalizeDemandPreferences(
      { tier: 'zero', department: 'all', search: '' },
      ALLOWED,
      PADRAO,
    );
    expect(out.source).toBe('all');
  });

  it('procedência corrompida no storage não recorta o painel', () => {
    expect(normalizeDemandPreferences({ source: 'lexicalll' }, ALLOWED, PADRAO).source).toBe('all');
    expect(normalizeDemandPreferences({ source: 99 }, ALLOWED, PADRAO).source).toBe('all');
  });

  it('round-trip é idempotente para toda procedência', () => {
    for (const source of DEPARTMENT_SOURCES) {
      const um = normalizeDemandPreferences({ source }, ALLOWED, PADRAO);
      const dois = normalizeDemandPreferences(um, ALLOWED, PADRAO);
      expect(dois).toEqual(um);
      expect(dois.source).toBe(source);
    }
  });
});

describe('CSV', () => {
  const rows = buildSkillDemandRows([skill('a', 'platform_heuristic', 0.15)], []);

  it('anexa procedência e confiança sem deslocar as colunas antigas', () => {
    const csv = demandRowsToCsv(rows);
    const [cabecalho, linha] = csv.replace('\uFEFF', '').split('\r\n');
    const colunas = cabecalho.split(',').map((c) => c.replace(/"/g, ''));
    expect(colunas.slice(0, 7)).toEqual([
      'slug',
      'nome',
      'departamento',
      'qualidade',
      'templates',
      'faixa',
      'origem',
    ]);
    expect(colunas.slice(7)).toEqual(['classificacao', 'confianca']);
    expect(linha).toContain('"Plataforma"');
    expect(linha).toContain('"0,15"'); // decimal pt-BR, aspeado
  });

  it('toda linha tem a mesma aridade do cabeçalho', () => {
    const muitas = buildSkillDemandRows(
      DEPARTMENT_SOURCES.map((s, i) => skill(String(i), s)),
      [],
    );
    const linhas = demandRowsToCsv(muitas).replace('\uFEFF', '').split('\r\n');
    const aridade = (l: string) => l.split('","').length;
    for (const l of linhas.slice(1)) expect(aridade(l)).toBe(aridade(linhas[0]));
  });
});

describe('simulação exaustiva de combinações', () => {
  it('nenhuma combinação de origem × dados hostis lança ou vaza linha fora do recorte', () => {
    const fontesHostis: unknown[] = [
      ...DEPARTMENT_SOURCES,
      null,
      undefined,
      '',
      'HEURISTIC',
      123,
      {},
    ];
    let cenarios = 0;
    for (const bruta of fontesHostis) {
      for (const filtro of ['all', ...DEPARTMENT_SOURCES] as const) {
        const rows = buildSkillDemandRows(
          [{ ...skill('x', 'heuristic'), department_source: bruta as string }],
          [],
        );
        const out = filterBySource(rows, normalizeSourceFilter(filtro));
        for (const row of out) {
          if (filtro !== 'all') expect(row.departmentSource).toBe(filtro);
          expect(DEPARTMENT_SOURCES).toContain(row.departmentSource as DepartmentSource);
        }
        cenarios += 1;
      }
    }
    expect(cenarios).toBe(fontesHostis.length * (DEPARTMENT_SOURCES.length + 1));
  });
});
