/**
 * citationTelemetryService — registra clicks em citações do Super Cérebro.
 *
 * Fluxo:
 *  1. `logCitationOpen(citation, ctx)` insere uma linha em `citation_telemetry`
 *     e devolve o `id` (usado como handle).
 *  2. `logCitationClose(handle, { openedDocument })` atualiza `closed_at`,
 *     `dwell_ms` e `opened_document`.
 *
 * Falhas de telemetria são silenciosas (logadas) — não devem quebrar o UX.
 */
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import type { CerebroCitation } from '@/types/cerebroCitations';

export interface CitationTelemetryContext {
  workspaceId?: string | null;
  notebookId?: string | null;
}

export interface CitationTelemetryHandle {
  id: string;
  openedAt: number;
}

export async function logCitationOpen(
  citation: CerebroCitation,
  ctx: CitationTelemetryContext = {},
): Promise<CitationTelemetryHandle | null> {
  try {
    const { data, error } = await supabaseExternal
      .from('citation_telemetry')
      .insert({
        workspace_id: ctx.workspaceId ?? null,
        notebook_id: ctx.notebookId ?? citation.notebook_id ?? null,
        document_id: citation.document_id ?? null,
        chunk_id: citation.chunk_id ?? null,
        citation_n: citation.n,
        page: citation.page ?? null,
        section: citation.section ?? null,
        document_title: citation.document_title ?? null,
      })
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) return null;
    return { id: data.id as string, openedAt: Date.now() };
  } catch (e) {
    logger.warn('cerebro.telemetry.open_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export async function logCitationClose(
  handle: CitationTelemetryHandle | null,
  opts: { openedDocument?: boolean } = {},
): Promise<void> {
  if (!handle) return;
  try {
    const dwellMs = Math.max(0, Date.now() - handle.openedAt);
    const { error } = await supabaseExternal
      .from('citation_telemetry')
      .update({
        closed_at: new Date().toISOString(),
        dwell_ms: dwellMs,
        opened_document: opts.openedDocument ?? false,
      })
      .eq('id', handle.id);
    if (error) throw error;
  } catch (e) {
    logger.warn('cerebro.telemetry.close_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function markCitationDocumentOpened(
  handle: CitationTelemetryHandle | null,
): Promise<void> {
  if (!handle) return;
  try {
    const { error } = await supabaseExternal
      .from('citation_telemetry')
      .update({ opened_document: true })
      .eq('id', handle.id);
    if (error) throw error;
  } catch (e) {
    logger.warn('cerebro.telemetry.mark_doc_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
