import { useEffect, useState, useCallback } from "react";
import { supabaseExternal as supabase } from "@/integrations/supabase/externalClient";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Eye, Clock, DollarSign, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface GraphExecution {
  id: string;
  graph_id: string;
  user_id: string;
  workspace_id: string | null;
  input: string;
  status: string;
  current_node_id: string | null;
  trace: Array<Record<string, unknown>>;
  final_output: string | null;
  total_cost_cents: number;
  error_message: string | null;
  started_at: string;
  ended_at: string | null;
}

const statusColor: Record<string, string> = {
  running: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  completed: "bg-green-500/15 text-green-500 border-green-500/30",
  failed: "bg-red-500/15 text-red-500 border-red-500/30",
  cancelled: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

export default function GraphExecutionsPage() {
  const [rows, setRows] = useState<GraphExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GraphExecution | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("graph_executions")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) {
      logger.error("graph_executions.load", error);
      toast.error("Falha ao carregar execuções");
    } else {
      setRows((data ?? []) as unknown as GraphExecution[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalCost = rows.reduce((s, r) => s + (r.total_cost_cents ?? 0), 0) / 100;
  const running = rows.filter((r) => r.status === "running").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  const durationOf = (r: GraphExecution) => {
    if (!r.ended_at) return "—";
    const ms = new Date(r.ended_at).getTime() - new Date(r.started_at).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Execuções de Grafos"
          description="Trilha completa de execução de agent graphs — nós visitados, custos e falhas"
        />
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{rows.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Rodando</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-500">{running}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Falharam</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-500">{failed}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Custo Total</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">${totalCost.toFixed(4)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Últimas 200 execuções</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Carregando…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Nenhuma execução registrada.</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-md border border-border/40 hover:bg-accent/30 transition-colors">
                  <Badge variant="outline" className={statusColor[r.status] ?? ""}>{r.status}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.input || "(sem input)"}</div>
                    <div className="text-xs text-muted-foreground flex gap-3 mt-0.5">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{durationOf(r)}</span>
                      <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />${(r.total_cost_cents / 100).toFixed(4)}</span>
                      <span>{formatDistanceToNow(new Date(r.started_at), { addSuffix: true, locale: ptBR })}</span>
                      {r.current_node_id && <span>nó: {r.current_node_id}</span>}
                      {r.error_message && <span className="text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />erro</span>}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Detalhes da Execução</DialogTitle></DialogHeader>
          {selected && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-4 pr-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Status:</span> {selected.status}</div>
                  <div><span className="text-muted-foreground">Duração:</span> {durationOf(selected)}</div>
                  <div><span className="text-muted-foreground">Custo:</span> ${(selected.total_cost_cents / 100).toFixed(4)}</div>
                  <div><span className="text-muted-foreground">Nó atual:</span> {selected.current_node_id ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold mb-1 text-muted-foreground">Input</div>
                  <pre className="text-xs bg-muted/40 rounded p-3 whitespace-pre-wrap">{selected.input}</pre>
                </div>
                {selected.final_output && (
                  <div>
                    <div className="text-xs font-semibold mb-1 text-muted-foreground">Output final</div>
                    <pre className="text-xs bg-muted/40 rounded p-3 whitespace-pre-wrap">{selected.final_output}</pre>
                  </div>
                )}
                {selected.error_message && (
                  <div>
                    <div className="text-xs font-semibold mb-1 text-red-500">Erro</div>
                    <pre className="text-xs bg-red-500/10 border border-red-500/30 rounded p-3 whitespace-pre-wrap">{selected.error_message}</pre>
                  </div>
                )}
                <div>
                  <div className="text-xs font-semibold mb-1 text-muted-foreground">Trace ({selected.trace?.length ?? 0} passos)</div>
                  <pre className="text-xs bg-muted/40 rounded p-3 max-h-96 overflow-auto">{JSON.stringify(selected.trace, null, 2)}</pre>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
