import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ZoomIn, ZoomOut, RotateCcw, Moon, Sun, ExternalLink, Loader2, FileWarning } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import mammoth from 'mammoth';
import DOMPurify from 'dompurify';
import { logger } from '@/lib/logger';
import { extractKeyPhrase } from '@/lib/citationHighlight';

export interface DocumentViewerSource {
  url: string;
  filename?: string | null;
  page?: number | null;
  snippet?: string | null;
  documentTitle?: string | null;
}

interface Props {
  source: DocumentViewerSource | null;
  onOpenChange: (open: boolean) => void;
}

type Kind = 'pdf' | 'docx' | 'other';

function detectKind(url: string, filename?: string | null): Kind {
  const target = (filename ?? url).toLowerCase().split('?')[0];
  if (target.endsWith('.pdf')) return 'pdf';
  if (target.endsWith('.docx') || target.endsWith('.doc')) return 'docx';
  return 'other';
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;

export function DocumentViewerDialog({ source, onOpenChange }: Props) {
  const open = source !== null;
  const [zoom, setZoom] = useState(1);
  const [dark, setDark] = useState(true);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const highlightRef = useRef<HTMLElement | null>(null);

  const kind = useMemo(() => (source ? detectKind(source.url, source.filename) : 'other'), [source]);
  const keyPhrase = useMemo(() => extractKeyPhrase(source?.snippet), [source?.snippet]);

  // Reset controls por citação
  useEffect(() => {
    if (!open) return;
    setZoom(1);
    setDocxHtml(null);
    setLoadError(null);
  }, [source?.url, open]);

  // Carrega e converte DOCX
  useEffect(() => {
    if (!open || kind !== 'docx' || !source) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(source.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        const { value } = await mammoth.convertToHtml({ arrayBuffer: buffer });
        if (cancelled) return;
        const clean = DOMPurify.sanitize(value, { USE_PROFILES: { html: true } });
        setDocxHtml(clean);
      } catch (e) {
        logger.error('cerebro.viewer.docx_failed', { error: e });
        if (!cancelled) setLoadError('Não foi possível renderizar este documento aqui.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, kind, source]);

  // Destaca frase-chave no DOCX após render + rola até ela
  useEffect(() => {
    if (kind !== 'docx' || !docxHtml || !keyPhrase) return;
    const container = document.getElementById('cerebro-docx-render');
    if (!container) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const needle = keyPhrase.toLowerCase();
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue ?? '';
      const idx = text.toLowerCase().indexOf(needle);
      if (idx < 0) continue;
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + keyPhrase.length);
      const mark = document.createElement('mark');
      mark.className = 'cerebro-viewer-hit';
      range.surroundContents(mark);
      highlightRef.current = mark;
      requestAnimationFrame(() => mark.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      break;
    }
  }, [docxHtml, keyPhrase, kind]);

  const pdfSrc = useMemo(() => {
    if (!source || kind !== 'pdf') return null;
    const parts: string[] = [];
    if (source.page && source.page > 0) parts.push(`page=${source.page}`);
    parts.push(`zoom=${Math.round(zoom * 100)}`);
    // Oculta toolbar nativa para dar espaço aos nossos controles
    parts.push('toolbar=0');
    parts.push('navpanes=0');
    return `${source.url}#${parts.join('&')}`;
  }, [source, kind, zoom]);

  const handleClose = (o: boolean) => {
    if (!o) {
      setDocxHtml(null);
      setLoadError(null);
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 py-3 border-b border-border/60 flex-row items-center justify-between gap-3 space-y-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <DialogTitle className="truncate text-body-sm font-semibold">
              {source?.documentTitle ?? source?.filename ?? 'Documento'}
            </DialogTitle>
            {source?.page != null && (
              <Badge variant="outline" className="text-meta">Página {source.page}</Badge>
            )}
            {keyPhrase && (
              <Badge variant="secondary" className="text-meta max-w-[220px] truncate">
                “{keyPhrase}”
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Diminuir zoom"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-meta tabular-nums w-10 text-center text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Aumentar zoom"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setZoom(1)}
              aria-label="Zoom padrão"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <div className="w-px h-6 bg-border/60 mx-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setDark((d) => !d)}
              aria-label={dark ? 'Modo claro' : 'Modo escuro'}
              aria-pressed={dark}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {source && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => window.open(source.url, '_blank', 'noopener,noreferrer')}
                aria-label="Abrir em nova aba"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogHeader>

        <div
          className={`flex-1 overflow-auto ${dark ? 'bg-neutral-950' : 'bg-neutral-100'}`}
          data-dark={dark}
        >
          {kind === 'pdf' && pdfSrc && (
            <iframe
              key={pdfSrc}
              src={pdfSrc}
              title="Visualizador de PDF"
              className="w-full h-full border-0"
              style={{
                filter: dark ? 'invert(1) hue-rotate(180deg)' : undefined,
                backgroundColor: dark ? '#0a0a0a' : '#f5f5f5',
              }}
            />
          )}

          {kind === 'docx' && (
            <div className="w-full h-full flex justify-center py-6 px-4">
              {loading && (
                <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Convertendo documento…
                </div>
              )}
              {loadError && (
                <div className="flex flex-col items-center gap-2 text-body-sm text-muted-foreground">
                  <FileWarning className="h-6 w-6" />
                  {loadError}
                </div>
              )}
              {!loading && !loadError && docxHtml && (
                <div
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                  className="transition-transform"
                >
                  <div
                    id="cerebro-docx-render"
                    className={`cerebro-docx-page ${dark ? 'is-dark' : ''}`}
                    dangerouslySetInnerHTML={{ __html: docxHtml }}
                  />
                </div>
              )}
            </div>
          )}

          {kind === 'other' && source && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-body-sm text-muted-foreground p-6 text-center">
              <FileWarning className="h-8 w-8" />
              <p>Este formato não tem prévia embutida.</p>
              <Button size="sm" variant="secondary" onClick={() => window.open(source.url, '_blank', 'noopener,noreferrer')}>
                Abrir em nova aba
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
