/**
 * AgentEvalsPage — Painel de avaliações automáticas (LLM-as-judge) por agente.
 * Consome hooks useAgentEvals: datasets, runs e resultados detalhados.
 */
import { useMemo, useState } from "react";
import { Beaker, Play, Plus, Trash2, CheckCircle2, XCircle, Loader2, Clock, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAgents, useWorkspaceId } from "@/hooks/use-data";
import {
  useEvalDatasets,
  useEvalRuns,
  useEvalResults,
  useCreateEvalDataset,
  useDeleteEvalDataset,
  useRunEval,
  type EvalItem,
} from "@/hooks/useAgentEvals";

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    queued: { label: "Na fila", className: "bg-muted text-muted-foreground" },
    running: { label: "Executando", className: "bg-nexus-blue/20 text-nexus-blue" },
    completed: { label: "Concluído", className: "bg-nexus-green/20 text-nexus-green" },
    failed: { label: "Falhou", className: "bg-destructive/20 text-destructive" },
  };
  const cfg = map[status] ?? { label: status, className: "" };
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
};

export default function AgentEvalsPage() {
  const { data: workspaceId } = useWorkspaceId();
  const { data: agents = [] } = useAgents();
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [openCreate, setOpenCreate] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { data: datasets = [], isLoading: loadingDatasets } = useEvalDatasets(selectedAgent || undefined);
  const { data: runs = [], isLoading: loadingRuns } = useEvalRuns(selectedAgent || undefined);
  const { data: results = [] } = useEvalResults(selectedRunId);

  const createDataset = useCreateEvalDataset();
  const deleteDataset = useDeleteEvalDataset();
  const runEval = useRunEval();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [itemsRaw, setItemsRaw] = useState('[\n  {\n    "input": "Qual a capital do Brasil?",\n    "expected_output": "Brasília",\n    "criteria": ["Cita explicitamente Brasília"]\n  }\n]');

  const parsedItems: EvalItem[] | null = useMemo(() => {
    try {
      const parsed = JSON.parse(itemsRaw);
      if (!Array.isArray(parsed)) return null;
      return parsed.filter((i) => typeof i?.input === "string" && typeof i?.expected_output === "string");
    } catch {
      return null;
    }
  }, [itemsRaw]);

  const handleCreate = async () => {
    if (!workspaceId) return toast.error("Workspace não carregado");
    if (!name.trim()) return toast.error("Nome obrigatório");
    if (!parsedItems || parsedItems.length === 0) return toast.error("JSON de itens inválido");

    await createDataset.mutateAsync({
      workspace_id: workspaceId,
      agent_id: selectedAgent || undefined,
      name: name.trim(),
      description,
      items: parsedItems,
    });
    setOpenCreate(false);
    setName("");
    setDescription("");
  };

  const handleRun = async (datasetId: string) => {
    if (!selectedAgent) return toast.error("Selecione um agente para executar");
    await runEval.mutateAsync({ dataset_id: datasetId, agent_id: selectedAgent });
  };

  const summary = useMemo(() => {
    const completed = runs.filter((r) => r.status === "completed");
    const totalRuns = runs.length;
    const passRate = completed.length
      ? completed.reduce((acc, r) => acc + (r.total_items ? r.passed / r.total_items : 0), 0) / completed.length
      : 0;
    const avgCost = completed.length
      ? completed.reduce((acc, r) => acc + Number(r.total_cost_usd || 0), 0) / completed.length
      : 0;
    const avgLatency = completed.length
      ? completed.reduce((acc, r) => acc + Number(r.avg_latency_ms || 0), 0) / completed.length
      : 0;
    return { totalRuns, passRate, avgCost, avgLatency };
  }, [runs]);

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Avaliações de Agente"
        subtitle="Datasets curados + LLM-as-judge para validar qualidade, custo e latência por versão."
        icon={Beaker}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedAgent || "all"} onValueChange={(v) => setSelectedAgent(v === "all" ? "" : v)}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Filtrar por agente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os agentes</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.avatar_emoji ?? "🤖"} {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button className="ml-auto">
              <Plus className="h-4 w-4 mr-2" />
              Novo dataset
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Criar dataset de avaliação</DialogTitle>
              <DialogDescription>
                Defina pares (input, expected_output) + critérios de julgamento. O judge LLM valida cada item na execução.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Regressão QA suporte v1" />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contexto do dataset" />
              </div>
              <div>
                <Label>
                  Itens (JSON) —{" "}
                  <span className={parsedItems ? "text-nexus-green" : "text-destructive"}>
                    {parsedItems ? `${parsedItems.length} itens válidos` : "JSON inválido"}
                  </span>
                </Label>
                <Textarea rows={12} value={itemsRaw} onChange={(e) => setItemsRaw(e.target.value)} className="font-mono text-xs" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={createDataset.isPending}>
                {createDataset.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Execuções</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{summary.totalRuns}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Taxa de aprovação</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-nexus-green">{(summary.passRate * 100).toFixed(1)}%</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Latência média</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{summary.avgLatency.toFixed(0)}ms</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />Custo médio</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">${summary.avgCost.toFixed(4)}</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="datasets">
        <TabsList>
          <TabsTrigger value="datasets">Datasets</TabsTrigger>
          <TabsTrigger value="runs">Execuções</TabsTrigger>
        </TabsList>

        <TabsContent value="datasets">
          <Card>
            <CardHeader><CardTitle>Datasets disponíveis</CardTitle></CardHeader>
            <CardContent>
              {loadingDatasets ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : datasets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhum dataset criado ainda.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Itens</TableHead>
                      <TableHead>Criado</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datasets.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="font-medium">{d.name}</div>
                          {d.description && <div className="text-xs text-muted-foreground">{d.description}</div>}
                        </TableCell>
                        <TableCell>{Array.isArray(d.items) ? d.items.length : 0}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(d.created_at), { addSuffix: true, locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!selectedAgent || runEval.isPending}
                            onClick={() => handleRun(d.id)}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Executar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteDataset.mutate(d.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {!selectedAgent && datasets.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3">Selecione um agente acima para habilitar execução.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader><CardTitle>Últimas execuções</CardTitle></CardHeader>
              <CardContent>
                {loadingRuns ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Sem execuções ainda.</p>
                ) : (
                  <ScrollArea className="h-[420px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Aprovados</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Quando</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {runs.map((r) => (
                          <TableRow
                            key={r.id}
                            className={`cursor-pointer ${selectedRunId === r.id ? "bg-muted/60" : ""}`}
                            onClick={() => setSelectedRunId(r.id)}
                          >
                            <TableCell>{statusBadge(r.status)}</TableCell>
                            <TableCell>{r.passed}/{r.total_items}</TableCell>
                            <TableCell>{Number(r.avg_score || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Detalhes da execução</CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedRunId ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Selecione uma execução para ver os itens julgados.</p>
                ) : results.length === 0 ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <ScrollArea className="h-[420px]">
                    <div className="space-y-3">
                      {results.map((r) => (
                        <div key={r.id} className="p-3 rounded-md border border-border/60 bg-card/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-xs">
                              {r.passed ? (
                                <CheckCircle2 className="h-4 w-4 text-nexus-green" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive" />
                              )}
                              <span className="font-mono">#{r.item_index}</span>
                              <Badge variant="outline" className="text-[10px]">Score {Number(r.score).toFixed(2)}</Badge>
                              <span className="text-muted-foreground">{r.latency_ms}ms · ${Number(r.cost_usd).toFixed(4)}</span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground"><b>Input:</b> {r.input}</p>
                          {r.expected && <p className="text-xs text-muted-foreground"><b>Esperado:</b> {r.expected}</p>}
                          {r.actual && <p className="text-xs mt-1"><b>Resposta:</b> {r.actual}</p>}
                          {r.judge_reasoning && (
                            <p className="text-[11px] text-muted-foreground italic mt-1 border-l-2 border-border pl-2">
                              {r.judge_reasoning}
                            </p>
                          )}
                          {r.error && <p className="text-xs text-destructive mt-1">Erro: {r.error}</p>}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
