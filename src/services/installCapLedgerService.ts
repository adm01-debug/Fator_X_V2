/**
 * Leitura da trilha de instalações que estouraram o teto de skills.
 *
 * Filtra `audit_log` pela ação `skill.install_over_cap`. O parsing fica na
 * camada pura (`installCapLedger`) para ser testável sem rede.
 */

import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import {
  parseInstallCapRows,
  type InstallCapEntry,
  type RawInstallCapRow,
} from '@/lib/skills/installCapLedger';

/** Horizonte de leitura: cobre com folga uma revisão de governança. */
const ROW_LIMIT = 300;

export async function fetchInstallCapLedger(): Promise<InstallCapEntry[]> {
  const { data, error } = await supabaseExternal
    .from('audit_log')
    .select('id, created_at, entity_id, metadata')
    .eq('action', 'skill.install_over_cap')
    .order('created_at', { ascending: false })
    .limit(ROW_LIMIT);

  if (error) {
    logger.error('fetchInstallCapLedger failed', { error: error.message });
    throw new Error(error.message);
  }

  return parseInstallCapRows((data ?? []) as unknown as RawInstallCapRow[]);
}
