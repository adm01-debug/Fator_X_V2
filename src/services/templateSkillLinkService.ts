/**
 * Template Skill Link Service — persistência dos vínculos entre os templates
 * de agentes (`src/data/agentTemplates.ts`) e as skills reais do Registry.
 *
 * Por que persistir? O cálculo em `linkSkillsToTemplate` é determinístico, mas
 * percorre TODO o registry para cada template. Persistir o resultado permite
 * que a galeria e o wizard leiam os vínculos com uma única consulta indexada,
 * além de permitir curadoria manual (origin = 'manual') por cima do automático.
 *
 * Escrita exige admin de workspace (política RLS da tabela).
 */
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { AGENT_TEMPLATES } from '@/data/agentTemplates';
import { linkSkillsToTemplate } from './templateSkillRegistry';
import type { AgentSkillDefinition } from './skillsRegistryService';
import { logger } from '@/lib/logger';

/** Quantidade máxima de skills vinculadas por template. */
export const MAX_LINKS_PER_TEMPLATE = 6;

export interface TemplateSkillLink {
  id: string;
  template_id: string;
  skill_id: string;
  score: number;
  reason: string;
  is_strong_match: boolean;
  department_match: boolean;
  matched_keywords: string[];
  origin: 'auto' | 'manual';
  /** Autor da curadoria manual (NULL em vínculos automáticos). */
  created_by?: string | null;
  /** Último admin que alterou a curadoria (NULL em vínculos automáticos). */
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Vínculo já resolvido com a skill correspondente, pronto para a UI. */
export interface ResolvedTemplateSkillLink extends TemplateSkillLink {
  skill: AgentSkillDefinition | null;
}


/**
 * Lê os vínculos persistidos de um template, do mais forte para o mais fraco.
 */
export async function fetchTemplateSkillLinks(
  templateId: string,
  limit = MAX_LINKS_PER_TEMPLATE,
): Promise<ResolvedTemplateSkillLink[]> {
  const { data, error } = await supabaseExternal
    .from('template_skill_links')
    .select('*, skill:skill_registry(*)')
    .eq('template_id', templateId)
    .is('deleted_at', null)
    .order('is_strong_match', { ascending: false })
    .order('score', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('fetchTemplateSkillLinks failed', { templateId, error: error.message });
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const { skill, ...link } = row as unknown as TemplateSkillLink & {
      skill: AgentSkillDefinition | null;
    };
    return { ...link, skill: skill ?? null };
  });
}

/** Contagem de vínculos por template — usado nos badges da galeria. */
export async function fetchTemplateLinkCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabaseExternal
    .from('template_skill_links')
    .select('template_id')
    .is('deleted_at', null);

  if (error) {
    logger.error('fetchTemplateLinkCounts failed', { error: error.message });
    throw new Error(error.message);
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = (row as { template_id: string }).template_id;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Forma normalizada consumida pela UI, independente da origem do vínculo. */
export interface DisplayTemplateSkillLink {
  skillId: string;
  skillName: string;
  reason: string;
  isStrongMatch: boolean;
  origin: 'auto' | 'manual';
  /** Trilha de auditoria — presente apenas em curadoria manual. */
  curatedBy?: string | null;
  curatedAt?: string | null;
}


/**
 * Mescla vínculos persistidos com o cálculo local (fallback), garantindo:
 * 1. Curadoria manual sempre no topo e nunca descartada pelo limite;
 * 2. Deduplicação por `skillId` (manual vence auto);
 * 3. Ordenação estável: manual → match forte → score/ordem de entrada.
 *
 * Função pura: é ela que os cenários de simulação exercitam.
 */
export function mergeDisplayLinks(
  persisted: DisplayTemplateSkillLink[],
  computedFallback: DisplayTemplateSkillLink[],
  limit = MAX_LINKS_PER_TEMPLATE,
): DisplayTemplateSkillLink[] {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : MAX_LINKS_PER_TEMPLATE;

  // Só usamos o fallback quando não há NADA persistido — evita misturar um
  // recálculo local desatualizado com a curadoria salva pelo admin.
  const source = persisted.length > 0 ? persisted : computedFallback;

  const seen = new Set<string>();
  const manual: DisplayTemplateSkillLink[] = [];
  const auto: DisplayTemplateSkillLink[] = [];

  for (const link of source) {
    if (!link?.skillId || seen.has(link.skillId)) continue;
    seen.add(link.skillId);
    (link.origin === 'manual' ? manual : auto).push(link);
  }

  const sortedAuto = [...auto].sort(
    (a, b) => Number(b.isStrongMatch) - Number(a.isStrongMatch),
  );

  // Manuais nunca são cortados: o limite se aplica ao restante.
  return [...manual, ...sortedAuto.slice(0, Math.max(0, safeLimit - manual.length))];
}

/** Converte um vínculo persistido resolvido para a forma de exibição. */
export function toDisplayLink(link: ResolvedTemplateSkillLink): DisplayTemplateSkillLink | null {
  if (!link.skill) return null;
  const isManual = link.origin === 'manual';
  return {
    skillId: link.skill.id,
    skillName: link.skill.name,
    reason: link.reason,
    isStrongMatch: link.is_strong_match,
    origin: link.origin,
    // Auditoria só faz sentido na curadoria humana; o gatilho no banco
    // garante NULL para vínculos automáticos, mas normalizamos aqui também.
    curatedBy: isManual ? (link.updated_by ?? link.created_by ?? null) : null,
    curatedAt: isManual ? (link.updated_at ?? link.created_at ?? null) : null,
  };
}

/**
 * Renderiza a trilha de auditoria de um vínculo em PT-BR.
 * Retorna `null` quando não há curadoria manual a atribuir — a UI então não
 * exibe nada, em vez de mostrar um rótulo vazio ou "desconhecido".
 *
 * Função pura: exercitada pelos cenários de simulação.
 */
export function formatCurationTrail(
  link: Pick<DisplayTemplateSkillLink, 'origin' | 'curatedBy' | 'curatedAt'>,
  currentUserId?: string | null,
): string | null {
  if (link.origin !== 'manual') return null;
  if (!link.curatedBy && !link.curatedAt) return null;

  const autor = link.curatedBy
    ? link.curatedBy === currentUserId
      ? 'você'
      : `admin ${link.curatedBy.slice(0, 8)}`
    : null;

  let quando: string | null = null;
  if (link.curatedAt) {
    const data = new Date(link.curatedAt);
    if (!Number.isNaN(data.getTime())) {
      quando = data.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
  }

  if (autor && quando) return `Curado por ${autor} em ${quando}`;
  if (autor) return `Curado por ${autor}`;
  if (quando) return `Curado em ${quando}`;
  return null;
}


/**
 * Cria (ou promove) um vínculo manual entre um template e uma skill.
 * Requer admin de workspace — a RLS rejeita os demais.
 */
export async function addManualTemplateSkillLink(
  templateId: string,
  skillId: string,
  reason = 'Curadoria manual',
): Promise<void> {
  if (!templateId || !skillId) throw new Error('templateId e skillId são obrigatórios');

  const { error } = await supabaseExternal.from('template_skill_links').upsert(
    {
      template_id: templateId,
      skill_id: skillId,
      score: 1,
      reason,
      is_strong_match: true,
      department_match: false,
      matched_keywords: [],
      origin: 'manual',
      // Re-vincular uma skill previamente removida "ressuscita" a linha —
      // o UNIQUE(template_id, skill_id) impede uma segunda linha ativa.
      deleted_at: null,
      deleted_by: null,
    },
    { onConflict: 'template_id,skill_id' },
  );

  if (error) {
    logger.error('addManualTemplateSkillLink failed', { templateId, skillId, error: error.message });
    throw new Error(error.message);
  }
}

/**
 * Remove um vínculo de forma REVERSÍVEL (soft delete).
 *
 * Por que não apagar? A remoção também é uma decisão de curadoria: preservá-la
 * permite auditar quem desvinculou o quê e oferecer "desfazer" no feed. As
 * leituras filtram `deleted_at IS NULL`, então o efeito prático é o mesmo.
 */
export async function removeTemplateSkillLink(
  templateId: string,
  skillId: string,
): Promise<void> {
  if (!templateId?.trim() || !skillId?.trim()) {
    // Sem a guarda, ids vazios viram um filtro `= ''` que não casa com nada:
    // a mutação "sucede" silenciosamente e a UI mente ao curador.
    throw new Error('templateId e skillId são obrigatórios');
  }

  const { error } = await supabaseExternal
    .from('template_skill_links')
    .update({ deleted_at: new Date().toISOString() })
    .eq('template_id', templateId)
    .eq('skill_id', skillId)
    .is('deleted_at', null);

  if (error) {
    logger.error('removeTemplateSkillLink failed', { templateId, skillId, error: error.message });
    throw new Error(error.message);
  }
}

/**
 * Normaliza uma lista de ids de skills: remove vazios, espaços e duplicatas,
 * preservando a ordem de entrada (determinismo nos testes e nos logs).
 *
 * Função pura: exercitada pelos cenários de simulação.
 */
export function sanitizeSkillIds(skillIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of skillIds ?? []) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Desfaz uma remoção reversível, reativando o vínculo. */
export async function restoreTemplateSkillLink(
  templateId: string,
  skillId: string,
): Promise<void> {
  await bulkRestoreTemplateSkillLinks(templateId, [skillId]);
}

/**
 * Reativa VÁRIOS vínculos de um template num único UPDATE.
 *
 * Por que em lote? Restaurar N remoções com N round-trips deixa a curadoria em
 * estado parcial se um deles falhar. Um único `IN (...)` é atômico no servidor.
 *
 * @returns quantidade de ids efetivamente enviados (0 = no-op sem I/O).
 */
export async function bulkRestoreTemplateSkillLinks(
  templateId: string,
  skillIds: readonly string[],
): Promise<number> {
  if (!templateId?.trim()) throw new Error('templateId é obrigatório');

  const ids = sanitizeSkillIds(skillIds);
  if (ids.length === 0) return 0;

  const { error } = await supabaseExternal
    .from('template_skill_links')
    .update({ deleted_at: null, deleted_by: null })
    .eq('template_id', templateId)
    .in('skill_id', ids)
    .not('deleted_at', 'is', null);

  if (error) {
    logger.error('bulkRestoreTemplateSkillLinks failed', {
      templateId,
      count: ids.length,
      error: error.message,
    });
    throw new Error(error.message);
  }

  return ids.length;
}

/**
 * Agrupa as remoções visíveis do feed por template, deduplicando skills.
 *
 * Função pura: a UI precisa de um plano determinístico ANTES de disparar I/O,
 * para poder contar quantos vínculos serão restaurados e em quantos lotes.
 * A ordem de templates segue a primeira ocorrência no feed (mais recente).
 */
export function groupRemovalsByTemplate(
  days: readonly CurationFeedDay[],
): Array<{ templateId: string; skillIds: string[] }> {
  const porTemplate = new Map<string, string[]>();

  for (const dia of days ?? []) {
    for (const entrada of dia?.entries ?? []) {
      if (entrada.kind !== 'unlinked') continue;
      const templateId = entrada.templateId?.trim();
      const skillId = entrada.skillId?.trim();
      if (!templateId || !skillId) continue;

      const atual = porTemplate.get(templateId);
      if (atual) atual.push(skillId);
      else porTemplate.set(templateId, [skillId]);
    }
  }

  return [...porTemplate.entries()].map(([templateId, skillIds]) => ({
    templateId,
    skillIds: sanitizeSkillIds(skillIds),
  }));
}

/**
 * A partir de quantos vínculos a restauração em massa pede confirmação.
 *
 * Abaixo disso o diálogo é ruído: o custo de desfazer é baixo e confirmar
 * sempre ensina o curador a aceitar sem ler.
 */
export const BULK_RESTORE_CONFIRM_THRESHOLD = 5;

/** Função pura: decide se a restauração em massa exige confirmação. */
export function shouldConfirmBulkRestore(
  count: number,
  threshold: number = BULK_RESTORE_CONFIRM_THRESHOLD,
): boolean {
  if (!Number.isFinite(count) || count <= 0) return false;
  return count >= threshold;
}

/** Falha de um lote individual dentro de uma restauração em massa. */
export interface BulkRestoreFailure {
  templateId: string;
  /** Nome amigável do template (cai para o id quando desconhecido). */
  templateName: string;
  /** Quantos vínculos ficaram sem restaurar neste lote. */
  skillCount: number;
  /** Mensagem crua do backend — o curador precisa distinguir RLS de rede. */
  message: string;
  /** Natureza classificada da falha (deriva de `message`). */
  kind: RestoreFailureKind;
  /** Instante ISO em que a falha ocorreu — base para TTL e ordenação. */
  failedAt: string;
}

/**
 * Natureza de uma falha de restauração — orienta a ação do curador.
 *
 * `permission`: RLS/autorização negou; retry não resolve sem mudar de papel.
 * `network`: falha transitória; retry tende a funcionar.
 * `unknown`: não classificável; mostrar mensagem crua.
 */
export type RestoreFailureKind = 'permission' | 'network' | 'unknown';

/** Função pura: classifica a mensagem de erro do backend. */
export function classifyRestoreFailure(message: string): RestoreFailureKind {
  const m = (message ?? '').toLowerCase();
  if (!m) return 'unknown';
  if (
    m.includes('rls') ||
    m.includes('row-level') ||
    m.includes('row level') ||
    m.includes('permission') ||
    m.includes('permissão') ||
    m.includes('não autorizado') ||
    m.includes('unauthorized') ||
    m.includes('forbidden') ||
    m.includes('policy') ||
    m.includes('jwt')
  ) {
    return 'permission';
  }
  if (
    m.includes('network') ||
    m.includes('fetch') ||
    m.includes('timeout') ||
    m.includes('timed out') ||
    m.includes('econn') ||
    m.includes('offline') ||
    m.includes('temporarily')
  ) {
    return 'network';
  }
  return 'unknown';
}

/** Rótulo curto em PT-BR para cada natureza de falha. */
export const RESTORE_FAILURE_LABEL: Record<RestoreFailureKind, string> = {
  permission: 'Sem permissão',
  network: 'Falha de rede',
  unknown: 'Erro',
};

/** Só faz sentido oferecer retry automático em falhas transitórias. */
export function isRetriableFailure(kind: RestoreFailureKind): boolean {
  return kind !== 'permission';
}

/** Resultado agregado de uma restauração em massa multi-template. */
export interface BulkRestoreAllResult {
  /** Vínculos efetivamente enviados para restauração. */
  restored: number;
  /** Templates cujo lote falhou (a restauração é parcial, não atômica entre templates). */
  failedTemplates: string[];
  /** Detalhe por falha: motivo e volume, para relatar sem reconsultar o banco. */
  failures: BulkRestoreFailure[];
}

/**
 * Extrai o nome amigável de cada template a partir do próprio feed.
 *
 * Função pura: evita um join extra só para rotular erro. O feed já carrega
 * `templateName`; quando ausente, o id é o rótulo honesto.
 */
export function buildTemplateNameMap(
  days: readonly CurationFeedDay[],
): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const dia of days ?? []) {
    for (const entrada of dia?.entries ?? []) {
      const id = entrada.templateId?.trim();
      if (!id || mapa.has(id)) continue;
      mapa.set(id, entrada.templateName?.trim() || id);
    }
  }
  return mapa;
}

/**
 * Filtra o plano de restauração para um subconjunto de templates.
 *
 * Função pura: o retry de uma restauração parcial precisa reprocessar
 * exatamente os templates que falharam, sem tocar nos que já deram certo
 * (reenviar um UPSERT idempotente é seguro, mas polui a auditoria).
 */
export function filterRemovalPlan(
  days: readonly CurationFeedDay[],
  templateIds: readonly string[],
): Array<{ templateId: string; skillIds: string[] }> {
  const alvo = new Set(
    (templateIds ?? []).map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean),
  );
  if (alvo.size === 0) return [];
  return groupRemovalsByTemplate(days).filter((g) => alvo.has(g.templateId));
}

/**
 * Política de reenvio automático para falhas transitórias.
 *
 * Só falhas classificadas como `network` são reenviadas: RLS não muda entre
 * tentativas e `unknown` pode ter efeito colateral desconhecido no servidor.
 * O UPSERT de restauração é idempotente, então reenviar é seguro.
 */
export const RESTORE_MAX_ATTEMPTS = 3;
export const RESTORE_BACKOFF_BASE_MS = 200;

/** Função pura: atraso exponencial (200ms, 400ms, 800ms...) da tentativa n. */
export function restoreBackoffDelay(
  attempt: number,
  baseMs: number = RESTORE_BACKOFF_BASE_MS,
): number {
  const n = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 1;
  return baseMs * 2 ** (n - 1);
}

const dormir = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/** Resumo agregado por natureza de falha — evita recontagem na UI. */
export function summarizeRestoreFailures(
  failures: readonly BulkRestoreFailure[],
): Record<RestoreFailureKind, number> {
  const resumo: Record<RestoreFailureKind, number> = {
    permission: 0,
    network: 0,
    unknown: 0,
  };
  for (const falha of failures ?? []) {
    if (!falha) continue;
    resumo[falha.kind] = (resumo[falha.kind] ?? 0) + (falha.skillCount || 0);
  }
  return resumo;
}

/** Executa um plano já calculado, tolerando falha por template. */
async function runRestorePlan(
  plano: ReadonlyArray<{ templateId: string; skillIds: string[] }>,
  nomes: ReadonlyMap<string, string> = new Map(),
  maxAttempts: number = RESTORE_MAX_ATTEMPTS,
): Promise<BulkRestoreAllResult> {
  let restored = 0;
  const failures: BulkRestoreFailure[] = [];

  for (const grupo of plano) {
    if (grupo.skillIds.length === 0) continue;

    let ultimaMensagem = '';
    let ultimoTipo: RestoreFailureKind = 'unknown';
    let sucesso = false;

    for (let tentativa = 1; tentativa <= Math.max(1, maxAttempts); tentativa++) {
      try {
        restored += await bulkRestoreTemplateSkillLinks(grupo.templateId, grupo.skillIds);
        sucesso = true;
        break;
      } catch (error) {
        ultimaMensagem = error instanceof Error ? error.message : String(error);
        ultimoTipo = classifyRestoreFailure(ultimaMensagem);
        const podeReenviar = ultimoTipo === 'network' && tentativa < Math.max(1, maxAttempts);
        logger.error('bulkRestoreAllRemovals attempt failed', {
          templateId: grupo.templateId,
          attempt: tentativa,
          willRetry: podeReenviar,
          error: ultimaMensagem,
        });
        if (!podeReenviar) break;
        await dormir(restoreBackoffDelay(tentativa));
      }
    }

    if (!sucesso) {
      failures.push({
        templateId: grupo.templateId,
        templateName: nomes.get(grupo.templateId) ?? grupo.templateId,
        skillCount: grupo.skillIds.length,
        message: ultimaMensagem,
        failedAt: new Date().toISOString(),
        kind: ultimoTipo,
      });
    }
  }

  return { restored, failedTemplates: failures.map((f) => f.templateId), failures };
}

/**
 * Escapa um campo para CSV RFC 4180.
 *
 * Mensagens de erro do Postgres contêm vírgulas, aspas e quebras de linha —
 * sem escapar, o relatório abre desalinhado em qualquer planilha.
 */
function csvField(value: string | number): string {
  const texto = String(value ?? '');
  return `"${texto.replace(/"/g, '""')}"`;
}

/**
 * Gera o CSV do relatório de restaurações parciais.
 *
 * Função pura: a UI só precisa disparar o download. Prefixo BOM para o Excel
 * em PT-BR interpretar acentuação corretamente.
 */
export function buildRestoreFailuresCsv(failures: readonly BulkRestoreFailure[]): string {
  const cabecalho = [
    'template_id',
    'template_nome',
    'vinculos_pendentes',
    'natureza',
    'mensagem',
    'ocorrido_em',
  ];
  const linhas = (failures ?? [])
    .filter(Boolean)
    .map((f) =>
      [
        csvField(f.templateId),
        csvField(f.templateName),
        csvField(f.skillCount),
        csvField(RESTORE_FAILURE_LABEL[f.kind] ?? f.kind),
        csvField(f.message),
        csvField(f.failedAt ?? ''),
      ].join(','),
    );
  return `\uFEFF${[cabecalho.map(csvField).join(','), ...linhas].join('\r\n')}\r\n`;
}

/** Nome de arquivo determinístico por data — facilita anexar em chamados. */
export function buildRestoreFailuresFilename(date: Date = new Date()): string {
  const iso = Number.isNaN(date.getTime()) ? new Date() : date;
  return `restauracoes-parciais-${iso.toISOString().slice(0, 10)}.csv`;
}

/** Chave de sessão onde as falhas parciais sobrevivem a um F5. */
export const RESTORE_FAILURES_STORAGE_KEY = 'nexus:curation:restore-failures';

const FAILURE_KINDS: readonly RestoreFailureKind[] = ['permission', 'network', 'unknown'];

/**
 * Função pura: valida e normaliza falhas vindas de storage.
 *
 * O conteúdo de `sessionStorage` é entrada não confiável (outra aba, versão
 * anterior do app, edição manual). Descartamos silenciosamente o que não
 * satisfaz o contrato em vez de deixar a UI renderizar `undefined`.
 */
/**
 * Janela de validade das pendências persistidas.
 *
 * Uma falha de ontem não descreve mais o estado do banco: o curador pode ter
 * restaurado por outro caminho. Expirar evita agir sobre informação morta.
 */
export const RESTORE_FAILURES_TTL_MS = 24 * 60 * 60 * 1000;

/** Normaliza `failedAt` vindo de storage; datas inválidas viram "agora". */
function normalizeFailedAt(valor: unknown): string {
  if (typeof valor === 'string') {
    const data = new Date(valor);
    if (!Number.isNaN(data.getTime())) return data.toISOString();
  }
  return new Date().toISOString();
}

/** Função pura: descarta falhas mais antigas que o TTL. */
export function pruneExpiredRestoreFailures(
  failures: readonly BulkRestoreFailure[],
  now: number = Date.now(),
  ttlMs: number = RESTORE_FAILURES_TTL_MS,
): BulkRestoreFailure[] {
  return (failures ?? []).filter((f) => {
    if (!f) return false;
    const t = new Date(f.failedAt).getTime();
    if (Number.isNaN(t)) return false;
    return now - t < ttlMs;
  });
}

export function parseStoredRestoreFailures(raw: string | null): BulkRestoreFailure[] {
  if (!raw) return [];
  let dados: unknown;
  try {
    dados = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(dados)) return [];

  const resultado: BulkRestoreFailure[] = [];
  for (const item of dados) {
    if (!item || typeof item !== 'object') continue;
    const registro = item as Record<string, unknown>;
    const templateId = typeof registro.templateId === 'string' ? registro.templateId.trim() : '';
    if (!templateId) continue;
    const kind = FAILURE_KINDS.includes(registro.kind as RestoreFailureKind)
      ? (registro.kind as RestoreFailureKind)
      : 'unknown';
    const skillCount = Number(registro.skillCount);
    resultado.push({
      templateId,
      templateName:
        typeof registro.templateName === 'string' && registro.templateName.trim()
          ? registro.templateName.trim()
          : templateId,
      skillCount: Number.isFinite(skillCount) && skillCount > 0 ? Math.floor(skillCount) : 0,
      message: typeof registro.message === 'string' ? registro.message : '',
      kind,
      failedAt: normalizeFailedAt(registro.failedAt),
    });
  }
  return resultado;
}

/**
 * Função pura: consolida falhas repetidas do mesmo template.
 *
 * Um retry que falha de novo gera uma segunda entrada para o mesmo
 * `templateId`. Mostrar as duas engana o curador sobre o volume pendente:
 * o estado real é apenas a ocorrência mais recente. A saída sai ordenada
 * da falha mais nova para a mais antiga.
 */
export function dedupeRestoreFailures(
  failures: readonly BulkRestoreFailure[],
): BulkRestoreFailure[] {
  const maisRecente = new Map<string, BulkRestoreFailure>();
  for (const falha of failures ?? []) {
    if (!falha?.templateId) continue;
    const atual = maisRecente.get(falha.templateId);
    if (!atual) {
      maisRecente.set(falha.templateId, falha);
      continue;
    }
    const tNova = new Date(falha.failedAt).getTime();
    const tAtual = new Date(atual.failedAt).getTime();
    // NaN em qualquer lado: preferimos a entrada com data válida.
    if (Number.isNaN(tAtual) || (!Number.isNaN(tNova) && tNova >= tAtual)) {
      maisRecente.set(falha.templateId, falha);
    }
  }
  return [...maisRecente.values()].sort(
    (a, b) => (new Date(b.failedAt).getTime() || 0) - (new Date(a.failedAt).getTime() || 0),
  );
}

/** Lê as falhas persistidas; tolera storage indisponível (SSR, modo privado). */
export function loadRestoreFailures(): BulkRestoreFailure[] {
  try {
    return dedupeRestoreFailures(
      pruneExpiredRestoreFailures(
        parseStoredRestoreFailures(sessionStorage.getItem(RESTORE_FAILURES_STORAGE_KEY)),
      ),
    );
  } catch {
    return [];
  }
}


/** Persiste (ou limpa) as falhas parciais da sessão atual. */
export function saveRestoreFailures(failures: readonly BulkRestoreFailure[]): void {
  try {
    if (!failures || failures.length === 0) {
      sessionStorage.removeItem(RESTORE_FAILURES_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(RESTORE_FAILURES_STORAGE_KEY, JSON.stringify(failures));
  } catch (error) {
    logger.warn('Falha ao persistir restaurações parciais', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}




/**
 * Restaura todas as remoções de um feed, um lote atômico por template.
 *
 * Não abortamos no primeiro erro: RLS pode negar um template específico e
 * ainda assim faz sentido restaurar os demais. O chamador recebe a lista de
 * falhas para informar o curador com honestidade.
 */
export async function bulkRestoreAllRemovals(
  days: readonly CurationFeedDay[],
): Promise<BulkRestoreAllResult> {
  return runRestorePlan(groupRemovalsByTemplate(days), buildTemplateNameMap(days));
}

/** Reprocessa apenas os templates que falharam numa restauração parcial. */
export async function retryFailedRestores(
  days: readonly CurationFeedDay[],
  templateIds: readonly string[],
): Promise<BulkRestoreAllResult> {
  return runRestorePlan(filterRemovalPlan(days, templateIds), buildTemplateNameMap(days));
}




export interface RebuildResult {
  templates: number;
  links: number;
  strongLinks: number;
  templatesWithoutLinks: string[];
}

/** Linha escrita pelo rebuild — inclui a limpeza explícita do soft delete. */
export type RebuildRow = Omit<TemplateSkillLink, 'id'> & {
  deleted_at: null;
  deleted_by: null;
};

/**
 * Recalcula e regrava TODOS os vínculos automáticos.
 *
 * Vínculos manuais (`origin = 'manual'`) são preservados: apenas as linhas
 * automáticas são removidas antes da regravação. Requer permissão de admin.
 */
export async function rebuildTemplateSkillLinks(
  limitPerTemplate = MAX_LINKS_PER_TEMPLATE,
): Promise<RebuildResult> {
  const { data: registryRows, error: registryError } = await supabaseExternal
    .from('skill_registry')
    .select('*')
    .eq('is_public', true);

  if (registryError) {
    logger.error('rebuildTemplateSkillLinks: registry read failed', {
      error: registryError.message,
    });
    throw new Error(registryError.message);
  }

  const registry = (registryRows ?? []) as unknown as AgentSkillDefinition[];
  const templatesWithoutLinks: string[] = [];
  // `deleted_at`/`deleted_by` fazem parte do payload de reconstrução: sem eles,
  // um vínculo automático que já havia sido soft-deletado sobreviveria ao
  // DELETE (que filtra `deleted_at IS NULL`) e o UPSERT o reescreveria mantendo
  // `deleted_at` preenchido — o vínculo recalculado ficaria invisível na UI.
  const rows: RebuildRow[] = [];

  for (const template of AGENT_TEMPLATES) {
    const links = linkSkillsToTemplate(template, registry, limitPerTemplate);
    if (links.length === 0) {
      templatesWithoutLinks.push(template.id);
      continue;
    }
    for (const link of links) {
      rows.push({
        template_id: template.id,
        skill_id: link.skill.id,
        score: Number(link.score.toFixed(3)),
        reason: link.reason,
        is_strong_match: link.isStrongMatch,
        department_match: link.departmentMatch,
        matched_keywords: Array.from(
          new Set([...link.affinities, ...link.matchedKeywords]),
        ).slice(0, 8),
        origin: 'auto',
        deleted_at: null,
        deleted_by: null,
      });
    }
  }

  const { error: deleteError } = await supabaseExternal
    .from('template_skill_links')
    .delete()
    .eq('origin', 'auto')
    .is('deleted_at', null);

  if (deleteError) {
    logger.error('rebuildTemplateSkillLinks: cleanup failed', { error: deleteError.message });
    throw new Error(deleteError.message);
  }

  // Lotes evitam payloads grandes demais em registries extensos.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabaseExternal
      .from('template_skill_links')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'template_id,skill_id' });

    if (error) {
      logger.error('rebuildTemplateSkillLinks: write failed', { error: error.message });
      throw new Error(error.message);
    }
  }

  const result: RebuildResult = {
    templates: AGENT_TEMPLATES.length - templatesWithoutLinks.length,
    links: rows.length,
    strongLinks: rows.filter((r) => r.is_strong_match).length,
    templatesWithoutLinks,
  };

  logger.info('rebuildTemplateSkillLinks completed', result);
  return result;
}

// ---------------------------------------------------------------------------
// Reaproveitamento de curadoria entre a galeria e o wizard rápido
// ---------------------------------------------------------------------------

/** Vínculo agregado a partir de VÁRIOS templates equivalentes. */
export interface AggregatedSkillLink extends DisplayTemplateSkillLink {
  /** Em quantos templates equivalentes esta skill aparece vinculada. */
  templateCount: number;
  /** Template canônico (primeiro da lista) que originou o vínculo. */
  sourceTemplateId: string;
}

/**
 * Agrega vínculos de múltiplos templates numa única lista priorizada.
 *
 * Precedência (determinística, sem empates aleatórios):
 * 1. Curadoria manual;
 * 2. Match forte;
 * 3. Recorrência entre os templates equivalentes (mais templates = mais sinal);
 * 4. Ordem de entrada — o template canônico vem primeiro na lista de origem.
 *
 * Função pura: exercitada pelos cenários de simulação.
 */
export function aggregateTemplateSkillLinks(
  byTemplate: Array<{ templateId: string; links: DisplayTemplateSkillLink[] }>,
  limit = MAX_LINKS_PER_TEMPLATE,
): AggregatedSkillLink[] {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : MAX_LINKS_PER_TEMPLATE;
  const acc = new Map<string, AggregatedSkillLink & { order: number }>();
  let order = 0;

  for (const group of byTemplate) {
    // A tabela tem UNIQUE(template_id, skill_id), mas o fallback local e
    // payloads inesperados podem repetir a mesma skill no grupo — sem esta
    // guarda, `templateCount` inflaria acima do nº real de blueprints.
    const seenInGroup = new Set<string>();

    for (const link of group.links ?? []) {
      if (!link?.skillId || seenInGroup.has(link.skillId)) continue;
      seenInGroup.add(link.skillId);
      const existing = acc.get(link.skillId);



      if (!existing) {
        acc.set(link.skillId, {
          ...link,
          templateCount: 1,
          sourceTemplateId: group.templateId,
          order: order++,
        });
        continue;
      }

      // Reforço: soma recorrência e promove os atributos mais fortes vistos.
      existing.templateCount += 1;
      existing.isStrongMatch = existing.isStrongMatch || link.isStrongMatch;
      if (link.origin === 'manual' && existing.origin !== 'manual') {
        existing.origin = 'manual';
        existing.reason = link.reason;
        existing.curatedBy = link.curatedBy ?? null;
        existing.curatedAt = link.curatedAt ?? null;
        existing.sourceTemplateId = group.templateId;
      }
    }
  }

  return [...acc.values()]
    .sort(
      (a, b) =>
        Number(b.origin === 'manual') - Number(a.origin === 'manual') ||
        Number(b.isStrongMatch) - Number(a.isStrongMatch) ||
        b.templateCount - a.templateCount ||
        a.order - b.order,
    )
    .slice(0, safeLimit)
    .map(({ order: _order, ...rest }) => rest);
}

/**
 * Lê os vínculos persistidos de vários templates numa ÚNICA consulta indexada
 * (`idx_tsl_template`) e devolve-os já agregados e priorizados.
 *
 * Nunca lança: o wizard rápido tem o recomendador textual como caminho feliz
 * alternativo, então uma falha de leitura degrada para lista vazia e é logada.
 */
export async function fetchAggregatedTemplateSkillLinks(
  templateIds: string[],
  limit = MAX_LINKS_PER_TEMPLATE,
): Promise<AggregatedSkillLink[]> {
  const ids = [...new Set(templateIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabaseExternal
    .from('template_skill_links')
    .select('*, skill:skill_registry(*)')
    .in('template_id', ids)
    .is('deleted_at', null)
    .order('is_strong_match', { ascending: false })
    .order('score', { ascending: false });

  if (error) {
    logger.warn('fetchAggregatedTemplateSkillLinks failed — degradando para vazio', {
      templateIds: ids,
      error: error.message,
    });
    return [];
  }

  const rows = (data ?? []) as unknown as ResolvedTemplateSkillLink[];

  // Preserva a ordem declarada em QUICK_TYPE_TEMPLATE_MAP (canônico primeiro).
  const byTemplate = ids.map((templateId) => ({
    templateId,
    links: rows
      .filter((r) => r.template_id === templateId)
      .map(toDisplayLink)
      .filter((l): l is DisplayTemplateSkillLink => l !== null),
  }));

  return aggregateTemplateSkillLinks(byTemplate, limit);
}

// ---------------------------------------------------------------------------
// Feed de curadoria recente (consome o índice parcial idx_tsl_manual_recent)
// ---------------------------------------------------------------------------

/** Entrada crua do feed, como retornada pelo banco. */
export interface RecentCurationRow {
  template_id: string;
  skill_id: string;
  reason: string;
  updated_at: string | null;
  created_at: string | null;
  updated_by: string | null;
  created_by: string | null;
  /** Preenchido quando o vínculo foi desvinculado (remoção reversível). */
  deleted_at?: string | null;
  deleted_by?: string | null;
  skill?: { name?: string | null } | null;
}

/** Um dia de curadoria, já agrupado e rotulado para a UI. */
export interface CurationFeedDay {
  /** Chave ISO (YYYY-MM-DD) do dia, em horário local. */
  dayKey: string;
  /** Rótulo PT-BR: "Hoje", "Ontem" ou dd/mm/aaaa. */
  dayLabel: string;
  entries: CurationFeedEntry[];
}

/** Natureza do evento de curadoria exibido no feed. */
export type CurationFeedKind = 'linked' | 'unlinked';

export interface CurationFeedEntry {
  kind: CurationFeedKind;
  templateId: string;
  templateName: string;
  skillId: string;
  skillName: string;
  reason: string;
  actorId: string | null;
  /** "você" quando o autor é o usuário atual; null quando desconhecido. */
  actorLabel: string | null;
  at: string | null;
  /** HH:MM local; null quando a data é inválida/ausente. */
  timeLabel: string | null;
}

const TEMPLATE_NAME_BY_ID = new Map(AGENT_TEMPLATES.map((t) => [t.id, t.name]));

function toDayKey(date: Date): string {
  // Chave local (não UTC): agrupar por dia precisa respeitar o fuso do curador,
  // senão uma curadoria das 21h em GMT-3 cairia no "dia seguinte".
  const mes = `${date.getMonth() + 1}`.padStart(2, '0');
  const dia = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${mes}-${dia}`;
}

/**
 * Agrupa as linhas de curadoria manual por dia, da mais recente para a mais
 * antiga, resolvendo nomes de template/skill e rótulos relativos em PT-BR.
 *
 * Função pura — recebe `now` para que os cenários de simulação sejam
 * determinísticos e não dependam do relógio da máquina.
 */
export function buildCurationFeed(
  rows: RecentCurationRow[],
  currentUserId?: string | null,
  now: Date = new Date(),
): CurationFeedDay[] {
  const hojeKey = toDayKey(now);
  const ontem = new Date(now.getTime());
  ontem.setDate(ontem.getDate() - 1);
  const ontemKey = toDayKey(ontem);

  const byDay = new Map<string, CurationFeedDay>();
  // Deduplica: a mesma dupla template+skill só aparece uma vez (o registro
  // mais recente vence), evitando repetição após reedições da curadoria.
  const seen = new Set<string>();

  const ordenadas = [...rows].sort((a, b) => {
    const ta = new Date(a.deleted_at ?? a.updated_at ?? a.created_at ?? 0).getTime() || 0;
    const tb = new Date(b.deleted_at ?? b.updated_at ?? b.created_at ?? 0).getTime() || 0;
    return tb - ta;
  });

  for (const row of ordenadas) {
    if (!row?.template_id || !row?.skill_id) continue;
    const chave = `${row.template_id}::${row.skill_id}`;
    if (seen.has(chave)) continue;
    seen.add(chave);

    const removido = Boolean(row.deleted_at);
    // Numa remoção, o carimbo relevante é o da própria remoção.
    const at = removido ? row.deleted_at ?? row.updated_at ?? null : row.updated_at ?? row.created_at ?? null;
    const data = at ? new Date(at) : null;
    const dataValida = data && !Number.isNaN(data.getTime()) ? data : null;

    // Sem data utilizável não há como posicionar no feed cronológico.
    if (!dataValida) continue;

    const dayKey = toDayKey(dataValida);
    const dayLabel =
      dayKey === hojeKey
        ? 'Hoje'
        : dayKey === ontemKey
          ? 'Ontem'
          : dataValida.toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            });

    const actorId = removido
      ? row.deleted_by ?? row.updated_by ?? null
      : row.updated_by ?? row.created_by ?? null;

    const entry: CurationFeedEntry = {
      kind: removido ? 'unlinked' : 'linked',
      templateId: row.template_id,
      templateName: TEMPLATE_NAME_BY_ID.get(row.template_id) ?? row.template_id,
      skillId: row.skill_id,
      skillName: row.skill?.name?.trim() || row.skill_id,
      reason: row.reason || 'Curadoria manual',
      actorId,
      actorLabel: actorId ? (actorId === currentUserId ? 'você' : `admin ${actorId.slice(0, 8)}`) : null,
      at,
      timeLabel: dataValida.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    const grupo = byDay.get(dayKey);
    if (grupo) grupo.entries.push(entry);
    else byDay.set(dayKey, { dayKey, dayLabel, entries: [entry] });
  }

  // Map preserva a ordem de inserção, que já é a cronológica decrescente.
  return [...byDay.values()];
}

/**
 * Lê as curadorias manuais mais recentes.
 * O filtro `origin = 'manual'` + `order by updated_at desc` casa exatamente
 * com o índice parcial `idx_tsl_manual_recent`, então o custo não cresce com
 * o volume de vínculos automáticos.
 */
export type CurationFeedFilter = 'all' | 'linked' | 'unlinked';

/**
 * Filtro puro sobre o feed já construído.
 *
 * Mantido separado da consulta porque a UI alterna o filtro sem refetch quando
 * o dataset já está em cache — e porque uma função pura é simulável.
 * Dias que ficam sem entradas são descartados (não renderizamos cabeçalho vazio).
 */
export function filterCurationFeed(
  feed: CurationFeedDay[],
  filtro: CurationFeedFilter,
): CurationFeedDay[] {
  if (filtro === 'all') return feed;
  return feed
    .map((dia) => ({ ...dia, entries: dia.entries.filter((e) => e.kind === filtro) }))
    .filter((dia) => dia.entries.length > 0);
}

/**
 * Página do feed: os dias já agrupados + o cursor para a próxima página.
 * `nextCursor` é `null` quando a consulta devolveu menos linhas que o limite —
 * sinal inequívoco de fim de dataset, sem precisar de um COUNT caro.
 */
export interface CurationFeedPage {
  days: CurationFeedDay[];
  nextCursor: string | null;
}

/** Escopo de autoria do feed: todos os curadores ou apenas o usuário atual. */
export type CurationActorScope = 'everyone' | 'me';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Monta a expressão `or` do PostgREST para o filtro de autoria.
 *
 * O id é validado como UUID **antes** de ser interpolado: `.or()` recebe uma
 * string de filtro crua, então um valor com vírgula ou ponto seria interpretado
 * como sintaxe (ex.: `deleted_by.is.null`) e poderia ampliar o conjunto lido.
 * Valor inválido devolve `null` — o chamador ignora o filtro em vez de vazar.
 *
 * Autoria cobre os dois lados do evento: quem vinculou (`updated_by`) e quem
 * removeu (`deleted_by`), porque um mesmo registro pode ter autores distintos.
 */
export function buildActorOrExpression(actorId?: string | null): string | null {
  if (!actorId || !UUID_RE.test(actorId.trim())) return null;
  const id = actorId.trim();
  return `updated_by.eq.${id},deleted_by.eq.${id},created_by.eq.${id}`;
}

/**
 * Valida o filtro por template contra o catálogo conhecido (allowlist).
 *
 * `template_id` é `text` livre — diferente de `skill_id`, que é UUID e se valida
 * sozinho pelo tipo. Aceitar qualquer string aqui permitiria consultas por ids
 * inexistentes (feed sempre vazio, sem sinal de erro) e transformaria o campo
 * num canal de enumeração. Aceitamos apenas ids presentes no catálogo.
 *
 * Retorna `null` quando não há filtro aplicável — o chamador não filtra.
 */
export function resolveTemplateFilter(
  templateId: string | null | undefined,
  knownIds: readonly string[],
): string | null {
  if (!templateId) return null;
  const alvo = templateId.trim();
  if (!alvo || alvo === 'all') return null;
  return knownIds.includes(alvo) ? alvo : null;
}




/**
 * Cursor = carimbo `updated_at` da última linha da página.
 *
 * Usamos `updated_at` (e não `deleted_at`) de propósito: é a coluna de ordenação
 * da consulta e do índice parcial `idx_tsl_manual_recent`. Paginar por uma coluna
 * diferente da ordenada produziria buracos e repetições entre páginas.
 */
export function resolveNextCursor(rows: RecentCurationRow[], limit: number): string | null {
  if (rows.length < limit) return null;
  const ultima = rows[rows.length - 1];
  return ultima?.updated_at ?? ultima?.created_at ?? null;
}

/**
 * Concatena páginas do feed preservando a ordem cronológica e a deduplicação
 * por (template, skill) — a primeira ocorrência (página mais recente) vence.
 *
 * Função pura: é o alvo da simulação de cenários de paginação.
 */
export function mergeCurationFeeds(
  paginas: CurationFeedDay[][],
): CurationFeedDay[] {
  const dias = new Map<string, CurationFeedDay>();
  const vistos = new Set<string>();

  for (const pagina of paginas) {
    for (const dia of pagina) {
      const alvo = dias.get(dia.dayKey);
      const destino = alvo ?? { dayKey: dia.dayKey, dayLabel: dia.dayLabel, entries: [] };
      if (!alvo) dias.set(dia.dayKey, destino);

      for (const entrada of dia.entries) {
        const chave = `${entrada.templateId}::${entrada.skillId}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        destino.entries.push(entrada);
      }
    }
  }

  return [...dias.values()].filter((dia) => dia.entries.length > 0);
}

/**
 * Lê uma página das curadorias manuais mais recentes.
 *
 * O filtro `origin = 'manual'` + `order by updated_at desc` casa exatamente com
 * o índice parcial `idx_tsl_manual_recent`, então o custo não cresce com o
 * volume de vínculos automáticos. O cursor mantém essa propriedade: `lt` sobre
 * a mesma coluna ordenada é um range scan, não um OFFSET (que releria tudo).
 */
export async function fetchRecentCurationsPage(
  limit = 30,
  currentUserId?: string | null,
  filtro: CurationFeedFilter = 'all',
  cursor?: string | null,
  escopo: CurationActorScope = 'everyone',
  templateId?: string | null,

): Promise<CurationFeedPage> {
  let query = supabaseExternal
    .from('template_skill_links')
    .select(
      'template_id, skill_id, reason, updated_at, created_at, updated_by, created_by, deleted_at, deleted_by, skill:skill_registry(name)',
    )
    .eq('origin', 'manual');

  // Empurrar o filtro para o banco mantém o LIMIT significativo: filtrar só no
  // cliente devolveria uma página cheia de eventos do tipo descartado.
  if (filtro === 'unlinked') query = query.not('deleted_at', 'is', null);
  if (filtro === 'linked') query = query.is('deleted_at', null);
  if (cursor) query = query.lt('updated_at', cursor);

  // Autoria também vai para o banco, pelo mesmo motivo do filtro de tipo.
  if (escopo === 'me') {
    const expr = buildActorOrExpression(currentUserId);
    // Sem id válido não existe "minhas curadorias": devolver tudo seria pior
    // que devolver nada, então filtramos por um predicado impossível.
    if (!expr) return { days: [], nextCursor: null };
    query = query.or(expr);
  }

  // Template: allowlist resolvida antes da consulta; `eq` usa o índice
  // idx_tsl_template quando a seletividade compensa.
  const alvoTemplate = resolveTemplateFilter(templateId, AGENT_TEMPLATES.map((t) => t.id));
  if (alvoTemplate) query = query.eq('template_id', alvoTemplate);




  const { data, error } = await query.order('updated_at', { ascending: false }).limit(limit);

  if (error) {
    logger.error('fetchRecentCurations failed', { error: error.message, filtro });
    return { days: [], nextCursor: null };
  }

  const rows = (data ?? []) as unknown as RecentCurationRow[];

  return {
    days: filterCurationFeed(buildCurationFeed(rows, currentUserId), filtro),
    nextCursor: resolveNextCursor(rows, limit),
  };
}

/** Compatibilidade: primeira página apenas. */
export async function fetchRecentCurations(
  limit = 30,
  currentUserId?: string | null,
  filtro: CurationFeedFilter = 'all',
): Promise<CurationFeedDay[]> {
  const { days } = await fetchRecentCurationsPage(limit, currentUserId, filtro);
  return days;
}


/* ------------------------------------------------------------------ *
 * Exportação CSV do feed de curadoria
 * ------------------------------------------------------------------ */

/** Cabeçalho fixo do CSV — a ordem é contrato com planilhas já salvas. */
export const CURATION_CSV_HEADER = [
  'dia',
  'hora',
  'evento',
  'template_id',
  'template',
  'skill_id',
  'skill',
  'motivo',
  'autor',
] as const;

/**
 * Escapa um campo para CSV (RFC 4180) e neutraliza injeção de fórmula.
 *
 * Dois riscos distintos são tratados aqui:
 *
 * 1. **Quebra estrutural** — vírgula, aspas, CR/LF dentro do valor mudariam a
 *    contagem de colunas. Solução RFC: envolver em aspas e dobrar as internas.
 * 2. **CSV injection** — Excel/Sheets executam células iniciadas por `=`, `+`,
 *    `-`, `@`, TAB ou CR como fórmula (`=cmd|'/c calc'!A1`). Um `reason`
 *    escrito por um curador chega ao CSV sem passar por HTML, então o escape
 *    do React não protege nada aqui. Prefixamos com aspa simples, que o
 *    aplicativo consome como marcador de texto literal.
 */
export function escapeCsvField(value: unknown): string {
  const bruto = value === null || value === undefined ? '' : String(value);
  // Sanitiza caracteres de controle que não sejam CR/LF (podem corromper o arquivo).
  const limpo = bruto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const perigoso = /^[=+\-@\t\r]/.test(limpo);
  const texto = perigoso ? `'${limpo}` : limpo;
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const CURATION_EVENT_LABEL: Record<CurationFeedKind, string> = {
  linked: 'Vínculo',
  unlinked: 'Remoção',
};

/**
 * Serializa o feed já filtrado em CSV. Função pura: o que estiver na tela é
 * exatamente o que sai no arquivo — exportar do banco de novo poderia
 * devolver linhas que o curador não estava vendo.
 *
 * Usa CRLF por ser o separador que o Excel aceita sem ambiguidade.
 */
export function buildCurationCsv(days: CurationFeedDay[]): string {
  const linhas: string[] = [CURATION_CSV_HEADER.join(',')];

  for (const dia of days ?? []) {
    for (const e of dia?.entries ?? []) {
      linhas.push(
        [
          dia.dayKey,
          e.timeLabel ?? '',
          CURATION_EVENT_LABEL[e.kind] ?? e.kind,
          e.templateId,
          e.templateName,
          e.skillId,
          e.skillName,
          e.reason,
          e.actorLabel ?? '',
        ]
          .map(escapeCsvField)
          .join(','),
      );
    }
  }

  return linhas.join('\r\n');
}

/** Nome de arquivo determinístico e ordenável: curadoria-YYYY-MM-DD-HHMM.csv */
export function buildCurationCsvFilename(now: Date = new Date()): string {
  const p = (n: number) => `${n}`.padStart(2, '0');
  const d = Number.isNaN(now.getTime()) ? new Date(0) : now;
  return `curadoria-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.csv`;
}
