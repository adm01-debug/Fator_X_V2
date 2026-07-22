import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Info, Loader2, RefreshCw } from 'lucide-react';

export type ChunkStrategy = 'fixed' | 'paragraph' | 'sentence';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Document row id from public.documents */
  documentId: string;
  /** Optional display name for header */
  documentTitle?: string;
}

interface DocSettings {
  chunk_size: number;
  chunk_overlap: number;
  chunk_strategy: ChunkStrategy;
  chunk_version: number;
  has_parsed_text: boolean;
}

const STRATEGY_LABELS: Record<ChunkStrategy, string> = {
  fixed: 'Tamanho fixo (janela deslizante)',
  paragraph: 'Por parágrafo',
  sentence: 'Por sentença',
};

const STRATEGY_HINTS: Record<ChunkStrategy, string> = {
  fixed: 'Melhor para textos densos e uniformes (relatórios, contratos).',
  paragraph: 'Preserva contexto lógico — ideal para artigos, docs técnicos.',
  sentence: 'Máxima granularidade — bom para FAQs e Q&A.',
};

export function DocumentChunkingDialog({ open, onOpenChange, documentId, documentTitle }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [initial, setInitial] = useState<DocSettings | null>(null);
  const [size, setSize] = useState<number>(1000);
  const [overlap, setOverlap] = useState<number>(200);
  const [strategy, setStrategy] = useState<ChunkStrategy>('fixed');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('documents')
        .select('chunk_size, chunk_overlap, chunk_strategy, chunk_version, parsed_text')
        .eq('id', documentId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error('Falha ao carregar configurações do documento');
        onOpenChange(false);
        return;
      }
      const s: DocSettings = {
        chunk_size: data.chunk_size ?? 1000,
        chunk_overlap: data.chunk_overlap ?? 200,
        chunk_strategy: (data.chunk_strategy ?? 'fixed') as ChunkStrategy,
        chunk_version: data.chunk_version ?? 1,
        has_parsed_text: !!(data.parsed_text && data.parsed_text.length > 20),
      };
      setInitial(s);
      setSize(s.chunk_size);
      setOverlap(s.chunk_overlap);
      setStrategy(s.chunk_strategy);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, documentId, onOpenChange]);

  const changed =
    !!initial && (
      size !== initial.chunk_size ||
      overlap !== initial.chunk_overlap ||
      strategy !== initial.chunk_strategy
    );

  const overlapMax = Math.max(0, size - 1);
  const overlapClamped = Math.min(overlap, overlapMax);

  const doRechunk = async () => {
    if (!initial) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('doc-rechunk', {
        body: {
          document_id: documentId,
          chunk_size: size,
          chunk_overlap: overlapClamped,
          chunk_strategy: strategy,
        },
      });
      if (error) throw error;
      const result = data as { status: string; chunks_created?: number; chunk_version?: number };
      if (result.status === 'noop') {
        toast.info('Configurações idênticas — nada mudou.');
      } else {
        toast.success('Reprocessamento iniciado', {
          description: `${result.chunks_created} blocos • versão v${result.chunk_version}. Citações antigas preservadas.`,
        });
        onOpenChange(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Falha ao reprocessar', { description: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            Chunking &amp; Re-embed
          </DialogTitle>
          <DialogDescription className="truncate">
            {documentTitle ?? 'Documento'}{initial && (
              <span className="ml-2"><Badge variant="outline">v{initial.chunk_version}</Badge></span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Estratégia</Label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as ChunkStrategy)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STRATEGY_LABELS) as ChunkStrategy[]).map(k => (
                    <SelectItem key={k} value={k}>{STRATEGY_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-meta text-muted-foreground">{STRATEGY_HINTS[strategy]}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Tamanho do bloco</Label>
                <span className="text-meta font-mono">{size} chars</span>
              </div>
              <Slider
                value={[size]}
                min={200}
                max={4000}
                step={50}
                onValueChange={([v]) => setSize(v)}
              />
              <div className="flex justify-between text-meta text-muted-foreground">
                <span>200 (curto)</span>
                <span>4000 (longo)</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Overlap</Label>
                <span className="text-meta font-mono">{overlapClamped} chars ({size > 0 ? Math.round((overlapClamped / size) * 100) : 0}%)</span>
              </div>
              <Slider
                value={[overlapClamped]}
                min={0}
                max={overlapMax}
                step={25}
                onValueChange={([v]) => setOverlap(v)}
              />
              <p className="text-meta text-muted-foreground">
                Overlap maior preserva contexto entre blocos, mas aumenta custo de embedding.
              </p>
            </div>

            {!initial?.has_parsed_text && (
              <Alert variant="destructive">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Este documento foi ingerido antes do salvamento de texto ({'<'} v2). Envie o arquivo novamente
                  para habilitar o re-chunking sem re-OCR.
                </AlertDescription>
              </Alert>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-meta">
                Blocos antigos ficam arquivados (não deletados), garantindo que as citações
                históricas continuem resolvendo. Uma nova versão (v{(initial?.chunk_version ?? 1) + 1}) será
                criada e re-embedada em background.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button
            onClick={doRechunk}
            disabled={busy || loading || !changed || !initial?.has_parsed_text}
          >
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Reprocessar &amp; Re-embed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DocumentChunkingDialog;
