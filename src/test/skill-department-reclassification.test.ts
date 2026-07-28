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
  buildReclassificationPlan,
  reclassificationToCsv,
  selectProposals,
  type ReclassifyCandidate,
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
    const dep = rand() < 0.3 ? null : SKILL_DEPARTMENTS[Math.floor(rand() * SKILL_DEPARTMENTS.length)];
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

      // 1. Contabilidade fecha: avaliados = propostos + inalterados + baixa confiança
      const { evaluated, proposed, unchanged, lowConfidence } = plano.summary;
      expect(proposed + unchanged + lowConfidence).toBe(evaluated);

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
        // 6. Confiança acima do limiar
        expect(p.confidence).toBeGreaterThanOrEqual(MIN_RECLASSIFY_CONFIDENCE);
        // 7. Unicidade
        expect(vistos.has(p.skillId)).toBe(false);
        vistos.add(p.skillId);
        // 8. Ordenação decrescente por confiança
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
    expect(selectProposals(plano, ids, Number.NaN).length).toBeLessThanOrEqual(MAX_RECLASSIFY_BATCH);
    expect(selectProposals(plano, ids, -10)).toEqual([]);
  });

  it('CSV é RFC 4180 com BOM e cabeçalho estável', () => {
    const plano = buildReclassificationPlan(gerarCatalogo(5, 20), 0);
    const csv = reclassificationToCsv(plano.proposals);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\r\n')[0]).toBe('"slug","nome","de","para","confianca","termos"');
    expect(csv.split('\r\n').length).toBe(plano.proposals.length + 1);
    // Aspas internas são escapadas por duplicação
    const comAspas = reclassificationToCsv([
      { skillId: 'a', name: 'diz "olá"', slug: 'a', from: null, to: 'ti', confidence: 1, matchedTerms: [] },
    ]);
    expect(comAspas).toContain('"diz ""olá"""');
  });
});
