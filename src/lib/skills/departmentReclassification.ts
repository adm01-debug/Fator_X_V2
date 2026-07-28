/**
 * Reclassificação de departamento — transforma o diagnóstico de "demanda zero"
 * em uma ação concreta e reversível.
 *
 * Por que existe: skills órfãs quase sempre têm o departamento errado (ou
 * nenhum), então o motor de recomendação nunca as considera para os templates
 * daquele departamento. Este módulo propõe o departamento correto usando o
 * classificador determinístico já existente e monta um PLANO — nada é escrito
 * aqui. A separação plano/aplicação é deliberada: o plano é puro, testável por
 * simulação exaustiva e auditável antes de tocar o banco.
 *
 * Invariantes garantidos por construção:
 *  1. Nenhum item no plano é no-op (`from === to` nunca aparece).
 *  2. `to` é sempre um departamento da taxonomia canônica.
 *  3. Um `skillId` aparece no máximo uma vez (dedupe por primeira ocorrência).
 *  4. Propostas abaixo do limiar de confiança são descartadas, não adivinhadas.
 *  5. Entradas hostis (nulos, ids vazios, tags não-array) degradam para exclusão
 *     silenciosa em vez de exceção — o painel nunca quebra por dado sujo.
 */
import { isDepartment, type SkillDepartment } from '@/config/skill-departments';
import { classifyDepartment } from '@/services/skillDepartmentClassifier';

/**
 * Confiança mínima para propor uma troca de departamento.
 * Acima do `LOW_CONFIDENCE_THRESHOLD` (0.18) do classificador de propósito:
 * uma reclassificação em massa é mais cara de reverter do que um palpite de
 * harvest, então exigimos evidência léxica mais forte.
 */
export const MIN_RECLASSIFY_CONFIDENCE = 0.25;

/**
 * Margem mínima entre o 1º e o 2º colocado do ranking.
 *
 * Por quê: a simulação com o catálogo real mostrou margem média de apenas
 * 0.084 — o léxico tem colisões PT/EN legítimas ("stock" = ação/estoque,
 * "documentação" pontua em executivo e ti). Confiança absoluta alta com
 * segundo colocado colado é um empate, não uma decisão; propor a troca nesse
 * caso troca um erro por outro. Exigir separação elimina a classe inteira de
 * falsos positivos por ambiguidade léxica.
 */
export const MIN_RECLASSIFY_MARGIN = 0.08;

/**
 * Barra elevada para skills que JÁ possuem departamento.
 *
 * Sobrescrever curadoria existente (humana ou de harvest) é destrutivo; então
 * uma reclassificação só vale a pena com evidência substancialmente mais forte
 * do que a exigida para preencher um campo vazio.
 */
export const MIN_RECLASSIFY_CONFIDENCE_OVERRIDE = 0.35;
export const MIN_RECLASSIFY_MARGIN_OVERRIDE = 0.12;

/** Teto de itens aplicados numa única rodada (protege contra clique acidental). */
export const MAX_RECLASSIFY_BATCH = 50;

/** Entrada mínima para propor uma reclassificação. */
export interface ReclassifyCandidate {
  skillId: string;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  tags?: readonly string[] | null;
  department?: string | null;
}

/** Uma troca proposta, pronta para exibição e aplicação. */
export interface ReclassifyProposal {
  skillId: string;
  name: string;
  slug: string;
  /** Departamento atual — `null` quando a skill nunca foi classificada. */
  from: SkillDepartment | null;
  to: SkillDepartment;
  confidence: number;
  matchedTerms: string[];
}

export interface ReclassifyPlanSummary {
  /** Candidatos avaliados (após descartar entradas inválidas). */
  evaluated: number;
  /** Propostas válidas. */
  proposed: number;
  /** Já estavam no departamento correto. */
  unchanged: number;
  /** Sem evidência léxica suficiente. */
  lowConfidence: number;
  /** Vencedor colado no segundo colocado — empate, não decisão. */
  ambiguous: number;
}

export interface ReclassifyPlan {
  proposals: ReclassifyProposal[];
  summary: ReclassifyPlanSummary;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
}

/** Limiares configuráveis; um número solto é interpretado como confiança mínima. */
export interface ReclassifyThresholds {
  minConfidence?: number;
  minMargin?: number;
  minConfidenceOverride?: number;
  minMarginOverride?: number;
}

function clamp01(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function resolveThresholds(input: number | ReclassifyThresholds | undefined) {
  const raw: ReclassifyThresholds = typeof input === 'number' ? { minConfidence: input } : (input ?? {});
  const minConfidence = clamp01(raw.minConfidence, MIN_RECLASSIFY_CONFIDENCE);
  const minMargin = clamp01(raw.minMargin, MIN_RECLASSIFY_MARGIN);
  return {
    minConfidence,
    minMargin,
    // A barra de sobrescrita nunca pode ser mais frouxa que a barra base:
    // isso tornaria mais fácil destruir curadoria do que preencher um vazio.
    minConfidenceOverride: Math.max(
      minConfidence,
      clamp01(raw.minConfidenceOverride, MIN_RECLASSIFY_CONFIDENCE_OVERRIDE),
    ),
    minMarginOverride: Math.max(
      minMargin,
      clamp01(raw.minMarginOverride, MIN_RECLASSIFY_MARGIN_OVERRIDE),
    ),
  };
}

/**
 * Monta o plano de reclassificação. Puro e total.
 *
 * A ordenação é por confiança decrescente e, em empate, por slug — comparador
 * transitivo (sem subtração de floats) para garantir sort determinístico entre
 * engines.
 */
export function buildReclassificationPlan(
  candidates: readonly ReclassifyCandidate[] | null | undefined,
  options?: number | ReclassifyThresholds,
): ReclassifyPlan {
  const limiares = resolveThresholds(options);

  const vistos = new Set<string>();
  const proposals: ReclassifyProposal[] = [];
  let evaluated = 0;
  let unchanged = 0;
  let lowConfidence = 0;
  let ambiguous = 0;

  for (const candidate of candidates ?? []) {
    if (!candidate || typeof candidate.skillId !== 'string') continue;
    const skillId = candidate.skillId.trim();
    if (skillId.length === 0 || vistos.has(skillId)) continue;
    vistos.add(skillId);
    evaluated += 1;

    const slug = text(candidate.slug) || skillId;
    const name = text(candidate.name) || slug;
    const atual = text(candidate.department);
    const from: SkillDepartment | null = isDepartment(atual) ? atual : null;

    const resultado = classifyDepartment({
      name,
      description: text(candidate.description),
      tags: safeTags(candidate.tags),
    });

    // Sobrescrever curadoria existente exige evidência mais forte.
    const confMin = from === null ? limiares.minConfidence : limiares.minConfidenceOverride;
    const margemMin = from === null ? limiares.minMargin : limiares.minMarginOverride;

    if (!resultado.department || resultado.confidence < confMin) {
      lowConfidence += 1;
      continue;
    }
    if (resultado.department === from) {
      unchanged += 1;
      continue;
    }

    const segundo = resultado.ranking[1]?.score ?? 0;
    const margem = Number((resultado.confidence - segundo).toFixed(6));
    if (margem < margemMin) {
      ambiguous += 1;
      continue;
    }

    proposals.push({
      skillId,
      name,
      slug,
      from,
      to: resultado.department,
      confidence: resultado.confidence,
      margin: margem,
      runnerUp: resultado.ranking[1]?.department ?? null,
      matchedTerms: resultado.matchedTerms.slice(0, 6),
    });
  }

  proposals.sort((a, b) => {
    if (a.confidence > b.confidence) return -1;
    if (a.confidence < b.confidence) return 1;
    return a.slug.localeCompare(b.slug);
  });

  return {
    proposals,
    summary: { evaluated, proposed: proposals.length, unchanged, lowConfidence, ambiguous },
  };
}

/**
 * Restringe o plano aos ids selecionados na UI, preservando a ordem do plano e
 * respeitando o teto de lote. Ids desconhecidos são ignorados.
 */
export function selectProposals(
  plan: ReclassifyPlan,
  selectedIds: readonly string[] | null | undefined,
  maxBatch: number = MAX_RECLASSIFY_BATCH,
): ReclassifyProposal[] {
  const teto = Number.isFinite(maxBatch) ? Math.max(0, Math.floor(maxBatch)) : MAX_RECLASSIFY_BATCH;
  const alvo = new Set((selectedIds ?? []).filter((id) => typeof id === 'string' && id.length > 0));
  if (alvo.size === 0) return [];
  return plan.proposals.filter((p) => alvo.has(p.skillId)).slice(0, teto);
}

/** Exportação CSV (RFC 4180, com BOM) do plano — trilha de auditoria offline. */
export function reclassificationToCsv(proposals: readonly ReclassifyProposal[]): string {
  const escape = (value: string | number | null) =>
    `"${(value === null ? '' : String(value)).replace(/"/g, '""')}"`;
  const linhas = [
    ['slug', 'nome', 'de', 'para', 'confianca', 'termos'].map(escape).join(','),
  ];
  for (const p of proposals) {
    linhas.push(
      [
        escape(p.slug),
        escape(p.name),
        escape(p.from ?? 'não classificado'),
        escape(p.to),
        escape(p.confidence),
        escape(p.matchedTerms.join(' ')),
      ].join(','),
    );
  }
  return '\uFEFF' + linhas.join('\r\n');
}
