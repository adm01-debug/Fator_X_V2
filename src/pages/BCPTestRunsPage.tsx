import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId } from "@/hooks/use-data";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { ShieldCheck, Plus, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type TestType = "tabletop" | "walkthrough" | "simulation" | "full_failover";

type BCPRun = {
  id: string;
  system_id: string;
  test_type: TestType;
  executed_at: string;
  scenario: string;
  actual_rto_minutes: number | null;
  actual_rpo_minutes: number | null;
  success: boolean;
  gaps: string[];
  action_items: string | null;
  notes: string | null;
};

type System = { id: string; name: string; rto_minutes: number | null; rpo_minutes: number | null };

const TEST_LABELS: Record<TestType, string> = {
  tabletop: "Tabletop",
  walkthrough: "Walkthrough",
  simulation: "Simulação",
  full_failover: "Failover Completo",
};

export default function BCPTestRunsPage() {
  const { data: workspaceId } = useWorkspaceId();
  const [runs, setRuns] = useState<BCPRun[]>([]);
  const [systems, setSystems] = useState<System[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    system_id: "",
    test_type: "tabletop" as TestType,
    scenario: "",
    actual_rto_minutes: "",
    actual_rpo_minutes: "",
    success: true,
    gaps: "",
    action_items: "",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    const [{ data: sys }, { data: r }] = await Promise.all([
      supabase.from("business_systems").select("id,name,rto_minutes,rpo_minutes").eq("workspace_id", workspaceId),
      supabase
        .from("bcp_test_runs")
        .select("id,system_id,test_type,executed_at,scenario,actual_rto_minutes,actual_rpo_minutes,success,gaps,action_items,notes")
        .order("executed_at", { ascending: false })
        .limit(200),
    ]);
    setSystems((sys ?? []) as System[]);
    const sysIds = new Set((sys ?? []).map((s) => s.id));
    setRuns(((r ?? []) as BCPRun[]).filter((run) => sysIds.has(run.system_id)));
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!form.system_id) {
      toast.error("Selecione um sistema");
      return;
    }
    if (!form.scenario.trim()) {
      toast.error("Descreva o cenário");
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      toast.error("Sessão inválida");
      return;
    }
    const gaps = form.gaps
      .split("\n")
      .map((g) => g.trim())
      .filter(Boolean);
    const { error } = await supabase.from("bcp_test_runs").insert({
      system_id: form.system_id,
      test_type: form.test_type,
      executed_by: userData.user.id,
      scenario: form.scenario.trim(),
      actual_rto_minutes: form.actual_rto_minutes ? Number(form.actual_rto_minutes) : null,
      actual_rpo_minutes: form.actual_rpo_minutes ? Number(form.actual_rpo_minutes) : null,
      success: form.success,
      gaps,
      action_items: form.action_items.trim() || null,
      notes: form.notes.trim() || null,
    });
    if (error) {
      toast.error(`Falha ao registrar: ${error.message}`);
      return;
    }
    toast.success("Teste BCP registrado");
    setDialogOpen(false);
    setForm({
      system_id: "",
      test_type: "tabletop",
      scenario: "",
      actual_rto_minutes: "",
      actual_rpo_minutes: "",
      success: true,
      gaps: "",
      action_items: "",
      notes: "",
    });
    void load();
  };

  const sysMap = new Map(systems.map((s) => [s.id, s]));
  const stats = {
    total: runs.length,
    passed: runs.filter((r) => r.success).length,
    failed: runs.filter((r) => !r.success).length,
    gaps: runs.reduce((acc, r) => acc + r.gaps.length, 0),
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Testes de Continuidade (BCP)"
        description="Registro auditável de testes de plano de continuidade de negócio — tabletop, walkthrough, simulação e failover"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total de Testes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Aprovados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-primary">{stats.passed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Falharam</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-destructive">{stats.failed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Gaps Identificados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.gaps}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Registrar Teste
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Histórico de Execuções
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum teste registrado. Registre um tabletop para começar sua trilha BCP.
            </p>
          ) : (
            runs.map((run) => {
              const sys = sysMap.get(run.system_id);
              const rtoBreach =
                sys?.rto_minutes != null &&
                run.actual_rto_minutes != null &&
                run.actual_rto_minutes > sys.rto_minutes;
              const rpoBreach =
                sys?.rpo_minutes != null &&
                run.actual_rpo_minutes != null &&
                run.actual_rpo_minutes > sys.rpo_minutes;
              return (
                <div
                  key={run.id}
                  className="rounded-lg border border-border/60 p-4 space-y-2 hover:bg-muted/30 transition"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{sys?.name ?? "Sistema"}</p>
                    <Badge variant="outline">{TEST_LABELS[run.test_type]}</Badge>
                    {run.success ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Aprovado
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Falhou
                      </Badge>
                    )}
                    {rtoBreach && <Badge variant="destructive">RTO estourado</Badge>}
                    {rpoBreach && <Badge variant="destructive">RPO estourado</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{run.scenario}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Executado em: {format(new Date(run.executed_at), "PPp", { locale: ptBR })}</span>
                    {run.actual_rto_minutes != null && (
                      <span>
                        RTO real: {run.actual_rto_minutes}min
                        {sys?.rto_minutes != null && ` (meta ${sys.rto_minutes}min)`}
                      </span>
                    )}
                    {run.actual_rpo_minutes != null && (
                      <span>
                        RPO real: {run.actual_rpo_minutes}min
                        {sys?.rpo_minutes != null && ` (meta ${sys.rpo_minutes}min)`}
                      </span>
                    )}
                  </div>
                  {run.gaps.length > 0 && (
                    <div className="text-xs">
                      <span className="font-medium">Gaps: </span>
                      {run.gaps.join(" • ")}
                    </div>
                  )}
                  {run.action_items && (
                    <p className="text-xs">
                      <span className="font-medium">Ações: </span>
                      {run.action_items}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Teste BCP</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Sistema de Negócio</Label>
              <Select value={form.system_id} onValueChange={(v) => setForm({ ...form, system_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {systems.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Teste</Label>
              <Select
                value={form.test_type}
                onValueChange={(v) => setForm({ ...form, test_type: v as TestType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TEST_LABELS) as TestType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TEST_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cenário</Label>
              <Textarea
                value={form.scenario}
                onChange={(e) => setForm({ ...form, scenario: e.target.value })}
                rows={2}
                placeholder="Ex: Perda total da região us-east-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>RTO Real (min)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.actual_rto_minutes}
                  onChange={(e) => setForm({ ...form, actual_rto_minutes: e.target.value })}
                />
              </div>
              <div>
                <Label>RPO Real (min)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.actual_rpo_minutes}
                  onChange={(e) => setForm({ ...form, actual_rpo_minutes: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Sucesso</Label>
                <p className="text-xs text-muted-foreground">O teste atendeu aos critérios de aceite</p>
              </div>
              <Switch
                checked={form.success}
                onCheckedChange={(v) => setForm({ ...form, success: v })}
              />
            </div>
            <div>
              <Label>Gaps encontrados (um por linha)</Label>
              <Textarea
                value={form.gaps}
                onChange={(e) => setForm({ ...form, gaps: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <Label>Ações corretivas</Label>
              <Textarea
                value={form.action_items}
                onChange={(e) => setForm({ ...form, action_items: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
