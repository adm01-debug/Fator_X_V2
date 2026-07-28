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

/**
 * Siglas de 2 letras relevantes no domínio (IA, BI, TI...). Tokens de 2 caracteres
 * são descartados por padrão como ruído, exceto quando fazem parte deste conjunto.
 */
const SHORT_TERMS = new Set(['ia', 'ai', 'bi', 'ti', 'qa', 'ux', 'ui', 'db', 'ml', 'nl', 'hr', 'rh', 'cs', 'go', 'js', 'ci', 'cd']);

export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => {
      if (STOP_WORDS.has(t)) return false;
      if (t.length >= 3) return true;
      return t.length === 2 && SHORT_TERMS.has(t);
    });
  return new Set(tokens);
}


/**
 * Sinônimos PT-BR ↔ EN e variações morfológicas.
 * Sem expansão, uma missão em português nunca casa com skills nomeadas em inglês
 * (e vice-versa), derrubando o recall do recomendador.
 */
const SYNONYMS: Record<string, string[]> = {
  vendas: ['sales', 'comercial', 'pipeline', 'deal'],
  sales: ['vendas', 'comercial'],
  cliente: ['clientes', 'customer', 'lead', 'contato'],
  clientes: ['cliente', 'customer', 'lead'],
  lead: ['leads', 'prospect', 'cliente'],
  suporte: ['support', 'atendimento', 'helpdesk', 'ticket'],
  atendimento: ['suporte', 'support', 'helpdesk'],
  documento: ['documentos', 'document', 'arquivo', 'pdf', 'rag'],
  documentos: ['documento', 'document', 'arquivo', 'rag'],
  pesquisa: ['research', 'busca', 'search', 'investigacao'],
  busca: ['search', 'pesquisa', 'consulta'],
  search: ['busca', 'pesquisa'],
  codigo: ['code', 'programacao', 'engenharia', 'software'],
  code: ['codigo', 'programacao', 'software'],
  teste: ['testes', 'test', 'tdd', 'qa', 'qualidade'],
  testes: ['teste', 'test', 'tdd', 'qa'],
  depurar: ['debug', 'depuracao', 'bug', 'erro'],
  bug: ['erro', 'debug', 'defeito'],
  planejamento: ['plano', 'plan', 'planning', 'roadmap'],
  plano: ['planejamento', 'plan', 'roadmap'],
  revisao: ['review', 'code review', 'auditoria'],
  review: ['revisao', 'auditoria'],
  automacao: ['automation', 'workflow', 'fluxo', 'processo'],
  workflow: ['automacao', 'fluxo', 'processo', 'pipeline'],
  relatorio: ['relatorios', 'report', 'analytics', 'dashboard'],
  dados: ['data', 'analytics', 'banco', 'database', 'sql'],
  marketing: ['campanha', 'conteudo', 'seo', 'social'],
  financeiro: ['finance', 'faturamento', 'billing', 'custos'],
  email: ['emails', 'mail', 'mensagem', 'smtp'],
  whatsapp: ['zap', 'mensagem', 'chat'],
};

/** Expande o conjunto de tokens com sinônimos conhecidos (1 nível, sem recursão). */
export function expandTokens(tokens: Set<string>): Set<string> {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const syn of SYNONYMS[token] ?? []) {
      for (const part of syn.split(/\s+/)) {
        if (part.length >= 3) expanded.add(part);
      }
    }
  }
  return expanded;
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

export interface RecommendOptions {
  /**
   * Preenche o resultado com skills de baseline (mais instaladas/verificadas)
   * quando o ranking semântico devolve menos que `limit`. Desligado por padrão
   * para preservar determinismo em fluxos que exigem apenas matches reais.
   */
  fillBaseline?: boolean;
}

export function recommendSkills(
  input: RecommendationInput,
  registry: AgentSkillDefinition[],
  limit = 5,
  options: RecommendOptions = {},
): Recommendation[] {
  const missionText = [input.mission, input.role ?? '', (input.tools ?? []).join(' ')].join(' ');
  const rawTokens = tokenize(missionText);
  if (rawTokens.size === 0 || registry.length === 0) return [];
  const missionTokens = expandTokens(rawTokens);

  const scored: Recommendation[] = registry.map((skill) => {
    const skillTokens = tokenize(
      `${skill.name} ${skill.description} ${(skill.tags || []).join(' ')}`,
    );
    const keywordScore = jaccard(missionTokens, skillTokens);
    const catScore = categoryFit(missionTokens, skill.category);
    const weightedKeyword = 0.6 * keywordScore;
    const weightedCategory = 0.4 * catScore;
    const score = weightedKeyword + weightedCategory;

    // Tokens literais da missão têm prioridade na explicação; sinônimos entram depois.
    const matched: string[] = [];
    for (const t of rawTokens) if (skillTokens.has(t)) matched.push(t);
    for (const t of missionTokens) {
      if (!rawTokens.has(t) && skillTokens.has(t)) matched.push(t);
    }

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

  // Ordenação por bucket quantizado (centésimos): garante transitividade —
  // um comparador com epsilon direto sobre floats quebra a relação de ordem
  // e produz sequências com score fora de ordem decrescente.
  const bucketOf = (score: number) => Math.round(score * 100);
  const ranked = scored
    .filter((r) => r.score > 0.01)
    .sort((a, b) => {
      const bucketDiff = bucketOf(b.score) - bucketOf(a.score);
      if (bucketDiff !== 0) return bucketDiff;
      const installDiff = (b.skill.install_count ?? 0) - (a.skill.install_count ?? 0);
      if (installDiff !== 0) return installDiff;
      return a.skill.id.localeCompare(b.skill.id);
    })

    .slice(0, limit);

  if (!options.fillBaseline || ranked.length >= limit) return ranked;

  const chosen = new Set(ranked.map((r) => r.skill.id));
  const baseline = registry
    .filter((s) => !chosen.has(s.id))
    .sort((a, b) => {
      const verified = Number(b.is_verified) - Number(a.is_verified);
      if (verified !== 0) return verified;
      const installs = (b.install_count ?? 0) - (a.install_count ?? 0);
      if (installs !== 0) return installs;
      return (b.rating ?? 0) - (a.rating ?? 0);
    })
    .slice(0, limit - ranked.length)
    .map<Recommendation>((skill) => ({
      skill,
      score: 0,
      reason: 'Baseline recomendada: skill verificada e popular no marketplace',
      matchedKeywords: [],
      breakdown: { keyword: 0, category: 0, weightedKeyword: 0, weightedCategory: 0 },
    }));

  return [...ranked, ...baseline];
}


/**
 * Deriva os ids de skills recomendadas que ainda NÃO estão instaladas no agente.
 * Pura e determinística: preserva a ordem de ranking, remove duplicatas e ids inválidos.
 */
export function computePendingSkillIds(
  recommendations: ReadonlyArray<{ skill: { id: string } }>,
  installedIds: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  const pending: string[] = [];
  for (const rec of recommendations ?? []) {
    const id = typeof rec?.skill?.id === 'string' ? rec.skill.id.trim() : '';
    if (!id || seen.has(id) || installedIds.has(id)) continue;
    seen.add(id);
    pending.push(id);
  }
  return pending;
}
