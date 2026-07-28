/**
 * Demanda de Skills — mede quantos templates de agente referenciam cada skill
 * do Registry e classifica o resultado em faixas acionáveis para curadoria.
 *
 * Por que existe: o catálogo cresce por harvest (centenas de skills), mas o
 * motor de recomendação só consegue vincular um subconjunto. Skills com
 * demanda ZERO nunca chegam a um agente — são candidatas a reescrita de tags,
 * reclassificação de departamento ou arquivamento. Sem esta medição a dívida
 * fica invisível.
 *
 * Todas as funções são puras e totais: entradas hostis (nulos, ids duplicados,
 * contagens negativas, vínculos apontando para skills inexistentes) degradam
 * para um resultado válido em vez de lançar exceção.
 */

/** Faixas de demanda, da mais crítica para a mais saudável. */
export type DemandTier = 'zero' | 'baixa' | 'media' | 'alta';

export const DEMAND_TIERS: DemandTier[] = ['zero', 'baixa', 'media', 'alta'];

export const DEMAND_TIER_LABEL: Record<DemandTier, string> = {
  zero: 'Demanda zero',
  baixa: 'Demanda baixa',
  media: 'Demanda média',
  alta: 'Demanda alta',
};

/** Limiares (inclusivos no piso) usados na classificação. */
export const DEMAND_THRESHOLDS = { baixa: 1, media: 3, alta: 6 } as const;

/**
 * Classifica a demanda a partir da quantidade de templates vinculados.
 * Valores inválidos (NaN, negativos, fracionários) são normalizados para 0.
 */
export function classifyDemand(templateCount: number): DemandTier {
  const n = Number.isFinite(templateCount) ? Math.max(0, Math.floor(templateCount)) : 0;
  if (n === 0) return 'zero';
  if (n < DEMAND_THRESHOLDS.media) return 'baixa';
  if (n < DEMAND_THRESHOLDS.alta) return 'media';
  return 'alta';
}

/**
 * Procedencias aceitas para a classificacao departamental (espelha o CHECK do banco).
 *
 * `lexical` é o rótulo legado do motor determinístico e `platform_heuristic` é
 * o tier de jargão de plataforma. Ambos precisam estar aqui: qualquer valor
 * fora da lista degrada para `unknown`, o que apagaria a procedência real na
 * UI e faria uma decisão automática parecer "sem origem conhecida".
 */
export const DEPARTMENT_SOURCES = [
  'unknown',
  'heuristic',
  'lexical',
  'platform_heuristic',
  'llm',
  'human',
  'import',
] as const;
export type DepartmentSource = (typeof DEPARTMENT_SOURCES)[number];

/** Rótulos pt-BR das procedências, para filtros e legendas. */
export const DEPARTMENT_SOURCE_LABEL: Record<DepartmentSource, string> = {
  unknown: 'Sem origem',
  heuristic: 'Léxico',
  lexical: 'Léxico (legado)',
  platform_heuristic: 'Plataforma',
  llm: 'IA (LLM)',
  human: 'Humano',
  import: 'Importação',
};


/**
 * Piso de confianca abaixo do qual a classificacao automatica e tratada como
 * palpite. Alinhado ao limiar usado na fila de reclassificacao.
 */
export const DEPARTMENT_REVIEW_THRESHOLD = 0.5;

/** Normaliza a procedencia vinda do banco, degradando para `unknown`. */
export function normalizeDepartmentSource(value: unknown): DepartmentSource {
  return (DEPARTMENT_SOURCES as readonly string[]).includes(String(value))
    ? (value as DepartmentSource)
    : 'unknown';
}

/** Converte a confianca (numeric chega como string no PostgREST) para [0,1]. */
export function normalizeDepartmentConfidence(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Entrada mínima exigida de uma skill do Registry. */
export interface DemandSkillInput {
  id: string;
  name?: string | null;
  slug?: string | null;
  department?: string | null;
  quality_score?: number | null;
  source_repo?: string | null;
  description?: string | null;
  tags?: readonly string[] | null;
  /** Confianca [0,1] da classificacao departamental persistida no Registry. */
  department_confidence?: number | string | null;
  /** Procedencia da classificacao: unknown | heuristic | llm | human | import. */
  department_source?: string | null;
}

/** Vínculo ativo template ↔ skill. */
export interface DemandLinkInput {
  skill_id: string;
  template_id: string;
}

/** Linha pronta para a UI. */
export interface SkillDemandRow {
  skillId: string;
  name: string;
  slug: string;
  department: string | null;
  qualityScore: number;
  sourceRepo: string | null;
  templateCount: number;
  tier: DemandTier;
  /** Texto e tags usados pelo classificador de departamento na reclassificação. */
  description: string;
  tags: string[];
  /** Confianca normalizada [0,1]; 0 quando ausente ou invalida. */
  departmentConfidence: number;
  /** Procedencia normalizada da classificacao departamental. */
  departmentSource: DepartmentSource;
  /**
   * Verdadeiro quando a classificacao veio de heuristica/LLM com baixa
   * confianca — sinaliza revisao humana pendente antes de confiar no rotulo.
   */
  departmentNeedsReview: boolean;
}

/** Resumo agregado exibido no cabeçalho do painel. */
export interface SkillDemandSummary {
  total: number;
  byTier: Record<DemandTier, number>;
  /** Percentual de skills que chegam a pelo menos um template (0..100). */
  coveragePct: number;
}

function safeText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

/**
 * Cruza catálogo × vínculos e devolve uma linha por skill, ordenada por
 * demanda crescente (o que precisa de atenção primeiro) e, em empate, por
 * qualidade decrescente e slug — comparador total, logo estável e transitivo.
 *
 * Vínculos duplicados (mesmo template para a mesma skill) contam uma única
 * vez; vínculos órfãos (skill inexistente no catálogo) são ignorados.
 */
export function buildSkillDemandRows(
  skills: readonly DemandSkillInput[] | null | undefined,
  links: readonly DemandLinkInput[] | null | undefined,
): SkillDemandRow[] {
  const catalog = new Map<string, DemandSkillInput>();
  for (const skill of skills ?? []) {
    if (!skill || typeof skill.id !== 'string' || skill.id.length === 0) continue;
    if (!catalog.has(skill.id)) catalog.set(skill.id, skill);
  }

  const templatesBySkill = new Map<string, Set<string>>();
  for (const link of links ?? []) {
    if (!link || typeof link.skill_id !== 'string' || typeof link.template_id !== 'string') continue;
    if (!catalog.has(link.skill_id)) continue;
    const bucket = templatesBySkill.get(link.skill_id) ?? new Set<string>();
    bucket.add(link.template_id);
    templatesBySkill.set(link.skill_id, bucket);
  }

  const rows: SkillDemandRow[] = [];
  for (const [id, skill] of catalog) {
    const templateCount = templatesBySkill.get(id)?.size ?? 0;
    const quality = Number.isFinite(skill.quality_score) ? Number(skill.quality_score) : 0;
    const confidence = normalizeDepartmentConfidence(skill.department_confidence);
    const source = normalizeDepartmentSource(skill.department_source);
    const department =
      typeof skill.department === 'string' && skill.department ? skill.department : null;
    rows.push({
      skillId: id,
      name: safeText(skill.name, safeText(skill.slug, id)),
      slug: safeText(skill.slug, id),
      department,
      qualityScore: quality,
      sourceRepo: typeof skill.source_repo === 'string' && skill.source_repo ? skill.source_repo : null,
      templateCount,
      tier: classifyDemand(templateCount),
      description: typeof skill.description === 'string' ? skill.description : '',
      tags: Array.isArray(skill.tags)
        ? skill.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        : [],
      departmentConfidence: confidence,
      departmentSource: source,
      // Revisao humana ja feita ('human') nunca reabre; sem departamento nao
      // ha o que revisar — o vazio ja aparece no filtro "sem departamento".
      departmentNeedsReview:
        Boolean(department) && source !== 'human' && confidence < DEPARTMENT_REVIEW_THRESHOLD,
    });
  }

  rows.sort((a, b) => {
    if (a.templateCount !== b.templateCount) return a.templateCount - b.templateCount;
    if (a.qualityScore !== b.qualityScore) return b.qualityScore - a.qualityScore;
    return a.slug.localeCompare(b.slug);
  });

  return rows;
}

/** Agrega as linhas em contadores por faixa e percentual de cobertura. */
export function summarizeSkillDemand(rows: readonly SkillDemandRow[]): SkillDemandSummary {
  const byTier: Record<DemandTier, number> = { zero: 0, baixa: 0, media: 0, alta: 0 };
  for (const row of rows) byTier[row.tier] += 1;
  const total = rows.length;
  const cobertas = total - byTier.zero;
  return {
    total,
    byTier,
    coveragePct: total === 0 ? 0 : Math.round((cobertas / total) * 1000) / 10,
  };
}

/** Filtro de faixa; `all` preserva a ordem original. */
export type DemandFilter = DemandTier | 'all';

export function filterByDemand(
  rows: readonly SkillDemandRow[],
  filter: DemandFilter,
): SkillDemandRow[] {
  if (filter === 'all') return [...rows];
  return rows.filter((row) => row.tier === filter);
}

/** Normaliza um filtro vindo de storage/URL; desconhecidos viram `all`. */
export function normalizeDemandFilter(value: unknown): DemandFilter {
  if (typeof value !== 'string') return 'all';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'all') return 'all';
  return (DEMAND_TIERS as string[]).includes(normalized) ? (normalized as DemandFilter) : 'all';
}

/**
 * Filtro por departamento. `all` mantém tudo; `none` isola as skills sem
 * classificação (o maior bolsão de dívida do catálogo); qualquer outro valor
 * é comparado ao campo `department` já normalizado em minúsculas.
 */
export type DepartmentFilter = 'all' | 'none' | (string & {});

export function filterByDepartment(
  rows: readonly SkillDemandRow[],
  filter: DepartmentFilter,
): SkillDemandRow[] {
  if (filter === 'all') return [...rows];
  if (filter === 'none') return rows.filter((row) => row.department === null);
  const alvo = filter.trim().toLowerCase();
  if (alvo.length === 0) return [...rows];
  return rows.filter((row) => (row.department ?? '').toLowerCase() === alvo);
}

/**
 * Normaliza um filtro de departamento contra a taxonomia permitida.
 * Valores fora da lista degradam para `all` — nunca produzem recorte vazio
 * inexplicável na UI.
 */
export function normalizeDepartmentFilter(
  value: unknown,
  allowed: readonly string[],
): DepartmentFilter {
  if (typeof value !== 'string') return 'all';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'all' || normalized === 'none') return normalized;
  return allowed.some((item) => item.toLowerCase() === normalized) ? normalized : 'all';
}

/** Contagem por departamento (chave `none` para as não classificadas). */
export function countByDepartment(rows: readonly SkillDemandRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = row.department ? row.department.toLowerCase() : 'none';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** Preferências persistidas do painel de demanda. */
export interface DemandPreferences {
  tier: DemandFilter;
  department: DepartmentFilter;
  search: string;
  /** Limiar de confiança escolhido pelo curador na reclassificação. */
  confidenceThreshold: number;
  /**
   * Recorta apenas classificações automáticas de baixa confiança.
   *
   * É o inverso de um filtro cosmético: sem ele, as skills que exibem o selo
   * "Rever depto." ficam diluídas entre centenas de linhas e nunca chegam ao
   * topo de nenhuma fila. Persistir o recorte transforma "olhar quando der"
   * numa lista de trabalho estável entre sessões.
   */
  onlyNeedsReview: boolean;
  /**
   * Recorta por procedência da classificação (`all` mantém tudo).
   *
   * Motivo: "rever depto." mistura léxico fraco, palpite de plataforma e saída
   * de LLM — três dívidas com tratamento diferente. Sem separar por origem, o
   * curador não consegue auditar um lote específico (ex.: "todas as decisões
   * que o tier de plataforma tomou") nem medir a qualidade por motor.
   */
  source: DepartmentSourceFilter;
}

/** Filtro por procedência; `all` preserva a ordem original. */
export type DepartmentSourceFilter = 'all' | DepartmentSource;

export function filterBySource(
  rows: readonly SkillDemandRow[],
  filter: DepartmentSourceFilter,
): SkillDemandRow[] {
  if (filter === 'all') return [...rows];
  return rows.filter((row) => row.departmentSource === filter);
}

/** Normaliza o filtro de procedência; desconhecidos degradam para `all`. */
export function normalizeSourceFilter(value: unknown): DepartmentSourceFilter {
  if (typeof value !== 'string') return 'all';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'all') return 'all';
  return (DEPARTMENT_SOURCES as readonly string[]).includes(normalized)
    ? (normalized as DepartmentSource)
    : 'all';
}

/** Contagem por procedência sobre o conjunto bruto (todas as chaves presentes). */
export function countBySource(
  rows: readonly SkillDemandRow[],
): Record<DepartmentSource, number> {
  const out = Object.fromEntries(
    DEPARTMENT_SOURCES.map((s) => [s, 0]),
  ) as Record<DepartmentSource, number>;
  for (const row of rows) out[row.departmentSource] += 1;
  return out;
}


/**
 * Recorta as linhas que precisam de revisão departamental.
 *
 * Combina com os demais filtros por interseção (E lógico), não por
 * substituição: "sem departamento + rever depto." é sempre vazio por
 * construção — `departmentNeedsReview` exige departamento presente — e isso é
 * correto, não um bug.
 */
export function filterByNeedsReview(
  rows: readonly SkillDemandRow[],
  only: boolean,
): SkillDemandRow[] {
  if (!only) return [...rows];
  return rows.filter((row) => row.departmentNeedsReview);
}

/** Quantas linhas do conjunto bruto exibem o selo "Rever depto.". */
export function countNeedsReview(rows: readonly SkillDemandRow[]): number {
  let total = 0;
  for (const row of rows) if (row.departmentNeedsReview) total += 1;
  return total;
}

/** Teto de busca persistida — evita gravar payload arbitrário na nuvem. */
export const DEMAND_SEARCH_MAX = 120;

/**
 * Fronteiras do limiar persistido. O piso NÃO é constante do módulo aqui de
 * propósito: quem conhece o piso real é `departmentReclassification`, e importá-lo
 * criaria acoplamento circular. O chamador injeta o piso; se não injetar, usamos
 * o valor conservador 0.25 (mesmo default do motor).
 */
export const DEMAND_THRESHOLD_FLOOR_FALLBACK = 0.25;
export const DEMAND_THRESHOLD_MAX = 0.95;

/**
 * Normaliza o limiar: descarta não-números, quantiza em passos de 0,01 (o
 * slider da UI opera nessa granularidade — sem isso um valor com ruído de ponto
 * flutuante voltaria do storage e o slider ficaria "entre" passos) e prende ao
 * intervalo [piso, teto]. Nunca é possível afrouxar abaixo do piso.
 */
export function normalizeConfidenceThreshold(
  value: unknown,
  floor: number = DEMAND_THRESHOLD_FLOOR_FALLBACK,
): number {
  const piso = Number.isFinite(floor)
    ? Math.min(Math.max(floor as number, 0), DEMAND_THRESHOLD_MAX)
    : DEMAND_THRESHOLD_FLOOR_FALLBACK;
  if (typeof value !== 'number' || !Number.isFinite(value)) return piso;
  const quantizado = Math.round(value * 100) / 100;
  return Math.min(Math.max(quantizado, piso), DEMAND_THRESHOLD_MAX);
}

/**
 * Sanitiza preferências vindas de storage/nuvem. A camada de persistência faz
 * spread cego (`{...defaults, ...remoto}`), então qualquer payload corrompido,
 * de versão antiga ou de departamento removido da taxonomia chegaria intacto ao
 * estado da UI e produziria um recorte vazio permanente e inexplicável para o
 * usuário. Aqui todo campo desconhecido degrada para o default seguro.
 */
export function normalizeDemandPreferences(
  value: unknown,
  allowedDepartments: readonly string[],
  defaults: DemandPreferences = {
    tier: 'zero',
    department: 'all',
    search: '',
    confidenceThreshold: DEMAND_THRESHOLD_FLOOR_FALLBACK,
    onlyNeedsReview: false,
    source: 'all',
  },
): DemandPreferences {
  const piso = normalizeConfidenceThreshold(
    defaults.confidenceThreshold,
    DEMAND_THRESHOLD_FLOOR_FALLBACK,
  );
  const raw = (value ?? {}) as Partial<Record<keyof DemandPreferences, unknown>>;
  if (typeof raw !== 'object' || Array.isArray(value)) return { ...defaults, confidenceThreshold: piso };

  const tier =
    typeof raw.tier === 'string' ? normalizeDemandFilter(raw.tier) : defaults.tier;
  const department =
    typeof raw.department === 'string'
      ? normalizeDepartmentFilter(raw.department, allowedDepartments)
      : defaults.department;
  const search =
    typeof raw.search === 'string' ? raw.search.slice(0, DEMAND_SEARCH_MAX) : '';
  const confidenceThreshold = normalizeConfidenceThreshold(raw.confidenceThreshold, piso);
  // Aceita apenas boolean literal. Um `"false"` vindo de storage legado é
  // truthy em JS e ligaria o recorte silenciosamente, escondendo a maior parte
  // do catálogo sem que o curador tenha pedido nada.
  const onlyNeedsReview =
    typeof raw.onlyNeedsReview === 'boolean' ? raw.onlyNeedsReview : defaults.onlyNeedsReview ?? false;
  // Procedência ausente (preferência gravada antes deste filtro existir) cai no
  // default do chamador, não em 'unknown' — senão uma sessão antiga abriria o
  // painel recortado em skills sem origem, que é quase o conjunto vazio.
  const source =
    raw.source === undefined ? defaults.source ?? 'all' : normalizeSourceFilter(raw.source);

  return { tier, department, search, confidenceThreshold, onlyNeedsReview, source };
}



/** Exportação CSV (RFC 4180, com BOM) do recorte visível. */
export function demandRowsToCsv(rows: readonly SkillDemandRow[]): string {
  const escape = (value: string | number | null) => {
    const text = value === null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  // Colunas novas são ANEXADAS ao fim de propósito: planilhas e scripts do
  // curador referenciam posições, e inserir no meio quebraria silenciosamente.
  const header = [
    'slug',
    'nome',
    'departamento',
    'qualidade',
    'templates',
    'faixa',
    'origem',
    'classificacao',
    'confianca',
  ];
  const lines = [header.map(escape).join(',')];
  for (const row of rows) {
    lines.push(
      [
        escape(row.slug),
        escape(row.name),
        escape(row.department),
        escape(row.qualityScore),
        escape(row.templateCount),
        escape(DEMAND_TIER_LABEL[row.tier]),
        escape(row.sourceRepo),
        escape(DEPARTMENT_SOURCE_LABEL[row.departmentSource]),
        // Locale pt-BR: vírgula decimal. O CSV já é totalmente aspeado, então
        // a vírgula não vaza como separador de campo.
        escape(row.departmentConfidence.toFixed(2).replace('.', ',')),
      ].join(','),
    );
  }

  return '\uFEFF' + lines.join('\r\n');
}
