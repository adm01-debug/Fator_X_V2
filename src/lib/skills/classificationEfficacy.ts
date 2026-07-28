/**
 * Eficácia do classificador departamental — lê a trilha de auditoria das
 * decisões de reclassificação e responde a UMA pergunta que nenhum painel
 * atual responde: *o classificador está errando, ou está acertando com medo?*
 *
 * Por que isso importa: hoje o selo "Rever depto." trata toda confiança baixa
 * como suspeita. Mas há dois mundos muito diferentes escondidos ali:
 *
 *  - **Confirmado** — o curador REJEITOU a troca porque o rótulo vigente já
 *    estava certo. O classificador acertou; só faltou confiança. A resposta
 *    correta é CALIBRAR (baixar limiar / melhorar léxico), não reclassificar.
 *  - **Corrigido** — o curador APROVOU a troca. O classificador errou de fato.
 *    A resposta correta é enriquecer o léxico daquele departamento.
 *
 * Sem separar os dois, qualquer decisão sobre limiares é chute. Este módulo é
 * puro e total: entrada hostil (metadata nula, datas inválidas, números como
 * string vinda de `numeric` do PostgREST) degrada para exclusão silenciosa ou
 * valor neutro — a auditoria nunca derruba o painel.
 *
 * Invariantes:
 *  1. Uma revisão (`review_id`) aparece no máximo uma vez — a decisão mais
 *     recente vence (uma RPC só decide uma vez, mas backfill/replay podem
 *     duplicar a linha de auditoria).
 *  2. Confianças são sempre clampadas em [0,1].
 *  3. `accuracy` é `null` quando não há denominador — nunca 0, que seria lido
 *     como "classificador péssimo" em vez de "sem dados".
 */
import { isDepartment, type SkillDepartment } from '@/config/skill-departments';

/** Ações de auditoria emitidas por `decide_skill_reclassification`. */
export const RECLASSIFICATION_AUDIT_ACTIONS = [
  'skill_reclassification.approved',
  'skill_reclassification.rejected',
] as const;

/** Procedência anterior registrada no momento da decisão. */
export const DECISION_SOURCES = ['unknown', 'heuristic', 'llm', 'human', 'import'] as const;
export type DecisionSource = (typeof DECISION_SOURCES)[number];

/** Origem da proposta que foi decidida. */
export type ProposalOrigin = 'lexico' | 'ia';

/**
 * Veredito sobre o classificador, derivado do par (decisão, estado anterior).
 *
 * - `corrigido`   → aprovou troca sobre departamento existente = erro do classificador
 * - `preenchido`  → aprovou troca sobre vazio = ganho puro, não havia rótulo para errar
 * - `confirmado`  → rejeitou com departamento vigente = acerto subestimado
 * - `descartado`  → rejeitou sem departamento vigente = proposta sem valor, nada mudou
 */
export type EfficacyVerdict = 'corrigido' | 'preenchido' | 'confirmado' | 'descartado';

export const EFFICACY_VERDICTS = [
  'corrigido',
  'preenchido',
  'confirmado',
  'descartado',
] as const;

export const EFFICACY_VERDICT_LABEL: Record<EfficacyVerdict, string> = {
  corrigido: 'Corrigido',
  preenchido: 'Preenchido',
  confirmado: 'Confirmado',
  descartado: 'Descartado',
};

/** Linha crua do `audit_log`, como chega do PostgREST. */
export interface AuditRowInput {
  id?: string | null;
  action?: string | null;
  entity_id?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Decisão normalizada, pronta para exibição em timeline. */
export interface ClassificationDecision {
  auditId: string;
  reviewId: string;
  skillId: string;
  slug: string;
  approved: boolean;
  from: SkillDepartment | null;
  to: SkillDepartment | null;
  /** Confiança da PROPOSTA decidida. */
  confidence: number;
  margin: number;
  origin: ProposalOrigin;
  /** Procedência do rótulo que existia ANTES da decisão. */
  previousSource: DecisionSource;
  /** Confiança do rótulo que existia ANTES da decisão. */
  previousConfidence: number;
  /** `false` quando a decisão não tocou o Registry (rejeição sem depto). */
  registryTouched: boolean;
  verdict: EfficacyVerdict;
  decidedAt: string | null;
  /** Epoch em ms; `null` quando a data é inválida ou ausente. */
  decidedAtMs: number | null;
  reason: string;
}

export interface EfficacySummary {
  total: number;
  byVerdict: Record<EfficacyVerdict, number>;
  /**
   * Acerto do classificador entre as decisões que julgaram um rótulo existente:
   * `confirmado / (confirmado + corrigido)`. `null` sem denominador.
   */
  accuracy: number | null;
  /** Confiança média que o classificador tinha nos rótulos CONFIRMADOS. */
  avgConfidenceWhenRight: number | null;
  /** Confiança média que o classificador tinha nos rótulos CORRIGIDOS. */
  avgConfidenceWhenWrong: number | null;
  /**
   * Sugestão de calibração: quando o classificador acerta com confiança abaixo
   * do limiar vigente, o limiar está caro demais. `null` quando não há sinal.
   */
  suggestedThreshold: number | null;
  /** Taxa de aprovação por origem da proposta (léxico vs IA). */
  byOrigin: Record<ProposalOrigin, { total: number; approved: number }>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clamp01(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function department(value: unknown): SkillDepartment | null {
  const raw = text(value).toLowerCase();
  return isDepartment(raw) ? (raw as SkillDepartment) : null;
}

function decisionSource(value: unknown): DecisionSource {
  const raw = text(value).toLowerCase();
  return (DECISION_SOURCES as readonly string[]).includes(raw)
    ? (raw as DecisionSource)
    : 'unknown';
}

function origin(value: unknown): ProposalOrigin {
  return text(value).toLowerCase() === 'ia' ? 'ia' : 'lexico';
}

function epoch(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Deriva o veredito. `registryTouched` do banco é a fonte da verdade sobre se
 * houve escrita; quando ausente (linhas antigas) inferimos pelo par
 * (aprovado, from).
 */
export function deriveVerdict(input: {
  approved: boolean;
  from: SkillDepartment | null;
  registryTouched: boolean;
}): EfficacyVerdict {
  if (input.approved) return input.from === null ? 'preenchido' : 'corrigido';
  return input.from !== null && input.registryTouched ? 'confirmado' : 'descartado';
}

/**
 * Converte linhas de auditoria em decisões normalizadas, ordenadas da mais
 * recente para a mais antiga. Linhas sem `review_id` utilizável são
 * descartadas: sem chave estável não há como deduplicar nem auditar.
 */
export function parseClassificationDecisions(
  rows: readonly AuditRowInput[] | null | undefined,
): ClassificationDecision[] {
  const porRevisao = new Map<string, ClassificationDecision>();

  for (const row of rows ?? []) {
    if (!row || typeof row !== 'object') continue;
    const action = text(row.action);
    if (!(RECLASSIFICATION_AUDIT_ACTIONS as readonly string[]).includes(action)) continue;

    const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<
      string,
      unknown
    >;
    const reviewId = text(meta.review_id);
    if (!reviewId) continue;

    const approved = action === 'skill_reclassification.approved';
    const from = department(meta.department_from);
    const registryTouched =
      typeof meta.registry_touched === 'boolean'
        ? meta.registry_touched
        : approved || from !== null;

    const decision: ClassificationDecision = {
      auditId: text(row.id) || reviewId,
      reviewId,
      skillId: text(row.entity_id),
      slug: text(meta.slug) || text(row.entity_id),
      approved,
      from,
      to: department(meta.department_to),
      confidence: clamp01(meta.confidence),
      margin: clamp01(meta.margin),
      origin: origin(meta.source),
      previousSource: decisionSource(meta.previous_department_source),
      previousConfidence: clamp01(meta.previous_department_confidence),
      registryTouched,
      verdict: deriveVerdict({ approved, from, registryTouched }),
      decidedAt: text(row.created_at) || null,
      decidedAtMs: epoch(row.created_at),
      reason: text(meta.decision_reason).slice(0, 1000),
    };

    // Dedupe: a decisão mais recente prevalece; sem data, a primeira vista.
    const anterior = porRevisao.get(reviewId);
    if (
      !anterior ||
      (decision.decidedAtMs ?? -Infinity) > (anterior.decidedAtMs ?? -Infinity)
    ) {
      porRevisao.set(reviewId, decision);
    }
  }

  return [...porRevisao.values()].sort((a, b) => {
    const ma = a.decidedAtMs ?? -Infinity;
    const mb = b.decidedAtMs ?? -Infinity;
    if (ma !== mb) return mb - ma;
    return a.reviewId.localeCompare(b.reviewId);
  });
}

function media(values: number[]): number | null {
  if (values.length === 0) return null;
  const soma = values.reduce((acc, v) => acc + v, 0);
  return Math.round((soma / values.length) * 1000) / 1000;
}

/** Agrega os vereditos em métricas de calibração. */
export function summarizeEfficacy(
  decisions: readonly ClassificationDecision[] | null | undefined,
): EfficacySummary {
  const byVerdict: Record<EfficacyVerdict, number> = {
    corrigido: 0,
    preenchido: 0,
    confirmado: 0,
    descartado: 0,
  };
  const byOrigin: Record<ProposalOrigin, { total: number; approved: number }> = {
    lexico: { total: 0, approved: 0 },
    ia: { total: 0, approved: 0 },
  };
  const confiancaAcerto: number[] = [];
  const confiancaErro: number[] = [];

  const lista = decisions ?? [];
  for (const d of lista) {
    byVerdict[d.verdict] += 1;
    byOrigin[d.origin].total += 1;
    if (d.approved) byOrigin[d.origin].approved += 1;
    // A confiança relevante para calibrar é a do rótulo JULGADO, não a da
    // proposta: é ela que decide se o selo "Rever depto." aparece.
    if (d.verdict === 'confirmado') confiancaAcerto.push(d.previousConfidence);
    if (d.verdict === 'corrigido') confiancaErro.push(d.previousConfidence);
  }

  const denominador = byVerdict.confirmado + byVerdict.corrigido;
  const avgConfidenceWhenRight = media(confiancaAcerto);

  return {
    total: lista.length,
    byVerdict,
    accuracy: denominador === 0 ? null : Math.round((byVerdict.confirmado / denominador) * 1000) / 1000,
    avgConfidenceWhenRight,
    avgConfidenceWhenWrong: media(confiancaErro),
    // Só sugerimos afrouxar quando há evidência dos DOIS lados; caso contrário
    // a "sugestão" seria eco de uma amostra enviesada.
    suggestedThreshold:
      confiancaAcerto.length >= 3 && avgConfidenceWhenRight !== null
        ? Math.round(Math.min(0.95, Math.max(0.05, avgConfidenceWhenRight)) * 100) / 100
        : null,
  };
}

/** Filtro por veredito para a timeline; `all` preserva a ordem. */
export type EfficacyFilter = EfficacyVerdict | 'all';

export function filterByVerdict(
  decisions: readonly ClassificationDecision[],
  filter: EfficacyFilter,
): ClassificationDecision[] {
  if (filter === 'all') return [...decisions];
  return decisions.filter((d) => d.verdict === filter);
}

/** Normaliza um filtro vindo de storage/URL; desconhecidos viram `all`. */
export function normalizeEfficacyFilter(value: unknown): EfficacyFilter {
  const raw = text(value).toLowerCase();
  return (EFFICACY_VERDICTS as readonly string[]).includes(raw) ? (raw as EfficacyVerdict) : 'all';
}
