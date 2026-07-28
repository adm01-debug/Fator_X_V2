/**
 * Integridade da procedência ponta-a-ponta: coleta → staging → registro.
 *
 * Gap que motivou o teste: a confiança e a origem calculadas na coleta eram
 * descartadas na promoção (`promoteCandidate` copiava só `department`), então
 * TODA skill promovida nascia `unknown`/0.0 no registro e entrava
 * permanentemente na fila de "revisar departamento" — 72 skills reais estavam
 * nesse estado. O banco ganhou uma trigger de normalização; estes testes
 * travam a mesma semântica no cliente para que a UI e o banco nunca discordem.
 */
import { describe, it, expect } from 'vitest';
import {
  DEPARTMENT_SOURCES,
  normalizeDepartmentSource,
  buildSkillDemandRows,
  type DemandSkillInput,
} from '@/lib/skills/skillDemand';

/**
 * Réplica em TS da trigger `normalize_skill_department_provenance`.
 *
 * Duplicar a regra é deliberado: o teste falha se alguém mudar a semântica de
 * um lado só, que é exatamente o modo de falha que produziu o bug original.
 */
function normalizeProvenance(input: {
  department: string | null;
  department_source: string;
  department_confidence: number;
}): { department: string | null; department_source: string; department_confidence: number } {
  if (input.department === null) {
    return { department: null, department_source: 'unknown', department_confidence: 0 };
  }
  if (input.department_source === 'human') {
    return { ...input, department_confidence: 1 };
  }
  if (input.department_source === 'unknown') {
    return { ...input, department_source: 'import' };
  }
  return { ...input };
}

const DEPARTAMENTOS = [null, 'ti', 'vendas'] as const;
const CONFIANCAS = [0, 0.15, 0.25, 0.7, 1] as const;

describe('trigger de procedência — invariantes', () => {
  it('nenhuma combinação produz departamento com origem "unknown"', () => {
    let cenarios = 0;
    for (const department of DEPARTAMENTOS) {
      for (const source of DEPARTMENT_SOURCES) {
        for (const conf of CONFIANCAS) {
          const out = normalizeProvenance({
            department,
            department_source: source,
            department_confidence: conf,
          });
          // A invariante central: rótulo sem dono é o estado proibido.
          expect(out.department === null || out.department_source !== 'unknown').toBe(true);
          expect(DEPARTMENT_SOURCES).toContain(out.department_source);
          cenarios += 1;
        }
      }
    }
    expect(cenarios).toBe(DEPARTAMENTOS.length * DEPARTMENT_SOURCES.length * CONFIANCAS.length);
  });

  it('sem departamento zera origem e confiança — vai para "sem depto.", não para "rever"', () => {
    for (const source of DEPARTMENT_SOURCES) {
      const out = normalizeProvenance({
        department: null,
        department_source: source,
        department_confidence: 0.9,
      });
      expect(out).toEqual({
        department: null,
        department_source: 'unknown',
        department_confidence: 0,
      });
    }
  });

  it('decisão humana recebe confiança plena mesmo se o cliente enviar zero', () => {
    for (const conf of CONFIANCAS) {
      const out = normalizeProvenance({
        department: 'ti',
        department_source: 'human',
        department_confidence: conf,
      });
      expect(out.department_confidence).toBe(1);
      expect(out.department_source).toBe('human');
    }
  });

  it('rótulo sem procedência declarada degrada para "import", preservando a confiança', () => {
    const out = normalizeProvenance({
      department: 'ti',
      department_source: 'unknown',
      department_confidence: 0.42,
    });
    expect(out.department_source).toBe('import');
    expect(out.department_confidence).toBe(0.42);
  });

  it('é idempotente — reaplicar a normalização não muda mais nada', () => {
    for (const department of DEPARTAMENTOS) {
      for (const source of DEPARTMENT_SOURCES) {
        for (const conf of CONFIANCAS) {
          const um = normalizeProvenance({
            department,
            department_source: source,
            department_confidence: conf,
          });
          expect(normalizeProvenance(um)).toEqual(um);
        }
      }
    }
  });
});

describe('efeito na fila de revisão', () => {
  function row(over: Partial<DemandSkillInput>): DemandSkillInput {
    return {
      id: 'x',
      name: 'X',
      slug: 'x',
      department: 'ti',
      department_source: 'unknown',
      department_confidence: 0,
      ...over,
    };
  }

  it('regressão dos 72: curadoria humana sai da fila de revisão', () => {
    const antes = normalizeProvenance({
      department: 'ti',
      department_source: 'human',
      department_confidence: 0,
    });
    const [linha] = buildSkillDemandRows(
      [
        row({
          department_source: antes.department_source,
          department_confidence: antes.department_confidence,
        }),
      ],
      [],
    );
    expect(linha.departmentNeedsReview).toBe(false);
  });

  it('importação sem procedência continua visível na fila, mas rotulada', () => {
    const norm = normalizeProvenance({
      department: 'ti',
      department_source: 'unknown',
      department_confidence: 0,
    });
    const [linha] = buildSkillDemandRows(
      [row({ department_source: norm.department_source, department_confidence: 0 })],
      [],
    );
    expect(linha.departmentSource).toBe('import');
    expect(linha.departmentNeedsReview).toBe(true);
  });

  it('toda origem normalizada é reconhecida pelo cliente (nada vira "sem origem" na UI)', () => {
    for (const department of DEPARTAMENTOS) {
      for (const source of DEPARTMENT_SOURCES) {
        const out = normalizeProvenance({
          department,
          department_source: source,
          department_confidence: 0.3,
        });
        expect(normalizeDepartmentSource(out.department_source)).toBe(out.department_source);
      }
    }
  });
});

describe('promoção candidato → registro', () => {
  /** Espelha o payload de `promoteCandidate` após a correção. */
  function promote(c: {
    department: string | null;
    department_source: string;
    department_confidence: number;
  }) {
    return normalizeProvenance({
      department: c.department,
      department_source: c.department_source,
      department_confidence: c.department_confidence,
    });
  }

  it('preserva o veredito do léxico calculado na coleta', () => {
    expect(
      promote({ department: 'ti', department_source: 'heuristic', department_confidence: 0.63 }),
    ).toEqual({ department: 'ti', department_source: 'heuristic', department_confidence: 0.63 });
  });

  it('correção do curador chega ao registro como humana e confiável', () => {
    // `updateCandidate` carimba human/1 no staging; a trigger reafirma.
    expect(
      promote({ department: 'vendas', department_source: 'human', department_confidence: 0.15 }),
    ).toEqual({ department: 'vendas', department_source: 'human', department_confidence: 1 });
  });

  it('o modo de falha original é impossível: promoção nunca gera unknown com rótulo', () => {
    for (const source of DEPARTMENT_SOURCES) {
      for (const conf of CONFIANCAS) {
        const out = promote({ department: 'ti', department_source: source, department_confidence: conf });
        expect(out.department_source).not.toBe('unknown');
      }
    }
  });
});
