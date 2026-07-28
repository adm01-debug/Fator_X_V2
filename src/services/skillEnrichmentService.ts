/**
 * Enriquecimento de descrições — camada de efeito colateral.
 *
 * O módulo puro (`@/lib/skills/descriptionEnrichment`) decide QUEM é elegível e
 * SE o texto gerado presta. Aqui mora o que toca o mundo: buscar candidatas no
 * Registry, chamar a Edge Function em lote controlado e gravar.
 *
 * Duas garantias que precisam ficar explícitas:
 *
 *  - **A gravação passa pela RPC `apply_skill_description`, nunca por UPDATE
 *    direto.** A RPC revalida confiança, tamanho e — o que importa — recusa
 *    sobrescrever descrição de origem humana, tudo dentro da transação. Um
 *    UPDATE do cliente faria a checagem fora dela, e duas rodadas simultâneas
 *    poderiam apagar a curadoria de alguém entre o SELECT e o UPDATE.
 *  - **Só grava com confiança alta.** O resto vira sugestão para revisão. O
 *    limiar existe nos dois lados: aqui para não gastar a ida ao servidor, lá
 *    porque o servidor é a autoridade.
 */
import { supabase } from '@/integrations/supabase/client';
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import {
  MIN_ENRICH_CONFIDENCE,
  hasEnoughSignal,
  isDescriptionSource,
  proposalFromVerdict,
  selectEligible,
  type DescriptionProposal,
  type DescriptionVerdict,
  type EnrichCandidate,
  type RejectedProposal,
} from '@/lib/skills/descriptionEnrichment';
import {
  QueueWorkerError,
  runBatchQueue,
  type QueueSnapshot,
} from '@/lib/skills/llmClassificationQueue';

// ============================================================================
// Leitura de candidatas
// ============================================================================

/**
 * Busca skills importadas cuja descrição está vazia.
 *
 * O filtro fino (placeholders como "TODO", procedência humana) fica no módulo
 * puro: o SQL cobre o caso dominante — `description = ''` — e o resto é regra
 * de negócio que muda mais rápido que schema e merece ser testável sem banco.
 */
export async function fetchEnrichCandidates(limit = 200): Promise<EnrichCandidate[]> {
  const { data, error } = await supabaseExternal
    .from('skill_registry')
    .select(
      'id, name, slug, description, category, department, tags, source_repo, source_url, description_source',
    )
    .or('source_repo.not.is.null,source_url.not.is.null')
    .order('install_count', { ascending: false })
    .limit(Math.max(1, Math.min(1000, limit)));

  if (error) {
    logger.error('fetchEnrichCandidates falhou', { message: error.message });
    throw new Error(`Falha ao carregar skills: ${error.message}`);
  }

  const linhas = data ?? [];
  return selectEligible(
    linhas.map((row) => ({
      skillId: row.id,
      name: row.name ?? '',
      slug: row.slug ?? '',
      description: row.description ?? '',
      category: row.category ?? '',
      department: row.department ?? null,
      tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === 'string') : [],
      sourceRepo: row.source_repo ?? null,
      sourceUrl: row.source_url ?? null,
      descriptionSource: isDescriptionSource(row.description_source) ? row.description_source : null,
    })),
  );
}

// ============================================================================
// Chamada da Edge Function
// ============================================================================

function edgeStatus(error: unknown): number | null {
  const response = (error as { context?: { response?: Response } })?.context?.response;
  return typeof response?.status === 'number' ? response.status : null;
}

function edgeRetryAfterMs(error: unknown): number | null {
  const response = (error as { context?: { response?: Response } })?.context?.response;
  const header = response?.headers?.get?.('Retry-After');
  if (!header) return null;
  const segundos = Number(header);
  return Number.isFinite(segundos) && segundos >= 0 ? Math.round(segundos * 1000) : null;
}

/**
 * Traduz a falha HTTP em política de retry para a fila.
 *
 * Mesma regra do fallback de classificação, e pelo mesmo motivo: 402 (créditos)
 * não é transitório — insistir só faz cada item gastar suas tentativas contra a
 * mesma parede antes de o lote inteiro falhar.
 */
export function toEnrichQueueError(error: unknown, fallback: string): QueueWorkerError {
  const status = edgeStatus(error);
  const mensagem = error instanceof Error ? error.message : fallback;

  if (status === 402) return new QueueWorkerError('Créditos de IA esgotados.', false, null, 'creditos');
  if (status === 401 || status === 403) {
    return new QueueWorkerError('Sem permissão para gerar descrições.', false, null, 'permissao');
  }
  if (status === 429) {
    return new QueueWorkerError('Limite de taxa atingido.', true, edgeRetryAfterMs(error), 'taxa');
  }
  if (status !== null && status >= 400 && status < 500) {
    return new QueueWorkerError(mensagem, false, null, 'invalido');
  }
  return new QueueWorkerError(mensagem, true, null, status === null ? 'rede' : 'servidor');
}

/** Gera a descrição de UMA skill. Projetada para ser o `worker` da fila. */
export async function describeSkillWithLlm(
  candidate: EnrichCandidate,
): Promise<DescriptionVerdict> {
  const { data, error } = await supabase.functions.invoke('skill-describe-llm', {
    body: {
      skill_id: candidate.skillId,
      name: candidate.name,
      slug: candidate.slug,
      category: candidate.category,
      department: candidate.department,
      tags: candidate.tags,
      source_repo: candidate.sourceRepo ?? '',
      readme_excerpt: '',
    },
  });

  if (error) throw toEnrichQueueError(error, 'Falha ao gerar descrição.');

  const payload = data as Partial<DescriptionVerdict> | null;
  if (!payload || typeof payload !== 'object') {
    throw new QueueWorkerError('Resposta vazia da geração.', true, null, 'contrato');
  }

  return {
    skill_id: typeof payload.skill_id === 'string' ? payload.skill_id : candidate.skillId,
    description: typeof payload.description === 'string' ? payload.description : '',
    confidence: typeof payload.confidence === 'number' ? payload.confidence : 0,
    model: typeof payload.model === 'string' ? payload.model : '',
    sufficient: payload.sufficient === true,
    rationale: typeof payload.rationale === 'string' ? payload.rationale : '',
  };
}

export interface EnrichQueueResult {
  proposals: DescriptionProposal[];
  rejections: RejectedProposal[];
  /** Descartadas antes da chamada por falta de sinal — não custaram nada. */
  skipped: RejectedProposal[];
  snapshot: QueueSnapshot<DescriptionVerdict>;
}

/**
 * Roda a geração sobre os candidatos. NÃO grava nada — quem decide aplicar é o
 * curador (ou `applyDescriptions`, com o corte de confiança alta).
 */
export async function runDescriptionEnrichQueue(options: {
  candidates: readonly EnrichCandidate[];
  signal?: AbortSignal;
  onSnapshot?: (snapshot: QueueSnapshot<DescriptionVerdict>) => void;
  concurrency?: number;
  minIntervalMs?: number;
}): Promise<EnrichQueueResult> {
  // Filtra o que nem vale a chamada: só o nome não descreve coisa alguma, e em
  // um lote de harvest esse é o grosso do custo.
  const comSinal: EnrichCandidate[] = [];
  const skipped: RejectedProposal[] = [];
  for (const c of options.candidates) {
    if (hasEnoughSignal(c)) comSinal.push(c);
    else {
      skipped.push({
        skillId: c.skillId,
        slug: c.slug || c.skillId,
        reason: 'insuficiente',
        confidence: 0,
      });
    }
  }

  const porId = new Map(comSinal.map((c) => [c.skillId, c]));

  const snapshot = await runBatchQueue<EnrichCandidate, DescriptionVerdict>({
    items: comSinal.map((c) => ({ id: c.skillId, input: c })),
    worker: (input) => describeSkillWithLlm(input),
    concurrency: options.concurrency,
    minIntervalMs: options.minIntervalMs,
    signal: options.signal,
    onSnapshot: options.onSnapshot,
  });

  const proposals: DescriptionProposal[] = [];
  const rejections: RejectedProposal[] = [];
  for (const item of snapshot.items) {
    if (item.status !== 'concluido' || !item.result) continue;
    const candidate = porId.get(item.id);
    if (!candidate) continue;
    const { proposal, rejection } = proposalFromVerdict(candidate, item.result);
    if (proposal) proposals.push(proposal);
    if (rejection) rejections.push(rejection);
  }

  logger.info('runDescriptionEnrichQueue concluída', {
    candidatos: options.candidates.length,
    semSinal: skipped.length,
    propostas: proposals.length,
    recusadas: rejections.length,
  });

  return { proposals, rejections, skipped, snapshot };
}

// ============================================================================
// Gravação
// ============================================================================

export type ApplyFailureKind = 'permission' | 'confidence' | 'conflict' | 'network' | 'unknown';

export interface ApplyDescriptionFailure {
  skillId: string;
  slug: string;
  kind: ApplyFailureKind;
  message: string;
}

export interface ApplyDescriptionOutcome {
  applied: DescriptionProposal[];
  failures: ApplyDescriptionFailure[];
}

/** Traduz o erro da RPC em categoria acionável para o curador. */
export function classifyApplyError(error: unknown): ApplyFailureKind {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const msg = raw.toLowerCase();
  if (msg.includes('row-level security') || msg.includes('permission') || msg.includes('42501')) {
    return 'permission';
  }
  // A RPC recusa explicitamente quando a confiança não alcança o piso.
  if (msg.includes('confian') || msg.includes('confidence')) return 'confidence';
  // Descrição já preenchida por outra pessoa entre o plano e o clique.
  if (msg.includes('já possui') || msg.includes('humana') || msg.includes('nao_elegivel')) {
    return 'conflict';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) {
    return 'network';
  }
  return 'unknown';
}

/**
 * Grava as descrições aprovadas, uma a uma, tolerando falhas parciais.
 *
 * O corte por confiança é reaplicado aqui mesmo que a UI já filtre: esta função
 * é chamável por outros caminhos, e "gravou uma descrição inventada no
 * catálogo" não tem desfazer barato.
 */
export async function applyDescriptions(
  proposals: readonly DescriptionProposal[],
  minConfidence = MIN_ENRICH_CONFIDENCE,
): Promise<ApplyDescriptionOutcome> {
  const applied: DescriptionProposal[] = [];
  const failures: ApplyDescriptionFailure[] = [];

  for (const proposal of proposals) {
    if (proposal.confidence < minConfidence) {
      failures.push({
        skillId: proposal.skillId,
        slug: proposal.slug,
        kind: 'confidence',
        message: `Confiança ${proposal.confidence.toFixed(2)} abaixo do mínimo ${minConfidence.toFixed(2)}.`,
      });
      continue;
    }

    try {
      const { data, error } = await supabaseExternal.rpc('apply_skill_description', {
        _skill_id: proposal.skillId,
        _description: proposal.description,
        _confidence: proposal.confidence,
        _model: proposal.model,
        _min_confidence: minConfidence,
      });

      if (error) {
        failures.push({
          skillId: proposal.skillId,
          slug: proposal.slug,
          kind: classifyApplyError(error),
          message: error.message,
        });
        continue;
      }

      // A RPC devolve a linha atualizada. Vazio = a guarda de elegibilidade
      // recusou (descrição preenchida no meio do caminho) ou RLS bloqueou.
      if (!data) {
        failures.push({
          skillId: proposal.skillId,
          slug: proposal.slug,
          kind: 'conflict',
          message: 'Nenhuma linha atualizada — a descrição mudou ou você não tem permissão.',
        });
        continue;
      }

      applied.push(proposal);
    } catch (error) {
      failures.push({
        skillId: proposal.skillId,
        slug: proposal.slug,
        kind: classifyApplyError(error),
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  if (failures.length > 0) {
    logger.warn('applyDescriptions: falhas parciais', {
      aplicadas: applied.length,
      falhas: failures.length,
    });
  }

  return { applied, failures };
}
