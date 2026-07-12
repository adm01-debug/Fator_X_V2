/**
 * Agent Experiments — A/B testing de configurações de agentes.
 * Compara duas variantes (A/B) por latência, custo, score e tokens.
 */
import { useMemo, useState } from "react";
import { FlaskConical, Play, Pause, Trophy, Trash2, Plus, CircleDot } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useAgents } from "@/hooks/use-data";
import {
  useExperiments,
  useExperimentRuns,
  useCreateExperiment,
  useUpdateExperimentStatus,
  useDeclareWinner,
  useDeleteExperiment,
  computeVariantStats,
  type AgentExperiment,
  type ExperimentStatus,
} from "@/hooks/useAgentExperiments";

function statusBadge(status: ExperimentStatus) {
  const map: Record<ExperimentStatus, { label: string; className: string }> = {
    draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
    running: {
      label: "Em execução",
      className: "bg-nexus-emerald/15 text-nexus-emerald border-nexus-emerald/30",
    },
    paused: { label: "Pausado", className: "bg-nexus-amber/15 text-nexus-amber border-nexus-amber/30" },
    completed: { label: "Concluído", className: "bg-nexus-cyan/15 text-nexus-cyan border-nexus-cyan/30" },
  };
  const cfg = map[status];
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

function fmtUsd(v: number) {
  return `$${v.toFixed(4)}`;
}

function fmtMs(v: number) {
  return `${v} ms`;
}

export default function AgentExperimentsPage() {
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const [agentId, setAgentId] = useState<string | undefined>();
  const [selected, setSelected] = useState<AgentExperiment | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const activeAgent = useMemo(
    () => agents?.find((a) => a.id === agentId),
    [agents, agentId],
  );

  const { data: experiments, isLoading: expLoading } = useExperiments(agentId);
  const { data: runs } = useExperimentRuns(selected?.id);

  const createExp = useCreateExperiment();
  const updateStatus = useUpdateExperimentStatus();
  const declareWinner = useDeclareWinner();
  const deleteExp = useDeleteExperiment();

  const statsA = useMemo(() => computeVariantStats(runs ?? [], "a"), [runs]);
  const statsB = useMemo(() => computeVariantStats(runs ?? [], "b"), [runs]);

  // form state
  const [form, setForm] = useState({
    name: "",
    description: "",
    variant_a: '{\n  "temperature": 0.7\n}',
    variant_b: '{\n  "temperature": 0.3\n}',
    split: 50,
  });

  const submitCreate = async () => {
    if (!agentId || !activeAgent) return;
    let a: Record<string, unknown> = {};
    let b: Record<string, unknown> = {};
    try {
      a = JSON.parse(form.variant_a);
      b = JSON.parse(form.variant_b);
    } catch {
      return;
    }
    await createExp.mutateAsync({
      agent_id: agentId,
      workspace_id: activeAgent.workspace_id ?? "",
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      variant_a_config: a,
      variant_b_config: b,
      traffic_split: form.split,
    });
    setDialogOpen(false);
    setForm({ ...form, name: "", description: "" });
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Experimentos A/B de Agentes"
        description="Compare configurações de agentes em produção com métricas objetivas de latência, custo e qualidade."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="size-5 text-primary" />
            Selecione um agente
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <Select
            value={agentId}
            onValueChange={(v) => {
              setAgentId(v);
              setSelected(null);
            }}
            disabled={agentsLoading}
          >
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Escolha um agente" />
            </SelectTrigger>
            <SelectContent>
              {agents?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.avatar_emoji ?? "🤖"} {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!agentId}>
                <Plus className="size-4 mr-2" /> Novo experimento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Criar experimento A/B</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex.: Temperatura alta vs baixa"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Variante A (JSON)</Label>
                    <Textarea
                      className="font-mono text-xs"
                      rows={6}
                      value={form.variant_a}
                      onChange={(e) => setForm({ ...form, variant_a: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Variante B (JSON)</Label>
                    <Textarea
                      className="font-mono text-xs"
                      rows={6}
                      value={form.variant_b}
                      onChange={(e) => setForm({ ...form, variant_b: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Divisão de tráfego: {form.split}% A / {100 - form.split}% B</Label>
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={[form.split]}
                    onValueChange={([v]) => setForm({ ...form, split: v })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={submitCreate}
                  disabled={!form.name.trim() || createExp.isPending}
                >
                  {createExp.isPending ? "Criando..." : "Criar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {agentId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Experimentos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {expLoading && <Skeleton className="h-20 w-full" />}
              {!expLoading && experiments?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum experimento ainda.
                </p>
              )}
              {experiments?.map((exp) => (
                <button
                  key={exp.id}
                  onClick={() => setSelected(exp)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selected?.id === exp.id
                      ? "bg-primary/10 border-primary"
                      : "bg-card/40 hover:bg-card/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{exp.name}</span>
                    {statusBadge(exp.status)}
                  </div>
                  {exp.winner && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-nexus-amber">
                      <Trophy className="size-3" /> Vencedor: Variante {exp.winner.toUpperCase()}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(exp.created_at), "dd MMM yyyy", { locale: ptBR })} · Split{" "}
                    {exp.traffic_split}/{100 - exp.traffic_split}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="lg:col-span-2 space-y-4">
            {!selected && (
              <Alert>
                <CircleDot className="size-4" />
                <AlertTitle>Selecione um experimento</AlertTitle>
                <AlertDescription>
                  Escolha um experimento à esquerda para ver métricas comparativas e ações.
                </AlertDescription>
              </Alert>
            )}

            {selected && (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                      <CardTitle>{selected.name}</CardTitle>
                      {selected.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {selected.description}
                        </p>
                      )}
                    </div>
                    {statusBadge(selected.status)}
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {selected.status === "draft" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          updateStatus.mutate({
                            id: selected.id,
                            status: "running",
                            agent_id: selected.agent_id,
                          })
                        }
                      >
                        <Play className="size-4 mr-2" /> Iniciar
                      </Button>
                    )}
                    {selected.status === "running" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateStatus.mutate({
                            id: selected.id,
                            status: "paused",
                            agent_id: selected.agent_id,
                          })
                        }
                      >
                        <Pause className="size-4 mr-2" /> Pausar
                      </Button>
                    )}
                    {selected.status === "paused" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          updateStatus.mutate({
                            id: selected.id,
                            status: "running",
                            agent_id: selected.agent_id,
                          })
                        }
                      >
                        <Play className="size-4 mr-2" /> Retomar
                      </Button>
                    )}
                    {selected.status !== "completed" && !selected.winner && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            declareWinner.mutate({
                              id: selected.id,
                              winner: "a",
                              agent_id: selected.agent_id,
                            })
                          }
                          disabled={statsA.runs === 0}
                        >
                          <Trophy className="size-4 mr-2" /> Vencedor A
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            declareWinner.mutate({
                              id: selected.id,
                              winner: "b",
                              agent_id: selected.agent_id,
                            })
                          }
                          disabled={statsB.runs === 0}
                        >
                          <Trophy className="size-4 mr-2" /> Vencedor B
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (window.confirm(`Excluir "${selected.name}"?`)) {
                          deleteExp.mutate({
                            id: selected.id,
                            agent_id: selected.agent_id,
                          });
                          setSelected(null);
                        }
                      }}
                    >
                      <Trash2 className="size-4 mr-2" /> Excluir
                    </Button>
                  </CardContent>
                </Card>

                <Tabs defaultValue="metrics">
                  <TabsList>
                    <TabsTrigger value="metrics">Métricas</TabsTrigger>
                    <TabsTrigger value="configs">Configurações</TabsTrigger>
                    <TabsTrigger value="runs">Execuções ({runs?.length ?? 0})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="metrics" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(
                      [
                        { key: "a", stats: statsA, tone: "border-nexus-cyan/30 bg-nexus-cyan/5" },
                        { key: "b", stats: statsB, tone: "border-nexus-purple/30 bg-nexus-purple/5" },
                      ] as const
                    ).map(({ key, stats, tone }) => (
                      <Card key={key} className={tone}>
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-base">
                            Variante {key.toUpperCase()}
                            {selected.winner === key && (
                              <Badge className="bg-nexus-amber/15 text-nexus-amber border-nexus-amber/30">
                                <Trophy className="size-3 mr-1" /> Vencedor
                              </Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Execuções</span>
                            <span className="font-mono font-semibold">{stats.runs}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Latência média</span>
                            <span className="font-mono">{fmtMs(stats.avgLatency)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Custo médio</span>
                            <span className="font-mono">{fmtUsd(stats.avgCost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Score médio</span>
                            <span className="font-mono">{stats.avgScore.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tokens totais</span>
                            <span className="font-mono">{stats.totalTokens.toLocaleString()}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>

                  <TabsContent value="configs" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Configuração A</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-xs font-mono bg-muted/40 p-3 rounded-lg overflow-x-auto max-h-64">
                          {JSON.stringify(selected.variant_a_config, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Configuração B</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-xs font-mono bg-muted/40 p-3 rounded-lg overflow-x-auto max-h-64">
                          {JSON.stringify(selected.variant_b_config, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="runs">
                    <Card>
                      <CardContent className="p-0">
                        {(runs?.length ?? 0) === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            Nenhuma execução registrada ainda.
                          </p>
                        ) : (
                          <div className="divide-y">
                            {runs?.slice(0, 100).map((r) => (
                              <div
                                key={r.id}
                                className="p-3 flex items-center gap-3 text-xs font-mono"
                              >
                                <Badge
                                  variant="outline"
                                  className={
                                    r.variant === "a"
                                      ? "border-nexus-cyan/40 text-nexus-cyan"
                                      : "border-nexus-purple/40 text-nexus-purple"
                                  }
                                >
                                  {r.variant.toUpperCase()}
                                </Badge>
                                <span className="text-muted-foreground w-40">
                                  {format(new Date(r.created_at), "dd/MM HH:mm:ss")}
                                </span>
                                <span>{fmtMs(r.latency_ms ?? 0)}</span>
                                <span>{fmtUsd(Number(r.cost_usd))}</span>
                                <span>score: {r.score != null ? Number(r.score).toFixed(2) : "—"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
