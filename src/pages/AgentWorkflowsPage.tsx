import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId } from "@/hooks/use-data";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Workflow, Plus, Play, Trash2, Activity, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type WorkflowRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  agent_id: string | null;
  nodes: unknown;
  edges: unknown;
  created_at: string;
  updated_at: string;
};

type WorkflowRun = {
  id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-nexus-success/20 text-nexus-success border-nexus-success/40",
  paused: "bg-nexus-warning/20 text-nexus-warning border-nexus-warning/40",
  archived: "bg-muted text-muted-foreground",
};

const RUN_STATUS_ICON: Record<string, JSX.Element> = {
  running: <Clock className="h-4 w-4 text-nexus-info animate-pulse" />,
  completed: <CheckCircle2 className="h-4 w-4 text-nexus-success" />,
  failed: <XCircle className="h-4 w-4 text-nexus-danger" />,
};

export default function AgentWorkflowsPage() {
  const { data: workspaceId } = useWorkspaceId();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    agent_id: "",
    status: "draft",
  });

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    const [wfRes, agentsRes] = await Promise.all([
      supabase
        .from("agent_workflows")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("agents")
        .select("id, name")
        .eq("workspace_id", workspaceId)
        .order("name"),
    ]);

    if (wfRes.error) {
      toast.error("Erro ao carregar workflows: " + wfRes.error.message);
    } else {
      setWorkflows((wfRes.data ?? []) as WorkflowRow[]);
    }
    if (!agentsRes.error) {
      setAgents((agentsRes.data ?? []) as Array<{ id: string; name: string }>);
    }

    const ids = (wfRes.data ?? []).map((w) => w.id);
    if (ids.length > 0) {
      const runsRes = await supabase
        .from("agent_workflow_runs")
        .select("id, workflow_id, status, started_at, completed_at, error_message")
        .in("workflow_id", ids)
        .order("started_at", { ascending: false })
        .limit(200);
      if (!runsRes.error) setRuns((runsRes.data ?? []) as WorkflowRun[]);
    } else {
      setRuns([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dependências intencionalmente estáveis / efeito de montagem
  }, [workspaceId]);

  const stats = useMemo(() => {
    const total = workflows.length;
    const active = workflows.filter((w) => w.status === "active").length;
    const totalRuns = runs.length;
    const failed = runs.filter((r) => r.status === "failed").length;
    return { total, active, totalRuns, failed };
  }, [workflows, runs]);

  const runsByWorkflow = useMemo(() => {
    const map = new Map<string, WorkflowRun[]>();
    runs.forEach((r) => {
      const arr = map.get(r.workflow_id) ?? [];
      arr.push(r);
      map.set(r.workflow_id, arr);
    });
    return map;
  }, [runs]);

  const create = async () => {
    if (!workspaceId || !form.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { error } = await supabase.from("agent_workflows").insert({
      workspace_id: workspaceId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      agent_id: form.agent_id || null,
      status: form.status,
      created_by: userData.user.id,
      nodes: [],
      edges: [],
    });
    if (error) {
      toast.error("Erro ao criar workflow: " + error.message);
      return;
    }
    toast.success("Workflow criado");
    setDialogOpen(false);
    setForm({ name: "", description: "", agent_id: "", status: "draft" });
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir workflow e todos os seus runs?")) return;
    const { error } = await supabase.from("agent_workflows").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Workflow excluído");
    void load();
  };

  const toggleStatus = async (wf: WorkflowRow) => {
    const next = wf.status === "active" ? "paused" : "active";
    const { error } = await supabase
      .from("agent_workflows")
      .update({ status: next })
      .eq("id", wf.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Workflow ${next === "active" ? "ativado" : "pausado"}`);
    void load();
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Workflows de Agentes"
        description="Orquestração multi-step com histórico de execuções e observabilidade."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Workflow
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm text-muted-foreground">Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-nexus-success">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm text-muted-foreground">Execuções</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalRuns}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm text-muted-foreground">Falhas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-nexus-danger">{stats.failed}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5" />
            Workflows
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-body-sm text-muted-foreground">Carregando…</p>
          ) : workflows.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">
              Nenhum workflow criado. Clique em "Novo Workflow" para começar.
            </p>
          ) : (
            <div className="space-y-3">
              {workflows.map((wf) => {
                const wfRuns = runsByWorkflow.get(wf.id) ?? [];
                const lastRun = wfRuns[0];
                const successRate =
                  wfRuns.length > 0
                    ? Math.round(
                        (wfRuns.filter((r) => r.status === "completed").length /
                          wfRuns.length) *
                          100,
                      )
                    : null;
                return (
                  <div
                    key={wf.id}
                    className="p-4 border border-border rounded-lg hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold">{wf.name}</h3>
                          <Badge className={STATUS_COLOR[wf.status] ?? "bg-muted"}>
                            {wf.status}
                          </Badge>
                          {successRate !== null && (
                            <Badge variant="outline">{successRate}% sucesso</Badge>
                          )}
                        </div>
                        {wf.description && (
                          <p className="text-body-sm text-muted-foreground mb-2">
                            {wf.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-meta text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Activity className="h-3 w-3" />
                            {wfRuns.length} execuções
                          </span>
                          {lastRun && (
                            <span className="flex items-center gap-1">
                              {RUN_STATUS_ICON[lastRun.status] ?? null}
                              Última:{" "}
                              {formatDistanceToNow(new Date(lastRun.started_at), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleStatus(wf)}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          {wf.status === "active" ? "Pausar" : "Ativar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove(wf.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Workflow</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Onboarding de Cliente"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <Label>Agente (opcional)</Label>
              <Select
                value={form.agent_id}
                onValueChange={(v) => setForm({ ...form, agent_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um agente" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status inicial</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={create}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
