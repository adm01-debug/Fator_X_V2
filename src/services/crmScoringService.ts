/**
 * CRM Scoring Service — Fase 2 (Lead Scoring por ICP).
 *
 * Decisão de arquitetura: o cálculo é uma **função pura** (`scoreLead`) rodando
 * no cliente/edge, e não uma expressão SQL. Três razões:
 *
 *  1. Explicabilidade — vendas precisa ver *por que* um lead pontuou 82. Um
 *     `CASE WHEN` em SQL devolve o número mas não a decomposição por critério.
 *  2. Simulação — a UI de perfis de ICP precisa recalcular ao vivo enquanto o
 *     usuário arrasta os pesos, sem round-trip ao banco.
 *  3. Testabilidade — a regra de negócio fica coberta por testes unitários
 *     determinísticos, sem precisar de um Postgres.
 *
 * O score persistido (`lead_score`) é só um cache do resultado; `score_reason`
 * guarda a decomposição para auditoria.
 */
import { fromTable } from '@/lib/supabaseExtended';
import { getWorkspaceId } from '@/lib/agentService';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════
// Tipos
// ═══════════════════════════════════════════════════════════════════

export interface IcpProfile {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  weight_industry: number;
  weight_company_size: number;
  weight_job_title: number;
  weight_engagement: number;
  target_industries: string[];
  target_job_titles: string[];
  min_company_size: number | null;
  max_company_size: number | null;
  qualified_threshold: number;
  hot_threshold: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Sinais brutos de um lead — deliberadamente frouxo: o CRM espelha origens externas e campos faltam. */
export interface LeadSignals {
  industry?: string | null;
  sizeBand?: string | null;
  employeeCount?: number | null;
  jobTitle?: string | null;
  /** Atividades registradas nos últimos 30 dias. */
  recentActivityCount?: number | null;
  /** ISO date da última atividade; alimenta o decaimento de engajamento. */
  lastActivityAt?: string | null;
}

export type LeadTier = 'hot' | 'qualified' | 'nurture' | 'cold';

export interface ScoreCriterion {
  key: 'industry' | 'company_size' | 'job_title' | 'engagement';
  label: string;
  /** 0..1 — quão bem o lead atende o critério. */
  match: number;
  /** Peso normalizado (0..1) aplicado ao critério. */
  weight: number;
  /** Contribuição em pontos absolutos (0..100). */
  points: number;
  reason: string;
}

export interface ScoreResult {
  score: number;
  tier: LeadTier;
  criteria: ScoreCriterion[];
  /** Critérios sem dado suficiente — sinaliza necessidade de enriquecimento. */
  missingSignals: string[];
}

// ═══════════════════════════════════════════════════════════════════
// Normalizadores
// ═══════════════════════════════════════════════════════════════════

/**
 * Comparação tolerante: o Bitrix24 devolve "Tecnologia da Informação" e o ICP
 * pode ter sido cadastrado como "tecnologia da informacao". Sem remover
 * acentos e caixa, o match falharia silenciosamente e o lead ficaria com 0.
 */
export function normalizeTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Converte faixas textuais ("11-50", "51+", "200") em um número representativo.
 * Devolve `null` quando não há sinal — nunca 0, que seria interpretado como
 * "empresa sem funcionários" e puniria o lead por falta de dado.
 */
export function parseSizeBand(band?: string | null): number | null {
  if (!band) return null;
  const cleaned = String(band).replace(/[.\s]/g, '');
  const range = cleaned.match(/^(\d+)\s*[-–a]\s*(\d+)$/i);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);
  const open = cleaned.match(/^(\d+)\+?$/);
  if (open) return Number(open[1]);
  return null;
}

/** Pesos podem somar qualquer coisa; normalizamos para que o score sempre caiba em 0..100. */
function normalizeWeights(profile: IcpProfile): Record<ScoreCriterion['key'], number> {
  const raw = {
    industry: Math.max(0, profile.weight_industry),
    company_size: Math.max(0, profile.weight_company_size),
    job_title: Math.max(0, profile.weight_job_title),
    engagement: Math.max(0, profile.weight_engagement),
  };
  const total = raw.industry + raw.company_size + raw.job_title + raw.engagement;
  // Todos os pesos zerados: distribui igualmente em vez de dividir por zero.
  if (total <= 0) return { industry: 0.25, company_size: 0.25, job_title: 0.25, engagement: 0.25 };
  return {
    industry: raw.industry / total,
    company_size: raw.company_size / total,
    job_title: raw.job_title / total,
    engagement: raw.engagement / total,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Critérios individuais
// ═══════════════════════════════════════════════════════════════════

function matchIndustry(signals: LeadSignals, profile: IcpProfile) {
  if (!signals.industry) return { match: 0, reason: 'Setor desconhecido', missing: true };
  if (profile.target_industries.length === 0) {
    // Perfil sem alvo definido não deve punir ninguém — trata como neutro.
    return { match: 0.5, reason: 'Perfil sem setores-alvo definidos', missing: false };
  }
  const lead = normalizeTerm(signals.industry);
  const hit = profile.target_industries.some((t) => {
    const target = normalizeTerm(t);
    return lead === target || lead.includes(target) || target.includes(lead);
  });
  return {
    match: hit ? 1 : 0,
    reason: hit ? `Setor "${signals.industry}" está no ICP` : `Setor "${signals.industry}" fora do ICP`,
    missing: false,
  };
}

function matchCompanySize(signals: LeadSignals, profile: IcpProfile) {
  const size = signals.employeeCount ?? parseSizeBand(signals.sizeBand);
  if (size === null) return { match: 0, reason: 'Porte desconhecido', missing: true };

  const min = profile.min_company_size;
  const max = profile.max_company_size;
  if (min === null && max === null) {
    return { match: 0.5, reason: 'Perfil sem faixa de porte definida', missing: false };
  }
  if ((min === null || size >= min) && (max === null || size <= max)) {
    return { match: 1, reason: `Porte ${size} dentro da faixa-alvo`, missing: false };
  }
  // Decaimento gradual: uma empresa com 1 funcionário a mais que o teto não é
  // um lead ruim. Punição proporcional ao desvio relativo, com piso em 0.
  const bound = size < (min ?? 0) ? (min as number) : (max as number);
  const deviation = Math.abs(size - bound) / Math.max(bound, 1);
  const match = Math.max(0, 1 - deviation);
  return {
    match: Number(match.toFixed(4)),
    reason: `Porte ${size} fora da faixa-alvo (${min ?? '–'}–${max ?? '–'})`,
    missing: false,
  };
}

function matchJobTitle(signals: LeadSignals, profile: IcpProfile) {
  if (!signals.jobTitle) return { match: 0, reason: 'Cargo desconhecido', missing: true };
  if (profile.target_job_titles.length === 0) {
    return { match: 0.5, reason: 'Perfil sem cargos-alvo definidos', missing: false };
  }
  const lead = normalizeTerm(signals.jobTitle);
  const hit = profile.target_job_titles.some((t) => lead.includes(normalizeTerm(t)));
  return {
    match: hit ? 1 : 0,
    reason: hit ? `Cargo "${signals.jobTitle}" é decisor-alvo` : `Cargo "${signals.jobTitle}" fora do ICP`,
    missing: false,
  };
}

/** Engajamento satura em 5 atividades e decai com o tempo desde o último toque. */
function matchEngagement(signals: LeadSignals, now: Date) {
  const count = signals.recentActivityCount ?? 0;
  if (count === 0 && !signals.lastActivityAt) {
    return { match: 0, reason: 'Sem atividades registradas', missing: true };
  }
  const volume = Math.min(count, 5) / 5;

  let recency = 0;
  if (signals.lastActivityAt) {
    const days = (now.getTime() - new Date(signals.lastActivityAt).getTime()) / 86_400_000;
    // NaN vindo de data inválida não pode contaminar o score.
    recency = Number.isFinite(days) ? Math.max(0, 1 - Math.max(0, days) / 30) : 0;
  }

  const match = Number((volume * 0.6 + recency * 0.4).toFixed(4));
  return {
    match,
    reason: `${count} atividade(s) recente(s)${signals.lastActivityAt ? ', último toque considerado' : ''}`,
    missing: false,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Motor de score
// ═══════════════════════════════════════════════════════════════════

const LABELS: Record<ScoreCriterion['key'], string> = {
  industry: 'Setor',
  company_size: 'Porte da empresa',
  job_title: 'Cargo',
  engagement: 'Engajamento',
};

/**
 * Calcula o score 0..100 de um lead contra um perfil de ICP.
 * Função pura e determinística — `now` é injetável para tornar o decaimento
 * de engajamento testável sem congelar o relógio global.
 */
export function scoreLead(signals: LeadSignals, profile: IcpProfile, now: Date = new Date()): ScoreResult {
  const weights = normalizeWeights(profile);

  const raw = {
    industry: matchIndustry(signals, profile),
    company_size: matchCompanySize(signals, profile),
    job_title: matchJobTitle(signals, profile),
    engagement: matchEngagement(signals, now),
  };

  const criteria: ScoreCriterion[] = (Object.keys(raw) as ScoreCriterion['key'][]).map((key) => {
    const r = raw[key];
    const match = Math.min(1, Math.max(0, r.match));
    return {
      key,
      label: LABELS[key],
      match,
      weight: Number(weights[key].toFixed(4)),
      points: Number((match * weights[key] * 100).toFixed(2)),
      reason: r.reason,
    };
  });

  const score = Number(criteria.reduce((sum, c) => sum + c.points, 0).toFixed(2));
  const missingSignals = (Object.keys(raw) as ScoreCriterion['key'][])
    .filter((k) => raw[k].missing)
    .map((k) => LABELS[k]);

  let tier: LeadTier = 'cold';
  if (score >= profile.hot_threshold) tier = 'hot';
  else if (score >= profile.qualified_threshold) tier = 'qualified';
  else if (score >= profile.qualified_threshold / 2) tier = 'nurture';

  return { score, tier, criteria, missingSignals };
}

// ═══════════════════════════════════════════════════════════════════
// Persistência
// ═══════════════════════════════════════════════════════════════════

export const DEFAULT_ICP_INPUT = {
  name: 'ICP Padrão',
  description: 'Perfil inicial — ajuste os pesos e alvos conforme seu mercado.',
  is_default: true,
  weight_industry: 25,
  weight_company_size: 25,
  weight_job_title: 25,
  weight_engagement: 25,
  target_industries: [] as string[],
  target_job_titles: ['diretor', 'gerente', 'head', 'c-level', 'ceo', 'cto'],
  min_company_size: 11,
  max_company_size: 1000,
  qualified_threshold: 70,
  hot_threshold: 85,
};

export async function listIcpProfiles(): Promise<IcpProfile[]> {
  const wsId = await getWorkspaceId();
  const { data, error } = await fromTable('crm_icp_profiles')
    .select('*')
    .eq('workspace_id', wsId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) {
    logger.error('listIcpProfiles failed', { error: error.message });
    throw error;
  }
  return (data ?? []).map((r) => normalizeProfile(r as Record<string, unknown>));
}

/** NUMERIC volta como string do PostgREST; sem converter, os pesos concatenariam. */
function normalizeProfile(row: Record<string, unknown>): IcpProfile {
  const num = (v: unknown, fallback = 0) => {
    const parsed = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const nullableNum = (v: unknown) => (v === null || v === undefined || v === '' ? null : num(v));
  return {
    ...(row as unknown as IcpProfile),
    weight_industry: num(row.weight_industry),
    weight_company_size: num(row.weight_company_size),
    weight_job_title: num(row.weight_job_title),
    weight_engagement: num(row.weight_engagement),
    min_company_size: nullableNum(row.min_company_size),
    max_company_size: nullableNum(row.max_company_size),
    qualified_threshold: num(row.qualified_threshold, 70),
    hot_threshold: num(row.hot_threshold, 85),
    target_industries: Array.isArray(row.target_industries) ? (row.target_industries as string[]) : [],
    target_job_titles: Array.isArray(row.target_job_titles) ? (row.target_job_titles as string[]) : [],
  };
}

export async function createIcpProfile(input: Partial<IcpProfile> & { name: string }): Promise<IcpProfile> {
  const wsId = await getWorkspaceId();
  const { data, error } = await fromTable('crm_icp_profiles')
    .insert({ ...DEFAULT_ICP_INPUT, ...input, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error || !data) {
    logger.error('createIcpProfile failed', { error: error?.message });
    throw error ?? new Error('Falha ao criar perfil de ICP');
  }
  return normalizeProfile(data as Record<string, unknown>);
}

export async function updateIcpProfile(id: string, patch: Partial<IcpProfile>): Promise<void> {
  const wsId = await getWorkspaceId();
  const { error } = await fromTable('crm_icp_profiles')
    .update(patch)
    .eq('id', id)
    .eq('workspace_id', wsId);
  if (error) {
    logger.error('updateIcpProfile failed', { error: error.message });
    throw error;
  }
}

/** Garante que o workspace tenha ao menos um perfil utilizável. */
export async function ensureDefaultIcpProfile(): Promise<IcpProfile> {
  const existing = await listIcpProfiles();
  const current = existing.find((p) => p.is_default) ?? existing[0];
  if (current) return current;
  return createIcpProfile({ ...DEFAULT_ICP_INPUT, name: DEFAULT_ICP_INPUT.name });
}

/**
 * Persiste o score de um negócio. Grava também `score_reason` e `scored_at`
 * para que a UI consiga explicar o número sem recalcular.
 */
export async function persistDealScore(dealId: string, profile: IcpProfile, result: ScoreResult): Promise<void> {
  const wsId = await getWorkspaceId();
  const { error } = await fromTable('crm_deals')
    .update({
      lead_score: result.score,
      icp_profile_id: profile.id,
      scored_at: new Date().toISOString(),
      score_reason: {
        tier: result.tier,
        criteria: result.criteria,
        missing_signals: result.missingSignals,
        profile_name: profile.name,
      },
    })
    .eq('id', dealId)
    .eq('workspace_id', wsId);
  if (error) {
    logger.error('persistDealScore failed', { error: error.message, dealId });
    throw error;
  }
}

export const TIER_LABELS: Record<LeadTier, string> = {
  hot: 'Quente',
  qualified: 'Qualificado',
  nurture: 'Nutrição',
  cold: 'Frio',
};

// ═══════════════════════════════════════════════════════════════════
// Recálculo em lote
// ═══════════════════════════════════════════════════════════════════

export interface RescoreOutcome {
  evaluated: number;
  updated: number;
  /** Negócios cujo score mudou de faixa — o que realmente interessa ao time. */
  tierChanges: Array<{ dealId: string; title: string; from: LeadTier | null; to: LeadTier }>;
  skipped: number;
}

/** Faixa persistida anteriormente, quando houver — permite detectar promoções/rebaixamentos. */
function previousTier(scoreReason: unknown): LeadTier | null {
  if (!scoreReason || typeof scoreReason !== 'object') return null;
  const tier = (scoreReason as { tier?: unknown }).tier;
  return tier === 'hot' || tier === 'qualified' || tier === 'nurture' || tier === 'cold' ? tier : null;
}

const ENGAGEMENT_WINDOW_DAYS = 30;
const RESCORE_CHUNK = 100;

/**
 * Recalcula o score de todos os negócios abertos do workspace.
 *
 * Estratégia de I/O: quatro leituras em bloco (negócios, empresas, contatos,
 * atividades da janela) em vez de N+1 por negócio. Com 500 negócios isso é a
 * diferença entre 4 e ~2.000 round-trips.
 *
 * A escrita usa `upsert` na PK `id` em blocos de 100. Diferente das tabelas
 * espelhadas do Bitrix — cujo índice único é *parcial* e por isso incompatível
 * com `ON CONFLICT` via PostgREST — aqui o conflito é na chave primária, que o
 * Postgres infere sem ambiguidade. `workspace_id` e `title` viajam no payload
 * porque são `NOT NULL` sem default e o caminho de INSERT do upsert os valida
 * mesmo quando a linha já existe.
 */
export async function rescoreOpenDeals(profile: IcpProfile, now: Date = new Date()): Promise<RescoreOutcome> {
  const wsId = await getWorkspaceId();
  const since = new Date(now.getTime() - ENGAGEMENT_WINDOW_DAYS * 86_400_000).toISOString();

  const [dealsRes, companiesRes, contactsRes, activitiesRes] = await Promise.all([
    fromTable('crm_deals')
      .select('id, title, workspace_id, company_id, contact_id, score_reason, lead_score')
      .eq('workspace_id', wsId)
      .eq('status', 'open')
      .is('deleted_at', null)
      .limit(2000),
    fromTable('crm_companies')
      .select('id, industry, size_band')
      .eq('workspace_id', wsId)
      .is('deleted_at', null)
      .limit(5000),
    fromTable('crm_contacts')
      .select('id, job_title')
      .eq('workspace_id', wsId)
      .is('deleted_at', null)
      .limit(5000),
    fromTable('crm_activities')
      .select('deal_id, occurred_at')
      .eq('workspace_id', wsId)
      .is('deleted_at', null)
      .gte('occurred_at', since)
      .limit(10000),
  ]);

  const firstError = dealsRes.error ?? companiesRes.error ?? contactsRes.error ?? activitiesRes.error;
  if (firstError) {
    logger.error('rescoreOpenDeals read failed', { error: firstError.message });
    throw firstError;
  }

  type DealRow = {
    id: string;
    title: string;
    workspace_id: string;
    company_id: string | null;
    contact_id: string | null;
    score_reason: unknown;
  };
  const deals = (dealsRes.data ?? []) as unknown as DealRow[];

  const companyById = new Map(
    ((companiesRes.data ?? []) as unknown as Array<{ id: string; industry: string | null; size_band: string | null }>)
      .map((c) => [c.id, c]),
  );
  const contactById = new Map(
    ((contactsRes.data ?? []) as unknown as Array<{ id: string; job_title: string | null }>).map((c) => [c.id, c]),
  );

  const activityCount = new Map<string, number>();
  const lastActivity = new Map<string, string>();
  for (const raw of (activitiesRes.data ?? []) as unknown as Array<{ deal_id: string | null; occurred_at: string | null }>) {
    if (!raw.deal_id) continue;
    activityCount.set(raw.deal_id, (activityCount.get(raw.deal_id) ?? 0) + 1);
    const current = lastActivity.get(raw.deal_id);
    if (raw.occurred_at && (!current || raw.occurred_at > current)) lastActivity.set(raw.deal_id, raw.occurred_at);
  }

  const scoredAt = now.toISOString();
  const tierChanges: RescoreOutcome['tierChanges'] = [];
  const payload = deals.map((deal) => {
    const company = deal.company_id ? companyById.get(deal.company_id) : undefined;
    const contact = deal.contact_id ? contactById.get(deal.contact_id) : undefined;

    const result = scoreLead(
      {
        industry: company?.industry ?? null,
        sizeBand: company?.size_band ?? null,
        jobTitle: contact?.job_title ?? null,
        recentActivityCount: activityCount.get(deal.id) ?? 0,
        lastActivityAt: lastActivity.get(deal.id) ?? null,
      },
      profile,
      now,
    );

    const before = previousTier(deal.score_reason);
    if (before !== result.tier) {
      tierChanges.push({ dealId: deal.id, title: deal.title, from: before, to: result.tier });
    }

    return {
      id: deal.id,
      workspace_id: deal.workspace_id,
      title: deal.title,
      lead_score: result.score,
      icp_profile_id: profile.id,
      scored_at: scoredAt,
      score_reason: {
        tier: result.tier,
        criteria: result.criteria,
        missing_signals: result.missingSignals,
        profile_name: profile.name,
      },
    };
  });

  let updated = 0;
  for (let i = 0; i < payload.length; i += RESCORE_CHUNK) {
    const chunk = payload.slice(i, i + RESCORE_CHUNK);
    const { error } = await fromTable('crm_deals').upsert(chunk, { onConflict: 'id' });
    if (error) {
      logger.error('rescoreOpenDeals write failed', { error: error.message, offset: i });
      throw error;
    }
    updated += chunk.length;
  }

  logger.info('rescoreOpenDeals completed', { evaluated: deals.length, updated, tierChanges: tierChanges.length });
  return { evaluated: deals.length, updated, tierChanges, skipped: deals.length - updated };
}
