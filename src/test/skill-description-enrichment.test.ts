/**
 * Invariantes do enriquecimento de descrições.
 *
 * Simulação determinística: em vez de testar exemplos escolhidos a dedo,
 * geramos centenas de combinações (procedência × descrição × sinal × confiança)
 * e afirmamos propriedades que precisam valer para TODAS elas. É onde os gaps
 * aparecem — o caso feliz nunca foi o problema.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_DESCRIPTION_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  MIN_ENRICH_CONFIDENCE,
  MIN_SUGGEST_CONFIDENCE,
  autoApplicable,
  eligibilityReason,
  fold,
  hasEnoughSignal,
  isDescriptionEmpty,
  isDescriptionSource,
  isEcho,
  isEligible,
  needsReview,
  proposalFromVerdict,
  proposalsToCsv,
  selectEligible,
  type DescriptionSource,
  type DescriptionVerdict,
  type EnrichCandidate,
} from '@/lib/skills/descriptionEnrichment';

function candidate(over: Partial<EnrichCandidate> = {}): EnrichCandidate {
  return {
    skillId: 'id-1',
    name: 'PDF Extract',
    slug: 'pdf-extract',
    description: '',
    category: 'tools',
    department: 'engenharia',
    tags: ['pdf', 'ocr'],
    sourceRepo: 'org/repo',
    sourceUrl: 'https://github.com/org/repo',
    descriptionSource: null,
    ...over,
  };
}

function verdict(over: Partial<DescriptionVerdict> = {}): DescriptionVerdict {
  return {
    skill_id: 'id-1',
    description:
      'Extrai tabelas estruturadas e blocos de texto corrido a partir de arquivos PDF digitalizados.',
    confidence: 0.9,
    model: 'gemini-flash',
    sufficient: true,
    rationale: 'README descreve o pipeline de extração.',
    ...over,
  };
}

describe('fold', () => {
  it('remove acentos, pontuação e caixa', () => {
    expect(fold('  Descrição, PADRÃO! ')).toBe('descricao padrao');
  });

  it('é idempotente para qualquer entrada gerada', () => {
    const amostras = ['ação', 'A-B_C', '   ', '...', 'ÉÀÇõ 123'];
    for (const s of amostras) expect(fold(fold(s))).toBe(fold(s));
  });
});

describe('isDescriptionEmpty', () => {
  it.each(['', '   ', 'TODO', 'tbd', 'N/A', 'Sem Descrição', '...', '--'])(
    'trata %j como vazia',
    (valor) => {
      expect(isDescriptionEmpty(valor)).toBe(true);
    },
  );

  it.each([null, undefined])('trata %j como vazia', (valor) => {
    expect(isDescriptionEmpty(valor)).toBe(true);
  });

  it('não confunde texto real com placeholder', () => {
    expect(isDescriptionEmpty('Converte documentos em texto estruturado.')).toBe(false);
    // "todo" como parte de uma frase real não é marcador.
    expect(isDescriptionEmpty('Processa todo o acervo documental da empresa.')).toBe(false);
  });
});

describe('eligibilityReason — matriz exaustiva', () => {
  const procedencias: Array<DescriptionSource | null> = ['humano', 'repositorio', 'ia', null];
  const descricoes = ['', 'TODO', 'Descrição curada por um humano de verdade.'];
  const origens: Array<Pick<EnrichCandidate, 'sourceRepo' | 'sourceUrl'>> = [
    { sourceRepo: 'org/repo', sourceUrl: null },
    { sourceRepo: null, sourceUrl: 'https://x.dev/s' },
    { sourceRepo: null, sourceUrl: null },
  ];

  it('cobre toda a matriz sem lançar e com motivo estável', () => {
    let elegiveis = 0;
    for (const descriptionSource of procedencias) {
      for (const description of descricoes) {
        for (const origem of origens) {
          const c = candidate({ descriptionSource, description, ...origem });
          const motivo = eligibilityReason(c);
          // Determinismo: mesma entrada, mesmo veredito.
          expect(eligibilityReason(c)).toBe(motivo);
          expect(isEligible(c)).toBe(motivo === null);

          if (!origem.sourceRepo && !origem.sourceUrl) {
            expect(motivo).toBe('nao_importada');
          } else if (descriptionSource === 'humano') {
            expect(motivo).toBe('descricao_humana');
          } else if (!isDescriptionEmpty(description)) {
            expect(motivo).toBe('ja_descrita');
          } else {
            expect(motivo).toBeNull();
            elegiveis += 1;
          }
        }
      }
    }
    expect(elegiveis).toBeGreaterThan(0);
  });

  it('nunca considera elegível uma skill com descrição de origem humana', () => {
    for (const description of ['', 'TODO', 'texto curado']) {
      expect(isEligible(candidate({ descriptionSource: 'humano', description }))).toBe(false);
    }
  });

  it('selectEligible é um subconjunto estável e preserva a ordem', () => {
    const lista = [
      candidate({ skillId: 'a' }),
      candidate({ skillId: 'b', sourceRepo: null, sourceUrl: null }),
      candidate({ skillId: 'c' }),
    ];
    expect(selectEligible(lista).map((c) => c.skillId)).toEqual(['a', 'c']);
  });
});

describe('hasEnoughSignal', () => {
  it('exige tag ou repositório com conteúdo', () => {
    expect(hasEnoughSignal(candidate({ tags: [], sourceRepo: null }))).toBe(false);
    expect(hasEnoughSignal(candidate({ tags: ['  ', ''], sourceRepo: '   ' }))).toBe(false);
    expect(hasEnoughSignal(candidate({ tags: ['ocr'], sourceRepo: null }))).toBe(true);
    expect(hasEnoughSignal(candidate({ tags: [], sourceRepo: 'org/repo' }))).toBe(true);
  });
});

describe('isEcho', () => {
  it('rejeita paráfrase do nome/slug', () => {
    expect(isEcho('Skill para pdf extract.', 'PDF Extract', 'pdf-extract')).toBe(true);
    expect(isEcho('Uma ferramenta de PDF Extract usada pelo agente.', 'PDF Extract', 'pdf-extract')).toBe(
      true,
    );
  });

  it('aceita texto com informação nova suficiente', () => {
    expect(
      isEcho(
        'Converte relatórios digitalizados em tabelas estruturadas usando reconhecimento óptico.',
        'PDF Extract',
        'pdf-extract',
      ),
    ).toBe(false);
  });

  it('não trava quando nome e slug são degenerados', () => {
    expect(isEcho('qualquer coisa', '', '')).toBe(false);
    expect(isEcho('qualquer coisa', 'ab', 'a')).toBe(false);
  });
});

describe('proposalFromVerdict', () => {
  it('recusa veredito insuficiente antes de qualquer outra checagem', () => {
    const r = proposalFromVerdict(candidate(), verdict({ sufficient: false, description: '' }));
    expect(r.proposal).toBeNull();
    expect(r.rejection?.reason).toBe('insuficiente');
  });

  it.each([
    ['vazia', '   '],
    ['curta', 'x'.repeat(MIN_DESCRIPTION_LENGTH - 1)],
    ['longa', 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1)],
  ])('recusa com motivo %s', (motivo, texto) => {
    const r = proposalFromVerdict(candidate(), verdict({ description: texto }));
    expect(r.proposal).toBeNull();
    expect(r.rejection?.reason).toBe(motivo);
  });

  it('recusa eco mesmo com confiança máxima', () => {
    const r = proposalFromVerdict(
      candidate(),
      verdict({ description: `Skill para pdf extract ${'.'.repeat(60)}`, confidence: 1 }),
    );
    expect(r.rejection?.reason).toBe('eco');
  });

  it('recusa abaixo do piso de sugestão', () => {
    const r = proposalFromVerdict(candidate(), verdict({ confidence: MIN_SUGGEST_CONFIDENCE - 0.01 }));
    expect(r.rejection?.reason).toBe('confianca_baixa');
  });

  it('satura confiança fora de faixa e nunca produz NaN', () => {
    for (const conf of [Number.NaN, Infinity, -Infinity, -5, 42]) {
      const r = proposalFromVerdict(candidate(), verdict({ confidence: conf }));
      const valor = r.proposal?.confidence ?? r.rejection?.confidence ?? -1;
      expect(Number.isFinite(valor)).toBe(true);
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThanOrEqual(1);
    }
  });

  it('marca autoApply exatamente na fronteira do piso', () => {
    const abaixo = proposalFromVerdict(
      candidate(),
      verdict({ confidence: MIN_ENRICH_CONFIDENCE - 0.001 }),
    ).proposal;
    const naBorda = proposalFromVerdict(candidate(), verdict({ confidence: MIN_ENRICH_CONFIDENCE }))
      .proposal;
    expect(abaixo?.autoApply ?? false).toBe(false);
    expect(naBorda?.autoApply).toBe(true);
  });

  it('retorna sempre exatamente um dos dois lados do par', () => {
    const cenarios: DescriptionVerdict[] = [
      verdict(),
      verdict({ sufficient: false }),
      verdict({ description: '' }),
      verdict({ confidence: 0 }),
      verdict({ description: 'Skill para pdf extract, pdf extract, pdf extract, pdf extract.' }),
    ];
    for (const v of cenarios) {
      const r = proposalFromVerdict(candidate(), v);
      expect(Boolean(r.proposal) !== Boolean(r.rejection)).toBe(true);
    }
  });

  it('usa o skillId como slug quando o slug está vazio', () => {
    const r = proposalFromVerdict(candidate({ slug: '', skillId: 'uuid-x' }), verdict());
    expect(r.proposal?.slug).toBe('uuid-x');
  });
});

describe('particionamento autoApplicable / needsReview', () => {
  const propostas = [0.4, 0.6, 0.75, 0.8, 0.99].map(
    (c) => proposalFromVerdict(candidate(), verdict({ confidence: c })).proposal!,
  );

  it('particiona sem sobreposição e sem perda', () => {
    const auto = autoApplicable(propostas);
    const revisar = needsReview(propostas);
    expect(auto.length + revisar.length).toBe(propostas.length);
    const ids = new Set([...auto, ...revisar].map((p) => p.confidence));
    expect(ids.size).toBe(propostas.length);
    expect(auto.every((p) => p.confidence >= MIN_ENRICH_CONFIDENCE)).toBe(true);
    expect(revisar.every((p) => p.confidence < MIN_ENRICH_CONFIDENCE)).toBe(true);
  });
});

describe('proposalsToCsv', () => {
  it('escapa aspas e mantém uma linha por proposta', () => {
    const p = proposalFromVerdict(
      candidate({ name: 'Skill "Alfa"' }),
      verdict({
        description: 'Descrição com "aspas" e vírgulas, várias delas, para testar o escape correto.',
      }),
    ).proposal!;
    const csv = proposalsToCsv([p]);
    const linhas = csv.split('\n');
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toBe('slug,nome,confianca,auto_aplicavel,modelo,descricao');
    expect(csv).toContain('""aspas""');
    expect(csv).toContain('""Alfa""');
  });

  it('cabeçalho sozinho quando não há propostas', () => {
    expect(proposalsToCsv([]).split('\n')).toHaveLength(1);
  });
});

describe('isDescriptionSource', () => {
  it('aceita só os três valores do CHECK do banco', () => {
    for (const v of ['humano', 'repositorio', 'ia']) expect(isDescriptionSource(v)).toBe(true);
    for (const v of ['', 'llm', null, undefined, 1, {}]) expect(isDescriptionSource(v)).toBe(false);
  });
});
