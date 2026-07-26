/**
 * CRM Service — Núcleo de Sales Automation (Fase 1).
 *
 * Modelo canônico próprio (crm_*), espelhado a partir do Bitrix24 via
 * `external_ref`. Todo acesso passa por `fromTable()` (banco de dados externo),
 * respeitando a fronteira dual-client travada em architecture-dual-client.test.ts.
 */
import { fromTable } from '@/lib/supabaseExtended';
import { getWorkspaceId } from '@/lib/agentService';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';

// ═══ Tipos de domínio ═══

export type DealStatus = 'open' | 'won' | 'lost';

export type CompanySizeBand = 'micro' | 'small' | 'medium' | 'large' | 'enterprise';

export type ActivityType =
  | 'note'
  | 'email'
  | 'call'
  | 'message'
  | 'stage_change'
  | 'task'
  | 'system';

export interface CrmCompany {
  id: string;
  workspace_id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size_band: CompanySizeBand | null;
  country: string | null;
  icp_score: number | null;
  enrichment_json: Record<string, unknown>;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CrmContact {
  id: string;
  workspace_id: string;
  company_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  opted_out: boolean;
  enrichment_json: Record<string, unknown>;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CrmPipeline {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CrmStage {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  name: string;
  position: number;
  win_probability: number;
  is_won: boolean;
  is_lost: boolean;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CrmDeal {
  id: string;
  workspace_id: string;
  pipeline_id: string | null;
  stage_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  title: string;
  amount: number;
  currency: string;
  owner_id: string | null;
  status: DealStatus;
  lead_score: number | null;
  score_breakdown: Record<string, unknown>;
  /** Decomposição explicável do lead score (Fase 2 — ICP). */
  score_reason: Record<string, unknown>;
  icp_profile_id: string | null;
  scored_at: string | null;

  expected_close_at: string | null;
  closed_at: string | null;
  last_activity_at: string | null;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CrmActivity {
  id: string;
  workspace_id: string;
  deal_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  activity_type: ActivityType;
  source: string;
  body: string | null;
  metadata: Record<string, unknown>;
  actor_id: string | null;
  trace_id: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DealFilters {
  status?: DealStatus | 'all';
  stageId?: string;
  search?: string;
  limit?: number;
}

/**
 * O Postgres devolve NUMERIC como string via PostgREST. Converter aqui evita
 * concatenação silenciosa ("1000" + "500" = "1000500") nos somatórios da UI.
 */
function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDeal(row: Record<string, unknown>): CrmDeal {
  return {
    ...(row as unknown as CrmDeal),
    amount: toNumber(row.amount),
    lead_score: toNullableNumber(row.lead_score),
  };
}

function normalizeStage(row: Record<string, unknown>): CrmStage {
  return {
    ...(row as unknown as CrmStage),
    win_probability: toNumber(row.win_probability),
    position: toNumber(row.position),
  };
}

function normalizeCompany(row: Record<string, unknown>): CrmCompany {
  return {
    ...(row as unknown as CrmCompany),
    icp_score: toNullableNumber(row.icp_score),
  };
}

// ═══ Deals ═══

export async function listDeals(filters: DealFilters = {}): Promise<CrmDeal[]> {
  const wsId = await getWorkspaceId();
  let query = fromTable('crm_deals')
    .select('*')
    .eq('workspace_id', wsId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.stageId) query = query.eq('stage_id', filters.stageId);
  if (filters.search) query = query.ilike('title', `%${filters.search}%`);

  const { data, error } = await query;
  if (error) {
    logger.error('listDeals failed', { error: error.message });
    throw error;
  }
  return (data ?? []).map((r) => normalizeDeal(r as Record<string, unknown>));
}

export async function getDeal(id: string): Promise<CrmDeal | null> {
  const { data, error } = await fromTable('crm_deals').select('*').eq('id', id).maybeSingle();
  if (error) {
    logger.error('getDeal failed', { error: error.message });
    throw error;
  }
  return data ? normalizeDeal(data as Record<string, unknown>) : null;
}

export async function createDeal(
  input: Pick<CrmDeal, 'title'> & Partial<Omit<CrmDeal, 'id' | 'workspace_id'>>,
): Promise<CrmDeal> {
  const wsId = await getWorkspaceId();
  const { data, error } = await fromTable('crm_deals')
    .insert({ ...input, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error || !data) {
    logger.error('createDeal failed', { error: error?.message });
    throw error ?? new Error('Falha ao criar negócio');
  }
  return normalizeDeal(data as Record<string, unknown>);
}

export async function updateDeal(id: string, patch: Partial<CrmDeal>): Promise<void> {
  const { error } = await fromTable('crm_deals').update(patch).eq('id', id);
  if (error) {
    logger.error('updateDeal failed', { error: error.message });
    throw error;
  }
}

/**
 * Move um negócio de estágio e registra a mudança na timeline.
 * A atividade é o registro auditável — a coluna `stage_id` guarda apenas o
 * estado atual e perderia o histórico sozinha.
 */
export async function moveDealToStage(
  dealId: string,
  stageId: string,
  meta: { fromStageId?: string | null; stageName?: string } = {},
): Promise<void> {
  const wsId = await getWorkspaceId();
  const now = new Date().toISOString();

  const { error } = await fromTable('crm_deals')
    .update({ stage_id: stageId, last_activity_at: now })
    .eq('id', dealId)
    .eq('workspace_id', wsId);
  if (error) {
    logger.error('moveDealToStage failed', { error: error.message, dealId });
    throw error;
  }

  await logActivity({
    deal_id: dealId,
    activity_type: 'stage_change',
    body: meta.stageName ? `Movido para "${meta.stageName}"` : 'Mudança de estágio',
    metadata: { from_stage_id: meta.fromStageId ?? null, to_stage_id: stageId },
  });
}

export async function softDeleteDeal(id: string): Promise<void> {
  const { error } = await fromTable('crm_deals')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    logger.error('softDeleteDeal failed', { error: error.message });
    throw error;
  }
}

// ═══ Pipelines & estágios ═══

export async function listPipelines(): Promise<CrmPipeline[]> {
  const wsId = await getWorkspaceId();
  const { data, error } = await fromTable('crm_pipelines')
    .select('*')
    .eq('workspace_id', wsId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) {
    logger.error('listPipelines failed', { error: error.message });
    throw error;
  }
  return (data ?? []) as CrmPipeline[];
}

export async function listStages(pipelineId?: string): Promise<CrmStage[]> {
  const wsId = await getWorkspaceId();
  let query = fromTable('crm_stages')
    .select('*')
    .eq('workspace_id', wsId)
    .is('deleted_at', null)
    .order('position', { ascending: true });
  if (pipelineId) query = query.eq('pipeline_id', pipelineId);

  const { data, error } = await query;
  if (error) {
    logger.error('listStages failed', { error: error.message });
    throw error;
  }
  return (data ?? []).map((r) => normalizeStage(r as Record<string, unknown>));
}

/** Cria um funil padrão com os estágios clássicos de vendas em PT-BR. */
export async function ensureDefaultPipeline(): Promise<CrmPipeline> {
  const existing = await listPipelines();
  const current = existing.find((p) => p.is_default) ?? existing[0];
  if (current) return current;

  const wsId = await getWorkspaceId();
  const { data, error } = await fromTable('crm_pipelines')
    .insert({ workspace_id: wsId, name: 'Funil Padrão', is_default: true })
    .select('*')
    .maybeSingle();
  if (error || !data) {
    logger.error('ensureDefaultPipeline failed', { error: error?.message });
    throw error ?? new Error('Falha ao criar funil padrão');
  }
  const pipeline = data as CrmPipeline;

  const defaults = [
    { name: 'Prospecção', position: 0, win_probability: 10 },
    { name: 'Qualificação', position: 1, win_probability: 25 },
    { name: 'Proposta', position: 2, win_probability: 50 },
    { name: 'Negociação', position: 3, win_probability: 75 },
    { name: 'Ganho', position: 4, win_probability: 100, is_won: true },
    { name: 'Perdido', position: 5, win_probability: 0, is_lost: true },
  ];

  const { error: stageError } = await fromTable('crm_stages').insert(
    defaults.map((s) => ({ ...s, workspace_id: wsId, pipeline_id: pipeline.id })),
  );
  if (stageError) {
    logger.error('ensureDefaultPipeline stages failed', { error: stageError.message });
    throw stageError;
  }
  return pipeline;
}

// ═══ Contatos & empresas ═══

export async function listContacts(search?: string, limit = 200): Promise<CrmContact[]> {
  const wsId = await getWorkspaceId();
  let query = fromTable('crm_contacts')
    .select('*')
    .eq('workspace_id', wsId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (search) query = query.ilike('full_name', `%${search}%`);

  const { data, error } = await query;
  if (error) {
    logger.error('listContacts failed', { error: error.message });
    throw error;
  }
  return (data ?? []) as CrmContact[];
}

export async function listCompanies(search?: string, limit = 200): Promise<CrmCompany[]> {
  const wsId = await getWorkspaceId();
  let query = fromTable('crm_companies')
    .select('*')
    .eq('workspace_id', wsId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error } = await query;
  if (error) {
    logger.error('listCompanies failed', { error: error.message });
    throw error;
  }
  return (data ?? []).map((r) => normalizeCompany(r as Record<string, unknown>));
}

export async function createContact(
  input: Pick<CrmContact, 'full_name'> & Partial<Omit<CrmContact, 'id' | 'workspace_id'>>,
): Promise<CrmContact> {
  const wsId = await getWorkspaceId();
  const { data, error } = await fromTable('crm_contacts')
    .insert({ ...input, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error || !data) {
    logger.error('createContact failed', { error: error?.message });
    throw error ?? new Error('Falha ao criar contato');
  }
  return data as CrmContact;
}

export async function createCompany(
  input: Pick<CrmCompany, 'name'> & Partial<Omit<CrmCompany, 'id' | 'workspace_id'>>,
): Promise<CrmCompany> {
  const wsId = await getWorkspaceId();
  const { data, error } = await fromTable('crm_companies')
    .insert({ ...input, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error || !data) {
    logger.error('createCompany failed', { error: error?.message });
    throw error ?? new Error('Falha ao criar empresa');
  }
  return normalizeCompany(data as Record<string, unknown>);
}

// ═══ Timeline ═══

export async function listActivities(
  ref: { dealId?: string; contactId?: string; companyId?: string },
  limit = 100,
): Promise<CrmActivity[]> {
  const wsId = await getWorkspaceId();
  let query = fromTable('crm_activities')
    .select('*')
    .eq('workspace_id', wsId)
    .is('deleted_at', null)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (ref.dealId) query = query.eq('deal_id', ref.dealId);
  if (ref.contactId) query = query.eq('contact_id', ref.contactId);
  if (ref.companyId) query = query.eq('company_id', ref.companyId);

  const { data, error } = await query;
  if (error) {
    logger.error('listActivities failed', { error: error.message });
    throw error;
  }
  return (data ?? []) as CrmActivity[];
}

export async function logActivity(
  input: Pick<CrmActivity, 'activity_type'> & Partial<Omit<CrmActivity, 'id' | 'workspace_id'>>,
): Promise<void> {
  const wsId = await getWorkspaceId();
  const { error } = await fromTable('crm_activities').insert({
    source: 'nexus',
    ...input,
    workspace_id: wsId,
  });
  if (error) {
    logger.error('logActivity failed', { error: error.message });
    throw error;
  }
}

// ═══ Métricas de topo ═══

export interface CrmSummary {
  openCount: number;
  openAmount: number;
  wonCount: number;
  wonAmount: number;
  lostCount: number;
  winRate: number;
  weightedForecast: number;
}

/**
 * Resumo calculado no cliente a partir dos negócios já carregados.
 * Mantém a Fase 1 sem view materializada — o forecast ponderado por estágio
 * entra na Fase 4, quando houver volume que justifique agregação no banco.
 */
export function summarizeDeals(deals: CrmDeal[], stages: CrmStage[]): CrmSummary {
  const stageProb = new Map(stages.map((s) => [s.id, s.win_probability]));

  let openCount = 0;
  let openAmount = 0;
  let wonCount = 0;
  let wonAmount = 0;
  let lostCount = 0;
  let weightedForecast = 0;

  for (const deal of deals) {
    if (deal.status === 'open') {
      openCount += 1;
      openAmount += deal.amount;
      const probability = deal.stage_id ? (stageProb.get(deal.stage_id) ?? 0) : 0;
      weightedForecast += (deal.amount * probability) / 100;
    } else if (deal.status === 'won') {
      wonCount += 1;
      wonAmount += deal.amount;
    } else {
      lostCount += 1;
    }
  }

  const closed = wonCount + lostCount;
  return {
    openCount,
    openAmount,
    wonCount,
    wonAmount,
    lostCount,
    winRate: closed > 0 ? (wonCount / closed) * 100 : 0,
    weightedForecast,
  };
}

export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Dispara a reconciliação com o Bitrix24.
 *
 * O webhook entrega apenas o ID da entidade, criando registros "casca"
 * (`enrichment_json.sync_state = 'pending'`). Esta chamada hidrata esses
 * registros e executa a carga inicial. É idempotente por
 * (workspace_id, external_ref), então reexecutar é seguro.
 */
export async function syncFromBitrix24(
  entities: Array<'deal' | 'contact' | 'company' | 'lead'> = ['company', 'contact', 'deal'],
): Promise<Record<string, { inserted: number; updated: number; failed: number }>> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase.functions.invoke('crm-bitrix-sync', {
    body: { workspace_id: wsId, entities },
  });
  if (error) {
    logger.error('crm-bitrix-sync falhou', error);
    throw error;
  }
  const summary = (data as { summary?: Record<string, { inserted: number; updated: number; failed: number }> } | null)?.summary;
  return summary ?? {};
}
