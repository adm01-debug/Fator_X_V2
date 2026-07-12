import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, Clock, Loader2, PauseCircle, TimerOff, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { getExecution, replayExecution, type ExecutionRecord, type ExecutionStepRecord, type ExecutionStatus } from '@/services/executionHistoryService';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  executionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplayed?: () => void;
}

const STATUS_META: Record<ExecutionStatus, { icon: typeof CheckCircle2; color: string; label: string }> = {
  running: { icon: Loader2, color: 'text-nexus-blue', label: 'Em execução' },
  success: { icon: CheckCircle2, color: 'text-nexus-emerald', label: 'Sucesso' },
  failed: { icon: XCircle, color: 'text-destructive', label: 'Falhou' },
  cancelled: { icon: PauseCircle, color: 'text-muted-foreground', label: 'Cancelado' },
  timeout: { icon: TimerOff, color: 'text-nexus-orange', label: 'Timeout' },
  waiting: { icon: Clock, color: 'text-nexus-amber', label: 'Aguardando' },
};

export function ExecutionTimelineDialog({ executionId, open, onOpenChange, onReplayed }: Props) {
  const [execution, setExecution] = useState<ExecutionRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !executionId) return;
    setLoading(true);
    getExecution(executionId)
      .then((exec) => setExecution(exec))
      .catch(() => toast({ title: 'Erro ao carregar execução', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [executionId, open, toast]);

  const toggleStep = (idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const handleReplay = async () => {
    if (!execution) return;
    setReplaying(true);
    try {
      await replayExecution(execution.id);
      toast({ title: 'Execução replicada com sucesso' });
      onReplayed?.();
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Erro ao replicar', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setReplaying(false);
    }
  };

  const totalDuration = execution?.duration_ms ?? 0;
  const status = execution?.status ?? 'running';
  const StatusIcon = STATUS_META[status].icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <StatusIcon size={20} className={STATUS_META[status].color} />
            <span>Timeline de execução</span>
            {execution && (
              <Badge variant="outline" className="ml-auto text-meta font-mono">{execution.id.slice(0, 8)}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {execution ? (
              <span className="flex flex-wrap items-center gap-3 text-meta">
                <span>{execution.source_name}</span>
                <span>•</span>
                <span>Gatilho: <span className="font-medium">{execution.trigger}</span></span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(execution.started_at), { addSuffix: true, locale: ptBR })}</span>
                {totalDuration > 0 && (<><span>•</span><span>{(totalDuration / 1000).toFixed(2)}s</span></>)}
              </span>
            ) : 'Carregando…'}
          </DialogDescription>
        </DialogHeader>

        {loading || !execution ? (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 size={32} className="mx-auto mb-3 animate-spin" />
            Carregando timeline…
          </div>
        ) : (
          <Tabs defaultValue="timeline">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="timeline">Timeline ({execution.steps.length})</TabsTrigger>
              <TabsTrigger value="input">Input</TabsTrigger>
              <TabsTrigger value="output">Output</TabsTrigger>
              <TabsTrigger value="meta">Metadata</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline">
              <ScrollArea className="h-[460px] pr-3">
                {execution.steps.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-body-sm">
                    Nenhum step registrado nesta execução.
                  </div>
                ) : (
                  <ol className="relative border-l-2 border-border ml-4 space-y-4 py-2">
                    {execution.steps.map((step: ExecutionStepRecord, idx: number) => {
                      const meta = STATUS_META[step.status];
                      const Icon = meta.icon;
                      const durationPct = totalDuration > 0 && step.duration_ms ? (step.duration_ms / totalDuration) * 100 : 0;
                      const isExpanded = expandedSteps.has(idx);
                      return (
                        <li key={step.step_id ?? idx} className="ml-6 relative">
                          <span className={`absolute -left-9 top-1 w-6 h-6 rounded-full bg-background border-2 border-border flex items-center justify-center ${meta.color}`}>
                            <Icon size={12} className={step.status === 'running' ? 'animate-spin' : ''} />
                          </span>
                          <div className="bg-background/60 border border-border rounded-lg p-3 hover:border-primary/40 transition-colors">
                            <button
                              onClick={() => toggleStep(idx)}
                              className="w-full flex items-start gap-2 text-left"
                            >
                              {isExpanded ? <ChevronDown size={14} className="mt-1 shrink-0" /> : <ChevronRight size={14} className="mt-1 shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-body-sm font-medium truncate">{step.step_name}</span>
                                  <Badge variant="outline" className="text-meta">{step.step_type}</Badge>
                                  <Badge className={`text-meta ${meta.color} bg-transparent border-current`}>{meta.label}</Badge>
                                </div>
                                <div className="flex items-center gap-3 text-meta text-muted-foreground mt-1">
                                  <span>{format(new Date(step.started_at), 'HH:mm:ss.SSS')}</span>
                                  {step.duration_ms != null && <span>• {step.duration_ms}ms</span>}
                                </div>
                                {durationPct > 0 && (
                                  <div className="h-1 bg-muted rounded-full mt-2 overflow-hidden">
                                    <div className={`h-full ${step.status === 'failed' ? 'bg-destructive' : 'bg-nexus-blue'}`} style={{ width: `${Math.min(durationPct, 100)}%` }} />
                                  </div>
                                )}
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="mt-3 space-y-2 pl-6">
                                {step.error && (
                                  <div className="text-meta bg-destructive/10 border border-destructive/30 rounded p-2 text-destructive font-mono whitespace-pre-wrap">
                                    {step.error}
                                  </div>
                                )}
                                <details open>
                                  <summary className="text-meta text-muted-foreground cursor-pointer hover:text-foreground">Input</summary>
                                  <pre className="text-meta bg-muted/40 rounded p-2 mt-1 overflow-x-auto font-mono max-h-48">{JSON.stringify(step.input, null, 2)}</pre>
                                </details>
                                {step.output && (
                                  <details>
                                    <summary className="text-meta text-muted-foreground cursor-pointer hover:text-foreground">Output</summary>
                                    <pre className="text-meta bg-muted/40 rounded p-2 mt-1 overflow-x-auto font-mono max-h-48">{JSON.stringify(step.output, null, 2)}</pre>
                                  </details>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="input">
              <ScrollArea className="h-[460px]">
                <pre className="text-meta bg-muted/40 rounded p-3 font-mono">{JSON.stringify(execution.input_data, null, 2)}</pre>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="output">
              <ScrollArea className="h-[460px]">
                {execution.error ? (
                  <div className="text-meta bg-destructive/10 border border-destructive/30 rounded p-3 text-destructive font-mono whitespace-pre-wrap">
                    <div className="font-bold mb-2">{execution.error}</div>
                    {execution.error_stack && <div className="opacity-80">{execution.error_stack}</div>}
                  </div>
                ) : execution.output_data ? (
                  <pre className="text-meta bg-muted/40 rounded p-3 font-mono">{JSON.stringify(execution.output_data, null, 2)}</pre>
                ) : (
                  <div className="text-center text-muted-foreground py-12">Sem output registrado.</div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="meta">
              <div className="space-y-2 text-body-sm">
                <div className="grid grid-cols-2 gap-3">
                  <MetaRow label="Tipo" value={execution.execution_type} />
                  <MetaRow label="Source ID" value={execution.source_id} mono />
                  <MetaRow label="Tokens" value={String(execution.tokens_used)} />
                  <MetaRow label="Custo" value={`R$ ${execution.cost_brl.toFixed(4)}`} />
                  <MetaRow label="Iniciado" value={format(new Date(execution.started_at), "dd/MM/yyyy HH:mm:ss")} />
                  <MetaRow label="Concluído" value={execution.completed_at ? format(new Date(execution.completed_at), "dd/MM/yyyy HH:mm:ss") : '—'} />
                  <MetaRow label="Retry de" value={execution.retry_of ?? '—'} mono />
                  <MetaRow label="Parent" value={execution.parent_execution_id ?? '—'} mono />
                </div>
                {execution.tags.length > 0 && (
                  <div className="pt-2">
                    <p className="text-meta text-muted-foreground mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {execution.tags.map((t) => <Badge key={t} variant="secondary" className="text-meta">{t}</Badge>)}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {execution && execution.status !== 'running' && (
            <Button onClick={handleReplay} disabled={replaying} className="gap-2">
              {replaying ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Replicar execução
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-meta text-muted-foreground">{label}</span>
      <span className={`text-body-sm ${mono ? 'font-mono text-meta' : ''} truncate`}>{value}</span>
    </div>
  );
}
