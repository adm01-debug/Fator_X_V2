import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { useWorkspaceId } from "@/hooks/use-data";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, DollarSign, Plus, Trash2, TrendingUp, Wallet } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Budget {
  id: string;
  workspace_id: string;
  name: string;
  limit_usd: number;
  current_usd: number;
  period: string;
  alert_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface BudgetEvent {
  id: string;
  event_type: string;
  period: string;
  period_spend_usd: number;
  period_limit_usd: number;
  pct_used: number;
  triggered_at: string;
  metadata: Record<string, unknown> | null;
}

interface WorkspaceBudget {
  id: string;
  workspace_id: string;
  monthly_limit_usd: number;
  daily_limit_usd: number;
  hard_stop: boolean;
  soft_threshold_pct: number;
  notify_emails: string[] | null;
}

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n ?? 0);

export default function BudgetsPage() {
  const qc = useQueryClient();
  const { data: workspaceId } = useWorkspaceId();
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("100");
  const [period, setPeriod] = useState("monthly");
  const [threshold, setThreshold] = useState("80");

  const budgetsQ = useQuery({
    queryKey: ["budgets", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabaseExternal
        .from("budgets")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Budget[];
    },
  });

  const wsBudgetQ = useQuery({
    queryKey: ["workspace_budgets", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabaseExternal
        .from("workspace_budgets")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data as WorkspaceBudget | null;
    },
  });

  const eventsQ = useQuery({
    queryKey: ["budget_events", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabaseExternal
        .from("budget_events")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("triggered_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as BudgetEvent[];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Workspace não encontrado");
      const limitNum = Number(limit);
      const thresholdNum = Number(threshold) / 100;
      if (!name.trim() || !Number.isFinite(limitNum) || limitNum <= 0) {
        throw new Error("Nome e limite (>0) são obrigatórios");
      }
      const { error } = await supabaseExternal.from("budgets").insert({
        workspace_id: workspaceId,
        name: name.trim(),
        limit_usd: limitNum,
        period,
        alert_threshold: thresholdNum,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orçamento criado");
      setName("");
      setLimit("100");
      qc.invalidateQueries({ queryKey: ["budgets", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabaseExternal.from("budgets").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets", workspaceId] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseExternal.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orçamento removido");
      qc.invalidateQueries({ queryKey: ["budgets", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertWsMut = useMutation({
    mutationFn: async (payload: Partial<WorkspaceBudget>) => {
      if (!workspaceId) throw new Error("Workspace não encontrado");
      const { data: userRes } = await supabaseExternal.auth.getUser();
      const created_by = userRes.user?.id ?? null;
      const row: Record<string, unknown> = { workspace_id: workspaceId, ...payload };
      if (created_by) row.created_by = created_by;
      const { error } = await supabaseExternal
        .from("workspace_budgets")
        .upsert(row as never, { onConflict: "workspace_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Limite global atualizado");
      qc.invalidateQueries({ queryKey: ["workspace_budgets", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const budgets = budgetsQ.data ?? [];
  const totalLimit = budgets.reduce((s, b) => s + Number(b.limit_usd || 0), 0);
  const totalCurrent = budgets.reduce((s, b) => s + Number(b.current_usd || 0), 0);
  const overThreshold = budgets.filter(
    (b) => b.limit_usd > 0 && b.current_usd / b.limit_usd >= b.alert_threshold,
  );

  const ws = wsBudgetQ.data;

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Orçamentos e Custos"
        description="Controle limites de gastos por workspace e por escopo, com alertas automáticos"
      />

      {overThreshold.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{overThreshold.length} orçamento(s) acima do threshold</AlertTitle>
          <AlertDescription>
            {overThreshold.map((b) => b.name).join(", ")} — considere ajustar limites ou pausar consumo.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-meta">
            <DollarSign className="h-4 w-4" /> Limite total
          </div>
          <div className="text-h2 font-heading mt-1">{fmtUsd(totalLimit)}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-meta">
            <TrendingUp className="h-4 w-4" /> Consumo atual
          </div>
          <div className="text-h2 font-heading mt-1">{fmtUsd(totalCurrent)}</div>
          <Progress
            className="mt-2"
            value={totalLimit > 0 ? Math.min(100, (totalCurrent / totalLimit) * 100) : 0}
          />
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-meta">
            <AlertTriangle className="h-4 w-4" /> Orçamentos ativos
          </div>
          <div className="text-h2 font-heading mt-1">
            {budgets.filter((b) => b.is_active).length}/{budgets.length}
          </div>
        </Card>
      </div>

      <Tabs defaultValue="budgets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="budgets">Orçamentos</TabsTrigger>
          <TabsTrigger value="workspace">Limite Global</TabsTrigger>
          <TabsTrigger value="events">Eventos ({eventsQ.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="budgets" className="space-y-4">
          <Card className="p-5">
            <h3 className="font-heading text-body-sm font-semibold mb-3">Novo orçamento</h3>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="md:col-span-2">
                <Label htmlFor="b-name">Nome</Label>
                <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Marketing Q1" />
              </div>
              <div>
                <Label htmlFor="b-limit">Limite (USD)</Label>
                <Input id="b-limit" type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="b-period">Período</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger id="b-period"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diário</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="quarterly">Trimestral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="b-th">Alerta (%)</Label>
                <Input id="b-th" type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="gap-2">
                <Plus className="h-4 w-4" /> Criar orçamento
              </Button>
            </div>
          </Card>

          <div className="space-y-2">
            {budgetsQ.isLoading && <p className="text-muted-foreground text-meta">Carregando…</p>}
            {budgets.length === 0 && !budgetsQ.isLoading && (
              <Card className="p-8 text-center text-muted-foreground">Nenhum orçamento criado ainda.</Card>
            )}
            {budgets.map((b) => {
              const pct = b.limit_usd > 0 ? (b.current_usd / b.limit_usd) * 100 : 0;
              const isOver = pct >= b.alert_threshold * 100;
              return (
                <Card key={b.id} className="p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-heading font-semibold">{b.name}</h4>
                        <Badge variant="outline">{b.period}</Badge>
                        {isOver && <Badge variant="destructive">Acima do threshold</Badge>}
                        {!b.is_active && <Badge variant="secondary">Inativo</Badge>}
                      </div>
                      <p className="text-meta text-muted-foreground mt-1">
                        {fmtUsd(b.current_usd)} de {fmtUsd(b.limit_usd)} · alerta em {(b.alert_threshold * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={b.is_active}
                        onCheckedChange={(v) => toggleMut.mutate({ id: b.id, is_active: v })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Remover orçamento "${b.name}"?`)) deleteMut.mutate(b.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <Progress className="mt-3" value={Math.min(100, pct)} />
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="workspace">
          <Card className="p-5 space-y-4">
            <div>
              <h3 className="font-heading text-body-sm font-semibold">Limite global do workspace</h3>
              <p className="text-meta text-muted-foreground">
                Aplicado como guarda de último recurso a todo o consumo do workspace.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Limite mensal (USD)</Label>
                <Input
                  type="number"
                  min={0}
                  defaultValue={ws?.monthly_limit_usd ?? 0}
                  onBlur={(e) => upsertWsMut.mutate({ monthly_limit_usd: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Limite diário (USD)</Label>
                <Input
                  type="number"
                  min={0}
                  defaultValue={ws?.daily_limit_usd ?? 0}
                  onBlur={(e) => upsertWsMut.mutate({ daily_limit_usd: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Threshold de alerta (%)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={ws?.soft_threshold_pct ?? 80}
                  onBlur={(e) => upsertWsMut.mutate({ soft_threshold_pct: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={ws?.hard_stop ?? false}
                    onCheckedChange={(v) => upsertWsMut.mutate({ hard_stop: v })}
                  />
                  <Label className="mb-0">Hard-stop ao ultrapassar</Label>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card className="p-0 overflow-hidden">
            <div className="divide-y divide-border">
              {(eventsQ.data ?? []).length === 0 && (
                <div className="p-8 text-center text-muted-foreground">Nenhum evento registrado.</div>
              )}
              {(eventsQ.data ?? []).map((e) => (
                <div key={e.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant={
                          e.event_type.includes("exceed") || e.event_type.includes("hard")
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {e.event_type}
                      </Badge>
                      <span className="text-meta text-muted-foreground">{e.period}</span>
                    </div>
                    <p className="text-meta text-muted-foreground mt-1">
                      {fmtUsd(Number(e.period_spend_usd))} de {fmtUsd(Number(e.period_limit_usd))} ({Number(e.pct_used).toFixed(1)}%)
                    </p>
                  </div>
                  <span className="text-meta text-muted-foreground">
                    {formatDistanceToNow(new Date(e.triggered_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
