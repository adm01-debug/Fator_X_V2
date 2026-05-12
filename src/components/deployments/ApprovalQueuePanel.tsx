import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listPendingApprovals, approveWorkflowRun, rejectWorkflowRun } from "@/services/approvalService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, ExternalLink, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function ApprovalQueuePanel() {
  const queryClient = useQueryClient();
  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: listPendingApprovals,
    refetchInterval: 10000, // Refresh every 10s for live ops
  });

  const [selectedRun, setSelectedRun] = useState<{ id: string; workflowId: string; type: 'approve' | 'reject' } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [processing, setProcessing] = useState(false);

  const handleAction = async () => {
    if (!selectedRun) return;
    setProcessing(true);
    try {
      if (selectedRun.type === 'approve') {
        await approveWorkflowRun(selectedRun.id, selectedRun.workflowId, feedback);
        toast.success("Aprovado com sucesso");
      } else {
        await rejectWorkflowRun(selectedRun.id, feedback);
        toast.success("Rejeitado");
      }
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      setSelectedRun(null);
      setFeedback("");
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (isLoading && pending.length === 0) return null;
  if (pending.length === 0) return null;

  return (
    <Card className="nexus-card bg-nexus-amber/5 border-nexus-amber/20 overflow-hidden animate-pulse-subtle">
      <CardHeader className="bg-nexus-amber/10 border-b border-nexus-amber/20 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-nexus-amber" />
            <CardTitle className="text-sm font-black uppercase tracking-widest text-nexus-amber">
              Fila de Aprovação Crítica
            </CardTitle>
          </div>
          <Badge variant="outline" className="bg-nexus-amber/20 text-nexus-amber border-none text-[10px] font-black">
            {pending.length} Pendentes
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-nexus-amber/10">
          {pending.map((run: any) => (
            <div key={run.id} className="p-4 flex items-center justify-between gap-4 hover:bg-nexus-amber/[0.03] transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-bold text-foreground truncate">{run.workflows?.name || 'Workflow'}</p>
                  <Badge variant="secondary" className="text-[9px] font-mono opacity-60">
                    Step {run.current_step}/{run.total_steps}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Há {new Date(run.started_at).toLocaleTimeString()}</span>
                  <span className="opacity-40">•</span>
                  <span className="font-mono">{run.id.slice(0, 8)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                  onClick={() => setSelectedRun({ id: run.id, workflowId: run.workflow_id, type: 'reject' })}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0 text-nexus-emerald hover:bg-nexus-emerald/10"
                  onClick={() => setSelectedRun({ id: run.id, workflowId: run.workflow_id, type: 'approve' })}
                >
                  <CheckCircle className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" className="h-8 px-3 rounded-xl text-[10px] font-bold gap-1.5" asChild>
                  <a href={`/workflows?run=${run.id}`}>
                    <ExternalLink className="h-3 w-3" /> Ver
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={!!selectedRun} onOpenChange={(open) => !open && setSelectedRun(null)}>
        <DialogContent className="rounded-[2.5rem] border-border/40 p-8 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading font-black flex items-center gap-3">
              {selectedRun?.type === 'approve' ? (
                <><CheckCircle className="h-6 w-6 text-nexus-emerald" /> Confirmar Aprovação</>
              ) : (
                <><XCircle className="h-6 w-6 text-destructive" /> Rejeitar Execução</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              {selectedRun?.type === 'approve' 
                ? "O workflow continuará sua execução a partir do ponto de suspensão."
                : "A execução será encerrada permanentemente."
              }
            </p>
            <Textarea 
              placeholder="Feedback opcional para o agente..." 
              value={feedback} 
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-[100px] rounded-2xl bg-muted/30 border-border/40"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRun(null)} className="rounded-xl h-11 px-6">Cancelar</Button>
            <Button 
              onClick={handleAction} 
              disabled={processing}
              className={selectedRun?.type === 'approve' ? "nexus-gradient-bg text-primary-foreground rounded-xl h-11 px-8" : "bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl h-11 px-8"}
            >
              {processing && <Clock className="h-4 w-4 mr-2 animate-spin" />}
              {selectedRun?.type === 'approve' ? "Aprovar Agora" : "Confirmar Rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
