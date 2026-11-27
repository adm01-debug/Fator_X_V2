/**
 * Nexus Agents Studio — LGPD Compliance Service
 * All read/write operations MUST go through lgpd-manager Edge Function
 * to ensure consistent RLS enforcement across workspaces.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ConsentRecord {
  id: string;
  purpose?: string;
  consent_type: string;
  granted: boolean;
  created_at: string;
}

export interface DeletionRequest {
  id: string;
  reason: string | null;
  status: string;
  requested_at: string;
}

export async function listConsentRecords(): Promise<ConsentRecord[]> {
  const { data, error } = await supabase.functions.invoke('lgpd-manager', {
    body: { action: 'list_consents' },
  });
  if (error) throw new Error(`Failed to list consent records: ${error.message}`);
  return ((data as { consents?: ConsentRecord[] })?.consents ?? []) as ConsentRecord[];
}

export async function listDeletionRequests(): Promise<DeletionRequest[]> {
  const { data, error } = await supabase.functions.invoke('lgpd-manager', {
    body: { action: 'list_deletion_requests' },
  });
  if (error) throw new Error(`Failed to list deletion requests: ${error.message}`);
  return ((data as { requests?: DeletionRequest[] })?.requests ?? []) as DeletionRequest[];
}

export interface ExportPayload {
  action: string;
  user_id: string;
  data: Record<string, unknown[]>;
  counts: Partial<Record<'memories' | 'sessions' | 'traces' | 'evaluations', number>>;
}

export interface DeletionResult {
  items_deleted: number;
  deleted: Record<string, number>;
  request_id: string | null;
}

export interface AnonymizeResult {
  status: string;
  ref: string;
  anonymized: Record<string, number>;
}

export async function exportMyData(): Promise<ExportPayload> {
  const { data, error } = await supabase.functions.invoke('lgpd-manager', {
    body: { action: 'export_data' },
  });
  if (error) throw error;
  const payload = data as ExportPayload;
  return { ...payload, counts: payload?.counts ?? {} };
}

export async function requestDeletion(
  scope: string,
  reason?: string,
): Promise<DeletionResult> {
  const { data, error } = await supabase.functions.invoke('lgpd-manager', {
    body: { action: 'delete_data', scope, reason },
  });
  if (error) throw error;
  const result = data as DeletionResult;
  return { deleted: {}, request_id: null, ...result, items_deleted: result?.items_deleted ?? 0 };
}

export async function anonymizeMyData(reason?: string): Promise<AnonymizeResult> {
  const { data, error } = await supabase.functions.invoke('lgpd-manager', {
    body: { action: 'anonymize', scope: 'all', reason },
  });
  if (error) throw error;
  return data as AnonymizeResult;
}

export async function manageConsent(purpose: string, grant: boolean) {
  const { error } = await supabase.functions.invoke('lgpd-manager', {
    body: { action: grant ? 'consent_grant' : 'consent_revoke', purpose, legal_basis: 'consent' },
  });
  if (error) throw new Error(`Failed to ${grant ? 'grant' : 'revoke'} consent: ${error.message}`);
}
