/**
 * Nexus Agents Studio — Governança LGPD
 *
 * A migration `20260724000010_lgpd_required_tables.sql` criou o Registro de
 * Operações (Art. 37), o inventário de dados pessoais, o log de incidentes
 * (Art. 48), as solicitações do titular (Art. 18, prazo de 15 dias), as
 * políticas de retenção e as configurações de LGPD — com RLS completa e o cron
 * `lgpd_check_sar_deadlines` vigiando os prazos. Nada disso tinha tela: os
 * prazos venciam sem ninguém ver e o registro obrigatório ficava vazio.
 *
 * Aqui ficam apenas as leituras/escritas diretas nessas tabelas; a RLS decide
 * quem pode ver e escrever (admin do workspace escreve, membro lê o que é
 * público do workspace, titular vê as próprias solicitações).
 */
// As seis tabelas LGPD nasceram na migration 20260724000010 e ainda não estão
// em src/integrations/supabase/types.ts — `fromTable` é o escape sancionado no
// repo para tabela fora do schema gerado (mesmo banco, tipagem relaxada).
import { fromTable } from '@/lib/supabaseExtended';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/** Art. 18 §1 LGPD — resposta em até 15 dias. */
export const DSAR_DEADLINE_DAYS = 15;

export type SubjectRequestType =
  | 'access'
  | 'rectification'
  | 'deletion'
  | 'portability'
  | 'information'
  | 'consent_revocation'
  | 'objection';

export type SubjectRequestStatus = 'received' | 'processing' | 'completed' | 'denied' | 'partial';

export interface SubjectRequest {
  id: string;
  user_id: string;
  workspace_id: string | null;
  request_type: SubjectRequestType;
  status: SubjectRequestStatus;
  description: string | null;
  deadline_at: string;
  responded_at: string | null;
  denied_reason: string | null;
  created_at: string;
}

export interface ProcessingOperation {
  id: string;
  workspace_id: string | null;
  data_category: 'personal' | 'sensitive' | 'children' | 'anonymized';
  data_type: string;
  processing_purpose: string;
  legal_basis: string;
  retention_period: string | null;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  description: string | null;
  next_review_due: string | null;
  created_at: string;
}

export interface BreachRecord {
  id: string;
  workspace_id: string | null;
  breach_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  description: string;
  affected_users_count: number | null;
  detection_at: string;
  notification_to_authority_at: string | null;
  resolved_at: string | null;
}

export interface RetentionPolicy {
  id: string;
  workspace_id: string | null;
  data_type: string;
  retention_days: number;
  auto_anonymize: boolean;
  is_active: boolean;
}

export interface PersonalDataField {
  id: string;
  table_name: string;
  column_name: string;
  data_category: string;
  is_pii: boolean;
  is_sensitive: boolean;
  sensitivity_level: 'low' | 'medium' | 'high' | 'critical';
  retention_days: number | null;
  purpose: string | null;
  notes: string | null;
}

export interface LgpdSettings {
  id: string;
  workspace_id: string;
  require_explicit_consent: boolean;
  consent_version: string | null;
  privacy_policy_url: string | null;
  terms_url: string | null;
  default_retention_days: number | null;
  auto_delete_inactive_days: number | null;
  anonymize_after_days: number | null;
  allow_third_party_sharing: boolean;
  require_dpa: boolean;
  notify_anpd_on_breach: boolean;
  breach_notification_days: number | null;
  dpo_name: string | null;
  dpo_email: string | null;
  dpo_phone: string | null;
  has_risk_assessment: boolean;
  last_risk_assessment: string | null;
}

const TERMINAL_STATUSES: SubjectRequestStatus[] = ['completed', 'denied', 'partial'];

export function isTerminalStatus(status: SubjectRequestStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Prazo do Art. 18 §1 a partir de uma data (padrão: agora). */
export function subjectRequestDeadline(from: Date = new Date()): Date {
  const deadline = new Date(from.getTime());
  deadline.setDate(deadline.getDate() + DSAR_DEADLINE_DAYS);
  return deadline;
}

export async function listSubjectRequests(workspaceId: string | null): Promise<SubjectRequest[]> {
  let query = fromTable('data_subject_requests')
    .select(
      'id, user_id, workspace_id, request_type, status, description, deadline_at, responded_at, denied_reason, created_at',
    );
  if (workspaceId) query = query.eq('workspace_id', workspaceId);
  const { data, error } = await query.order('deadline_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SubjectRequest[];
}

export async function createSubjectRequest(input: {
  workspaceId: string | null;
  requestType: SubjectRequestType;
  description?: string;
}): Promise<SubjectRequest> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Faça login para abrir uma solicitação');

  const { data, error } = await fromTable('data_subject_requests')
    .insert({
      user_id: user.id,
      workspace_id: input.workspaceId,
      request_type: input.requestType,
      description: input.description?.trim() || null,
      deadline_at: subjectRequestDeadline().toISOString(),
    })
    .select('id, user_id, workspace_id, request_type, status, description, deadline_at, responded_at, denied_reason, created_at')
    .single();
  if (error) throw error;
  return data as SubjectRequest;
}

export async function respondSubjectRequest(
  id: string,
  status: SubjectRequestStatus,
  deniedReason?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (isTerminalStatus(status)) patch.responded_at = new Date().toISOString();
  if (status === 'denied') patch.denied_reason = deniedReason?.trim() || null;
  const { error } = await fromTable('data_subject_requests').update(patch).eq('id', id);
  if (error) throw error;
}

export async function listProcessingOperations(workspaceId: string | null): Promise<ProcessingOperation[]> {
  let query = fromTable('data_processing_register')
    .select(
      'id, workspace_id, data_category, data_type, processing_purpose, legal_basis, retention_period, risk_level, description, next_review_due, created_at',
    );
  if (workspaceId) query = query.eq('workspace_id', workspaceId);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProcessingOperation[];
}

export async function createProcessingOperation(input: {
  workspaceId: string | null;
  dataCategory: ProcessingOperation['data_category'];
  dataType: string;
  processingPurpose: string;
  legalBasis: string;
  riskLevel: ProcessingOperation['risk_level'];
  retentionPeriod?: string;
  description?: string;
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await fromTable('data_processing_register').insert({
    workspace_id: input.workspaceId,
    data_category: input.dataCategory,
    data_type: input.dataType.trim(),
    processing_purpose: input.processingPurpose.trim(),
    legal_basis: input.legalBasis,
    risk_level: input.riskLevel,
    retention_period: input.retentionPeriod?.trim() || null,
    description: input.description?.trim() || null,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
}

export async function listBreaches(workspaceId: string | null): Promise<BreachRecord[]> {
  let query = fromTable('data_breach_log')
    .select(
      'id, workspace_id, breach_type, severity, status, description, affected_users_count, detection_at, notification_to_authority_at, resolved_at',
    );
  if (workspaceId) query = query.eq('workspace_id', workspaceId);
  const { data, error } = await query.order('detection_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BreachRecord[];
}

export async function listRetentionPolicies(workspaceId: string | null): Promise<RetentionPolicy[]> {
  let query = fromTable('data_retention_policies')
    .select('id, workspace_id, data_type, retention_days, auto_anonymize, is_active');
  if (workspaceId) query = query.eq('workspace_id', workspaceId);
  const { data, error } = await query.order('data_type', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RetentionPolicy[];
}

export async function saveRetentionPolicy(input: {
  workspaceId: string | null;
  dataType: string;
  retentionDays: number;
  autoAnonymize: boolean;
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await fromTable('data_retention_policies').upsert(
    {
      workspace_id: input.workspaceId,
      data_type: input.dataType.trim(),
      retention_days: input.retentionDays,
      auto_anonymize: input.autoAnonymize,
      is_active: true,
      created_by: user?.id ?? null,
    },
    { onConflict: 'workspace_id,data_type' },
  );
  if (error) throw error;
}

export async function listPersonalDataInventory(workspaceId: string | null): Promise<PersonalDataField[]> {
  let query = fromTable('personal_data_inventory')
    .select(
      'id, table_name, column_name, data_category, is_pii, is_sensitive, sensitivity_level, retention_days, purpose, notes',
    );
  if (workspaceId) query = query.eq('workspace_id', workspaceId);
  const { data, error } = await query.order('table_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PersonalDataField[];
}

export async function getLgpdSettings(workspaceId: string): Promise<LgpdSettings | null> {
  const { data, error } = await fromTable('lgpd_settings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) {
    logger.warn('[lgpdGovernance] falha ao ler lgpd_settings', { error: String(error) });
    throw error;
  }
  return (data ?? null) as LgpdSettings | null;
}

export async function saveLgpdSettings(
  workspaceId: string,
  patch: Partial<Omit<LgpdSettings, 'id' | 'workspace_id'>>,
): Promise<void> {
  const { error } = await fromTable('lgpd_settings')
    .upsert({ workspace_id: workspaceId, ...patch }, { onConflict: 'workspace_id' });
  if (error) throw error;
}