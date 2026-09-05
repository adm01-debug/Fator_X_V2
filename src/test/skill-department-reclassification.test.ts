/**
 * Simulação de cenários para o plano de reclassificação de departamento.
 *
 * Estratégia: gerar centenas de catálogos sintéticos (incluindo entradas
 * hostis) e provar invariantes em vez de conferir saídas específicas — assim
 * o teste sobrevive a mudanças no léxico do classificador.
 */
import { describe, expect, it } from 'vitest';
import { SKILL_DEPARTMENTS, isDepartment } from '@/config/skill-departments';
import {
  MAX_RECLASSIFY_BATCH,
  MIN_RECLASSIFY_CONFIDENCE,
  MIN_RECLASSIFY_CONFIDENCE_OVERRIDE,
  MIN_RECLASSIFY_MARGIN,
  MIN_RECLASSIFY_MARGIN_OVERRIDE,
  buildReclassificationPlan,
  mergeLlmProposals,
  proposalFromLlmVerdict,
  reclassificationToCsv,
  selectProposals,
  type LlmFallbackCandidate,
  type ReclassifyCandidate,
  type ReclassifyProposal,
} from '@/lib/skills/departmentReclassification';

/** PRNG determinístico (mulberry32) — mesma semente, mesmos cenários. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXTOS = [
  'Conciliação de faturas e fluxo de caixa no ERP',
  'Prospecção outbound com cadência de leads no CRM',
  'Onboarding de colaboradores e folha de ponto',
  'Pipeline de CI/CD com observabilidade e deploy',
  'Campanha de marketing com SEO e copy de anúncios',
  'Revisão de contrato e cláusula de compliance jurídico',
  'Roteirização de entrega e controle de estoque',
  'Atendimento pós-venda com ticket e NPS',
  'Modelagem de dados e dashboard analítico',
  'Relatório executivo de OKR para o board',
  '',
  '   ',
  '🙂🙂🙂',
  'lorem ipsum dolor sit amet consectetur',
];

const SUJEIRA: unknown[] = [
  null,
  undefined,
  {},
  { skillId: '' },
  { skillId: '   ' },
  { skillId: 42 },
  { skillId: 'ok', tags: 'não-é-array' },
  { skillId: 'ok2', department: '__proto__' },
  { skillId: 'ok3', department: 'departamento-inexistente' },
  { skillId: 'ok4', name: null, slug: null, description: null, tags: null },
];

function gerarCatalogo(seed: number, tamanho: number): ReclassifyCandidate[] {
  const rand = rng(seed);
  const itens: ReclassifyCandidate[] = [];
  for (let i = 0; i < tamanho; i += 1) {
    const texto = TEXTOS[Math.floor(rand() * TEXTOS.length)];
    const dep =
      rand() < 0.3 ? null : SKILL_DEPARTMENTS[Math.floor(rand() * SKILL_DEPARTMENTS.length)];
    itens.push({
      skillId: `skill-${seed}-${i}`,
      name: texto,
      slug: `slug-${seed}-${i}`,
      description: rand() < 0.5 ? texto : '',
      tags: rand() < 0.5 ? texto.split(' ').slice(0, 3) : [],
      department: dep,
    });
  }
  // 20% de duplicatas exatas de id, para exercitar o dedupe.
  const dupes = Math.floor(tamanho * 0.2);
  for (let i = 0; i < dupes; i += 1) itens.push({ ...itens[i] });
  return itens;
}

describe('buildReclassificationPlan — 300 catálogos simulados', () => {
  it('mantém todos os invariantes', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const catalogo = gerarCatalogo(seed, 12);
      const plano = buildReclassificationPlan(catalogo);

      // 1. Contabilidade fecha: avaliados = todas as saídas possíveis
      const { evaluated, proposed, unchanged, lowConfidence, ambiguous } = plano.summary;
      expect(proposed + unchanged + lowConfidence + ambiguous).toBe(evaluated);

      // 2. Dedupe: avaliados = ids distintos
      const idsDistintos = new Set(catalogo.map((c) => c.skillId)).size;
      expect(evaluated).toBe(idsDistintos);

      const vistos = new Set<string>();
      let anterior = Number.POSITIVE_INFINITY;
      for (const p of plano.proposals) {
        // 3. Nunca no-op
        expect(p.to).not.toBe(p.from);
        // 4. Destino sempre canônico
        expect(isDepartment(p.to)).toBe(true);
        // 5. Origem canônica ou nula
        if (p.from !== null) expect(isDepartment(p.from)).toBe(true);
        // 6. Barra de confiança — mais alta quando sobrescreve curadoria
        expect(p.confidence).toBeGreaterThanOrEqual(
          p.from === null ? MIN_RECLASSIFY_CONFIDENCE : MIN_RECLASSIFY_CONFIDENCE_OVERRIDE,
        );
        // 7. Margem sobre o segundo colocado — nunca propõe empate
        expect(p.margin).toBeGreaterThanOrEqual(
          p.from === null ? MIN_RECLASSIFY_MARGIN : MIN_RECLASSIFY_MARGIN_OVERRIDE,
        );
        expect(p.runnerUp).not.toBe(p.to);
        // 8. Unicidade
        expect(vistos.has(p.skillId)).toBe(false);
        vistos.add(p.skillId);
        // 9. Ordenação decrescente por confiança
        expect(p.confidence).toBeLessThanOrEqual(anterior);
        anterior = p.confidence;
      }
    }
  });

  it('é determinístico entre execuções', () => {
    const catalogo = gerarCatalogo(7, 40);
    expect(buildReclassificationPlan(catalogo)).toEqual(buildReclassificationPlan(catalogo));
  });

  it('degrada entradas hostis sem lançar', () => {
    const plano = buildReclassificationPlan(SUJEIRA as ReclassifyCandidate[]);
    expect(plano.summary.evaluated).toBeLessThanOrEqual(SUJEIRA.length);
    for (const p of plano.proposals) expect(isDepartment(p.to)).toBe(true);
    expect(buildReclassificationPlan(null).proposals).toEqual([]);
    expect(buildReclassificationPlan(undefined).summary.evaluated).toBe(0);
  });

  it('limiar 1 zera propostas e limiar 0 nunca reprova por confiança', () => {
    const catalogo = gerarCatalogo(11, 30);
    expect(buildReclassificationPlan(catalogo, 1.01).proposals.length).toBe(0);
    const permissivo = buildReclassificationPlan(catalogo, -5);
    // Com limiar mínimo, só reprova quem o classificador não conseguiu rotular.
    expect(permissivo.summary.proposed + permissivo.summary.unchanged).toBeGreaterThanOrEqual(
      buildReclassificationPlan(catalogo).summary.proposed,
    );
  });

  it('selectProposals respeita seleção, ordem e teto de lote', () => {
    const plano = buildReclassificationPlan(gerarCatalogo(3, 200), 0);
    const ids = plano.proposals.map((p) => p.skillId);

    expect(selectProposals(plano, [])).toEqual([]);
    expect(selectProposals(plano, null)).toEqual([]);
    expect(selectProposals(plano, ['inexistente'])).toEqual([]);

    const selecionados = selectProposals(plano, ids);
    expect(selecionados.length).toBeLessThanOrEqual(MAX_RECLASSIFY_BATCH);
    // Preserva a ordem do plano
    const posicoes = selecionados.map((p) => ids.indexOf(p.skillId));
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
    // Teto respeitado mesmo com valores absurdos
    expect(selectProposals(plano, ids, Number.NaN).length).toBeLessThanOrEqual(
      MAX_RECLASSIFY_BATCH,
    );
    expect(selectProposals(plano, ids, -10)).toEqual([]);
  });

  it('CSV é RFC 4180 com BOM e cabeçalho estável', () => {
    const plano = buildReclassificationPlan(gerarCatalogo(5, 20), 0);
    const csv = reclassificationToCsv(plano.proposals);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.slice(1).split('\r\n')[0]).toBe(
      '"slug","nome","de","para","confianca","margem","segundo","termos","origem","justificativa"',
    );
    expect(csv.split('\r\n').length).toBe(plano.proposals.length + 1);
    // Aspas internas são escapadas por duplicação
    const comAspas = reclassificationToCsv([
      {
        skillId: 'a',
        name: 'diz "olá"',
        slug: 'a',
        from: null,
        to: 'ti',
        confidence: 1,
        margin: 1,
        runnerUp: null,
        matchedTerms: [],
      },
    ]);
    expect(comAspas).toContain('"diz ""olá"""');
  });

  it('llmCandidates materializa exatamente o balde de baixa confiança', () => {
    for (let seed = 1; seed <= 120; seed += 1) {
      // Limiar impossível: tudo cai em lowConfidence, nada vira proposta.
      const plano = buildReclassificationPlan(gerarCatalogo(seed, 12), {
        minConfidence: 1.1,
        minConfidenceOverride: 1.1,
        minMargin: 0,
        minMarginOverride: 0,
      });
      expect(plano.proposals).toEqual([]);
      expect(plano.llmCandidates.length).toBe(plano.summary.lowConfidence);
      // Ordem estável por slug — o painel não pode embaralhar entre execuções.
      const slugs = plano.llmCandidates.map((c) => c.slug);
      expect(slugs).toEqual([...slugs].sort((a, b) => a.localeCompare(b)));
      // Nenhum candidato pode aparecer também como proposta.
      const propostos = new Set(plano.proposals.map((p) => p.skillId));
      for (const c of plano.llmCandidates) expect(propostos.has(c.skillId)).toBe(false);
    }
  });

  it('llmCandidates e proposals são baldes disjuntos sob limiares reais', () => {
    for (let seed = 200; seed <= 320; seed += 1) {
      const plano = buildReclassificationPlan(gerarCatalogo(seed, 15));
      const ids = new Set<string>();
      for (const p of plano.proposals) ids.add(p.skillId);
      for (const c of plano.llmCandidates) {
        expect(ids.has(c.skillId)).toBe(false);
        expect(c.lexicalConfidence).toBeGreaterThanOrEqual(0);
        expect(c.lexicalConfidence).toBeLessThanOrEqual(1);
      }
      expect(plano.summary.evaluated).toBe(
        plano.summary.proposed +
          plano.summary.unchanged +
          plano.summary.lowConfidence +
          plano.summary.ambiguous,
      );
    }
  });

  const candidato: LlmFallbackCandidate = {
    skillId: 'sk-1',
    name: 'Skill genérica',
    slug: 'skill-generica',
    description: 'texto vago',
    tags: [],
    from: null,
    lexicalConfidence: 0.1,
  };

  it('proposalFromLlmVerdict rejeita vereditos indefensáveis', () => {
    // Departamento fora da taxonomia (alucinação).
    expect(
      proposalFromLlmVerdict(candidato, { department: 'vendas_b2b', confidence: 0.99 }),
    ).toBeNull();
    expect(
      proposalFromLlmVerdict(candidato, { department: 'indefinido', confidence: 0.99 }),
    ).toBeNull();
    expect(proposalFromLlmVerdict(candidato, { department: null, confidence: 0.99 })).toBeNull();
    // Confiança abaixo do limiar mínimo.
    expect(proposalFromLlmVerdict(candidato, { department: 'ti', confidence: 0 })).toBeNull();
    expect(
      proposalFromLlmVerdict(candidato, { department: 'ti', confidence: Number.NaN }),
    ).toBeNull();
    // Troca no-op: já está no departamento proposto.
    expect(
      proposalFromLlmVerdict({ ...candidato, from: 'ti' }, { department: 'ti', confidence: 1 }),
    ).toBeNull();
  });

  it('proposalFromLlmVerdict marca origem e não inventa evidência léxica', () => {
    const proposta = proposalFromLlmVerdict(candidato, {
      department: 'dados',
      confidence: 0.87,
      rationale: '  Trata de ETL e métricas.  ',
    });
    expect(proposta).not.toBeNull();
    expect(proposta?.source).toBe('ia');
    expect(proposta?.to).toBe('dados');
    expect(proposta?.rationale).toBe('Trata de ETL e métricas.');
    // Sem segundo colocado e sem termos: uma proposta de IA não pode se
    // disfarçar de proposta auditável.
    expect(proposta?.margin).toBe(0);
    expect(proposta?.matchedTerms).toEqual([]);
    expect(proposta?.runnerUp).toBeNull();
    expect(isDepartment(proposta?.to ?? '')).toBe(true);
  });

  it('mergeLlmProposals dá precedência ao léxico e deduplica', () => {
    const plano = buildReclassificationPlan(gerarCatalogo(7, 20));
    const alvo = plano.proposals[0];
    expect(alvo).toBeDefined();

    const conflitante: ReclassifyProposal = {
      skillId: alvo.skillId,
      name: alvo.name,
      slug: alvo.slug,
      from: alvo.from,
      to: alvo.to === 'ti' ? 'rh' : 'ti',
      confidence: 1,
      margin: 0,
      runnerUp: null,
      matchedTerms: [],
      source: 'ia',
    };
    const novo: ReclassifyProposal = { ...conflitante, skillId: 'novo-1', slug: 'novo-1' };

    const fundido = mergeLlmProposals(plano, [conflitante, novo, novo]);
    // O léxico venceu: o skillId em conflito mantém o destino original.
    expect(fundido.filter((p) => p.skillId === alvo.skillId)).toHaveLength(1);
    expect(fundido.find((p) => p.skillId === alvo.skillId)?.to).toBe(alvo.to);
    // Duplicata de IA colapsada em uma linha.
    expect(fundido.filter((p) => p.skillId === 'novo-1')).toHaveLength(1);
    expect(fundido.length).toBe(plano.proposals.length + 1);
  });

  it('selectProposals aceita lista fundida, não só o plano', () => {
    const plano = buildReclassificationPlan(gerarCatalogo(9, 20));
    const extra: ReclassifyProposal = {
      skillId: 'ia-1',
      name: 'IA',
      slug: 'ia-1',
      from: null,
      to: 'dados',
      confidence: 0.9,
      margin: 0,
      runnerUp: null,
      matchedTerms: [],
      source: 'ia',
    };
    const fundido = mergeLlmProposals(plano, [extra]);
    expect(selectProposals(fundido, ['ia-1'])).toHaveLength(1);
    // O plano puro não conhece a proposta de IA.
    expect(selectProposals(plano, ['ia-1'])).toEqual([]);
    expect(selectProposals(fundido, ['ia-1'], 0)).toEqual([]);
  });

  it('CSV registra a origem de cada linha', () => {
    const plano = buildReclassificationPlan(gerarCatalogo(11, 10), 0);
    const csv = reclassificationToCsv(plano.proposals);
    for (const linha of csv.slice(1).split('\r\n').slice(1)) {
      expect(linha).toContain('"lexico"');
    }
    // Propostas legadas (sem `source`) não quebram a exportação.
    const legado = reclassificationToCsv([
      {
        skillId: 'x',
        name: 'x',
        slug: 'x',
        from: null,
        to: 'ti',
        confidence: 1,
        margin: 1,
        runnerUp: null,
        matchedTerms: [],
      },
    ]);
    expect(legado).toContain('"lexico"');
  });
});
