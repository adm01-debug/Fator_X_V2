/**
 * skill-harvester — normalização, classificação, sanitização e scoring.
 *
 * Runtime Deno. Sem dependências externas além do que já está no _shared.
 */
import {
  DEPARTMENT_LEXICON,
  SKILL_DEPARTMENTS,
  isLicenseAllowed,
  type SkillDepartment,
} from "./departments.ts";

// ─────────────────────────────────────────── tokenização

const STOP_WORDS = new Set([
  'a','o','as','os','de','da','do','das','dos','para','com','em','e','ou','que',
  'um','uma','uns','umas','no','na','nos','nas','ao','por','sobre','the','and',
  'or','to','of','is','be','are','was','were','in','on','at','for','with','this',
  'that','you','your','can','will','use','using','from','has','have',
]);

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOP_WORDS.has(t)),
  );
}

// ─────────────────────────────────────────── sanitização

const TAG_RE = /<\/?[a-z][\s\S]*?>/gi;
// eslint-disable-next-line no-control-regex -- remoção de caracteres de controle é o propósito da regex
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Remove HTML/JS e caracteres de controle. Nunca renderize sem isso. */
export function stripUnsafe(input: string, maxLen = 4000): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(TAG_RE, ' ')
    .replace(CTRL_RE, '')
    .replace(/javascript:/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

// ─────────────────────────────────────────── segurança de conteúdo

const INJECTION_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i, label: 'prompt_injection:ignore_instructions' },
  { re: /disregard\s+(all\s+)?(previous|prior)\s+/i, label: 'prompt_injection:disregard' },
  { re: /ignore\s+as\s+instru[cç][oõ]es\s+anteriores/i, label: 'prompt_injection:pt_ignore' },
  { re: /you\s+are\s+now\s+(in\s+)?(dan|developer\s+mode|jailbreak)/i, label: 'prompt_injection:jailbreak' },
  { re: /reveal\s+(your\s+)?(system\s+prompt|instructions)/i, label: 'prompt_injection:reveal_prompt' },
  { re: /\bcurl\b[^\n]{0,120}\|\s*(ba)?sh\b/i, label: 'shell:pipe_to_shell' },
  { re: /\brm\s+-rf\s+\/(?!\w)/i, label: 'shell:rm_rf_root' },
  { re: /\bprocess\.env\b[\s\S]{0,80}\b(fetch|axios|request)\b/i, label: 'exfiltration:env_to_network' },
  { re: /\bexfiltrat(e|ion)\b/i, label: 'exfiltration:explicit' },
];

const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bghp_[A-Za-z0-9]{30,}\b/, label: 'secret:github_pat' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/, label: 'secret:github_fine_grained' },
  { re: /\bsk-[A-Za-z0-9]{20,}\b/, label: 'secret:openai_key' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, label: 'secret:slack_token' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: 'secret:aws_access_key' },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, label: 'secret:google_api_key' },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, label: 'secret:jwt' },
  { re: /hooks\.slack\.com\/services\/[A-Za-z0-9/]+/, label: 'secret:slack_webhook' },
  { re: /discord(app)?\.com\/api\/webhooks\/\d+\//, label: 'secret:discord_webhook' },
];

/** Entropia de Shannon — usada para pegar segredos fora dos padrões conhecidos. */
export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const freq: Record<string, number> = {};
  for (const ch of s) freq[ch] = (freq[ch] ?? 0) + 1;
  let h = 0;
  for (const k in freq) {
    const p = freq[k] / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const HIGH_ENTROPY_CANDIDATE = /\b[A-Za-z0-9+/_-]{32,}\b/g;

export function scanContentRisks(content: string): string[] {
  const reasons = new Set<string>();
  for (const p of INJECTION_PATTERNS) if (p.re.test(content)) reasons.add(p.label);
  for (const p of SECRET_PATTERNS) if (p.re.test(content)) reasons.add(p.label);

  const matches = content.match(HIGH_ENTROPY_CANDIDATE) ?? [];
  for (const m of matches.slice(0, 200)) {
    if (shannonEntropy(m) > 4.6) {
      reasons.add('secret:high_entropy_string');
      break;
    }
  }
  return Array.from(reasons);
}

/** Allowlist de hosts para servidores MCP. */
export const MCP_HOST_ALLOWLIST = [
  'workers.dev',
  'mcp.so',
  'githubusercontent.com',
  'github.com',
  'supabase.co',
  'vercel.app',
  'fly.dev',
  'render.com',
  'promobrindes.com.br',
];

export function isMcpUrlAllowed(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return MCP_HOST_ALLOWLIST.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────── frontmatter

export interface Frontmatter {
  data: Record<string, string | string[]>;
  body: string;
  present: boolean;
}

const FENCE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

/** Parser mínimo e seguro de frontmatter YAML (strings e listas). */
export function parseFrontmatter(raw: string): Frontmatter {
  const m = raw.match(FENCE);
  if (!m) return { data: {}, body: raw, present: false };
  const data: Record<string, string | string[]> = {};
  let currentKey: string | null = null;

  for (const line of m[1].split(/\r?\n/)) {
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      const prev = data[currentKey];
      const arr = Array.isArray(prev) ? prev : [];
      arr.push(unquote(listItem[1]));
      data[currentKey] = arr;
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    currentKey = kv[1];
    const value = kv[2].trim();
    if (value === '') {
      data[currentKey] = [];
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[currentKey] = value
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
    } else {
      data[currentKey] = unquote(value);
    }
  }
  return { data, body: raw.slice(m[0].length), present: true };
}

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

// ─────────────────────────────────────────── classificação

export interface Classification {
  department: SkillDepartment | null;
  confidence: number;
  /**
   * Procedência do veredito, persistida junto com o rótulo.
   *
   * Espelha os valores aceitos por `skill_harvest_candidates.department_source`.
   * Sem este campo o staging guardava o rótulo sem dizer quem o produziu, e a
   * promoção para o registro nascia como "sem origem conhecida".
   */
  source: 'unknown' | 'heuristic';
}

function hitRate(tokens: Set<string>, lexicon: Set<string>): number {
  if (tokens.size === 0) return 0;
  let hits = 0;
  for (const t of tokens) if (lexicon.has(t)) hits++;
  return Math.min(1, hits / Math.sqrt(tokens.size));
}

const LEX_SETS = Object.fromEntries(
  SKILL_DEPARTMENTS.map((d) => [d, new Set(DEPARTMENT_LEXICON[d])]),
) as Record<SkillDepartment, Set<string>>;

export const LOW_CONFIDENCE_THRESHOLD = 0.18;

export function classifyDepartment(input: {
  name: string;
  description?: string;
  tags?: string[];
  content?: string;
}): Classification {
  const primary = tokenize(`${input.name} ${input.description ?? ''}`);
  const tagT = tokenize((input.tags ?? []).join(' '));
  const contentT = input.content ? tokenize(input.content.slice(0, 4000)) : new Set<string>();

  let best: SkillDepartment | null = null;
  let bestScore = 0;
  for (const dep of SKILL_DEPARTMENTS) {
    const lex = LEX_SETS[dep];
    const score = 0.55 * hitRate(primary, lex) + 0.3 * hitRate(tagT, lex) + 0.15 * hitRate(contentT, lex);
    if (score > bestScore) {
      bestScore = score;
      best = dep;
    }
  }
  // Score zero significa que nenhum léxico encostou no texto: não há rótulo,
  // logo não há procedência a declarar.
  const department = bestScore > 0 ? best : null;
  return {
    department,
    confidence: Number(bestScore.toFixed(3)),
    source: department ? 'heuristic' : 'unknown',
  };
}

export function inferCategory(input: {
  name: string;
  description?: string;
  tags?: string[];
  hasMcpServer?: boolean;
}): string {
  if (input.hasMcpServer) return 'integrations';
  const t = tokenize(`${input.name} ${input.description ?? ''} ${(input.tags ?? []).join(' ')}`);
  const has = (...w: string[]) => w.some((x) => t.has(x));
  if (has('workflow', 'workflows', 'automation', 'automacao', 'orchestration')) return 'workflows';
  if (has('prompt', 'prompts', 'persona', 'template', 'templates', 'instruction')) return 'prompts';
  if (has('knowledge', 'conhecimento', 'rag', 'docs', 'documentation', 'wiki', 'guide')) return 'knowledge';
  if (has('integration', 'integracao', 'connector', 'conector', 'webhook', 'sdk', 'mcp')) return 'integrations';
  return 'tools';
}

// ─────────────────────────────────────────── repositórios "meta"

/**
 * Padrões de repositórios que NÃO são skills instaláveis: listas curadas,
 * coletâneas, cursos, roadmaps e materiais didáticos.
 *
 * Por que isso importa: na primeira varredura real, 9 dos 9 candidatos que
 * chegaram à curadoria manual eram coletâneas (awesome-mcp-servers,
 * public-apis, IoT-For-Beginners…). Elas passavam porque a nota era dominada
 * por estrelas — `public-apis` tem 452k estrelas e zero skills executáveis.
 */
const META_REPO_PATTERNS: RegExp[] = [
  /\bawesome\b/,
  /\bawesome[-_]/,
  /[-_]awesome\b/,
  /\bcurated\b/,
  /\bcollection\b/,
  /\bcollective\b/,
  /\blist of\b/,
  /\blist[-_]of\b/,
  /\bcheat[-_ ]?sheets?\b/,
  /\bfor[-_ ]beginners\b/,
  /\bfrom[-_ ]scratch\b/,
  /\broadmap\b/,
  /\btutorials?\b/,
  /\bcourse\b/,
  /\bcurriculum\b/,
  /\bmasters\b/,
  /\blessons\b/,
  /\bexamples?[-_ ]repo\b/,
  /\bpublic[-_ ]apis\b/,
  /\bhandbook\b/,
  /\binterview[-_ ]questions\b/,
];

const META_TAGS = new Set([
  'awesome',
  'awesome-list',
  'awesome-lists',
  'curated-list',
  'list',
  'collection',
  'resources',
  'tutorial',
  'tutorials',
  'course',
  'learning',
  'education',
  'roadmap',
  'books',
]);

/**
 * true quando o repositório é uma coletânea/curso e não uma skill executável.
 * Avalia nome, slug, descrição, tópicos e o início do README.
 */
export function isMetaRepository(input: {
  name?: string;
  slug?: string;
  description?: string;
  tags?: string[];
  content?: string;
}): boolean {
  const haystack = [
    input.name ?? '',
    input.slug ?? '',
    input.description ?? '',
    (input.content ?? '').slice(0, 400),
  ]
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (META_REPO_PATTERNS.some((re) => re.test(haystack))) return true;
  return (input.tags ?? []).some((t) => META_TAGS.has(t.toLowerCase()));
}

// ─────────────────────────────────────────── qualidade

export interface QualitySignals {
  stars: number;
  lastCommitAt?: string | null;
  hasDocs: boolean;
  hasTests: boolean;
  licenseAllowed: boolean;
  frontmatterCompleteness: number;
  descriptionLength: number;
  /** Repositório-coletânea (ver `isMetaRepository`): não é skill instalável. */
  isMeta?: boolean;
  /** Confiança da classificação departamental (0..1) — sinal de especificidade. */
  departmentConfidence?: number;
}

/**
 * Nota de qualidade 0..100 ponderada por INSTALABILIDADE, não por popularidade.
 *
 * Mudança em relação à v1: estrelas caíram de 30 para 12 pontos e passaram a
 * ser um sinal de confiança, não o eixo principal. O peso migrou para os
 * sinais que indicam uma skill real e específica — frontmatter completo
 * (nome/descrição/tags), documentação, testes e confiança departamental.
 * Coletâneas sofrem penalidade dura de 45 pontos, o que as joga abaixo do
 * `MIN_QUALITY_SCORE` mesmo com centenas de milhares de estrelas.
 */
export function computeQualityScore(s: QualitySignals): number {
  const stars = Math.min(1, Math.log10(Math.max(1, s.stars)) / 3) * 12;

  let recency = 0;
  if (s.lastCommitAt) {
    const months = (Date.now() - new Date(s.lastCommitAt).getTime()) / (1000 * 60 * 60 * 24 * 30);
    recency = Math.max(0, 1 - months / 24) * 18;
  }

  const frontmatter = Math.max(0, Math.min(1, s.frontmatterCompleteness)) * 25;
  const department = Math.max(0, Math.min(1, (s.departmentConfidence ?? 0) / 0.5)) * 12;

  const total =
    stars +
    recency +
    frontmatter +
    department +
    (s.hasDocs ? 8 : 0) +
    (s.hasTests ? 8 : 0) +
    (s.licenseAllowed ? 12 : 0) +
    Math.min(1, s.descriptionLength / 160) * 5 +
    (s.isMeta ? META_PENALTY : 0);

  return Number(Math.max(0, Math.min(100, total)).toFixed(2));
}

/** Penalidade aplicada a repositórios-coletânea. */
export const META_PENALTY = -45;

export const MIN_QUALITY_SCORE = 35;



// ─────────────────────────────────────────── utilitários

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Normaliza o conteúdo antes de hashear, para deduplicar variações triviais. */
export function normalizeForHash(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export { isLicenseAllowed };
