import { useEffect, useState, useCallback } from "react";
import { useWorkspaceId } from "@/hooks/use-data";
import {
  listGameDays,
  createGameDay,
  startGameDay,
  completeGameDay,
} from "@/services/gameDayService";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Swords, Plus, Play, CheckCircle2, XCircle, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type GameDay = {
  id: string;
  title: string;
  description: string | null;
  scenario: string;
  status: string;
  scheduled_at: string;
  started_at: string | null;
  ended_at: string | null;
  runbook_section: string | null;
};

const SCENARIOS = [
  { value: "provider_outage", label: "Falha de Provedor LLM" },
  { value: "cost_spike", label: "Pico de Custos" },
  { value: "db_slowdown", label: "Lentidão no Banco" },
  { value: "auth_failure", label: "Falha de Autenticação" },
  { value: "custom", label: "Customizado" },
] as const;

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  scheduled: { label: "Agendado", variant: "outline" },
  running: { label: "Em Andamento", variant: "default" },
  completed: { label: "Concluído", variant: "secondary" },
  aborted: { label: "Abortado", variant: "destructive" },
};

export default function GameDaysPage() {
  const { data: workspaceId } = useWorkspaceId();
  const [gameDays, setGameDays] = useState<GameDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    scenario: "provider_outage",
    scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    runbook_section: "",
  });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    const data = await listGameDays(workspaceId);
    setGameDays(data);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!workspaceId) return;
    if (!form.title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    try {
      await createGameDay({
        workspace_id: workspaceId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        scenario: form.scenario as import("@/services/gameDayService").GameDayScenario,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        runbook_section: form.runbook_section.trim() || undefined,
      });
    } catch (err: unknown) {
      toast.error(`Falha ao criar: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    toast.success("Game Day agendado");
    setDialogOpen(false);
    setForm({
      title: "",
      description: "",
      scenario: "provider_outage",
      scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      runbook_section: "",
    });
    void load();
  };

  const transition = async (id: string, next: "running" | "completed" | "aborted") => {
    try {
      if (next === "running") {
        await startGameDay(id, false);
      } else if (next === "completed") {
        await completeGameDay({
          game_day_id: id,
          runbook_followed: false,
          gaps_found: [],
          score: 0,
          retrospective: "",
        });
      } else {
        // aborted — no dedicated service method, use direct patch
        const { error } = await import("@/integrations/supabase/client").then(
          (m) => m.supabase.from("game_days").update({ status: "aborted", ended_at: new Date().toISOString() }).eq("id", id),
        );
        if (error) throw new Error(error.message);
      }
    } catch (err: unknown) {
      toast.error(`Falha: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    toast.success("Status atualizado");
    void load();
  };

  const stats = {
    scheduled: gameDays.filter((g) => g.status === "scheduled").length,
    running: gameDays.filter((g) => g.status === "running").length,
    completed: gameDays.filter((g) => g.status === "completed").length,
    aborted: gameDays.filter((g) => g.status === "aborted").length,
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Game Days"
        description="Simulações coordenadas de desastres para validar runbooks e resposta a incidentes"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm text-muted-foreground">Agendados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.scheduled}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm text-muted-foreground">Em Andamento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-primary">{stats.running}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm text-muted-foreground">Concluídos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm text-muted-foreground">Abortados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-destructive">{stats.aborted}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Game Day
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5" />
            Simulações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-body-sm text-muted-foreground">Carregando…</p>
          ) : gameDays.length === 0 ? (
            <p className="text-body-sm text-muted-foreground text-center py-8">
              Nenhum Game Day agendado. Crie um para validar seu runbook.
            </p>
          ) : (
            gameDays.map((gd) => {
              const meta = STATUS_META[gd.status] ?? STATUS_META.scheduled;
              const scenarioLabel = SCENARIOS.find((s) => s.value === gd.scenario)?.label ?? gd.scenario;
              return (
                <div
                  key={gd.id}
                  className="rounded-lg border border-border/60 p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between hover:bg-muted/30 transition"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{gd.title}</p>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <Badge variant="outline">{scenarioLabel}</Badge>
                    </div>
                    {gd.description && (
                      <p className="text-body-sm text-muted-foreground">{gd.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-meta text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(gd.scheduled_at), "PPp", { locale: ptBR })}
                      </span>
                      {gd.runbook_section && <span>Runbook: {gd.runbook_section}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {gd.status === "scheduled" && (
                      <Button size="sm" onClick={() => transition(gd.id, "running")}>
                        <Play className="h-4 w-4 mr-1" />
                        Iniciar
                      </Button>
                    )}
                    {gd.status === "running" && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => transition(gd.id, "completed")}>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Concluir
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => transition(gd.id, "aborted")}>
                          <XCircle className="h-4 w-4 mr-1" />
                          Abortar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Game Day</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Simulação Black Friday - Falha OpenAI"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
            <div>
              <Label>Cenário</Label>
              <Select value={form.scenario} onValueChange={(v) => setForm({ ...form, scenario: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCENARIOS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Agendado para</Label>
              <Input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
              />
            </div>
            <div>
              <Label>Seção do Runbook (opcional)</Label>
              <Input
                value={form.runbook_section}
                onChange={(e) => setForm({ ...form, runbook_section: e.target.value })}
                placeholder="Ex: DR-001 Fallback de Provedor"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate}>Agendar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
