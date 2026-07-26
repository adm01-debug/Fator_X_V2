/**
 * crmCadenceService — Cadências de follow-up e suas inscrições.
 *
 * Divisão de responsabilidade proposital:
 *   • Este módulo gerencia definição (cadências/passos) e inscrição.
 *   • A Edge Function `crm-cadence-runner` gerencia execução e envio.
 *
 * Inscrição vive aqui porque depende do score já calculado no cliente e
 * precisa refletir na UI imediatamente; execução vive lá porque exige
 * `service_role`, atomicidade de fila e um relógio que não é o do navegador.
 */
import { fromTable } from '@/lib/supabaseExtended';
import { getWorkspaceId } from '@/lib/agentService';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import type { LeadTier } from '@/services/crmScoringService';

export type CadenceChannel = 'email' | 'whatsapp' | 'slack' | 'task';
export type EnrollmentStatus = 'active' | 'completed' | 'stopped' | 'failed';

export interface CrmCadence {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  trigger_tier: LeadTier | null;
  is_active: boolean;
  daily_send_cap: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CrmCadenceStep {
  id: string;
  workspace_id: string;
  cadence_id: string;
  position: number;
  channel: CadenceChannel;
  delay_hours: number;
  subject: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface CrmCadenceEnrollment {
  id: string;
  workspace_id: string;
  cadence_id: string;
  deal_id: string;
  contact_id: string | null;
  status: EnrollmentStatus;
  current_step: number;
  next_run_at: string;
  attempts: number;
  last_error: string | null;
  last_sent_at: string | null;
  stop_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** PostgREST devolve NUMERIC/INT como string em alguns caminhos — normalizar sempre. */
function toInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function listCadences(): Promise<CrmCadence[]> {
  const wsId = await getWorkspaceId();
  const { data, error } = await fromTable('crm_cadences')
    .select('*')
    .eq('workspace_id', wsId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('listCadences failed', { error: error.message });
    throw error;
  }
  return ((data ?? []) as unknown as CrmCadence[]).map((row) => ({
    ...row,
    daily_send_cap: toInt(row.daily_send_cap, 100),
  }));
}

export async function listCadenceSteps(cadenceId: string): Promise<CrmCadenceStep[]> {
  const wsId = await getWorkspaceId();
  const { data, error } = await fromTable('crm_cadence_steps')
    .select('*')
    .eq('workspace_id', wsId)
    .eq('cadence_id', cadenceId)
    .order('position', { ascending: true });
  if (error) {
    logger.error('listCadenceSteps failed', { error: error.message });
    throw error;
  }
  return ((data ?? []) as unknown as CrmCadenceStep[]).map((row) => ({
    ...row,
    position: toInt(row.position),
    delay_hours: toInt(row.delay_hours, 24),
  }));
}

export async function createCadence(input: {
  name: string;
  description?: string | null;
  trigger_tier?: LeadTier | null;
}): Promise<CrmCadence> {
  const wsId = await getWorkspaceId();
  const { data, error } = await fromTable('crm_cadences')
    .insert({
      workspace_id: wsId,
      name: input.name,
      description: input.description ?? null,
      trigger_tier: input.trigger_tier ?? null,
    })
    .select('*')
    .maybeSingle();
  if (error || !data) {
    logger.error('createCadence failed', { error: error?.message });
    throw error ?? new Error('Falha ao criar cadência');
  }
  return data as unknown as CrmCadence;
}

export async function updateCadence(id: string, patch: Partial<CrmCadence>): Promise<void> {
  const wsId = await getWorkspaceId();
  const { error } = await fromTable('crm_cadences')
    .update(patch)
    .eq('id', id)
    .eq('workspace_id', wsId);
  if (error) {
    logger.error('updateCadence failed', { error: error.message });
    throw error;
  }
}

export async function upsertCadenceStep(
  cadenceId: string,
  step: { id?: string; position: number; channel: CadenceChannel; delay_hours: number; subject?: string | null; body: string },
): Promise<void> {
  const wsId = await getWorkspaceId();
  const payload = {
    ...(step.id ? { id: step.id } : {}),
    workspace_id: wsId,
    cadence_id: cadenceId,
    position: step.position,
    channel: step.channel,
    delay_hours: step.delay_hours,
    subject: step.subject ?? null,
    body: step.body,
  };
  // Conflito na PK quando editando; INSERT puro quando novo. `position` tem
  // UNIQUE(cadence_id, position) e o erro 23505 é propagado de propósito — a UI
  // precisa dizer "já existe um passo nessa posição", não sobrescrever em silêncio.
  const { error } = step.id
    ? await fromTable('crm_cadence_steps').upsert(payload, { onConflict: 'id' })
    : await fromTable('crm_cadence_steps').insert(payload);
  if (error) {
    logger.error('upsertCadenceStep failed', { error: error.message });
    throw error;
  }
}

export async function deleteCadenceStep(id: string): Promise<void> {
  const wsId = await getWorkspaceId();
  const { error } = await fromTable('crm_cadence_steps')
    .delete()
    .eq('id', id)
    .eq('workspace_id', wsId);
  if (error) {
    logger.error('deleteCadenceStep failed', { error: error.message });
    throw error;
  }
}

export interface EnrollOutcome {
  enrolled: number;
  skippedOptedOut: number;
  skippedAlreadyActive: number;
  eligible: number;
}

/**
 * Inscreve negócios da faixa-alvo na cadência.
 *
 * Três filtros, nesta ordem — cada um existe por um risco concreto:
 *   1. faixa do score  → cadência errada para o lead errado queima o contato
 *   2. `opted_out`     → inscrever quem pediu descadastro é violação, não bug
 *   3. inscrição ativa → o índice parcial único já barra, mas filtrar antes
 *                        evita transformar operação normal em erro 23505
 */
export async function enrollDealsByTier(cadenceId: string, tier: LeadTier): Promise<EnrollOutcome> {
  const wsId = await getWorkspaceId();

  const [dealsRes, activeRes] = await Promise.all([
    fromTable('crm_deals')
      .select('id, contact_id, score_reason')
      .eq('workspace_id', wsId)
      .eq('status', 'open')
      .is('deleted_at', null)
      .limit(2000),
    fromTable('crm_cadence_enrollments')
      .select('deal_id')
      .eq('workspace_id', wsId)
      .eq('cadence_id', cadenceId)
      .eq('status', 'active')
      .limit(5000),
  ]);
  if (dealsRes.error) throw dealsRes.error;
  if (activeRes.error) throw activeRes.error;

  const alreadyActive = new Set(
    ((activeRes.data ?? []) as unknown as Array<{ deal_id: string }>).map((row) => row.deal_id),
  );

  const deals = (dealsRes.data ?? []) as unknown as Array<{
    id: string;
    contact_id: string | null;
    score_reason: unknown;
  }>;

  const eligible = deals.filter((deal) => {
    const reason = deal.score_reason;
    return !!reason && typeof reason === 'object' && (reason as { tier?: unknown }).tier === tier;
  });

  const contactIds = Array.from(
    new Set(eligible.map((d) => d.contact_id).filter((id): id is string => !!id)),
  );
  const optedOut = new Set<string>();
  if (contactIds.length > 0) {
    const { data: contacts, error } = await fromTable('crm_contacts')
      .select('id, opted_out')
      .in('id', contactIds);
    if (error) throw error;
    for (const contact of (contacts ?? []) as unknown as Array<{ id: string; opted_out: boolean }>) {
      if (contact.opted_out) optedOut.add(contact.id);
    }
  }

  let skippedOptedOut = 0;
  let skippedAlreadyActive = 0;
  const rows = eligible.filter((deal) => {
    if (alreadyActive.has(deal.id)) {
      skippedAlreadyActive++;
      return false;
    }
    if (deal.contact_id && optedOut.has(deal.contact_id)) {
      skippedOptedOut++;
      return false;
    }
    return true;
  }).map((deal) => ({
    workspace_id: wsId,
    cadence_id: cadenceId,
    deal_id: deal.id,
    contact_id: deal.contact_id,
  }));

  if (rows.length > 0) {
    const { error } = await fromTable('crm_cadence_enrollments').insert(rows);
    if (error) {
      logger.error('enrollDealsByTier failed', { error: error.message });
      throw error;
    }
  }

  logger.info('enrollDealsByTier completed', { cadenceId, tier, enrolled: rows.length });
  return {
    enrolled: rows.length,
    skippedOptedOut,
    skippedAlreadyActive,
    eligible: eligible.length,
  };
}

export async function listEnrollments(cadenceId?: string): Promise<CrmCadenceEnrollment[]> {
  const wsId = await getWorkspaceId();
  let query = fromTable('crm_cadence_enrollments')
    .select('*')
    .eq('workspace_id', wsId)
    .order('next_run_at', { ascending: true })
    .limit(200);
  if (cadenceId) query = query.eq('cadence_id', cadenceId);
  const { data, error } = await query;
  if (error) {
    logger.error('listEnrollments failed', { error: error.message });
    throw error;
  }
  return ((data ?? []) as unknown as CrmCadenceEnrollment[]).map((row) => ({
    ...row,
    current_step: toInt(row.current_step),
    attempts: toInt(row.attempts),
  }));
}

/** Interrompe uma inscrição. Ação do operador sempre vence a automação. */
export async function stopEnrollment(id: string, reason = 'manual'): Promise<void> {
  const wsId = await getWorkspaceId();
  const { error } = await fromTable('crm_cadence_enrollments')
    .update({ status: 'stopped', stop_reason: reason })
    .eq('id', id)
    .eq('workspace_id', wsId);
  if (error) {
    logger.error('stopEnrollment failed', { error: error.message });
    throw error;
  }
}

export interface RunnerSummary {
  claimed: number;
  sent: number;
  completed: number;
  stopped: number;
  failed: number;
  skipped: number;
  /** Inscrições adiadas por atingirem o teto diário de envios da cadência. */
  capped: number;
}

/** Dispara o runner sob demanda. `dryRun` prevê o lote sem enviar nada. */
export async function runCadences(options: { dryRun?: boolean; batchSize?: number } = {}): Promise<RunnerSummary> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase.functions.invoke('crm-cadence-runner', {
    body: { workspace_id: wsId, dry_run: options.dryRun ?? false, batch_size: options.batchSize ?? 50 },
  });
  if (error) {
    logger.error('crm-cadence-runner falhou', error);
    throw error;
  }
  const summary = (data as { summary?: RunnerSummary } | null)?.summary;
  return summary ?? { claimed: 0, sent: 0, completed: 0, stopped: 0, failed: 0, skipped: 0, capped: 0 };
}

/** Uma rodada do runner, gravada pela Edge Function (somente leitura no cliente). */
export interface CrmCadenceRun extends RunnerSummary {
  id: string;
  workspace_id: string | null;
  triggered_by: 'cron' | 'manual';
  dry_run: boolean;
  duration_ms: number;
  error_message: string | null;
  created_at: string;
}

/**
 * Histórico de execuções do workspace. As rodadas globais do cron têm
 * `workspace_id` nulo e são filtradas pela RLS para administradores, por isso
 * não são pedidas aqui.
 */
export async function listCadenceRuns(limit = 50): Promise<CrmCadenceRun[]> {
  const wsId = await getWorkspaceId();
  const { data, error } = await fromTable('crm_cadence_runs')
    .select('*')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    logger.error('listCadenceRuns failed', { error: error.message });
    throw error;
  }
  return (data ?? []) as unknown as CrmCadenceRun[];
}
