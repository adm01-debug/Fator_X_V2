import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { FileText, FileType2, Trash2, RefreshCw, UploadCloud, Info } from 'lucide-react';
import {
  uploadDocument, listIngestions, subscribeIngestions,
  retryIngestion, deleteIngestion,
  statusLabel, methodLabel,
  ACCEPTED_MIMES, MAX_UPLOAD_BYTES,
  type DocumentIngestion,
} from '@/services/documentIngestionService';
import { NotebookSelector } from './NotebookSelector';
import { useCerebroStore } from '@/stores/cerebroStore';

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function methodVariant(m: string | null): 'default' | 'secondary' | 'outline' {
  if (m === 'ocr') return 'default';
  if (m === 'hybrid') return 'secondary';
  return 'outline';
}

function statusColor(s: DocumentIngestion['status']): string {
  if (s === 'ready') return 'text-emerald-500';
  if (s === 'error') return 'text-destructive';
  return 'text-primary';
}

export function DocumentUploadTab() {
  const activeNotebookId = useCerebroStore((s) => s.activeNotebookId);
  const [ingestions, setIngestions] = useState<DocumentIngestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
      const rows = await listIngestions(activeNotebookId ?? undefined).catch(() => []);
      setIngestions(rows);
    })();
  }, [activeNotebookId]);

  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeIngestions(userId, (row) => {
      setIngestions((prev) => {
        const idx = prev.findIndex((r) => r.id === row.id);
        if (idx === -1) return [row, ...prev];
        const next = [...prev];
        next[idx] = row;
        return next;
      });
    });
    return unsub;
  }, [userId]);

  const handleFiles = useCallback(async (files: File[]) => {
    if (!activeNotebookId) {
      toast.error('Selecione um notebook antes de enviar arquivos.');
      return;
    }
    setLoading(true);
    for (const file of files) {
      const tId = toast.loading(`Enviando ${file.name}…`);
      try {
        const ing = await uploadDocument(file, {
          collectionId: activeNotebookId,
          onStage: (s) => toast.loading(`${file.name}: ${statusLabel(s as DocumentIngestion['status'])}`, { id: tId }),
        });
        toast.success(`${file.name} pronto!`, {
          id: tId,
          description: `Método: ${methodLabel(ing.extraction_method)} • ${ing.pages ?? '—'} páginas`,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`Falha em ${file.name}`, { id: tId, description: msg });
      }
    }
    setLoading(false);
  }, [activeNotebookId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED_MIMES,
    maxSize: MAX_UPLOAD_BYTES,
    multiple: true,
    onDrop: handleFiles,
    disabled: loading || !activeNotebookId,
  });

  const empty = useMemo(() => ingestions.length === 0, [ingestions]);

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UploadCloud className="h-5 w-5 text-primary" />
            Upload de Documentos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <NotebookSelector allowAll={false} />
            {!activeNotebookId && (
              <Badge variant="outline" className="text-meta">Selecione um notebook para habilitar o upload</Badge>
            )}
          </div>


          <div
            {...getRootProps()}
            className={`
              rounded-lg border-2 border-dashed p-10 text-center cursor-pointer
              transition-colors duration-200
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-secondary/30'}
              ${(loading || !selectedCollection) ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <input {...getInputProps()} />
            <UploadCloud className="h-10 w-10 text-primary mx-auto mb-3" />
            <p className="text-body font-medium">
              {isDragActive ? 'Solte os arquivos aqui…' : 'Arraste PDFs e DOCX ou clique para selecionar'}
            </p>
            <p className="text-meta text-muted-foreground mt-1">
              Até 20 MB por arquivo. PDF escaneado usa OCR automático (Granite Vision).
            </p>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-meta">
              PDFs com texto nativo são extraídos instantaneamente. PDFs escaneados são
              rasterizados no navegador e enviados para OCR página a página, com custos
              registrados no simulador (categoria <code>ocr.page</code>).
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Histórico de ingestões</CardTitle>
        </CardHeader>
        <CardContent>
          {empty ? (
            <div className="py-10 text-center text-muted-foreground text-meta">
              Nenhum documento ingerido ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {ingestions.map((ing) => (
                <IngestionRow key={ing.id} ing={ing} onChanged={(r) => {
                  setIngestions((prev) => prev.map(p => p.id === r.id ? r : p));
                }} onRemoved={(id) => setIngestions((prev) => prev.filter(p => p.id !== id))} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface RowProps {
  ing: DocumentIngestion;
  onChanged: (r: DocumentIngestion) => void;
  onRemoved: (id: string) => void;
}

function IngestionRow({ ing, onRemoved }: RowProps) {
  const [busy, setBusy] = useState(false);
  const isPdf = ing.mime === 'application/pdf';
  const Icon = isPdf ? FileText : FileType2;
  const isRunning = ing.status !== 'ready' && ing.status !== 'error';

  const doRetry = async () => {
    setBusy(true);
    try {
      await retryIngestion(ing.id);
      toast.success('Reprocessamento iniciado');
    } catch (e) {
      toast.error('Falha ao reprocessar', { description: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!confirm(`Remover "${ing.filename}" e todos os chunks?`)) return;
    setBusy(true);
    try {
      await deleteIngestion(ing);
      onRemoved(ing.id);
      toast.success('Removido');
    } catch (e) {
      toast.error('Falha ao remover', { description: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
      <Icon className="h-5 w-5 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-body font-medium truncate">{ing.filename}</span>
          {ing.extraction_method && (
            <Badge variant={methodVariant(ing.extraction_method)} className="text-meta">
              {methodLabel(ing.extraction_method)}
            </Badge>
          )}
          {ing.pages && <Badge variant="outline" className="text-meta">{ing.pages} pág.</Badge>}
          <span className="text-meta text-muted-foreground">{humanBytes(ing.size_bytes)}</span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className={`text-meta ${statusColor(ing.status)}`}>{statusLabel(ing.status)}</span>
          {isRunning && (
            <Progress value={ing.progress_pct} className="h-1.5 flex-1 max-w-xs" />
          )}
        </div>
        {ing.error_message && (
          <p className="text-meta text-destructive mt-1 truncate" title={ing.error_message}>
            {ing.error_message}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {ing.status === 'error' && (
          <Button size="sm" variant="ghost" onClick={doRetry} disabled={busy}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={doDelete} disabled={busy}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default DocumentUploadTab;
