/**
 * Livro-razão das evidências de prompt exportadas.
 *
 * A exportação já grava a impressão digital do artefato no `audit_log`
 * (`prompt.export_evidence`). Faltava o outro lado da prova: dado um arquivo
 * que alguém apresenta numa revisão meses depois, conseguir dizer com
 * segurança "isto é exatamente o que saiu do sistema em tal data" — ou
 * "isto não corresponde a nenhuma exportação registrada".
 *
 * Camada PURA: parsing defensivo das linhas da trilha, agregação e
 * verificação por checksum. Nenhuma dependência de rede ou DOM, porque é
 * justamente esta lógica que precisa ser testável exaustivamente.
 */

import { artifactChecksum } from '@/lib/skills/promptAuditArtifact';

/* ------------------------------------------------------------------ *
 * Tipos
 * ------------------------------------------------------------------ */

/** Linha crua vinda de `audit_log` — tudo opcional de propósito. */
export interface RawEvidenceRow {
  id?: unknown;
  created_at?: unknown;
  entity_id?: unknown;
  metadata?: unknown;
}

export interface EvidenceEntry {
  id: string;
  /** ISO do registro na trilha (quando o servidor gravou). */
  createdAt: string;
  /** ISO declarado no artefato; pode divergir levemente do createdAt. */
  generatedAt: string;
  agentId: string;
  agentName: string;
  model: string;
  filename: string;
  checksum: string;
  artifactChars: number;
  skillsReceived: number;
  skillsInjected: number;
  skillsOverflow: number;
  skillsSanitized: number;
  estimatedTokens: number;
  unresolvedVariables: number;
  forcedOverflow: boolean;
  injectedDirtySkill: boolean;
  overflowedSkills: string[];
  /**
   * `true` quando a exportação usou toggles de estresse. Evidência sintética
   * não deveria ser usada como prova de configuração real de produção — o
   * painel precisa marcá-la para não induzir o revisor ao erro.
   */
  synthetic: boolean;
}

/* ------------------------------------------------------------------ *
 * Coerção defensiva
 * ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

/** Inteiro não negativo; qualquer lixo vira 0 em vez de NaN na UI. */
function asCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function asBool(value: unknown): boolean {
  return value === true || value === 'true';
}

function asIso(value: unknown): string {
  const text = asText(value);
  if (text === '') return '';
  const t = Date.parse(text);
  return Number.isNaN(t) ? '' : new Date(t).toISOString();
}

/** Checksum válido = 8 dígitos hex minúsculos (formato do FNV-1a de 32 bits). */
export function isValidChecksum(value: string): boolean {
  return /^[0-9a-f]{8}$/.test(value);
}

function asNameList(value: unknown, limit = 25): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const name = asText(item);
    if (name !== '') out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

/**
 * Converte linhas da trilha em entradas tipadas.
 *
 * Linhas sem checksum válido são DESCARTADAS: uma entrada sem impressão
 * digital não prova nada e, pior, apareceria no verificador como "nunca
 * bate", empurrando o revisor a desconfiar de arquivos legítimos.
 */
export function parseEvidenceRows(rows: readonly RawEvidenceRow[]): EvidenceEntry[] {
  const entries: EvidenceEntry[] = [];

  for (const row of rows ?? []) {
    const meta = asRecord(row?.metadata);
    const checksum = asText(meta.checksum).toLowerCase();
    if (!isValidChecksum(checksum)) continue;

    const forcedOverflow = asBool(meta.forced_overflow);
    const injectedDirtySkill = asBool(meta.injected_dirty_skill);
    const createdAt = asIso(row?.created_at);
    const generatedAt = asIso(meta.generated_at) || createdAt;

    entries.push({
      id: asText(row?.id, checksum),
      createdAt,
      generatedAt,
      agentId: asText(row?.entity_id),
      agentName: asText(meta.agent_name) || '(sem nome)',
      model: asText(meta.model) || '—',
      filename: asText(meta.filename) || '(sem arquivo)',
      checksum,
      artifactChars: asCount(meta.artifact_chars),
      skillsReceived: asCount(meta.skills_received),
      skillsInjected: asCount(meta.skills_injected),
      skillsOverflow: asCount(meta.skills_overflow),
      skillsSanitized: asCount(meta.skills_sanitized),
      estimatedTokens: asCount(meta.estimated_tokens),
      unresolvedVariables: asCount(meta.unresolved_variables),
      forcedOverflow,
      injectedDirtySkill,
      overflowedSkills: asNameList(meta.overflowed_skills),
      synthetic: forcedOverflow || injectedDirtySkill,
    });
  }

  // Mais recente primeiro; sem data cai para o fim (ordem indefinida é pior).
  return entries.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/* ------------------------------------------------------------------ *
 * Agregação
 * ------------------------------------------------------------------ */

export interface DuplicateChecksum {
  checksum: string;
  count: number;
  agentName: string;
}

export interface EvidenceLedgerSummary {
  total: number;
  /** Agentes distintos com pelo menos uma exportação. */
  agents: number;
  /** Exportações cujo prompt perdeu skills pelo teto. */
  withOverflow: number;
  /** Exportações geradas com toggles de estresse. */
  synthetic: number;
  /** Exportações com variáveis não resolvidas no prompt. */
  withUnresolved: number;
  lastExportAt: string | null;
  /**
   * Checksums repetidos: dois artefatos idênticos exportados em momentos
   * diferentes. Não é erro — é sinal de que nada mudou entre as revisões, e
   * quem audita precisa saber disso antes de tratar como evidência nova.
   */
  duplicates: DuplicateChecksum[];
}

export function summarizeEvidenceLedger(
  entries: readonly EvidenceEntry[],
): EvidenceLedgerSummary {
  const agentes = new Set<string>();
  const porChecksum = new Map<string, { count: number; agentName: string }>();
  let withOverflow = 0;
  let synthetic = 0;
  let withUnresolved = 0;
  let lastExportAt: string | null = null;

  for (const e of entries) {
    if (e.agentId !== '') agentes.add(e.agentId);
    if (e.skillsOverflow > 0) withOverflow += 1;
    if (e.synthetic) synthetic += 1;
    if (e.unresolvedVariables > 0) withUnresolved += 1;
    if (e.createdAt !== '' && (lastExportAt === null || e.createdAt > lastExportAt)) {
      lastExportAt = e.createdAt;
    }
    const atual = porChecksum.get(e.checksum);
    porChecksum.set(e.checksum, {
      count: (atual?.count ?? 0) + 1,
      agentName: atual?.agentName ?? e.agentName,
    });
  }

  const duplicates: DuplicateChecksum[] = [];
  for (const [checksum, info] of porChecksum) {
    if (info.count > 1) {
      duplicates.push({ checksum, count: info.count, agentName: info.agentName });
    }
  }
  duplicates.sort((a, b) => b.count - a.count || a.checksum.localeCompare(b.checksum));

  return {
    total: entries.length,
    agents: agentes.size,
    withOverflow,
    synthetic,
    withUnresolved,
    lastExportAt,
    duplicates,
  };
}

/* ------------------------------------------------------------------ *
 * Verificação de artefato
 * ------------------------------------------------------------------ */

export type VerificationStatus =
  /** Conteúdo vazio — nada a verificar. */
  | 'vazio'
  /** Checksum bate com pelo menos uma exportação registrada. */
  | 'autentico'
  /** Checksum bate, mas o tamanho gravado difere: arquivo provavelmente editado/truncado. */
  | 'divergente'
  /** Nenhuma exportação registrada com este checksum. */
  | 'desconhecido';

export interface VerificationResult {
  status: VerificationStatus;
  checksum: string;
  chars: number;
  /** Todas as exportações que casam (mesmo artefato pode ter sido exportado n vezes). */
  matches: EvidenceEntry[];
}

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  vazio: 'Cole o conteúdo do arquivo',
  autentico: 'Artefato autêntico',
  divergente: 'Checksum bate, tamanho divergente',
  desconhecido: 'Sem correspondência na trilha',
};

/**
 * Verifica um artefato colado contra as evidências registradas.
 *
 * O checksum é recalculado sobre o conteúdo exatamente como recebido. Isso
 * significa que um editor que reescreve quebras de linha invalida a prova —
 * comportamento correto: a garantia é byte a byte, e afrouxá-la tornaria a
 * verificação decorativa.
 */
export function verifyArtifactContent(
  content: string,
  entries: readonly EvidenceEntry[],
): VerificationResult {
  const chars = content.length;
  if (content.trim() === '') {
    return { status: 'vazio', checksum: '', chars: 0, matches: [] };
  }

  const checksum = artifactChecksum(content);
  const matches = entries.filter((e) => e.checksum === checksum);

  if (matches.length === 0) {
    return { status: 'desconhecido', checksum, chars, matches: [] };
  }

  // `artifact_chars` 0 significa registro antigo/sem tamanho: não usar como
  // prova de divergência, senão evidências legítimas viram suspeitas.
  const comTamanho = matches.filter((m) => m.artifactChars > 0);
  const bateTamanho =
    comTamanho.length === 0 || comTamanho.some((m) => m.artifactChars === chars);

  return {
    status: bateTamanho ? 'autentico' : 'divergente',
    checksum,
    chars,
    matches,
  };
}
