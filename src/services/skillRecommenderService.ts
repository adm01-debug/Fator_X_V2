/**
 * Skill Recommender — recomenda skills do registry para uma missão/contexto de agente.
 *
 * Score híbrido:
 *   0.6 × keyword-match (Jaccard sobre tokens de nome+descrição+tags)
 *   0.4 × categoria-fit (baseado em heurísticas do texto da missão)
 *
 * Hard cap: top-5. Tie-break: maior install_count. Fallback puro keyword.
 * Sem chamadas LLM — determinístico, latência < 50ms.
 */
import type { AgentSkillDefinition } from './skillsRegistryService';

export interface RecommendationInput {
  mission: string;
  role?: string;
  tools?: string[];
}

export interface ScoreBreakdown {
  keyword: number; // 0..1 (Jaccard)
  category: number; // 0..1 (heurística)
  weightedKeyword: number; // 0.6 × keyword
  weightedCategory: number; // 0.4 × category
}

export interface Recommendation {
  skill: AgentSkillDefinition;
  score: number;
  reason: string;
  matchedKeywords: string[];
  breakdown: ScoreBreakdown;
}

const STOP_WORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'para', 'com', 'em',
  'e', 'ou', 'que', 'um', 'uma', 'uns', 'umas', 'no', 'na', 'nos', 'nas',
  'ao', 'à', 'às', 'aos', 'por', 'sobre', 'the', 'and', 'or', 'to', 'of',
  'is', 'be', 'are', 'was', 'were', 'in', 'on', 'at', 'for', 'with',
]);

export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

const CATEGORY_HINTS: Record<string, string[]> = {
  tools: ['api', 'ferramenta', 'integracao', 'webhook', 'chamada', 'call'],
  knowledge: ['conhecimento', 'documento', 'rag', 'base', 'pdf', 'arquivo'],
  prompts: ['prompt', 'template', 'instrucao', 'roteiro', 'script'],
  workflows: ['workflow', 'automacao', 'processo', 'fluxo', 'pipeline'],
  integrations: ['slack', 'discord', 'crm', 'salesforce', 'hubspot', 'zapier', 'integracao'],
};

function categoryFit(missionTokens: Set<string>, category: string): number {
  const hints = CATEGORY_HINTS[category] || [];
  if (hints.length === 0) return 0;
  let hits = 0;
  for (const h of hints) if (missionTokens.has(h)) hits++;
  return Math.min(1, hits / 2); // 2 hits = fit máximo
}

export function recommendSkills(
  input: RecommendationInput,
  registry: AgentSkillDefinition[],
  limit = 5,
): Recommendation[] {
  const missionText = [input.mission, input.role ?? '', (input.tools ?? []).join(' ')].join(' ');
  const missionTokens = tokenize(missionText);
  if (missionTokens.size === 0 || registry.length === 0) return [];

  const scored: Recommendation[] = registry.map((skill) => {
    const skillTokens = tokenize(
      `${skill.name} ${skill.description} ${(skill.tags || []).join(' ')}`,
    );
    const keywordScore = jaccard(missionTokens, skillTokens);
    const catScore = categoryFit(missionTokens, skill.category);
    const weightedKeyword = 0.6 * keywordScore;
    const weightedCategory = 0.4 * catScore;
    const score = weightedKeyword + weightedCategory;

    const matched: string[] = [];
    for (const t of missionTokens) if (skillTokens.has(t)) matched.push(t);

    const reason = matched.length > 0
      ? `Alinhada com "${matched.slice(0, 3).join('", "')}" da missão`
      : catScore > 0
        ? `Categoria "${skill.category}" combina com o contexto do agente`
        : 'Skill popular no marketplace';

    return {
      skill,
      score,
      reason,
      matchedKeywords: matched,
      breakdown: { keyword: keywordScore, category: catScore, weightedKeyword, weightedCategory },
    };
  });

  return scored
    .filter((r) => r.score > 0.01)
    .sort((a, b) => {
      if (Math.abs(a.score - b.score) < 0.01) {
        return (b.skill.install_count ?? 0) - (a.skill.install_count ?? 0);
      }
      return b.score - a.score;
    })
    .slice(0, limit);
}
