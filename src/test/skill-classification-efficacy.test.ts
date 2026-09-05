/**
 * Eficácia do classificador — a métrica que decide se afrouxamos ou apertamos
 * o limiar de revisão. Um bug aqui não quebra a tela: ele faz um humano tomar
 * a decisão errada sobre 800+ skills. Por isso os testes cobrem sobretudo a
 * fronteira entre "classificador errou" e "classificador acertou com medo".
 */
import { describe, it, expect } from 'vitest';
import {
  deriveVerdict,
  filterByVerdict,
  normalizeEfficacyFilter,
  parseClassificationDecisions,
  summarizeEfficacy,
  type AuditRowInput,
} from '@/lib/skills/classificationEfficacy';

function row(
  over: Partial<AuditRowInput> & { meta?: Record<string, unknown> } = {},
): AuditRowInput {
  const { meta, ...rest } = over;
  return {
    id: 'audit-1',
    action: 'skill_reclassification.approved',
    entity_id: 'skill-1',
    created_at: '2026-07-28T10:00:00Z',
    metadata: {
      review_id: 'rev-1',
      slug: 'skill-a',
      department_from: 'ti',
      department_to: 'dados',
      confidence: 0.6,
      margin: 0.2,
      source: 'lexico',
      previous_department_source: 'heuristic',
      previous_department_confidence: 0.12,
      registry_touched: true,
      ...(meta ?? {}),
    },
    ...rest,
  };
}

describe('deriveVerdict', () => {
  it('aprovar sobre departamento existente = erro do classificador', () => {
    expect(deriveVerdict({ approved: true, from: 'ti', registryTouched: true })).toBe('corrigido');
  });

  it('aprovar sobre vazio = preenchimento, não erro', () => {
    expect(deriveVerdict({ approved: true, from: null, registryTouched: true })).toBe('preenchido');
  });

  it('rejeitar com departamento vigente = confirmação do rótulo automático', () => {
    expect(deriveVerdict({ approved: false, from: 'ti', registryTouched: true })).toBe(
      'confirmado',
    );
  });

  it('rejeitar sem departamento não confirma nada', () => {
    expect(deriveVerdict({ approved: false, from: null, registryTouched: false })).toBe(
      'descartado',
    );
  });

  it('rejeição que não tocou o Registry não vira confirmação', () => {
    expect(deriveVerdict({ approved: false, from: 'ti', registryTouched: false })).toBe(
      'descartado',
    );
  });
});

describe('parseClassificationDecisions', () => {
  it('ignora ações que não são de reclassificação', () => {
    expect(parseClassificationDecisions([row({ action: 'skill.installed' })])).toHaveLength(0);
  });

  it('descarta linhas sem review_id — sem chave não há auditoria', () => {
    expect(parseClassificationDecisions([row({ meta: { review_id: '' } })])).toHaveLength(0);
    expect(
      parseClassificationDecisions([{ action: 'skill_reclassification.approved' }]),
    ).toHaveLength(0);
  });

  it('entradas hostis não lançam', () => {
    for (const v of [null, undefined, [], [null], [42], ['x']] as unknown[]) {
      expect(() => parseClassificationDecisions(v as AuditRowInput[])).not.toThrow();
    }
  });

  it('numeric como string (PostgREST) é convertido e clampado', () => {
    const [d] = parseClassificationDecisions([
      row({ meta: { confidence: '0.42', previous_department_confidence: '5' } }),
    ]);
    expect(d.confidence).toBeCloseTo(0.42);
    expect(d.previousConfidence).toBe(1);
  });

  it('departamento fora da taxonomia degrada para null em vez de propagar lixo', () => {
    const [d] = parseClassificationDecisions([
      row({ meta: { department_from: 'departamento-x', department_to: null } }),
    ]);
    expect(d.from).toBeNull();
    expect(d.to).toBeNull();
    expect(d.verdict).toBe('preenchido');
  });

  it('procedência anterior inválida vira unknown', () => {
    const [d] = parseClassificationDecisions([
      row({ meta: { previous_department_source: 'chute' } }),
    ]);
    expect(d.previousSource).toBe('unknown');
  });

  it('deduplica por review_id mantendo a decisão mais recente', () => {
    const out = parseClassificationDecisions([
      row({ id: 'a', created_at: '2026-07-01T00:00:00Z', meta: { confidence: 0.1 } }),
      row({ id: 'b', created_at: '2026-07-20T00:00:00Z', meta: { confidence: 0.9 } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBeCloseTo(0.9);
  });

  it('ordena do mais recente para o mais antigo, com data inválida por último', () => {
    const out = parseClassificationDecisions([
      row({ id: 'a', created_at: 'data-quebrada', meta: { review_id: 'r1' } }),
      row({ id: 'b', created_at: '2026-07-20T00:00:00Z', meta: { review_id: 'r2' } }),
      row({ id: 'c', created_at: '2026-07-25T00:00:00Z', meta: { review_id: 'r3' } }),
    ]);
    expect(out.map((d) => d.reviewId)).toEqual(['r3', 'r2', 'r1']);
    expect(out[2].decidedAtMs).toBeNull();
  });

  it('registry_touched ausente é inferido pelo par (aprovado, from)', () => {
    const [aprovado] = parseClassificationDecisions([
      row({ meta: { registry_touched: undefined } }),
    ]);
    expect(aprovado.registryTouched).toBe(true);
    const [rejeitado] = parseClassificationDecisions([
      row({
        action: 'skill_reclassification.rejected',
        meta: { registry_touched: undefined, department_from: null },
      }),
    ]);
    expect(rejeitado.registryTouched).toBe(false);
  });
});

describe('summarizeEfficacy', () => {
  function decisoes() {
    return parseClassificationDecisions([
      row({ id: '1', meta: { review_id: 'r1', previous_department_confidence: 0.1 } }), // corrigido
      row({ id: '2', meta: { review_id: 'r2', department_from: null } }), // preenchido
      row({
        id: '3',
        action: 'skill_reclassification.rejected',
        meta: { review_id: 'r3', previous_department_confidence: 0.3 },
      }), // confirmado
      row({
        id: '4',
        action: 'skill_reclassification.rejected',
        meta: { review_id: 'r4', previous_department_confidence: 0.4 },
      }), // confirmado
    ]);
  }

  it('conta cada veredito exatamente uma vez', () => {
    const s = summarizeEfficacy(decisoes());
    expect(s.total).toBe(4);
    expect(s.byVerdict).toEqual({ corrigido: 1, preenchido: 1, confirmado: 2, descartado: 0 });
  });

  it('acerto ignora preenchimentos — não havia rótulo para julgar', () => {
    expect(summarizeEfficacy(decisoes()).accuracy).toBeCloseTo(2 / 3, 3);
  });

  it('sem denominador o acerto é null, nunca 0', () => {
    const s = summarizeEfficacy([]);
    expect(s.accuracy).toBeNull();
    expect(s.avgConfidenceWhenRight).toBeNull();
    expect(s.suggestedThreshold).toBeNull();
  });

  it('médias separam a confiança de quando acertou e de quando errou', () => {
    const s = summarizeEfficacy(decisoes());
    expect(s.avgConfidenceWhenRight).toBeCloseTo(0.35, 3);
    expect(s.avgConfidenceWhenWrong).toBeCloseTo(0.1, 3);
  });

  it('sugestão de limiar exige amostra mínima de confirmações', () => {
    expect(summarizeEfficacy(decisoes()).suggestedThreshold).toBeNull();
    const muitas = parseClassificationDecisions(
      [0.3, 0.32, 0.34].map((c, i) =>
        row({
          id: `x${i}`,
          action: 'skill_reclassification.rejected',
          meta: { review_id: `rx${i}`, previous_department_confidence: c },
        }),
      ),
    );
    expect(summarizeEfficacy(muitas).suggestedThreshold).toBeCloseTo(0.32, 2);
  });

  it('agrega aprovação por origem da proposta', () => {
    const s = summarizeEfficacy(
      parseClassificationDecisions([
        row({ id: '1', meta: { review_id: 'r1', source: 'ia' } }),
        row({
          id: '2',
          action: 'skill_reclassification.rejected',
          meta: { review_id: 'r2', source: 'ia' },
        }),
        row({ id: '3', meta: { review_id: 'r3', source: 'lexico' } }),
      ]),
    );
    expect(s.byOrigin.ia).toEqual({ total: 2, approved: 1 });
    expect(s.byOrigin.lexico).toEqual({ total: 1, approved: 1 });
  });

  it('origem desconhecida degrada para léxico em vez de sumir da contagem', () => {
    const s = summarizeEfficacy(
      parseClassificationDecisions([row({ meta: { source: 'oráculo' } })]),
    );
    expect(s.byOrigin.lexico.total).toBe(1);
  });
});

describe('filterByVerdict / normalizeEfficacyFilter', () => {
  const base = parseClassificationDecisions([
    row({ id: '1', meta: { review_id: 'r1' } }),
    row({ id: '2', action: 'skill_reclassification.rejected', meta: { review_id: 'r2' } }),
  ]);

  it('all devolve cópia, não a referência', () => {
    const out = filterByVerdict(base, 'all');
    expect(out).toHaveLength(2);
    expect(out).not.toBe(base);
  });

  it('recorta por veredito', () => {
    expect(filterByVerdict(base, 'confirmado').map((d) => d.reviewId)).toEqual(['r2']);
  });

  it('valores corrompidos de storage degradam para all', () => {
    for (const v of ['', 'CORRIGIDO ', null, 1, {}, []]) {
      const f = normalizeEfficacyFilter(v);
      expect(['all', 'corrigido']).toContain(f);
    }
    expect(normalizeEfficacyFilter('lixo')).toBe('all');
    expect(normalizeEfficacyFilter('corrigido')).toBe('corrigido');
  });
});
