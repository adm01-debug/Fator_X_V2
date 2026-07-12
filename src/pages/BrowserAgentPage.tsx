import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe2, Play, Square, Trash2, CheckCircle2, Loader2, Clock, DollarSign, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { browserAgentService, type BrowserSession } from "@/services/browserAgentService";

const statusBadge = (status: BrowserSession["status"]) => {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    running: { variant: "default", label: "Executando" },
    completed: { variant: "secondary", label: "Concluída" },
    failed: { variant: "destructive", label: "Falhou" },
    cancelled: { variant: "outline", label: "Cancelada" },
  };
  const cfg = map[status] ?? map.failed;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};

export default function BrowserAgentPage() {
  const qc = useQueryClient();
  const [goal, setGoal] = useState("");
  const [startUrl, setStartUrl] = useState("https://duckduckgo.com");
  const [maxSteps, setMaxSteps] = useState(10);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [replaySession, setReplaySession] = useState<BrowserSession | null>(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ["browser-sessions"],
    queryFn: () => browserAgentService.listSessions(),
    refetchInterval: 3000,
  });

  const runMutation = useMutation({
    mutationFn: () => browserAgentService.runAgent({ goal, start_url: startUrl, max_steps: maxSteps }),
    onSuccess: (res) => {
      setActiveSessionId(res.session_id);
      toast.success(`Sessão concluída: ${res.status}`, { description: res.final_result?.slice(0, 120) });
      qc.invalidateQueries({ queryKey: ["browser-sessions"] });
    },
    onError: (e) => toast.error("Falha", { description: e instanceof Error ? e.message : String(e) }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => browserAgentService.cancelSession(id),
    onSuccess: () => {
      toast.success("Sessão cancelada");
      qc.invalidateQueries({ queryKey: ["browser-sessions"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => browserAgentService.deleteSession(id),
    onSuccess: () => {
      toast.success("Sessão removida");
      qc.invalidateQueries({ queryKey: ["browser-sessions"] });
    },
  });

  const totalSessions = sessions.length;
  const completed = sessions.filter((s) => s.status === "completed").length;
  const totalCostCents = sessions.reduce((sum, s) => sum + s.cost_cents, 0);
  const totalSteps = sessions.reduce((sum, s) => sum + s.steps_count, 0);

  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) : null;

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Globe2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
              Browser Agent
            </h1>
            <p className="text-body-sm text-muted-foreground">Agentes autônomos que navegam e extraem informação na web</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><ListChecks className="h-5 w-5 text-muted-foreground" /><div><p className="text-2xl font-bold">{totalSessions}</p><p className="text-meta text-muted-foreground">Sessões totais</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-nexus-emerald" /><div><p className="text-2xl font-bold">{completed}</p><p className="text-meta text-muted-foreground">Completadas</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Clock className="h-5 w-5 text-muted-foreground" /><div><p className="text-2xl font-bold">{totalSteps}</p><p className="text-meta text-muted-foreground">Steps executados</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><DollarSign className="h-5 w-5 text-muted-foreground" /><div><p className="text-2xl font-bold">${(totalCostCents / 100).toFixed(2)}</p><p className="text-meta text-muted-foreground">Custo total</p></div></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova execução</CardTitle>
          <CardDescription>Defina o objetivo e a URL inicial. O agente decide cada passo via LLM.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-body-sm font-medium">Objetivo</label>
            <Textarea
              placeholder="Ex: Encontre o preço atual do iPhone 15 Pro Max no site da Apple Brasil"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-2">
              <label className="text-body-sm font-medium">URL inicial</label>
              <Input value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <label className="text-body-sm font-medium">Max steps</label>
              <Input type="number" min={1} max={25} value={maxSteps} onChange={(e) => setMaxSteps(parseInt(e.target.value) || 10)} />
            </div>
          </div>
          <Button
            onClick={() => runMutation.mutate()}
            disabled={!goal.trim() || !startUrl.trim() || runMutation.isPending}
            loading={runMutation.isPending}
            variant="gradient"
            size="lg"
            className="w-full"
          >
            <Play className="h-4 w-4" />
            {runMutation.isPending ? "Executando..." : "Executar agente"}
          </Button>
        </CardContent>
      </Card>

      {activeSession && activeSession.status === "running" && (
        <Card className="border-primary/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Sessão ativa</CardTitle>
              <CardDescription>{activeSession.goal}</CardDescription>
            </div>
            <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate(activeSession.id)}>
              <Square className="h-4 w-4" /> Cancelar
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[500px]">
              <ScrollArea className="h-full border rounded-lg bg-black/5 p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur pb-2">
                    <h3 className="text-body-sm font-bold flex items-center gap-2">
                      <ListChecks className="h-4 w-4" /> Log de Execução
                    </h3>
                    <Badge variant="outline">Step {activeSession.steps_count + 1}</Badge>
                  </div>
                  {activeSession.steps.map((s, i) => (
                    <div key={i} className="text-meta p-3 rounded-lg bg-card border shadow-sm space-y-2 animate-in slide-in-from-bottom-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="uppercase text-[9px] font-black">{s.action}</Badge>
                        <span className="text-muted-foreground truncate flex-1">{s.url}</span>
                      </div>
                      <p className="font-medium text-foreground/80 leading-relaxed italic">"{s.reasoning}"</p>
                      {s.screenshot && (
                        <div className="relative aspect-video rounded overflow-hidden border">
                          <img src={`data:image/jpeg;base64,${s.screenshot}`} alt="Step Screenshot" className="object-cover w-full h-full" />
                        </div>
                      )}
                    </div>
                  ))}
                  {activeSession.steps.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <p className="text-body-sm">Iniciando motor de navegação...</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
              
              <div className="h-full border rounded-lg bg-muted flex flex-col">
                <div className="p-2 border-b bg-background flex items-center justify-between">
                  <span className="text-meta font-mono text-muted-foreground uppercase tracking-widest">Live Agent Viewport</span>
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-nexus-red" />
                    <div className="w-2 h-2 rounded-full bg-nexus-yellow" />
                    <div className="w-2 h-2 rounded-full bg-nexus-green" />
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center p-4">
                  {activeSession.steps[activeSession.steps.length - 1]?.screenshot ? (
                    <img 
                      src={`data:image/jpeg;base64,${activeSession.steps[activeSession.steps.length - 1].screenshot}`} 
                      className="max-h-full max-w-full rounded shadow-2xl border-4 border-background"
                      alt="Live View"
                    />
                  ) : (
                    <div className="text-center space-y-3">
                      <Globe2 className="h-12 w-12 mx-auto text-muted-foreground/30 animate-pulse" />
                      <p className="text-meta text-muted-foreground">Aguardando sinal visual...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
          <CardDescription>Todas as sessões executadas</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-center text-body-sm text-muted-foreground py-8">Nenhuma sessão ainda. Execute a primeira acima.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Objetivo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Steps</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-xs truncate" title={s.goal}>{s.goal}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="text-right">{s.steps_count}/{s.max_steps}</TableCell>
                    <TableCell className="text-right">${(s.cost_cents / 100).toFixed(2)}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => setReplaySession(s)}>Replay</Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(s.id)}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!replaySession} onOpenChange={(o) => !o && setReplaySession(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Replay da sessão</DialogTitle>
            <DialogDescription>{replaySession?.goal}</DialogDescription>
          </DialogHeader>
          {replaySession && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-body-sm">
                {statusBadge(replaySession.status)}
                <span className="text-muted-foreground">·</span>
                <span>{replaySession.steps_count} steps</span>
                <span className="text-muted-foreground">·</span>
                <span>${(replaySession.cost_cents / 100).toFixed(2)}</span>
              </div>
              {replaySession.final_result && (
                <div className="p-3 rounded-md bg-nexus-emerald/10 border border-nexus-emerald/30">
                  <p className="text-meta font-medium text-nexus-emerald mb-1">Resultado final</p>
                  <p className="text-body-sm whitespace-pre-wrap">{replaySession.final_result}</p>
                </div>
              )}
              {replaySession.error_message && (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30">
                  <p className="text-meta font-medium text-destructive mb-1">Erro</p>
                  <p className="text-body-sm">{replaySession.error_message}</p>
                </div>
              )}
              <ScrollArea className="h-96">
                <div className="space-y-3">
                  {replaySession.steps.map((s, i) => (
                    <div key={i} className="border-l-2 border-primary/40 pl-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-meta">Step {s.step_index + 1}</Badge>
                        <Badge className="text-meta">{s.action}</Badge>
                        {s.args.idx !== undefined && <span className="text-meta text-muted-foreground">idx={s.args.idx}</span>}
                      </div>
                      <p className="text-meta text-muted-foreground truncate mb-1">URL: {s.url}</p>
                      <p className="text-body-sm">{s.reasoning}</p>
                      {s.args.text && <p className="text-meta mt-1 font-mono bg-muted/40 px-2 py-1 rounded">{s.args.text}</p>}
                      {s.args.result && <p className="text-meta mt-1 italic">→ {s.args.result}</p>}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
