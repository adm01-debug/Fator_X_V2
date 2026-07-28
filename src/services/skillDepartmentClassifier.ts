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
  DOMAIN_DEPARTMENTS,
  FALLBACK_DEPARTMENT,
  SKILL_DEPARTMENTS,
  type SkillDepartment,
} from '@/config/skill-departments';
import { tokenize } from '@/services/skillRecommenderService';

export const LOW_CONFIDENCE_THRESHOLD = 0.18;

/**
 * Piso de score para o balde `transversal`. Abaixo disso a skill continua
 * "Não classificada" — é preferível o vazio explícito a um rótulo enganoso.
 * Calibrado por simulação sobre o catálogo real (142 skills): resgata 15
 * agregadores sem roubar nenhuma classificação de domínio válida.
 */
export const MIN_TRANSVERSAL_SCORE = 0.2;

/**
 * Camada de decisão que produziu o veredito:
 *  - `domain`: um departamento de negócio venceu por léxico próprio;
 *  - `transversal`: nenhum domínio pontuou, mas há sinal de agregador;
 *  - `platform`: o texto é dominado por vocabulário de plataforma de agentes
 *    (o mesmo que o filtro IDF descarta) — evidência positiva de tooling/TI;
 *  - `none`: sem evidência suficiente, permanece não classificada.
 */
export type ClassificationTier = 'domain' | 'transversal' | 'platform' | 'none';

export interface DepartmentClassification {
  department: SkillDepartment | null;
  confidence: number;
  matchedTerms: string[];
  /** Ranking completo, do maior para o menor score. */
  ranking: Array<{ department: SkillDepartment; score: number }>;
  needsLlmFallback: boolean;
  tier: ClassificationTier;
  /** Fração de tokens de plataforma no texto primário + tags (0..1). */
  platformDensity: number;
  /** Evidência que sustenta a confiança do tier de plataforma. */
  platformEvidence: { distinctTerms: number; fieldsWithSignal: number };

  /** Veredito determinístico porém fraco: exige confirmação humana. */
  needsReview: boolean;
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

/**
 * Vocabulário de PLATAFORMA — presente em praticamente toda skill do catálogo
 * ("agent", "skill", "llm", "prompt", "claude"...). Termos assim têm frequência
 * de documento próxima de 1: não discriminam departamento algum, apenas somam
 * ruído. A simulação sobre as 142 skills reais mostrou que incluí-los no léxico
 * de TI sequestrava skills de domínio legítimas (TradingAgents → TI,
 * eCommerce Skills → TI). Removê-los antes da pontuação é o equivalente léxico
 * de um filtro IDF: preserva o sinal de domínio e devolve agregadores puros ao
 * balde `transversal`, que é onde eles pertencem.
 */
export const PLATFORM_STOPWORDS = new Set<string>([
  'ai', 'ia', 'agent', 'agents', 'agentic', 'agente', 'agentes',
  'skill', 'skills', 'habilidade', 'habilidades',
  'llm', 'llms', 'gpt', 'prompt', 'prompts', 'prompting',
  'claude', 'codex', 'cursor', 'copilot', 'anthropic', 'openai', 'gemini',
  'mcp', 'chatgpt', 'assistant', 'assistente', 'model', 'modelos',
  'tool', 'tools', 'ferramenta', 'ferramentas', 'usar', 'use', 'using',
]);

function dropStopwords(tokens: Set<string>): Set<string> {
  const limpos = new Set<string>();
  for (const t of tokens) if (!PLATFORM_STOPWORDS.has(t)) limpos.add(t);
  return limpos;
}

function hitRate(tokens: Set<string>, lexicon: Set<string>): { rate: number; hits: string[] } {
  if (tokens.size === 0) return { rate: 0, hits: [] };
  const hits: string[] = [];
  for (const t of tokens) if (lexicon.has(t)) hits.push(t);
  // Normaliza por sqrt para não penalizar textos longos de forma agressiva.
  const rate = hits.length / Math.sqrt(tokens.size);
  return { rate: Math.min(1, rate), hits };
}

/**
 * Densidade mínima de vocabulário de plataforma para acionar o tier `platform`.
 * Calibrada por simulação sobre as 142 skills reais: 0.08 é o menor valor que
 * resgata os casos de sinal-zero cujo texto é curto (paperclip, gstack, scroll
 * world, agency agents) sem alterar o veredito de NENHUMA skill de domínio já
 * classificada — o tier só é consultado quando a confiança de domínio já ficou
 * abaixo de LOW_CONFIDENCE_THRESHOLD.
 */
export const MIN_PLATFORM_DENSITY = 0.08;

/** Departamento atribuído pelo tier de plataforma (tooling de agentes = TI). */
export const PLATFORM_TIER_DEPARTMENT: SkillDepartment = 'ti';

/**
 * Confiança BASE do tier de plataforma — o piso, atribuído a um veredito
 * apoiado em um único termo de jargão. Deliberadamente abaixo de
 * `LOW_CONFIDENCE_THRESHOLD`: o veredito é determinístico, mas indireto
 * (inferido pela ausência de domínio), então nasce marcado para revisão.
 */
export const PLATFORM_TIER_CONFIDENCE = 0.15;

/** Ganho de confiança por termo de plataforma DISTINTO além do primeiro. */
export const PLATFORM_EVIDENCE_STEP = 0.03;

/**
 * Teto do tier de plataforma. Nunca alcança a confiança de um veredito de
 * domínio nem a de curadoria humana: por mais jargão que haja, a inferência
 * continua sendo "isto é ferramental", não "isto é do departamento X".
 */
export const PLATFORM_TIER_MAX_CONFIDENCE = 0.4;

/**
 * Teto aplicado quando TODA a evidência vem de um único campo. Fica um passo
 * abaixo do limiar de revisão de propósito: vinte tópicos de jargão colados em
 * um repositório sem descrição são um metadado inflado, não corroboração.
 * Exigir dois campos independentes é o que separa evidência de repetição.
 */
export const PLATFORM_SINGLE_FIELD_CAP = 0.17;

interface PlatformEvidence {
  density: number;
  /** Termos de plataforma distintos em todo o texto. */
  distinctTerms: number;
  /** Campos independentes (nome+descrição, tags) com ao menos um sinal. */
  fieldsWithSignal: number;
  confidence: number;
}

function platformSignals(text: string): Set<string> {
  const encontrados = new Set<string>();
  for (const t of tokenize(text)) if (PLATFORM_STOPWORDS.has(t)) encontrados.add(t);
  return encontrados;
}

/**
 * Mede o jargão de plataforma em duas dimensões independentes.
 *
 * A densidade decide SE o tier dispara; a contagem de termos distintos e de
 * campos corroborantes decide QUÃO confiável é o veredito. Antes disso, todo
 * item do tier recebia 0.15 fixo — `gstack` ("Router for the gstack skill
 * suite", zero tópicos) empatava com `fastmcp` (MCP, Python, servidores,
 * clientes, nove tópicos). Um empate assim fabrica trabalho de curadoria:
 * o caso óbvio e o caso genuinamente ambíguo chegam na mesma fila.
 */
function platformEvidenceOf(input: ClassifierInput): PlatformEvidence {
  const primario = [input.name, input.description ?? ''].join(' ');
  const tagsTexto = (input.tags ?? []).join(' ');
  const brutos = tokenize([primario, tagsTexto].join(' '));
  if (brutos.size === 0) {
    return { density: 0, distinctTerms: 0, fieldsWithSignal: 0, confidence: 0 };
  }

  const sinaisPrimario = platformSignals(primario);
  const sinaisTags = platformSignals(tagsTexto);
  const distintos = new Set([...sinaisPrimario, ...sinaisTags]);

  let plataforma = 0;
  for (const t of brutos) if (PLATFORM_STOPWORDS.has(t)) plataforma += 1;
  const density = plataforma / brutos.size;

  const fieldsWithSignal = (sinaisPrimario.size > 0 ? 1 : 0) + (sinaisTags.size > 0 ? 1 : 0);

  let confidence =
    PLATFORM_TIER_CONFIDENCE + PLATFORM_EVIDENCE_STEP * Math.max(0, distintos.size - 1);
  confidence = Math.min(confidence, PLATFORM_TIER_MAX_CONFIDENCE);
  if (fieldsWithSignal < 2) confidence = Math.min(confidence, PLATFORM_SINGLE_FIELD_CAP);

  return {
    density,
    distinctTerms: distintos.size,
    fieldsWithSignal,
    confidence: Number(confidence.toFixed(3)),
  };
}


export function classifyDepartment(input: ClassifierInput): DepartmentClassification {
  const primaryText = [input.name, input.description ?? ''].join(' ');
  const primaryTokens = dropStopwords(tokenize(primaryText));
  const tagTokens = dropStopwords(tokenize((input.tags ?? []).join(' ')));
  // Conteúdo bruto é truncado para limitar custo e ruído.
  const contentTokens = input.content
    ? dropStopwords(tokenize(input.content.slice(0, 4000)))
    : new Set<string>();


  const ranking: Array<{ department: SkillDepartment; score: number }> = [];
  let bestHits: string[] = [];
  let best: SkillDepartment | null = null;
  let bestScore = 0;

  for (const dep of DOMAIN_DEPARTMENTS) {
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

  // `transversal` é avaliado FORA da competição: entra no ranking para dar
  // visibilidade, mas só vence quando nenhum domínio real tem sinal relevante.
  const fLex = LEXICON_SETS[FALLBACK_DEPARTMENT];
  const fp = hitRate(primaryTokens, fLex);
  const ft = hitRate(tagTokens, fLex);
  const fc = hitRate(contentTokens, fLex);
  const fallbackScore = 0.55 * fp.rate + 0.3 * ft.rate + 0.15 * fc.rate;
  ranking.push({ department: FALLBACK_DEPARTMENT, score: fallbackScore });

  ranking.sort((a, b) => b.score - a.score);

  let confidence = Number(bestScore.toFixed(3));
  let resolved: SkillDepartment | null = confidence > 0 ? best : null;
  let matched = resolved ? bestHits : [];
  let tier: ClassificationTier = resolved === null ? 'none' : 'domain';

  if (confidence < LOW_CONFIDENCE_THRESHOLD && fallbackScore >= MIN_TRANSVERSAL_SCORE) {
    resolved = FALLBACK_DEPARTMENT;
    confidence = Number(fallbackScore.toFixed(3));
    matched = Array.from(new Set([...fp.hits, ...ft.hits, ...fc.hits])).slice(0, 12);
    tier = 'transversal';
  }

  const evidenciaPlataforma = platformEvidenceOf(input);
  const platformDensity = Number(evidenciaPlataforma.density.toFixed(3));

  /**
   * Tier de plataforma — último recurso ANTES do vazio. Só entra quando nem
   * domínio nem agregador produziram evidência utilizável. As stopwords, que
   * são ruído para discriminar domínio, viram aqui o próprio sinal: um texto
   * saturado de "agent/skill/llm/mcp" descreve ferramental de agentes, e
   * ferramental é TI. Nunca sobrescreve um veredito de domínio ou transversal.
   */
  if (
    tier !== 'transversal' &&
    confidence < LOW_CONFIDENCE_THRESHOLD &&
    platformDensity >= MIN_PLATFORM_DENSITY
  ) {
    resolved = PLATFORM_TIER_DEPARTMENT;
    confidence = evidenciaPlataforma.confidence;
    tier = 'platform';
    matched = Array.from(new Set([...bestHits, 'plataforma-de-agentes'])).slice(0, 12);
  } else if (resolved === null) {
    tier = 'none';
  }

  return {
    department: resolved,
    confidence,
    matchedTerms: matched,
    ranking,
    // Um agregador resolvido não precisa de LLM: a ausência de domínio é o fato.
    // O tier de plataforma também é conclusivo — vai para revisão, não para LLM.
    needsLlmFallback:
      tier !== 'transversal' && tier !== 'platform' && confidence < LOW_CONFIDENCE_THRESHOLD,
    tier,
    platformDensity,
    platformEvidence: {
      distinctTerms: evidenciaPlataforma.distinctTerms,
      fieldsWithSignal: evidenciaPlataforma.fieldsWithSignal,
    },
    // Só o tier de plataforma FRACO precisa de humano. Evidência corroborada em
    // campos independentes já é conclusiva o bastante para não ocupar a fila.
    needsReview:
      (tier === 'platform' || tier === 'domain') && confidence < LOW_CONFIDENCE_THRESHOLD,
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
