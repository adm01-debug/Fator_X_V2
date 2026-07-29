/**
 * Segmentação por régua de confiança no motor de eficácia.
 *
 * Defeito que esta suíte impede de voltar: `summarizeEfficacy` calculava UMA
 * média de confiança sobre decisões de duas escalas incompatíveis. O tier de
 * plataforma tem teto estrutural de `PLATFORM_TIER_MAX_CONFIDENCE` (0,40) por
 * construção — ele nunca afirma pertencimento a departamento com autoridade de
 * léxico de domínio. Misturá-lo com decisões de domínio (que vão a 0,95)
 * produzia uma "sugestão de limiar" que afundava proporcionalmente à
 * quantidade de itens de plataforma na amostra.
 *
 * Simulação que motivou a correção: em 300 amostras aleatórias mistas, 281 das
 * 284 com sugestão emitida vinham deprimidas, com desvio máximo de 0,452 em
 * relação à média real de domínio. Aplicar aquele botão teria derrubado o
 * limiar de revisão de domínio para perto do teto de plataforma — despejando
 * na fila justamente os palpites que o limiar existia para reter.
 *
 * Os testes abaixo são invariantes, não exemplos: se alguém "simplificar"
 * voltando a uma média única, todos caem.
 */
import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_SCALES,
  MIN_SUGGESTION_SAMPLE,
  SCALE_CEILING,
  SCALE_FLOOR,
  parseClassificationDecisions,
  scaleOf,
  summarizeEfficacy,
  type ClassificationDecision,
  type ConfidenceScale,
  type EfficacyVerdict,
} from '@/lib/skills/classificationEfficacy';
import { PLATFORM_TIER_MAX_CONFIDENCE } from '@/services/skillDepartmentClassifier';
import { PLATFORM_REVIEW_THRESHOLD, reviewThresholdFor } from '@/lib/skills/skillDemand';

/** PRNG determinístico — a suíte não pode variar entre execuções. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

let contador = 0;
function decisao(over: Partial<ClassificationDecision> = {}): ClassificationDecision {
  contador += 1;
  const previousSource = over.previousSource ?? 'heuristic';
  return {
    auditId: `a${contador}`,
    reviewId: `r${contador}`,
    skillId: `s${contador}`,
    slug: `slug-${contador}`,
    approved: false,
    from: 'ti',
    to: 'dados',
    confidence: 0.5,
    margin: 0.1,
    origin: 'lexico',
    previousSource,
    previousConfidence: 0.5,
    registryTouched: true,
    scale: scaleOf(previousSource),
    verdict: 'confirmado',
    decidedAt: new Date(1_700_000_000_000 + contador * 1000).toISOString(),
    decidedAtMs: 1_700_000_000_000 + contador * 1000,
    reason: '',
    ...over,
  };
}

function confirmada(scale: ConfidenceScale, conf: number): ClassificationDecision {
  return decisao({
    previousSource: scale === 'plataforma' ? 'platform_heuristic' : 'heuristic',
    previousConfidence: conf,
    verdict: 'confirmado',
    approved: false,
  });
}

function corrigida(scale: ConfidenceScale, conf: number): ClassificationDecision {
  return decisao({
    previousSource: scale === 'plataforma' ? 'platform_heuristic' : 'heuristic',
    previousConfidence: conf,
    verdict: 'corrigido',
    approved: true,
  });
}

describe('escalas de confiança — mapeamento de procedência', () => {
  it('apenas platform_heuristic cai na régua de plataforma', () => {
    expect(scaleOf('platform_heuristic')).toBe('plataforma');
    for (const s of ['unknown', 'heuristic', 'llm', 'human', 'import'] as const) {
      expect(scaleOf(s), `${s} não deveria ser plataforma`).toBe('dominio');
    }
  });

  it('a régua concorda com o limiar de revisão aplicado na fila', () => {
    // Se as duas fontes divergirem, o painel recomenda um limiar que a fila
    // não usa — a métrica passa a descrever um sistema que não existe.
    expect(reviewThresholdFor('platform_heuristic')).toBe(PLATFORM_REVIEW_THRESHOLD);
    expect(SCALE_CEILING.plataforma).toBe(PLATFORM_TIER_MAX_CONFIDENCE);
    expect(PLATFORM_REVIEW_THRESHOLD).toBeLessThan(SCALE_CEILING.plataforma);
  });

  it('o parser deriva a régua da procedência registrada na auditoria', () => {
    const linhas = [
      {
        id: 'x1',
        action: 'skill_reclassification.rejected',
        entity_id: 'sk1',
        created_at: '2026-07-01T00:00:00Z',
        metadata: {
          review_id: 'rv1',
          department_from: 'ti',
          previous_department_source: 'platform_heuristic',
          previous_department_confidence: '0.24',
        },
      },
      {
        id: 'x2',
        action: 'skill_reclassification.rejected',
        entity_id: 'sk2',
        created_at: '2026-07-02T00:00:00Z',
        metadata: {
          review_id: 'rv2',
          department_from: 'dados',
          previous_department_source: 'heuristic',
          previous_department_confidence: '0.61',
        },
      },
    ];
    const [maisNova, maisVelha] = parseClassificationDecisions(linhas);
    expect(maisNova.scale).toBe('dominio');
    expect(maisNova.previousSource).toBe('heuristic');
    expect(maisVelha.scale).toBe('plataforma');
    expect(maisVelha.previousSource).toBe('platform_heuristic');
  });

  it('procedência desconhecida degrada para domínio, nunca quebra', () => {
    const [d] = parseClassificationDecisions([
      {
        id: 'x',
        action: 'skill_reclassification.approved',
        entity_id: 'sk',
        created_at: '2026-07-01T00:00:00Z',
        metadata: { review_id: 'rv', previous_department_source: 'oráculo-místico' },
      },
    ]);
    expect(d.previousSource).toBe('unknown');
    expect(d.scale).toBe('dominio');
  });
});

describe('sugestão de limiar — isolamento entre réguas', () => {
  it('plataforma não desloca a sugestão de domínio (invariante central)', () => {
    const rng = makeRng(20260729);
    let avaliados = 0;

    for (let caso = 0; caso < 300; caso++) {
      const nDom = MIN_SUGGESTION_SAMPLE + Math.floor(rng() * 20);
      const nPlat = Math.floor(rng() * 25);

      const confDominio: number[] = [];
      const ds: ClassificationDecision[] = [];
      for (let i = 0; i < nDom; i++) {
        const c = 0.5 + rng() * 0.45;
        confDominio.push(c);
        ds.push(confirmada('dominio', c));
      }
      for (let i = 0; i < nPlat; i++) {
        ds.push(confirmada('plataforma', 0.15 + rng() * 0.25));
      }

      const resumo = summarizeEfficacy(ds);
      const esperado =
        Math.round(
          Math.min(
            SCALE_CEILING.dominio,
            Math.max(
              SCALE_FLOOR.dominio,
              Math.round((confDominio.reduce((a, b) => a + b, 0) / nDom) * 1000) / 1000,
            ),
          ) * 100,
        ) / 100;

      expect(
        resumo.suggestedThreshold,
        `caso ${caso}: ${nPlat} itens de plataforma contaminaram a sugestão de domínio`,
      ).toBeCloseTo(esperado, 2);
      avaliados++;
    }

    expect(avaliados).toBe(300);
  });

  it('a sugestão do topo do resumo é sempre a da régua de domínio', () => {
    const rng = makeRng(11);
    for (let i = 0; i < 120; i++) {
      const ds: ClassificationDecision[] = [];
      const n = Math.floor(rng() * 12);
      for (let k = 0; k < n; k++) {
        const escala: ConfidenceScale = rng() < 0.5 ? 'dominio' : 'plataforma';
        const teto = SCALE_CEILING[escala];
        ds.push(confirmada(escala, rng() * teto));
      }
      const r = summarizeEfficacy(ds);
      expect(r.suggestedThreshold).toBe(r.byScale.dominio.suggestedThreshold);
    }
  });

  it('nenhuma sugestão ultrapassa o teto da própria régua', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 200; i++) {
      const ds: ClassificationDecision[] = [];
      for (const escala of CONFIDENCE_SCALES) {
        const n = MIN_SUGGESTION_SAMPLE + Math.floor(rng() * 10);
        // Injeta confiança acima do teto de propósito: dado corrompido no
        // banco não pode virar política impossível de satisfazer.
        for (let k = 0; k < n; k++) ds.push(confirmada(escala, 0.5 + rng() * 0.5));
      }
      const r = summarizeEfficacy(ds);
      for (const escala of CONFIDENCE_SCALES) {
        const s = r.byScale[escala].suggestedThreshold;
        expect(s).not.toBeNull();
        expect(s!, `${escala} sugeriu acima do teto`).toBeLessThanOrEqual(SCALE_CEILING[escala]);
        expect(s!, `${escala} sugeriu abaixo do piso`).toBeGreaterThanOrEqual(SCALE_FLOOR[escala]);
      }
    }
  });

  it('sugestão de plataforma permanece alcançável pelo próprio tier', () => {
    // Regressão do bug original: um limiar de plataforma acima de 0,40 tornaria
    // a fila permanentemente inescapável para aquele tier.
    const ds = Array.from({ length: 8 }, () => confirmada('plataforma', 0.38));
    const s = summarizeEfficacy(ds).byScale.plataforma.suggestedThreshold;
    expect(s).not.toBeNull();
    expect(s!).toBeLessThanOrEqual(PLATFORM_TIER_MAX_CONFIDENCE);
  });

  it('amostra abaixo do mínimo não vira recomendação', () => {
    for (let n = 0; n < MIN_SUGGESTION_SAMPLE; n++) {
      const ds = Array.from({ length: n }, () => confirmada('dominio', 0.7));
      const r = summarizeEfficacy(ds);
      expect(r.byScale.dominio.suggestedThreshold, `n=${n}`).toBeNull();
      expect(r.suggestedThreshold, `n=${n}`).toBeNull();
    }
    const ok = summarizeEfficacy(
      Array.from({ length: MIN_SUGGESTION_SAMPLE }, () => confirmada('dominio', 0.7)),
    );
    expect(ok.suggestedThreshold).toBeCloseTo(0.7, 2);
  });

  it('amostra só de plataforma não gera sugestão de domínio', () => {
    const ds = Array.from({ length: 30 }, () => confirmada('plataforma', 0.3));
    const r = summarizeEfficacy(ds);
    expect(r.suggestedThreshold).toBeNull();
    expect(r.byScale.plataforma.suggestedThreshold).toBeCloseTo(0.3, 2);
  });
});

describe('acurácia por régua', () => {
  it('cada régua calcula seu próprio denominador', () => {
    const ds = [
      ...Array.from({ length: 6 }, () => confirmada('dominio', 0.7)),
      ...Array.from({ length: 2 }, () => corrigida('dominio', 0.4)),
      ...Array.from({ length: 1 }, () => confirmada('plataforma', 0.2)),
      ...Array.from({ length: 3 }, () => corrigida('plataforma', 0.16)),
    ];
    const r = summarizeEfficacy(ds);
    expect(r.byScale.dominio.accuracy).toBeCloseTo(6 / 8, 3);
    expect(r.byScale.plataforma.accuracy).toBeCloseTo(1 / 4, 3);
    // O agregado continua existindo como panorama, mas não governa política.
    expect(r.accuracy).toBeCloseTo(7 / 12, 3);
  });

  it('régua sem denominador reporta null, nunca zero', () => {
    const r = summarizeEfficacy(Array.from({ length: 4 }, () => confirmada('dominio', 0.8)));
    expect(r.byScale.plataforma.accuracy).toBeNull();
    expect(r.byScale.plataforma.avgConfidenceWhenRight).toBeNull();
    expect(r.byScale.plataforma.total).toBe(0);
  });

  it('vereditos sem rótulo anterior não entram em nenhum denominador', () => {
    const ds = [
      decisao({ verdict: 'preenchido', approved: true, from: null }),
      decisao({ verdict: 'descartado', approved: false, from: null, registryTouched: false }),
    ];
    const r = summarizeEfficacy(ds);
    expect(r.accuracy).toBeNull();
    expect(r.byScale.dominio.accuracy).toBeNull();
    expect(r.byScale.dominio.total).toBe(2);
  });

  it('a soma dos totais por régua fecha com o total geral', () => {
    const rng = makeRng(5150);
    const vereditos: EfficacyVerdict[] = ['confirmado', 'corrigido', 'preenchido', 'descartado'];
    for (let i = 0; i < 150; i++) {
      const n = Math.floor(rng() * 40);
      const ds = Array.from({ length: n }, () => {
        const escala: ConfidenceScale = rng() < 0.4 ? 'plataforma' : 'dominio';
        const v = vereditos[Math.floor(rng() * vereditos.length)];
        return decisao({
          previousSource: escala === 'plataforma' ? 'platform_heuristic' : 'heuristic',
          previousConfidence: rng() * SCALE_CEILING[escala],
          verdict: v,
          approved: v === 'corrigido' || v === 'preenchido',
          from: v === 'preenchido' ? null : 'ti',
        });
      });
      const r = summarizeEfficacy(ds);
      expect(r.byScale.dominio.total + r.byScale.plataforma.total).toBe(r.total);
      expect(r.total).toBe(n);
    }
  });
});

describe('robustez', () => {
  it('decisões legadas sem campo scale são reclassificadas pela procedência', () => {
    // Cache de sessão anterior à segmentação: o objeto não tem `scale`.
    const legado = {
      ...confirmada('plataforma', 0.22),
    } as ClassificationDecision & { scale?: ConfidenceScale };
    delete legado.scale;

    const r = summarizeEfficacy([
      legado as ClassificationDecision,
      confirmada('plataforma', 0.22),
      confirmada('plataforma', 0.22),
    ]);
    expect(r.byScale.plataforma.total).toBe(3);
    expect(r.byScale.dominio.total).toBe(0);
    expect(r.suggestedThreshold).toBeNull();
  });

  it('entrada nula ou vazia produz resumo neutro', () => {
    for (const entrada of [null, undefined, []]) {
      const r = summarizeEfficacy(entrada);
      expect(r.total).toBe(0);
      expect(r.accuracy).toBeNull();
      expect(r.suggestedThreshold).toBeNull();
      for (const escala of CONFIDENCE_SCALES) {
        expect(r.byScale[escala].total).toBe(0);
        expect(r.byScale[escala].suggestedThreshold).toBeNull();
      }
    }
  });
});
