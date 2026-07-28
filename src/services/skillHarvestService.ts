/**
 * skillHarvestService — curadoria dos candidatos coletados no GitHub.
 *
 * Todas as leituras/escritas passam por `supabaseExternal` (padrão do projeto).
 * A promoção para `skill_registry` preserva licença e atribuição da origem.
 */
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { stripHtml } from '@/lib/sanitize';
import type { SkillDepartment } from '@/config/skill-departments';

export type CandidateStatus = 'pending' | 'approved' | 'rejected' | 'auto_rejected' | 'promoted';

export interface HarvestCandidate {
  id: string;
  run_id: string | null;
  name: string;
  slug: string;
  description: string;
  version: string;
  author: string;
  category: string;
  department: string | null;
  department_confidence: number;
  tags: string[];
  source_repo: string;
  source_url: string;
  source_path: string | null;
  source_license: string | null;
  stars: number;
  last_commit_at: string | null;
  quality_score: number;
  raw_content: string | null;
  skill_config: Record<string, unknown>;
  mcp_server_url: string | null;
  status: CandidateStatus;
  rejection_reasons: string[];
  promoted_skill_id: string | null;
  created_at: string;
}

export interface HarvestRun {
  id: string;
  queries: string[];
  departments: string[];
  repos_scanned: number;
  candidates_found: number;
  candidates_accepted: number;
  candidates_rejected: number;
  duration_ms: number | null;
  status: string;
  error: string | null;
  created_at: string;
}

export interface CandidateFilters {
  status?: CandidateStatus | 'all';
  department?: SkillDepartment | 'all';
  minQuality?: number;
  search?: string;
  limit?: number;
}

interface RawRow { [key: string]: unknown }

function toCandidate(row: RawRow): HarvestCandidate {
  return {
    id: String(row.id),
    run_id: row.run_id ? String(row.run_id) : null,
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    description: String(row.description ?? ''),
    version: String(row.version ?? '1.0.0'),
    author: String(row.author ?? ''),
    category: String(row.category ?? 'tools'),
    department: row.department ? String(row.department) : null,
    department_confidence: Number(row.department_confidence ?? 0),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    source_repo: String(row.source_repo ?? ''),
    source_url: String(row.source_url ?? ''),
    source_path: row.source_path ? String(row.source_path) : null,
    source_license: row.source_license ? String(row.source_license) : null,
    stars: Number(row.stars ?? 0),
    last_commit_at: row.last_commit_at ? String(row.last_commit_at) : null,
    quality_score: Number(row.quality_score ?? 0),
    raw_content: row.raw_content ? String(row.raw_content) : null,
    skill_config: (row.skill_config as Record<string, unknown>) ?? {},
    mcp_server_url: row.mcp_server_url ? String(row.mcp_server_url) : null,
    status: (row.status as CandidateStatus) ?? 'pending',
    rejection_reasons: Array.isArray(row.rejection_reasons) ? (row.rejection_reasons as string[]) : [],
    promoted_skill_id: row.promoted_skill_id ? String(row.promoted_skill_id) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

/** Resultado de um lote de varredura. */
export interface HarvestBatchResult {
  runId: string;
  found: number;
  inserted: number;
  rejected: number;
  errors: string[];
  /** Deslocamento usado nesta chamada. */
  fileOffset: number;
  /** Onde o próximo lote deve começar. */
  nextFileOffset: number;
  /** Ainda restam arquivos por ler nos repositórios alvo. */
  truncated: boolean;
  /** Total de SKILL.md por repositório — permite mostrar progresso real. */
  repoFileTotals: Record<string, number>;
  durationMs: number;
}

export interface HarvestParams {
  departments?: SkillDepartment[];
  topics?: string[];
  /** Monorepos alvo (`owner/repo`). Quando informado, a busca por queries é ignorada. */
  repos?: string[];
  /** Teto de SKILL.md lidos por repositório (monorepos exigem valores altos). */
  filesPerRepo?: number;
  /** Deslocamento na lista ordenada de SKILL.md — usado para varrer em lotes. */
  fileOffset?: number;
  maxRepos?: number;
  maxCandidates?: number;
  minStars?: number;
  dryRun?: boolean;
}

/** Dispara UM lote da varredura no GitHub (Edge Function server-side). */
export async function runHarvest(params: HarvestParams): Promise<HarvestBatchResult> {
  const fileOffset = params.fileOffset ?? 0;
  const { data, error } = await supabase.functions.invoke('skill-harvester', {
    body: {
      departments: params.departments ?? [],
      topics: params.topics ?? [],
      repos: params.repos ?? [],
      filesPerRepo: params.filesPerRepo ?? 8,
      fileOffset,
      maxRepos: params.maxRepos ?? 40,
      maxCandidates: params.maxCandidates ?? 120,
      minStars: params.minStars ?? 3,
      dryRun: params.dryRun ?? false,
    },
  });


  if (error) {
    // O SDK mascara o corpo real; extraia antes de propagar.
    let details = error.message;
    const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
    if (ctx?.text) {
      try { details = await ctx.text(); } catch { /* mantém message */ }
    }
    logger.error('skill-harvester falhou', { details });
    throw new Error(details);
  }

  const res = data as {
    run_id: string; candidates_found: number; candidates_inserted: number;
    candidates_auto_rejected: number; errors?: string[];
    file_offset?: number; next_file_offset?: number; truncated?: boolean;
    repo_file_totals?: Record<string, number>; duration_ms?: number;
  };

  // O servidor pode devolver um offset menor que o enviado se nada foi lido.
  // Forçar avanço estrito impede loop infinito no orquestrador de lotes.
  const nextFileOffset = Math.max(Number(res.next_file_offset ?? fileOffset), fileOffset);

  return {
    runId: res.run_id,
    found: res.candidates_found ?? 0,
    inserted: res.candidates_inserted ?? 0,
    rejected: res.candidates_auto_rejected ?? 0,
    errors: res.errors ?? [],
    fileOffset: Number(res.file_offset ?? fileOffset),
    nextFileOffset,
    truncated: Boolean(res.truncated) && nextFileOffset > fileOffset,
    repoFileTotals: res.repo_file_totals ?? {},
    durationMs: Number(res.duration_ms ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Checkpoint de retomada
// ---------------------------------------------------------------------------

const CHECKPOINT_PREFIX = 'nexus.harvest.checkpoint.';

export interface HarvestCheckpoint {
  /** Próximo deslocamento a ser lido. */
  offset: number;
  /** Momento da última gravação (ISO) — usado para expirar checkpoints velhos. */
  savedAt: string;
  /** Total conhecido de SKILL.md, para exibir progresso ao retomar. */
  total: number;
}

/** Checkpoints mais velhos que isto são descartados (o repo já mudou). */
const CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Chave estável por conjunto de repositórios. A ordenação evita que
 * `a,b` e `b,a` gerem checkpoints distintos para a mesma varredura.
 */
export function harvestCheckpointKey(repos: string[]): string {
  return CHECKPOINT_PREFIX + [...repos].map((r) => r.trim().toLowerCase()).sort().join('|');
}

export function loadHarvestCheckpoint(repos: string[]): HarvestCheckpoint | null {
  if (repos.length === 0 || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(harvestCheckpointKey(repos));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HarvestCheckpoint>;
    const offset = Number(parsed.offset);
    if (!Number.isFinite(offset) || offset <= 0) return null;
    const savedAt = String(parsed.savedAt ?? '');
    const age = Date.now() - new Date(savedAt).getTime();
    if (!Number.isFinite(age) || age > CHECKPOINT_TTL_MS) return null;
    return { offset, savedAt, total: Number(parsed.total ?? 0) };
  } catch {
    return null; // storage indisponível ou JSON corrompido — recomeça do zero
  }
}

export function saveHarvestCheckpoint(repos: string[], offset: number, total = 0): void {
  if (repos.length === 0 || typeof localStorage === 'undefined') return;
  try {
    const payload: HarvestCheckpoint = { offset, total, savedAt: new Date().toISOString() };
    localStorage.setItem(harvestCheckpointKey(repos), JSON.stringify(payload));
  } catch { /* cota cheia — o progresso em memória segue válido */ }
}

export function clearHarvestCheckpoint(repos: string[]): void {
  if (repos.length === 0 || typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(harvestCheckpointKey(repos)); } catch { /* noop */ }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Varre um monorepo até o fim, encadeando lotes.
 *
 * Cada lote é uma invocação independente da Edge Function — nenhuma delas
 * corre risco de estourar o limite de tempo da plataforma.
 *
 * Resiliência: uma falha transitória (429/502 do GitHub, cold start) NÃO
 * descarta os lotes já concluídos. O lote é retentado com backoff exponencial
 * e, esgotadas as tentativas, o laço encerra devolvendo o progresso parcial —
 * o checkpoint gravado permite retomar exatamente do mesmo ponto.
 */
export async function runHarvestAllBatches(
  params: HarvestParams,
  options: {
    maxBatches?: number;
    onBatch?: (batch: HarvestBatchResult, index: number) => void;
    /** Notifica falha de um lote antes da retentativa/desistência. */
    onBatchError?: (error: Error, attempt: number, willRetry: boolean) => void;
    /** Persiste o avanço a cada lote (padrão: grava o checkpoint local). */
    onCheckpoint?: (offset: number, total: number) => void;
    retriesPerBatch?: number;
    signal?: AbortSignal;
  } = {},
): Promise<HarvestBatchResult[]> {
  const maxBatches = options.maxBatches ?? 20;
  const retries = options.retriesPerBatch ?? 2;
  const batches: HarvestBatchResult[] = [];
  let offset = params.fileOffset ?? 0;

  for (let i = 0; i < maxBatches; i++) {
    if (options.signal?.aborted) break;

    let batch: HarvestBatchResult | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        batch = await runHarvest({ ...params, fileOffset: offset });
        break;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        const willRetry = attempt < retries && !options.signal?.aborted;
        options.onBatchError?.(err, attempt + 1, willRetry);
        logger.warn('Lote de harvest falhou', {
          attempt: attempt + 1, offset, willRetry, error: err.message,
        });
        if (!willRetry) break;
        // Backoff exponencial com teto — evita martelar a API do GitHub.
        await sleep(Math.min(8000, 1000 * 2 ** attempt));
      }
    }

    // Esgotadas as tentativas: preserva o que já foi coletado e para aqui.
    if (!batch) break;

    batches.push(batch);
    options.onBatch?.(batch, i);

    const total = Object.values(batch.repoFileTotals).reduce<number>(
      (acc, n) => Math.max(acc, Number(n) || 0),
      0,
    );

    if (!batch.truncated) break;
    if (batch.nextFileOffset <= offset) break; // sem progresso — aborta
    offset = batch.nextFileOffset;
    options.onCheckpoint?.(offset, total);
  }

  return batches;
}


export async function listCandidates(filters: CandidateFilters = {}): Promise<HarvestCandidate[]> {
  let query = supabaseExternal
    .from('skill_harvest_candidates')
    .select('*')
    .order('quality_score', { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.department && filters.department !== 'all') query = query.eq('department', filters.department);
  if (typeof filters.minQuality === 'number') query = query.gte('quality_score', filters.minQuality);
  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[%,]/g, '');
    query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%,source_repo.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('Falha ao listar candidatos de harvest', { error: error.message });
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => toCandidate(r as RawRow));
}

export async function listRuns(limit = 20): Promise<HarvestRun[]> {
  const { data, error } = await supabaseExternal
    .from('skill_harvest_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    logger.error('Falha ao listar execuções de harvest', { error: error.message });
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => {
    const row = r as RawRow;
    return {
      id: String(row.id),
      queries: Array.isArray(row.queries) ? (row.queries as string[]) : [],
      departments: Array.isArray(row.departments) ? (row.departments as string[]) : [],
      repos_scanned: Number(row.repos_scanned ?? 0),
      candidates_found: Number(row.candidates_found ?? 0),
      candidates_accepted: Number(row.candidates_accepted ?? 0),
      candidates_rejected: Number(row.candidates_rejected ?? 0),
      duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
      status: String(row.status ?? 'running'),
      error: row.error ? String(row.error) : null,
      created_at: String(row.created_at ?? ''),
    };
  });
}

/** Contagem de skills promovidas por departamento — alimenta o painel de cobertura. */
export async function getDepartmentCoverage(): Promise<Record<string, number>> {
  const { data, error } = await supabaseExternal
    .from('skill_registry')
    .select('department')
    .not('department', 'is', null);
  if (error) {
    logger.error('Falha ao calcular cobertura por departamento', { error: error.message });
    return {};
  }
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const dep = (row as { department: string | null }).department;
    if (!dep) continue;
    counts[dep] = (counts[dep] ?? 0) + 1;
  }
  return counts;
}

export async function updateCandidate(
  id: string,
  patch: { status?: CandidateStatus; department?: string | null; tags?: string[]; category?: string },
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabaseExternal
    .from('skill_harvest_candidates')
    .update({
      ...patch,
      reviewed_by: userData.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) {
    logger.error('Falha ao atualizar candidato', { id, error: error.message });
    throw new Error(error.message);
  }
}

export async function bulkUpdateStatus(ids: string[], status: CandidateStatus): Promise<void> {
  if (ids.length === 0) return;
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabaseExternal
    .from('skill_harvest_candidates')
    .update({ status, reviewed_by: userData.user?.id ?? null, reviewed_at: new Date().toISOString() })
    .in('id', ids);
  if (error) {
    logger.error('Falha na atualização em lote', { count: ids.length, error: error.message });
    throw new Error(error.message);
  }
}

/**
 * Promove um candidato aprovado para o `skill_registry`.
 *
 * A skill nasce `is_verified = false` e `is_public = false`: a publicação é
 * um segundo ato deliberado no marketplace, nunca efeito colateral da curadoria.
 * O candidato permanece no staging, o que torna a promoção reversível.
 */
export async function promoteCandidate(candidate: HarvestCandidate): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();

  const payload = {
    name: stripHtml(candidate.name).slice(0, 120),
    slug: candidate.slug,
    description: stripHtml(candidate.description).slice(0, 1200) || candidate.name,
    version: candidate.version,
    author: candidate.author,
    category: candidate.category,
    department: candidate.department,
    tags: candidate.tags,
    skill_config: {
      ...candidate.skill_config,
      imported_from: candidate.source_url,
      attribution: `${candidate.author} — ${candidate.source_repo}`,
    },
    mcp_server_url: candidate.mcp_server_url,
    source_repo: candidate.source_repo,
    source_url: candidate.source_url,
    source_license: candidate.source_license,
    quality_score: candidate.quality_score,
    is_verified: false,
    is_public: false,
    created_by: userData.user?.id ?? null,
  };

  const { data, error } = await supabaseExternal
    .from('skill_registry')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    logger.error('Falha ao promover candidato', { id: candidate.id, error: error.message });
    throw new Error(error.message);
  }

  const skillId = String((data as { id: string }).id);

  const { error: linkErr } = await supabaseExternal
    .from('skill_harvest_candidates')
    .update({
      status: 'promoted',
      promoted_skill_id: skillId,
      reviewed_by: userData.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', candidate.id);

  // A skill já existe; falhar aqui deixaria o staging inconsistente, então alertamos.
  if (linkErr) logger.error('Skill promovida mas staging não atualizado', { skillId, error: linkErr.message });

  return skillId;
}
