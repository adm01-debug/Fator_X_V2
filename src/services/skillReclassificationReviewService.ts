/**
 * Fila de revisão manual das classificações automáticas.
 *
 * Por que uma fila persistida e não a aprovação em memória do diálogo:
 *
 *  - **Rastreabilidade.** Depois que o UPDATE roda, o "antes" desaparece. Sem
 *    um registro do estado anterior, da evidência e de quem decidiu, ninguém
 *    consegue auditar um erro de classificação — especialmente os vindos de
 *    LLM, cuja justificativa é a única defesa da troca.
 *  - **Separação de poderes.** Qualquer curador pode PROPOR; só administrador
 *    pode DECIDIR. Isso é impossível de garantir no cliente, então a decisão
 *    mora numa RPC `SECURITY DEFINER` com checagem explícita de papel.
 *  - **Concorrência.** A aprovação revalida no servidor que o departamento
 *    atual ainda é o mesmo que foi analisado. Um plano calculado às 10h não
 *    pode sobrescrever às cegas uma curadoria feita às 11h.
 *
 * Este módulo não decide nada: traduz erros do PostgREST em categorias
 * acionáveis e devolve estado para a UI.
 */
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { isDepartment, type SkillDepartment } from '@/config/skill-departments';
import type { ProposalSource, ReclassifyProposal } from '@/lib/skills/departmentReclassification';

/** Situação de uma revisão. Terminais: `aprovado`, `rejeitado`. */
export type ReviewStatus = 'pendente' | 'aprovado' | 'rejeitado';

export interface ReclassificationReview {
  id: string;
  skillId: string;
  slug: string;
  name: string;
  /** Estado ANTES — congelado no momento da proposta. */
  from: SkillDepartment | null;
  /** Estado DEPOIS proposto. */
  to: SkillDepartment;
  confidence: number;
  margin: number;
  /**
   * Limiar exigido pelo curador quando a proposta foi criada. `null` para
   * propostas anteriores à coluna. Sem isso, uma proposta de 0,60 aprovada
   * ontem é indistinguível de uma que seria rejeitada hoje sob limiar 0,80 —
   * e a auditoria não consegue reconstruir o critério vigente.
   */
  confidenceThreshold: number | null;
  runnerUp: SkillDepartment | null;
  matchedTerms: string[];
  source: ProposalSource;
  rationale: string;
  status: ReviewStatus;
  decisionReason: string;
  requestedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/** Limite de caracteres do motivo — espelha o `LEFT(..., 1000)` da RPC. */
export const MAX_DECISION_REASON = 1000;

export type ReviewErrorKind =
  | 'permission'
  | 'conflict'
  | 'duplicate'
  | 'already_decided'
  | 'not_found'
  | 'network'
  | 'unknown';

export class ReviewOperationError extends Error {
  constructor(
    message: string,
    readonly kind: ReviewErrorKind,
  ) {
    super(message);
    this.name = 'ReviewOperationError';
  }
}

/**
 * Traduz o erro cru em algo que o curador possa agir.
 *
 * Os códigos vêm da RPC de propósito: mensagens de texto mudam com refactor,
 * SQLSTATE não. `40001` = conflito de estado, `55000` = já decidida,
 * `23505` = já existe pendência para a mesma skill.
 */
export function classifyReviewError(error: unknown): ReviewErrorKind {
  const code = (error as { code?: string } | null)?.code ?? '';
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const msg = raw.toLowerCase();

  if (code === '23505' || msg.includes('idx_skill_reclass_one_pending')) return 'duplicate';
  if (code === '40001' || msg.includes('conflito')) return 'conflict';
  if (code === '55000' || msg.includes('ja decidida')) return 'already_decided';
  if (code === 'P0002' || msg.includes('nao encontrada')) return 'not_found';
  if (code === '42501' || msg.includes('row-level security') || msg.includes('permission')) {
    return 'permission';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) {
    return 'network';
  }
  return 'unknown';
}

export const REVIEW_ERROR_LABEL: Record<ReviewErrorKind, string> = {
  permission: 'Apenas administradores podem decidir reclassificações.',
  conflict: 'O departamento mudou desde a proposta — recarregue a fila.',
  duplicate: 'Já existe uma proposta pendente para esta skill.',
  already_decided: 'Esta revisão já foi decidida por outra pessoa.',
  not_found: 'Revisão não encontrada.',
  network: 'Falha de rede.',
  unknown: 'Erro inesperado.',
};

/** Linha crua do banco — tipada localmente para não vazar `any` na fronteira. */
interface ReviewRow {
  id: string;
  skill_id: string;
  skill_slug: string | null;
  skill_name: string | null;
  department_from: string | null;
  department_to: string;
  confidence: number | string | null;
  margin: number | string | null;
  confidence_threshold?: number | string | null;
  runner_up: string | null;
  matched_terms: string[] | null;
  source: string | null;
  rationale: string | null;
  status: string | null;
  decision_reason: string | null;
  requested_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function toNumber(value: number | string | null): number {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normaliza o limiar persistido.
 *
 * Diferente de `toNumber`, aqui `null` é informação legítima (proposta antiga,
 * anterior à coluna) e NÃO pode virar 0: exibir "limiar 0,00" sugeriria que o
 * curador aceitou qualquer coisa, o oposto do que aconteceu. Valores fora de
 * [0,1] também viram `null` — dado corrompido é pior que dado ausente numa
 * trilha de auditoria.
 */
export function toThreshold(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  // `Number('')` e `Number('   ')` valem 0 — string vazia viraria "limiar 0,00"
  // em vez de "sem registro". Barrada antes da coerção.
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

function toStatus(value: string | null): ReviewStatus {
  return value === 'aprovado' || value === 'rejeitado' ? value : 'pendente';
}

/**
 * Normaliza a linha para o domínio.
 *
 * Devolve `null` quando `department_to` não pertence mais à taxonomia — uma
 * proposta órfã de departamento renomeado não pode ser aprovada, e mostrá-la
 * como aprovável seria oferecer um botão que só produz erro.
 */
export function mapReviewRow(row: ReviewRow): ReclassificationReview | null {
  if (!row || typeof row.id !== 'string' || !isDepartment(row.department_to)) return null;
  const from = row.department_from;
  const runnerUp = row.runner_up;
  return {
    id: row.id,
    skillId: row.skill_id,
    slug: row.skill_slug ?? '',
    name: row.skill_name ?? row.skill_slug ?? 'Skill sem nome',
    from: from !== null && isDepartment(from) ? from : null,
    to: row.department_to,
    confidence: toNumber(row.confidence),
    margin: toNumber(row.margin),
    confidenceThreshold: toThreshold(row.confidence_threshold),
    runnerUp: runnerUp !== null && isDepartment(runnerUp) ? runnerUp : null,
    matchedTerms: Array.isArray(row.matched_terms) ? row.matched_terms.filter(Boolean) : [],
    source: row.source === 'ia' ? 'ia' : 'lexico',
    rationale: row.rationale ?? '',
    status: toStatus(row.status),
    decisionReason: row.decision_reason ?? '',
    requestedBy: row.requested_by,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS =
  'id, skill_id, skill_slug, skill_name, department_from, department_to, confidence, confidence_threshold, margin, runner_up, matched_terms, source, rationale, status, decision_reason, requested_by, reviewed_by, reviewed_at, created_at';

export interface FetchReviewsOptions {
  status?: ReviewStatus | 'todos';
  limit?: number;
}

/** Carrega a fila de revisão, mais recentes primeiro. */
export async function fetchReclassificationReviews(
  options: FetchReviewsOptions = {},
): Promise<ReclassificationReview[]> {
  const limit = Math.min(Math.max(1, options.limit ?? 200), 500);
  let query = supabaseExternal
    .from('skill_reclassification_reviews')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options.status && options.status !== 'todos') {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;
  if (error) throw new ReviewOperationError(error.message, classifyReviewError(error));

  const rows = (data ?? []) as unknown as ReviewRow[];
  return rows.map(mapReviewRow).filter((r): r is ReclassificationReview => r !== null);
}

export interface SubmitReviewsResult {
  /** Propostas efetivamente enfileiradas. */
  queued: number;
  /** Ignoradas por já existir pendência para a mesma skill. */
  duplicates: string[];
  /** Falhas com motivo — nunca abortam o lote inteiro. */
  failures: { slug: string; kind: ReviewErrorKind; message: string }[];
}

/**
 * Enfileira propostas para revisão manual.
 *
 * Insere uma a uma de propósito: um insert em lote falharia inteiro no
 * primeiro conflito com o índice de pendência única, descartando trabalho
 * válido. O custo (N round-trips) é irrelevante para lotes de curadoria e
 * compra granularidade total no relatório de erro.
 */
export async function submitReclassificationReviews(
  proposals: readonly ReclassifyProposal[],
  options: { confidenceThreshold?: number } = {},
): Promise<SubmitReviewsResult> {
  // Quantizado em 4 casas para casar com numeric(5,4): mandar 0.7300000000001
  // faria o Postgres arredondar silenciosamente e o valor lido divergiria do
  // enviado — ruído gratuito numa trilha de auditoria.
  const limiar = toThreshold(options.confidenceThreshold);
  const limiarPersistido = limiar === null ? null : Number(limiar.toFixed(4));
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;
  if (!userId) {
    throw new ReviewOperationError('Sessão expirada — entre novamente.', 'permission');
  }

  const duplicates: string[] = [];
  const failures: SubmitReviewsResult['failures'] = [];
  let queued = 0;

  for (const p of proposals) {
    // Defesa em profundidade: a mesma invariante do CHECK no banco. Falhar
    // aqui produz mensagem útil em vez de um erro de constraint opaco.
    if (p.from === p.to) continue;

    const { error } = await supabaseExternal.from('skill_reclassification_reviews').insert({
      skill_id: p.skillId,
      skill_slug: p.slug ?? '',
      skill_name: p.name ?? '',
      department_from: p.from,
      department_to: p.to,
      confidence: Number(p.confidence.toFixed(4)),
      confidence_threshold: limiarPersistido,
      margin: Number(p.margin.toFixed(4)),
      runner_up: p.runnerUp,
      matched_terms: p.matchedTerms ?? [],
      source: p.source ?? 'lexico',
      rationale: (p.rationale ?? '').slice(0, 2000),
      status: 'pendente',
      requested_by: userId,
    });

    if (!error) {
      queued += 1;
      continue;
    }

    const kind = classifyReviewError(error);
    // Duplicata não é falha: significa que a proposta JÁ está na fila.
    if (kind === 'duplicate') duplicates.push(p.slug || p.skillId);
    else failures.push({ slug: p.slug || p.skillId, kind, message: error.message });
  }

  if (failures.length > 0) {
    logger.warn('submitReclassificationReviews: falhas parciais', {
      queued,
      duplicates: duplicates.length,
      failed: failures.length,
    });
  }

  return { queued, duplicates, failures };
}

/**
 * Aprova ou rejeita uma revisão via RPC atômica.
 *
 * Toda a lógica sensível (checagem de admin, guarda de concorrência, escrita
 * no Registry e no audit_log) roda em UMA transação no servidor. O cliente
 * apenas informa a intenção e o motivo.
 */
export async function decideReclassificationReview(input: {
  reviewId: string;
  approve: boolean;
  reason?: string;
}): Promise<ReclassificationReview> {
  const reason = (input.reason ?? '').trim().slice(0, MAX_DECISION_REASON);

  const { data, error } = await supabaseExternal.rpc('decide_skill_reclassification', {
    _review_id: input.reviewId,
    _approve: input.approve,
    _reason: reason,
  });

  if (error) {
    const kind = classifyReviewError(error);
    logger.warn('decideReclassificationReview falhou', { kind, reviewId: input.reviewId });
    throw new ReviewOperationError(REVIEW_ERROR_LABEL[kind], kind);
  }

  // A RPC retorna a linha completa (RETURNS <table>); o supabase-js entrega
  // como objeto único.
  const row = (Array.isArray(data) ? data[0] : data) as unknown as ReviewRow | null;
  const mapped = row ? mapReviewRow(row) : null;
  if (!mapped) {
    throw new ReviewOperationError('Resposta inesperada do servidor.', 'unknown');
  }
  return mapped;
}
