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
import { FileText, Plus, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Severity = "SEV1" | "SEV2" | "SEV3" | "SEV4";
type PMStatus = "draft" | "review" | "published";
type Source = "incident_run" | "game_day" | "dr_drill" | "manual";

type Postmortem = {
  id: string;
  title: string;
  incident_source: Source;
  severity: Severity;
  status: PMStatus;
  summary: string | null;
  root_cause: string | null;
  lessons_learned: string | null;
  published_at: string | null;
  created_at: string;
};

type ActionItem = {
  id: string;
  postmortem_id: string;
  description: string;
  owner_name: string | null;
  due_date: string | null;
  priority: "P0" | "P1" | "P2";
  status: "open" | "in_progress" | "done" | "cancelled";
};

const SEV_META: Record<Severity, { label: string; variant: "destructive" | "default" | "secondary" | "outline" }> = {
  SEV1: { label: "SEV1 — Crítico", variant: "destructive" },
  SEV2: { label: "SEV2 — Alto", variant: "destructive" },
  SEV3: { label: "SEV3 — Médio", variant: "default" },
  SEV4: { label: "SEV4 — Baixo", variant: "secondary" },
};

const STATUS_META: Record<PMStatus, { label: string; variant: "outline" | "default" | "secondary" }> = {
  draft: { label: "Rascunho", variant: "outline" },
  review: { label: "Em revisão", variant: "default" },
  published: { label: "Publicado", variant: "secondary" },
};

const SOURCE_LABEL: Record<Source, string> = {
  incident_run: "Incidente",
  game_day: "Game Day",
  dr_drill: "DR Drill",
  manual: "Manual",
};

export default function PostmortemsPage() {
  const { data: workspaceId } = useWorkspaceId();
  const [items, setItems] = useState<Postmortem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Postmortem | null>(null);
  const [form, setForm] = useState({
    title: "",
    incident_source: "manual" as Source,
    severity: "SEV3" as Severity,
    summary: "",
    root_cause: "",
    lessons_learned: "",
  });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    const { data: pm, error } = await supabase
      .from("postmortems")
      .select("id,title,incident_source,severity,status,summary,root_cause,lessons_learned,published_at,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar post-mortems");
    else {
      setItems((pm ?? []) as Postmortem[]);
      const ids = (pm ?? []).map((p) => p.id);
      if (ids.length > 0) {
        const { data: ai } = await supabase
          .from("postmortem_action_items")
          .select("id,postmortem_id,description,owner_name,due_date,priority,status")
          .in("postmortem_id", ids);
        setActions((ai ?? []) as ActionItem[]);
      } else {
        setActions([]);
      }
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!workspaceId) return;
    if (!form.title.trim()) {
      toast.error("Título obrigatório");
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { error } = await supabase.from("postmortems").insert({
      workspace_id: workspaceId,
      title: form.title.trim(),
      incident_source: form.incident_source,
      severity: form.severity,
      status: "draft",
      summary: form.summary.trim() || null,
      root_cause: form.root_cause.trim() || null,
      lessons_learned: form.lessons_learned.trim() || null,
      author_id: userData.user.id,
    });
    if (error) {
      toast.error(`Falha: ${error.message}`);
      return;
    }
    toast.success("Post-mortem criado");
    setDialogOpen(false);
    setForm({ title: "", incident_source: "manual", severity: "SEV3", summary: "", root_cause: "", lessons_learned: "" });
    void load();
  };

  const publish = async (id: string) => {
    const { error } = await supabase
      .from("postmortems")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(`Falha: ${error.message}`);
    else {
      toast.success("Publicado");
      void load();
    }
  };

  const actionsFor = (pmId: string) => actions.filter((a) => a.postmortem_id === pmId);

  const stats = {
    total: items.length,
    published: items.filter((i) => i.status === "published").length,
    open_actions: actions.filter((a) => a.status === "open" || a.status === "in_progress").length,
    sev1_sev2: items.filter((i) => i.severity === "SEV1" || i.severity === "SEV2").length,
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Post-Mortems"
        description="Documentação estruturada de incidentes com timeline, root cause e action items rastreáveis"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm text-muted-foreground">Publicados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-primary">{stats.published}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm text-muted-foreground">Ações Abertas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.open_actions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm text-muted-foreground">SEV1/SEV2</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-destructive">{stats.sev1_sev2}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Novo Post-Mortem
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Documentos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-body-sm text-muted-foreground">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="text-body-sm text-muted-foreground text-center py-8">
              Nenhum post-mortem ainda. Registre incidentes para melhoria contínua.
            </p>
          ) : (
            items.map((pm) => {
              const acts = actionsFor(pm.id);
              const openActs = acts.filter((a) => a.status === "open" || a.status === "in_progress").length;
              return (
                <div
                  key={pm.id}
                  className="rounded-lg border border-border/60 p-4 hover:bg-muted/30 transition cursor-pointer"
                  onClick={() => setSelected(pm)}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{pm.title}</p>
                        <Badge variant={SEV_META[pm.severity].variant}>{SEV_META[pm.severity].label}</Badge>
                        <Badge variant={STATUS_META[pm.status].variant}>{STATUS_META[pm.status].label}</Badge>
                        <Badge variant="outline">{SOURCE_LABEL[pm.incident_source]}</Badge>
                      </div>
                      {pm.summary && <p className="text-body-sm text-muted-foreground line-clamp-2">{pm.summary}</p>}
                      <div className="flex items-center gap-3 text-meta text-muted-foreground flex-wrap">
                        <span>Criado {format(new Date(pm.created_at), "PPp", { locale: ptBR })}</span>
                        {openActs > 0 && (
                          <span className="flex items-center gap-1 text-nexus-amber">
                            <AlertCircle className="h-3 w-3" /> {openActs} ação(ões) pendente(s)
                          </span>
                        )}
                        {acts.length > 0 && openActs === 0 && (
                          <span className="flex items-center gap-1 text-primary">
                            <CheckCircle2 className="h-3 w-3" /> Todas ações concluídas
                          </span>
                        )}
                      </div>
                    </div>
                    {pm.status !== "published" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          void publish(pm.id);
                        }}
                      >
                        Publicar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Post-Mortem</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Origem</Label>
                <Select value={form.incident_source} onValueChange={(v) => setForm({ ...form, incident_source: v as Source })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
                      <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Severidade</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as Severity })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SEV_META) as Severity[]).map((s) => (
                      <SelectItem key={s} value={s}>{SEV_META[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Resumo</Label>
              <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Root Cause</Label>
              <Textarea value={form.root_cause} onChange={(e) => setForm({ ...form, root_cause: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Lições aprendidas</Label>
              <Textarea value={form.lessons_learned} onChange={(e) => setForm({ ...form, lessons_learned: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-body-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={SEV_META[selected.severity].variant}>{SEV_META[selected.severity].label}</Badge>
                  <Badge variant={STATUS_META[selected.status].variant}>{STATUS_META[selected.status].label}</Badge>
                  <Badge variant="outline">{SOURCE_LABEL[selected.incident_source]}</Badge>
                </div>
                {selected.summary && (
                  <section>
                    <h4 className="font-medium mb-1">Resumo</h4>
                    <p className="text-muted-foreground whitespace-pre-wrap">{selected.summary}</p>
                  </section>
                )}
                {selected.root_cause && (
                  <section>
                    <h4 className="font-medium mb-1">Root Cause</h4>
                    <p className="text-muted-foreground whitespace-pre-wrap">{selected.root_cause}</p>
                  </section>
                )}
                {selected.lessons_learned && (
                  <section>
                    <h4 className="font-medium mb-1">Lições Aprendidas</h4>
                    <p className="text-muted-foreground whitespace-pre-wrap">{selected.lessons_learned}</p>
                  </section>
                )}
                <section>
                  <h4 className="font-medium mb-2 flex items-center gap-2"><Clock className="h-4 w-4" /> Action Items</h4>
                  {actionsFor(selected.id).length === 0 ? (
                    <p className="text-muted-foreground text-meta">Nenhuma ação registrada.</p>
                  ) : (
                    <ul className="space-y-2">
                      {actionsFor(selected.id).map((a) => (
                        <li key={a.id} className="rounded border p-2 flex justify-between gap-2">
                          <div>
                            <p>{a.description}</p>
                            <p className="text-meta text-muted-foreground">
                              {a.owner_name ?? "Sem responsável"}
                              {a.due_date && ` • Prazo ${format(new Date(a.due_date), "PP", { locale: ptBR })}`}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="outline">{a.priority}</Badge>
                            <Badge variant={a.status === "done" ? "secondary" : "default"}>{a.status}</Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
