import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, ExternalLink, Highlighter, Eye, AlertTriangle, RotateCw } from 'lucide-react';
import { DocumentViewerDialog, type DocumentViewerSource } from './DocumentViewerDialog';
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { getCachedSignedUrl, refetchSignedUrl } from '@/lib/signedUrlCache';
import { toast } from 'sonner';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CerebroCitation } from '@/types/cerebroCitations';
import { logger } from '@/lib/logger';
import { extractKeyPhrase, buildDeepLink, splitForHighlight } from '@/lib/citationHighlight';
import {
  logCitationOpen,
  logCitationClose,
  markCitationDocumentOpened,
  type CitationTelemetryHandle,
} from '@/services/citationTelemetryService';
import { useCurrentWorkspace } from '@/hooks/useCurrentWorkspace';
import { useCerebroStore } from '@/stores/cerebroStore';

interface CitationDialogProps {
  citation: CerebroCitation | null;
  onOpenChange: (open: boolean) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function CitationDialog({ citation, onOpenChange }: CitationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [openedDocument, setOpenedDocument] = useState(false);
  const [highlightMode, setHighlightMode] = useState(true);
  const [viewerSource, setViewerSource] = useState<DocumentViewerSource | null>(null);
  const telemetryRef = useRef<CitationTelemetryHandle | null>(null);
  const { workspaceId } = useCurrentWorkspace();
  const activeNotebookId = useCerebroStore((s) => s.activeNotebookId);
  const open = citation !== null;

  const keyPhrase = useMemo(() => extractKeyPhrase(citation?.snippet), [citation?.snippet]);
  const highlightParts = useMemo(
    () => splitForHighlight(citation?.snippet ?? '', keyPhrase),
    [citation?.snippet, keyPhrase],
  );

  // Instrumentação: registra abertura ao montar/receber uma citação; fechamento no unmount ou troca.
  useEffect(() => {
    if (!citation) return;
    let cancelled = false;
    setOpenedDocument(false);
    (async () => {
      const handle = await logCitationOpen(citation, {
        workspaceId,
        notebookId: citation.notebook_id ?? activeNotebookId ?? null,
      });
      if (cancelled) {
        // Diálogo já foi fechado antes do insert retornar — feche o registro imediatamente.
        void logCitationClose(handle, { openedDocument: false });
        return;
      }
      telemetryRef.current = handle;
    })();
    return () => {
      cancelled = true;
      const handle = telemetryRef.current;
      telemetryRef.current = null;
      void logCitationClose(handle, { openedDocument });
    };
    // Reinicia telemetria a cada nova citação (chunk_id + n identificam).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citation?.chunk_id, citation?.n]);

  const handleOpenDocument = async (mode: 'inline' | 'external' = 'inline') => {
    if (!citation?.document_id || !UUID_RE.test(citation.document_id)) {
      toast.error('Documento inválido');
      return;
    }
    setLoading(true);
    try {
      const { data: doc, error } = await supabaseExternal
        .from('documents')
        .select('metadata, source_url, title')
        .eq('id', citation.document_id)
        .maybeSingle();
      if (error) throw error;

      const md = (doc?.metadata ?? {}) as {
        storage_path?: string;
        bucket?: string;
        filename?: string;
      };
      const storagePath = md.storage_path;
      const bucket = md.bucket ?? 'knowledge-uploads';
      const filename = md.filename ?? storagePath ?? null;

      const openWith = (rawUrl: string) => {
        setOpenedDocument(true);
        void markCitationDocumentOpened(telemetryRef.current);
        if (mode === 'inline') {
          setViewerSource({
            url: rawUrl,
            filename,
            page: citation?.page ?? null,
            snippet: citation?.snippet ?? null,
            documentTitle: (doc?.title as string | undefined) ?? citation?.document_title ?? null,
          });
        } else {
          const finalUrl = buildDeepLink(rawUrl, {
            page: citation?.page ?? null,
            phrase: keyPhrase || null,
          });
          window.open(finalUrl, '_blank', 'noopener,noreferrer');
        }
      };

      if (storagePath) {
        const signedUrl = await getCachedSignedUrl(bucket, storagePath);
        if (signedUrl) {
          openWith(signedUrl);
          return;
        }
      }

      if (doc?.source_url) {
        openWith(doc.source_url);
        return;
      }
      toast.info('Documento sem URL de origem disponível');
    } catch (e) {
      logger.error('cerebro.citation.open_failed', { error: e });
      toast.error('Não foi possível abrir o documento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Fonte [{citation?.n}]
          </DialogTitle>
          <DialogDescription className="text-foreground font-semibold text-base">
            {citation?.document_title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {citation?.notebook_name && (
              <Badge variant="secondary">Notebook: {citation.notebook_name}</Badge>
            )}
            {citation?.page != null && (
              <Badge variant="outline">Página {citation.page}</Badge>
            )}
            {citation?.section && (
              <Badge variant="outline">Seção: {citation.section}</Badge>
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Trecho usado
              </p>
              {keyPhrase && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 gap-1 text-[10px]"
                  onClick={() => setHighlightMode((v) => !v)}
                  aria-pressed={highlightMode}
                >
                  <Highlighter className="h-3 w-3" />
                  {highlightMode ? 'Destaque on' : 'Destaque off'}
                </Button>
              )}
            </div>
            <p className="text-sm text-foreground leading-relaxed italic">
              "
              {highlightMode && keyPhrase
                ? highlightParts.map((part, i) =>
                    part.hit ? (
                      <mark
                        key={i}
                        className="rounded bg-primary/25 text-foreground px-0.5 not-italic font-medium"
                      >
                        {part.text}
                      </mark>
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )
                : citation?.snippet}
              "
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => handleOpenDocument('inline')}
              disabled={loading || !citation?.document_id}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              {loading ? 'Carregando…' : 'Visualizar aqui'}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleOpenDocument('external')}
              disabled={loading || !citation?.document_id}
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Nova aba
            </Button>
          </div>
        </div>
      </DialogContent>
      <DocumentViewerDialog source={viewerSource} onOpenChange={(o) => !o && setViewerSource(null)} />
    </Dialog>
  );
}
