import { supabase } from '@/integrations/supabase/client';

export type ConsentType =
  | 'terms_of_service'
  | 'privacy_policy'
  | 'marketing'
  | 'analytics'
  | 'ai_training'
  | 'data_sharing';

export interface ConsentRecord {
  id: string;
  user_id: string;
  workspace_id: string | null;
  consent_type: ConsentType;
  granted: boolean;
  legal_basis: string | null;
  purpose: string | null;
  granted_at: string | null;
  revoked_at: string | null;
  version: number;
  updated_at: string;
}

export const CONSENT_LABELS: Record<ConsentType, string> = {
  terms_of_service: 'Termos de uso',
  privacy_policy: 'Politica de privacidade',
  marketing: 'Comunicacoes de marketing',
  analytics: 'Telemetria e analise de uso',
  ai_training: 'Uso dos dados para treinar modelos',
  data_sharing: 'Compartilhamento com terceiros',
};

/** Consentimentos que a lei presume necessarios e que nao podem ser recusados. */
export const REQUIRED_CONSENTS: ConsentType[] = ['terms_of_service', 'privacy_policy'];

export async function listMyConsents(workspaceId: string | null): Promise<ConsentRecord[]> {
  const { data, error } = await supabase.rpc('list_my_consents', { p_workspace: workspaceId });
  if (error) throw error;
  return (data ?? []) as ConsentRecord[];
}

export async function setMyConsent(input: {
  consentType: ConsentType;
  granted: boolean;
  workspaceId: string | null;
}): Promise<ConsentRecord> {
  const { data, error } = await supabase.rpc('set_my_consent', {
    p_consent_type: input.consentType,
    p_granted: input.granted,
    p_workspace: input.workspaceId,
  });
  if (error) throw error;
  return data as ConsentRecord;
}
