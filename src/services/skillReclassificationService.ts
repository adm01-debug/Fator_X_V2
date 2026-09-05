/**
 * Aplicação do plano de reclassificação de departamento.
 *
 * Separado do módulo puro de propósito: aqui mora o efeito colateral (UPDATE
 * no Registry) e o tratamento de erro por linha. Regras:
 *
 *  - Atualiza uma skill por vez com `.eq('id', ...)` e guarda de estado
 *    (`.eq('department', from)` quando havia valor): se outro curador mudou o
 *    departamento entre o cálculo do plano e o clique, a linha é reportada
 *    como conflito em vez de sobrescrever silenciosamente (optimistic locking
 *    sem coluna de versão).
 *  - Nunca aborta o lote inteiro por causa de uma linha: cada falha é
 *    classificada e devolvida para a UI decidir o retry.
 *  - `curated_by` / `curated_at` são preenchidos por trigger no banco, não
 *    pelo cliente — cliente não é fonte confiável de identidade.
 */
import { supabase } from '@/integrations/supabase/client';
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import {
  proposalFromLlmVerdict,
  type LlmFallbackCandidate,
  type ReclassifyProposal,
} from '@/lib/skills/departmentReclassification';
import {
  QueueWorkerError,
  runBatchQueue,
  type QueueSnapshot,
} from '@/lib/skills/llmClassificationQueue';

export type ReclassifyFailureKind = 'permission' | 'conflict' | 'network' | 'unknown';

export interface ReclassifyFailure {
  skillId: string;
  slug: string;
  kind: ReclassifyFailureKind;
  message: string;
}

export interface ReclassifyOutcome {
  applied: ReclassifyProposal[];
  failures: ReclassifyFailure[];
}

/** Traduz o erro do PostgREST em uma categoria acionável para o curador. */
export function classifyReclassifyError(error: unknown): ReclassifyFailureKind {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const msg = raw.toLowerCase();
  if (msg.includes('row-level security') || msg.includes('permission') || msg.includes('42501')) {
    return 'permission';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) {
    return 'network';
  }
  return 'unknown';
}

/** Aplica as propostas selecionadas, uma a uma, tolerando falhas parciais. */
export async function applyReclassification(
  proposals: readonly ReclassifyProposal[],
): Promise<ReclassifyOutcome> {
  const applied: ReclassifyProposal[] = [];
  const failures: ReclassifyFailure[] = [];

  for (const proposal of proposals) {
    try {
      let query = supabaseExternal
        .from('skill_registry')
        .update({ department: proposal.to })
        .eq('id', proposal.skillId);

      // Guarda de estado: só troca se o departamento continua o que o plano viu.
      query =
        proposal.from === null
          ? query.is('department', null)
          : query.eq('department', proposal.from);

      const { data, error } = await query.select('id');

      if (error) {
        failures.push({
          skillId: proposal.skillId,
          slug: proposal.slug,
          kind: classifyReclassifyError(error),
          message: error.message,
        });
        continue;
      }

      if (!data || data.length === 0) {
        // Zero linhas afetadas = RLS bloqueou OU o estado mudou. Ambos exigem
        // atenção humana, mas 'conflict' é a hipótese mais provável e a menos
        // alarmante; a UI orienta recarregar o plano.
        failures.push({
          skillId: proposal.skillId,
          slug: proposal.slug,
          kind: 'conflict',
          message: 'Nenhuma linha atualizada — o departamento mudou ou você não tem permissão.',
        });
        continue;
      }

      applied.push(proposal);
    } catch (error) {
      failures.push({
        skillId: proposal.skillId,
        slug: proposal.slug,
        kind: classifyReclassifyError(error),
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  if (failures.length > 0) {
    logger.warn('applyReclassification: falhas parciais', {
      applied: applied.length,
      failed: failures.length,
    });
  }

  return { applied, failures };
}

// ============================================================================
// Fallback LLM — classificação das skills que o léxico não resolveu.
// ============================================================================

/**
 * Veredito bruto devolvido pela Edge Function `skill-classify-llm`.
 * `department: null` significa "o modelo respondeu e não soube decidir" — um
 * resultado legítimo, não uma falha.
 */
export interface LlmClassificationVerdict {
  skill_id: string;
  department: string | null;
  confidence: number;
  rationale: string;
}

/** Recupera o status HTTP que o supabase-js esconde dentro de FunctionsHttpError. */
function edgeStatus(error: unknown): number | null {
  const response = (error as { context?: { response?: Response } })?.context?.response;
  return typeof response?.status === 'number' ? response.status : null;
}

/** Lê o `Retry-After` (segundos) da resposta e converte em ms. */
function edgeRetryAfterMs(error: unknown): number | null {
  const response = (error as { context?: { response?: Response } })?.context?.response;
  const header = response?.headers?.get?.('Retry-After');
  if (!header) return null;
  const segundos = Number(header);
  return Number.isFinite(segundos) && segundos >= 0 ? Math.round(segundos * 1000) : null;
}

/**
 * Traduz a falha HTTP em uma instrução de retry para a fila.
 *
 * A regra que importa: 402 (créditos esgotados) NÃO é re-tentável. Insistir
 * nele só queima o lote inteiro contra uma parede — cada item gastaria suas 3
 * tentativas para receber o mesmo 402. 429 e 5xx são transitórios; 4xx de
 * validação são culpa do payload e não melhoram com repetição.
 */
function toQueueError(error: unknown, fallbackMessage: string): QueueWorkerError {
  const status = edgeStatus(error);
  const mensagem = error instanceof Error ? error.message : fallbackMessage;

  if (status === 402) {
    return new QueueWorkerError('Créditos de IA esgotados.', false, null, 'creditos');
  }
  if (status === 401 || status === 403) {
    return new QueueWorkerError('Sem permissão para classificar.', false, null, 'permissao');
  }
  if (status === 429) {
    return new QueueWorkerError('Limite de taxa atingido.', true, edgeRetryAfterMs(error), 'taxa');
  }
  if (status !== null && status >= 400 && status < 500) {
    return new QueueWorkerError(mensagem, false, null, 'invalido');
  }
  // Sem status = falha de rede antes da resposta. Transitório por definição.
  return new QueueWorkerError(mensagem, true, null, status === null ? 'rede' : 'servidor');
}

/**
 * Classifica UMA skill via LLM. Projetada para ser o `worker` da fila:
 * lança `QueueWorkerError` (que carrega a política de retry) e resolve com o
 * veredito cru, deixando a conversão em proposta para o chamador.
 */
export async function classifySkillWithLlm(
  candidate: LlmFallbackCandidate,
): Promise<LlmClassificationVerdict> {
  const { data, error } = await supabase.functions.invoke('skill-classify-llm', {
    body: {
      skill_id: candidate.skillId,
      name: candidate.name,
      description: candidate.description,
      tags: candidate.tags,
      current_department: candidate.from,
    },
  });

  if (error) throw toQueueError(error, 'Falha ao classificar com IA.');

  const payload = data as Partial<LlmClassificationVerdict> | null;
  if (!payload || typeof payload !== 'object') {
    // Resposta 2xx com corpo inesperado: re-tentar pode resolver um blip, mas
    // se for contrato quebrado as 3 tentativas terminam rápido e visivelmente.
    throw new QueueWorkerError('Resposta vazia da classificação.', true, null, 'contrato');
  }

  return {
    skill_id: typeof payload.skill_id === 'string' ? payload.skill_id : candidate.skillId,
    department: typeof payload.department === 'string' ? payload.department : null,
    confidence: typeof payload.confidence === 'number' ? payload.confidence : 0,
    rationale: typeof payload.rationale === 'string' ? payload.rationale : '',
  };
}

/**
 * Executa o fallback LLM sobre todos os candidatos e devolve as propostas
 * revisáveis. Não aplica nada no banco — curadoria humana continua obrigatória.
 */
export async function runLlmFallbackQueue(options: {
  candidates: readonly LlmFallbackCandidate[];
  signal?: AbortSignal;
  onSnapshot?: (snapshot: QueueSnapshot<LlmClassificationVerdict>) => void;
  concurrency?: number;
  minIntervalMs?: number;
}): Promise<{
  proposals: ReclassifyProposal[];
  snapshot: QueueSnapshot<LlmClassificationVerdict>;
}> {
  const porId = new Map(options.candidates.map((c) => [c.skillId, c]));

  const snapshot = await runBatchQueue<LlmFallbackCandidate, LlmClassificationVerdict>({
    items: options.candidates.map((c) => ({ id: c.skillId, input: c })),
    worker: (input) => classifySkillWithLlm(input),
    concurrency: options.concurrency,
    minIntervalMs: options.minIntervalMs,
    signal: options.signal,
    onSnapshot: options.onSnapshot,
  });

  const proposals: ReclassifyProposal[] = [];
  for (const item of snapshot.items) {
    if (item.status !== 'concluido' || !item.result) continue;
    const candidate = porId.get(item.id);
    if (!candidate) continue;
    const proposta = proposalFromLlmVerdict(candidate, item.result);
    if (proposta) proposals.push(proposta);
  }

  logger.info('runLlmFallbackQueue concluída', {
    candidatos: options.candidates.length,
    propostas: proposals.length,
  });

  return { proposals, snapshot };
}
