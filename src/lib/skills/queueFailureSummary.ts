import type { QueueItemState, QueueSnapshot } from './llmClassificationQueue';

/**
 * Resumo de falhas de um lote da fila LLM.
 *
 * Por que existe: hoje o painel só mostra "N falharam". Isso é inacionável — a
 * ação do curador é COMPLETAMENTE diferente por causa raiz:
 *
 * - `creditos`  → comprar créditos; retentar agora é garantia de falhar de novo
 * - `taxa`      → esperar e retentar; o próprio lote provavelmente se resolve
 * - `permissao` → pedir acesso ao admin; retentar nunca vai funcionar
 * - `rede`/`servidor` → retentar é razoável
 * - `invalido`/`contrato` → o item é o problema, não o ambiente
 *
 * Um único número agregado esconde exatamente a informação que decide entre
 * "clique em retentar" e "não adianta clicar".
 */
export type FailureCategory =
  | 'creditos'
  | 'taxa'
  | 'permissao'
  | 'rede'
  | 'servidor'
  | 'invalido'
  | 'contrato'
  | 'cancelado'
  | 'desconhecido';

/** Ordem de exibição: o que bloqueia o lote inteiro aparece primeiro. */
export const FAILURE_CATEGORY_ORDER: readonly FailureCategory[] = [
  'creditos',
  'permissao',
  'taxa',
  'servidor',
  'rede',
  'contrato',
  'invalido',
  'cancelado',
  'desconhecido',
] as const;

const CATEGORY_LABEL: Record<FailureCategory, string> = {
  creditos: 'Créditos de IA esgotados',
  permissao: 'Sem permissão',
  taxa: 'Limite de taxa',
  servidor: 'Erro do servidor',
  rede: 'Falha de rede',
  contrato: 'Resposta inválida do modelo',
  invalido: 'Requisição inválida',
  cancelado: 'Cancelado',
  desconhecido: 'Erro desconhecido',
};

/**
 * Orientação exibida ao curador. `retryUseful=false` é o sinal que desabilita o
 * botão "retentar" — insistir em 402/403 só queima tempo do usuário.
 */
const CATEGORY_ADVICE: Record<FailureCategory, { hint: string; retryUseful: boolean }> = {
  creditos: { hint: 'Adicione créditos antes de retentar.', retryUseful: false },
  permissao: { hint: 'Peça acesso a um administrador do workspace.', retryUseful: false },
  taxa: { hint: 'Aguarde alguns instantes e retente o lote.', retryUseful: true },
  servidor: { hint: 'Instabilidade temporária — retentar costuma resolver.', retryUseful: true },
  rede: { hint: 'Verifique a conexão e retente.', retryUseful: true },
  contrato: { hint: 'O modelo devolveu formato inesperado; retente estes itens.', retryUseful: true },
  invalido: { hint: 'Estes itens precisam de correção manual.', retryUseful: false },
  cancelado: { hint: 'Execução interrompida pelo curador.', retryUseful: true },
  desconhecido: { hint: 'Revise o detalhe do erro antes de retentar.', retryUseful: true },
};

/**
 * Normaliza o `errorKind` cru da fila. O motor tipa `kind` como `string` (para
 * não acoplar a fila genérica a este domínio), então tudo que não conhecemos
 * cai em `desconhecido` em vez de virar uma categoria fantasma na UI.
 */
export function toFailureCategory(kind: string | null | undefined): FailureCategory {
  if (typeof kind !== 'string') return 'desconhecido';
  const k = kind.trim().toLowerCase();
  return (FAILURE_CATEGORY_ORDER as readonly string[]).includes(k)
    ? (k as FailureCategory)
    : 'desconhecido';
}

export interface FailureBucket {
  category: FailureCategory;
  label: string;
  hint: string;
  retryUseful: boolean;
  count: number;
  /** IDs afetados — permite retentar exatamente este subconjunto. */
  skillIds: string[];
  /** Primeira mensagem crua observada, para o detalhe expansível. */
  sample: string | null;
}

export interface FailureSummary {
  buckets: FailureBucket[];
  totalFailed: number;
  /** Verdadeiro quando NENHUMA categoria presente se beneficia de retry. */
  retryPointless: boolean;
  /** Subconjunto acionável — alimenta o botão "retentar retentáveis". */
  retryableSkillIds: string[];
}

const VAZIO: FailureSummary = {
  buckets: [],
  totalFailed: 0,
  retryPointless: false,
  retryableSkillIds: [],
};

/**
 * Agrupa os itens em estado `erro` do snapshot por causa raiz.
 *
 * Itens sem `id` utilizável são contados mas não entram em `skillIds`: um retry
 * direcionado sobre um id vazio reprocessaria o alvo errado.
 */
export function summarizeQueueFailures<T>(
  snapshot: QueueSnapshot<T> | null | undefined,
): FailureSummary {
  const items = snapshot?.items;
  if (!Array.isArray(items) || items.length === 0) return VAZIO;

  const mapa = new Map<FailureCategory, FailureBucket>();
  let totalFailed = 0;

  for (const item of items as QueueItemState<T>[]) {
    // Estados terminais NÃO bem-sucedidos. `cancelado` entra aqui porque, do
    // ponto de vista do curador, é trabalho que não foi feito — omiti-lo faria
    // a soma do resumo não bater com o total do lote.
    if (!item || (item.status !== 'falhou' && item.status !== 'cancelado')) continue;
    totalFailed += 1;

    const category =
      item.status === 'cancelado' ? 'cancelado' : toFailureCategory(item.errorKind);
    const advice = CATEGORY_ADVICE[category];
    let bucket = mapa.get(category);
    if (!bucket) {
      bucket = {
        category,
        label: CATEGORY_LABEL[category],
        hint: advice.hint,
        retryUseful: advice.retryUseful,
        count: 0,
        skillIds: [],
        sample: null,
      };
      mapa.set(category, bucket);
    }
    bucket.count += 1;
    if (typeof item.id === 'string' && item.id.length > 0) bucket.skillIds.push(item.id);
    if (bucket.sample === null && typeof item.lastError === 'string' && item.lastError) {
      bucket.sample = item.lastError;
    }
  }

  if (totalFailed === 0) return VAZIO;

  const buckets = FAILURE_CATEGORY_ORDER.map((c) => mapa.get(c)).filter(
    (b): b is FailureBucket => b !== undefined,
  );

  const retryableSkillIds = buckets.filter((b) => b.retryUseful).flatMap((b) => b.skillIds);

  return {
    buckets,
    totalFailed,
    // Só é "inútil retentar" se TODA falha do lote for definitiva. Havendo uma
    // única categoria transitória, o botão continua valendo para aquele subconjunto.
    retryPointless: buckets.every((b) => !b.retryUseful),
    retryableSkillIds,
  };
}

/** Linha compacta para toast/logs: "3 créditos · 2 taxa". */
export function formatFailureSummary(summary: FailureSummary): string {
  if (summary.totalFailed === 0) return '';
  return summary.buckets.map((b) => `${b.count} ${b.label.toLowerCase()}`).join(' · ');
}
