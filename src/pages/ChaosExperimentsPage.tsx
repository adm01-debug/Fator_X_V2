import { useEffect, useMemo, useState } from "react";
import { useWorkspaceId } from "@/hooks/use-data";
import {
  listChaosExperiments,
  createChaosExperiment,
  disableChaosExperiment,
} from "@/services/chaosService";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Zap, Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type ChaosExp = {
  id: string;
  name: string;
  target: string;
  fault_type: string;
  probability: number;
  latency_ms: number | null;
  enabled: boolean;
  created_at: string;
  expires_at: string;
};

const TARGETS = ["llm-gateway", "agent-workflow-runner"] as const;
const FAULTS = ["latency", "error_500", "error_429", "timeout"] as const;

const FAULT_LABEL: Record<string, string> = {
  latency: "Latência artificial",
  error_500: "Erro HTTP 500",
  error_429: "Rate limit 429",
  timeout: "Timeout",
};

export default function ChaosExperimentsPage() {
  const { data: workspaceId } = useWorkspaceId();
  const [experiments, setExperiments] = useState<ChaosExp[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    target: "llm-gateway",
    fault_type: "latency",
    probability: 0.05,
    latency_ms: 500,
    duration_min: 30,
  });

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    const data = await listChaosExperiments(workspaceId);
    setExperiments(data);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dependências intencionalmente estáveis / efeito de montagem
  }, [workspaceId]);

  const stats = useMemo(() => {
    const now = Date.now();
    const active = experiments.filter(
      (e) => e.enabled && new Date(e.expires_at).getTime() > now,
    ).length;
    return { total: experiments.length, active };
  }, [experiments]);

  const create = async () => {
    if (!workspaceId || !form.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (form.duration_min < 1 || form.duration_min > 60) {
      toast.error("Duração deve estar entre 1 e 60 minutos");
      return;
    }
    try {
      await createChaosExperiment({
        workspace_id: workspaceId,
        name: form.name.trim(),
        target: form.target as import("@/services/chaosService").ChaosTarget,
        fault_type: form.fault_type as import("@/services/chaosService").ChaosFaultType,
        probability: form.probability,
        latency_ms: form.fault_type === "latency" ? form.latency_ms : undefined,
        duration_seconds: form.duration_min * 60,
      });
    } catch (err: unknown) {
      toast.error("Erro: " + (err instanceof Error ? err.message : String(err)));
      return;
    }
    toast.success("Experimento criado — auto-expira em " + form.duration_min + "min");
    setDialogOpen(false);
    setForm({ ...form, name: "" });
    void load();
  };

  const toggle = async (exp: ChaosExp) => {
    if (exp.enabled) {
      await disableChaosExperiment(exp.id);
    } else {
      const { error } = await import("@/integrations/supabase/client").then(
        (m) => m.supabase.from("chaos_experiments").update({ enabled: true }).eq("id", exp.id),
      );
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir experimento?")) return;
    const { error } = await supabase.from("chaos_experiments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Excluído");
    void load();
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Engenharia de Caos"
        description="Injeção controlada de falhas para validar resiliência. Auto-expira em até 60min."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Experimento
          </Button>
        }
      />

      <div className="rounded-lg border border-nexus-warning/40 bg-nexus-warning/10 p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-nexus-warning flex-shrink-0 mt-0.5" />
        <div className="text-body-sm">
          <p className="font-semibold text-nexus-warning">Atenção</p>
          <p className="text-muted-foreground">
            Experimentos injetam falhas reais em rotas de produção. Comece com
            probabilidade baixa (≤5%) e monitore alertas ativamente.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <CardTitle className="text-body-sm text-muted-foreground">Ativos agora</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-nexus-warning">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm text-muted-foreground">Alvos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{TARGETS.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Experimentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-body-sm text-muted-foreground">Carregando…</p>
          ) : experiments.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">
              Nenhum experimento. Clique em "Novo Experimento".
            </p>
          ) : (
            <div className="space-y-3">
              {experiments.map((exp) => {
                const expired = new Date(exp.expires_at).getTime() < Date.now();
                return (
                  <div
                    key={exp.id}
                    className="p-4 border border-border rounded-lg flex items-start justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold">{exp.name}</h3>
                        <Badge variant="outline">{exp.target}</Badge>
                        <Badge>{FAULT_LABEL[exp.fault_type] ?? exp.fault_type}</Badge>
                        <Badge variant="secondary">
                          {(exp.probability * 100).toFixed(1)}%
                        </Badge>
                        {expired ? (
                          <Badge className="bg-muted">expirado</Badge>
                        ) : exp.enabled ? (
                          <Badge className="bg-nexus-warning/20 text-nexus-warning border-nexus-warning/40">
                            ativo
                          </Badge>
                        ) : (
                          <Badge variant="outline">desativado</Badge>
                        )}
                      </div>
                      <div className="text-meta text-muted-foreground flex gap-4 flex-wrap">
                        {exp.latency_ms !== null && (
                          <span>Latência: {exp.latency_ms}ms</span>
                        )}
                        <span>
                          Expira{" "}
                          {formatDistanceToNow(new Date(exp.expires_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!expired && (
                        <Switch
                          checked={exp.enabled}
                          onCheckedChange={() => toggle(exp)}
                        />
                      )}
                      <Button size="sm" variant="ghost" onClick={() => remove(exp.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
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
            <DialogTitle>Novo Experimento de Caos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Teste de resiliência LLM"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Alvo</Label>
                <Select
                  value={form.target}
                  onValueChange={(v) => setForm({ ...form, target: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGETS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de falha</Label>
                <Select
                  value={form.fault_type}
                  onValueChange={(v) => setForm({ ...form, fault_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FAULTS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FAULT_LABEL[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Probabilidade (0–0.5)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="0.5"
                  value={form.probability}
                  onChange={(e) =>
                    setForm({ ...form, probability: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label>Duração (min, máx 60)</Label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={form.duration_min}
                  onChange={(e) =>
                    setForm({ ...form, duration_min: parseInt(e.target.value) || 30 })
                  }
                />
              </div>
            </div>
            {form.fault_type === "latency" && (
              <div>
                <Label>Latência injetada (ms)</Label>
                <Input
                  type="number"
                  min="0"
                  max="10000"
                  value={form.latency_ms}
                  onChange={(e) =>
                    setForm({ ...form, latency_ms: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            )}
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
