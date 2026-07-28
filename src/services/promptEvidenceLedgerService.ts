/**
 * Leitura das evidências de prompt exportadas a partir da trilha de auditoria.
 *
 * Filtra `audit_log` pela ação `prompt.export_evidence`. O parsing fica na
 * camada pura (`promptEvidenceLedger`) para que a robustez contra metadados
 * malformados seja testável sem rede.
 */

import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import {
  parseEvidenceRows,
  type EvidenceEntry,
  type RawEvidenceRow,
} from '@/lib/skills/promptEvidenceLedger';

/**
 * Teto de leitura. A verificação por checksum só é útil contra o histórico
 * carregado; 500 exportações cobrem com folga o horizonte de uma revisão e
 * mantêm a resposta leve.
 */
const ROW_LIMIT = 500;

export async function fetchPromptEvidenceLedger(): Promise<EvidenceEntry[]> {
  const { data, error } = await supabaseExternal
    .from('audit_log')
    .select('id, created_at, entity_id, metadata')
    .eq('action', 'prompt.export_evidence')
    .order('created_at', { ascending: false })
    .limit(ROW_LIMIT);

  if (error) {
    logger.error('fetchPromptEvidenceLedger failed', { error: error.message });
    throw new Error(error.message);
  }

  return parseEvidenceRows((data ?? []) as unknown as RawEvidenceRow[]);
}
