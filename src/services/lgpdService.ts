/**
 * Nexus Agents Studio — LGPD Compliance Service
 * All read/write operations MUST go through lgpd-manager Edge Function
 * to ensure consistent RLS enforcement across workspaces.
 */
import { supabase } from '@/integrations/supabase/client';

export async function listConsentRecords() {
  const { data, error } = await supabase.functions.invoke('lgpd-manager', {
    body: { action: 'list_consents' },
  });
  if (error) throw new Error(`Failed to list consent records: ${error.message}`);
  return (data as { consents?: unknown[] })?.consents ?? [];
}

export async function listDeletionRequests() {
  const { data, error } = await supabase.functions.invoke('lgpd-manager', {
    body: { action: 'list_deletion_requests' },
  });
  if (error) throw new Error(`Failed to list deletion requests: ${error.message}`);
  return (data as { requests?: unknown[] })?.requests ?? [];
}

export async function exportMyData() {
  const { data, error } = await supabase.functions.invoke('lgpd-manager', {
    body: { action: 'export_data' },
  });
  if (error) throw error;
  return data;
}

export async function requestDeletion(scope: string) {
  const { data, error } = await supabase.functions.invoke('lgpd-manager', {
    body: { action: 'request_deletion', scope },
  });
  if (error) throw error;
  return data;
}

export async function manageConsent(purpose: string, grant: boolean) {
  const { error } = await supabase.functions.invoke('lgpd-manager', {
    body: { action: grant ? 'consent_grant' : 'consent_revoke', purpose, legal_basis: 'consent' },
  });
  if (error) throw new Error(`Failed to ${grant ? 'grant' : 'revoke'} consent: ${error.message}`);
}
