/**
 * IngestionHistoryDialog — timeline granular de eventos de ingestão
 * (parsing → OCR → chunking → embedding → ready/cancelled/error).
 * Assina realtime para atualizações ao vivo enquanto o job roda.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Loader2, AlertCircle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import {
  listIngestionEvents, subscribeIngestionEvents, statusLabel,
  type IngestionEvent, type IngestionStatus,
} from '@/services/documentIngestionService';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ingestionId: string;
  filename: string;
}

function statusIcon(s: IngestionStatus) {
  if (s === 'ready') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (s === 'error') return <AlertCircle className="h-4 w-4 text-destructive" />;
  if (s === 'cancelled') return <XCircle className="h-4 w-4 text-muted-foreground" />;
  if (s === 'pending') return <Clock className="h-4 w-4 text-muted-foreground" />;
  return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
}

function statusVariant(s: IngestionStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'ready') return 'default';
  if (s === 'error') return 'destructive';
  if (s === 'cancelled') return 'outline';
  return 'secondary';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function elapsedMs(a: string, b: string): number {
  return new Date(b).getTime() - new Date(a).getTime();
}

function humanDelta(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function IngestionHistoryDialog({ open, onOpenChange, ingestionId, filename }: Props) {
  const [events, setEvents] = useState<IngestionEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    listIngestionEvents(ingestionId)
      .then((rows) => { if (alive) setEvents(rows); })
      .catch(() => { /* silent */ })
      .finally(() => { if (alive) setLoading(false); });
    const unsub = subscribeIngestionEvents(ingestionId, (ev) => {
      setEvents((prev) => (prev.some((p) => p.id === ev.id) ? prev : [...prev, ev]));
    });
    return () => { alive = false; unsub(); };
  }, [open, ingestionId]);

  const last = events[events.length - 1];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-h3 truncate">{filename}</DialogTitle>
          <DialogDescription className="text-meta">
            Histórico granular de status — cada transição do pipeline de ingestão.
          </DialogDescription>
        </DialogHeader>

        {last && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/40 border border-border/40">
            {statusIcon(last.status)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-body font-medium">{statusLabel(last.status)}</span>
                <Badge variant={statusVariant(last.status)} className="text-meta">
                  {last.progress_pct}%
                </Badge>
              </div>
              <Progress value={last.progress_pct} className="h-1.5 mt-2" />
            </div>
          </div>
        )}

        <ScrollArea className="h-[420px] pr-3">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-meta">Carregando…</div>
          ) : events.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-meta">
              Sem eventos registrados.
            </div>
          ) : (
            <ol className="relative border-l border-border/60 ml-3 space-y-4 pt-2">
              {events.map((ev, i) => {
                const prev = i > 0 ? events[i - 1] : null;
                const delta = prev ? humanDelta(elapsedMs(prev.created_at, ev.created_at)) : null;
                return (
                  <li key={ev.id} className="ml-6">
                    <span className="absolute -left-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-background border border-border/60">
                      {statusIcon(ev.status)}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-medium">
                        {statusLabel(ev.status)}
                      </span>
                      <Badge variant={statusVariant(ev.status)} className="text-meta">
                        {ev.progress_pct}%
                      </Badge>
                      <span className="text-meta text-muted-foreground">
                        {formatTime(ev.created_at)}
                      </span>
                      {delta && (
                        <span className="text-meta text-muted-foreground/70">
                          +{delta}
                        </span>
                      )}
                    </div>
                    {ev.message && (
                      <p className="text-meta text-muted-foreground mt-1 break-words">
                        {ev.message}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default IngestionHistoryDialog;
