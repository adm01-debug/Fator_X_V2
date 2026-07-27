/**
 * Classificador determinístico de departamento para skills.
 *
 * Estratégia (sem LLM, < 1ms por skill):
 *   score(dep) = 0.7 × jaccardBoost(tokens, lexicon) + 0.3 × tagHitRate(tags, lexicon)
 *
 * Retorna o departamento vencedor e a confiança (0..1). Confiança abaixo de
 * `LOW_CONFIDENCE_THRESHOLD` sinaliza que vale acionar o fallback LLM.
 */
import {
  DEPARTMENT_META,
  SKILL_DEPARTMENTS,
  type SkillDepartment,
} from '@/config/skill-departments';
import { tokenize } from '@/services/skillRecommenderService';

export const LOW_CONFIDENCE_THRESHOLD = 0.18;

export interface DepartmentClassification {
  department: SkillDepartment | null;
  confidence: number;
  matchedTerms: string[];
  /** Ranking completo, do maior para o menor score. */
  ranking: Array<{ department: SkillDepartment; score: number }>;
  needsLlmFallback: boolean;
}

export interface ClassifierInput {
  name: string;
  description?: string;
  tags?: string[];
  /** Conteúdo bruto (SKILL.md) — usado com peso reduzido. */
  content?: string;
}

const LEXICON_SETS: Record<SkillDepartment, Set<string>> = Object.fromEntries(
  SKILL_DEPARTMENTS.map((d) => [d, new Set(DEPARTMENT_META[d].lexicon)]),
) as Record<SkillDepartment, Set<string>>;

function hitRate(tokens: Set<string>, lexicon: Set<string>): { rate: number; hits: string[] } {
  if (tokens.size === 0) return { rate: 0, hits: [] };
  const hits: string[] = [];
  for (const t of tokens) if (lexicon.has(t)) hits.push(t);
  // Normaliza por sqrt para não penalizar textos longos de forma agressiva.
  const rate = hits.length / Math.sqrt(tokens.size);
  return { rate: Math.min(1, rate), hits };
}

export function classifyDepartment(input: ClassifierInput): DepartmentClassification {
  const primaryText = [input.name, input.description ?? ''].join(' ');
  const primaryTokens = tokenize(primaryText);
  const tagTokens = tokenize((input.tags ?? []).join(' '));
  // Conteúdo bruto é truncado para limitar custo e ruído.
  const contentTokens = input.content ? tokenize(input.content.slice(0, 4000)) : new Set<string>();

  const ranking: Array<{ department: SkillDepartment; score: number }> = [];
  let bestHits: string[] = [];
  let best: SkillDepartment | null = null;
  let bestScore = 0;

  for (const dep of SKILL_DEPARTMENTS) {
    const lex = LEXICON_SETS[dep];
    const p = hitRate(primaryTokens, lex);
    const t = hitRate(tagTokens, lex);
    const c = hitRate(contentTokens, lex);
    const score = 0.55 * p.rate + 0.3 * t.rate + 0.15 * c.rate;
    ranking.push({ department: dep, score });
    if (score > bestScore) {
      bestScore = score;
      best = dep;
      bestHits = Array.from(new Set([...p.hits, ...t.hits, ...c.hits])).slice(0, 12);
    }
  }

  ranking.sort((a, b) => b.score - a.score);

  const confidence = Number(bestScore.toFixed(3));
  const resolved = confidence > 0 ? best : null;

  return {
    department: resolved,
    confidence,
    matchedTerms: resolved ? bestHits : [],
    ranking,
    needsLlmFallback: confidence < LOW_CONFIDENCE_THRESHOLD,
  };
}

/**
 * Mapeia sinais do repositório para uma das 5 categorias do registry.
 */
export function inferCategory(input: {
  name: string;
  description?: string;
  tags?: string[];
  hasMcpServer?: boolean;
  hasWorkflow?: boolean;
}): 'tools' | 'knowledge' | 'prompts' | 'workflows' | 'integrations' {
  if (input.hasMcpServer) return 'integrations';
  const tokens = tokenize([input.name, input.description ?? '', (input.tags ?? []).join(' ')].join(' '));
  const has = (...words: string[]) => words.some((w) => tokens.has(w));

  if (input.hasWorkflow || has('workflow', 'workflows', 'automation', 'automacao', 'pipeline', 'orchestration')) {
    return 'workflows';
  }
  if (has('prompt', 'prompts', 'persona', 'template', 'templates', 'system', 'instruction')) {
    return 'prompts';
  }
  if (has('knowledge', 'conhecimento', 'rag', 'docs', 'documentation', 'wiki', 'reference', 'guide')) {
    return 'knowledge';
  }
  if (has('integration', 'integracao', 'connector', 'conector', 'api', 'webhook', 'sdk', 'mcp')) {
    return 'integrations';
  }
  return 'tools';
}

export interface QualitySignals {
  stars: number;
  lastCommitAt?: string | null;
  hasDocs: boolean;
  hasTests: boolean;
  licenseAllowed: boolean;
  frontmatterCompleteness: number; // 0..1
  descriptionLength: number;
}

/**
 * Nota de qualidade 0..100 combinando popularidade, recência e completude.
 */
export function computeQualityScore(s: QualitySignals): number {
  // Popularidade: log-escalada, satura em ~1000 estrelas (30 pts)
  const stars = Math.min(1, Math.log10(Math.max(1, s.stars)) / 3) * 30;

  // Recência: 25 pts, decai linearmente até 24 meses
  let recency = 0;
  if (s.lastCommitAt) {
    const months = (Date.now() - new Date(s.lastCommitAt).getTime()) / (1000 * 60 * 60 * 24 * 30);
    recency = Math.max(0, 1 - months / 24) * 25;
  }

  const docs = s.hasDocs ? 10 : 0;
  const tests = s.hasTests ? 10 : 0;
  const license = s.licenseAllowed ? 15 : 0;
  const frontmatter = Math.max(0, Math.min(1, s.frontmatterCompleteness)) * 5;
  const description = Math.min(1, s.descriptionLength / 160) * 5;

  return Number((stars + recency + docs + tests + license + frontmatter + description).toFixed(2));
}

export const MIN_QUALITY_SCORE = 35;
