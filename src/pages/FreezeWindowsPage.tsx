/**
 * Janelas de Congelamento (Freeze Windows) — governança de deploys.
 * Impede mudanças no workspace durante períodos críticos (Black Friday, fechamento fiscal, etc.),
 * exceto quando marcadas como permissivas a operações emergenciais.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, isAfter, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Snowflake,
  Plus,
  Trash2,
  CalendarClock,
  ShieldAlert,
  ShieldCheck,
  Info,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId } from "@/hooks/use-data";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type FreezeWindow = {
  id: string;
  workspace_id: string;
  name: string;
  reason: string | null;
  starts_at: string;
  ends_at: string;
  allow_emergency: boolean;
  created_by: string;
  created_at: string;
};

type Status = "active" | "scheduled" | "expired";

function statusOf(w: FreezeWindow, now: Date): Status {
  const start = new Date(w.starts_at);
  const end = new Date(w.ends_at);
  if (isBefore(now, start)) return "scheduled";
  if (isAfter(now, end)) return "expired";
  return "active";
}

function toLocalInput(iso: string): string {
  // yyyy-MM-ddTHH:mm in local time for <input type="datetime-local">
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function FreezeWindowsPage() {
  const { data: workspaceId } = useWorkspaceId();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [allowEmergency, setAllowEmergency] = useState(true);

  const { data: windows, isLoading } = useQuery({
    queryKey: ["freeze_windows", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("freeze_windows")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FreezeWindow[];
    },
  });

  const now = new Date();

  const stats = useMemo(() => {
    const list = windows ?? [];
    const active = list.filter((w) => statusOf(w, now) === "active").length;
    const scheduled = list.filter((w) => statusOf(w, now) === "scheduled").length;
    const expired = list.filter((w) => statusOf(w, now) === "expired").length;
    return { total: list.length, active, scheduled, expired };
  }, [windows, now]);

  const resetForm = () => {
    setName("");
    setReason("");
    setStartsAt("");
    setEndsAt("");
    setAllowEmergency(true);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Workspace não carregado");
      if (!name.trim()) throw new Error("Nome é obrigatório");
      if (!startsAt || !endsAt) throw new Error("Defina início e fim");
      const startIso = new Date(startsAt).toISOString();
      const endIso = new Date(endsAt).toISOString();
      if (new Date(endIso) <= new Date(startIso)) {
        throw new Error("O fim precisa ser posterior ao início");
      }
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão inválida");
      const { error } = await supabase.from("freeze_windows").insert({
        workspace_id: workspaceId,
        name: name.trim(),
        reason: reason.trim() || null,
        starts_at: startIso,
        ends_at: endIso,
        allow_emergency: allowEmergency,
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Janela de congelamento criada");
      qc.invalidateQueries({ queryKey: ["freeze_windows"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleEmergency = useMutation({
    mutationFn: async ({ id, allow }: { id: string; allow: boolean }) => {
      const { error } = await supabase
        .from("freeze_windows")
        .update({ allow_emergency: allow })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["freeze_windows"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("freeze_windows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Janela removida");
      qc.invalidateQueries({ queryKey: ["freeze_windows"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nowLocal = toLocalInput(new Date().toISOString());

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Janelas de Congelamento"
        description="Bloqueie mudanças no workspace durante períodos críticos. Deploys e automações respeitam as janelas ativas."
      />

      {stats.active > 0 && (
        <Alert className="border-nexus-amber/40 bg-nexus-amber/10">
          <ShieldAlert className="size-4 text-nexus-amber" />
          <AlertTitle>Congelamento em vigor</AlertTitle>
          <AlertDescription>
            {stats.active} janela{stats.active > 1 ? "s" : ""} ativa
            {stats.active > 1 ? "s" : ""} agora — mudanças em produção serão rejeitadas até o
            término.
          </AlertDescription>
        </Alert>
      )}

      {stats.total === 0 && !isLoading && (
        <Alert>
          <Info className="size-4" />
          <AlertTitle>Nenhuma janela configurada</AlertTitle>
          <AlertDescription>
            Cadastre períodos críticos (ex.: Black Friday, fechamento fiscal, feriados) para
            impedir mudanças arriscadas.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{stats.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ativas</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-nexus-amber">{stats.active}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Agendadas</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-primary">{stats.scheduled}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Expiradas</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-muted-foreground">
            {stats.expired}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Snowflake className="size-5 text-primary" />
            <CardTitle>Janelas cadastradas</CardTitle>
          </div>
          <Dialog
            open={dialogOpen}
            onOpenChange={(v) => {
              setDialogOpen(v);
              if (!v) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4 mr-2" /> Nova janela
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova janela de congelamento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    placeholder="Ex.: Black Friday 2026"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="starts">Início</Label>
                    <Input
                      id="starts"
                      type="datetime-local"
                      min={nowLocal}
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ends">Fim</Label>
                    <Input
                      id="ends"
                      type="datetime-local"
                      min={startsAt || nowLocal}
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Justificativa (opcional)</Label>
                  <Textarea
                    id="reason"
                    placeholder="Motivo do congelamento e escopo esperado."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 bg-card/40">
                  <div>
                    <p className="text-sm font-medium">Permitir mudanças emergenciais</p>
                    <p className="text-xs text-muted-foreground">
                      Se ativo, hotfixes com aprovação de admin ainda podem passar.
                    </p>
                  </div>
                  <Switch checked={allowEmergency} onCheckedChange={setAllowEmergency} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? "Criando..." : "Criar janela"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <Skeleton className="h-24 w-full" />}
          {!isLoading && (windows?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma janela cadastrada ainda.
            </p>
          )}
          {windows?.map((w) => {
            const status = statusOf(w, now);
            return (
              <div
                key={w.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border bg-card/40 hover:bg-card/60 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{w.name}</span>
                    {status === "active" && (
                      <Badge className="bg-nexus-amber/15 text-nexus-amber border-nexus-amber/30">
                        <ShieldAlert className="size-3 mr-1" /> Congelamento ativo
                      </Badge>
                    )}
                    {status === "scheduled" && (
                      <Badge variant="outline">
                        <CalendarClock className="size-3 mr-1" /> Agendada
                      </Badge>
                    )}
                    {status === "expired" && <Badge variant="secondary">Expirada</Badge>}
                    {w.allow_emergency ? (
                      <Badge variant="outline" className="text-xs">
                        <ShieldCheck className="size-3 mr-1" /> Emergência permitida
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-destructive">
                        <ShieldAlert className="size-3 mr-1" /> Bloqueio total
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(w.starts_at), "dd 'de' MMM yyyy, HH:mm", { locale: ptBR })}
                    {" → "}
                    {format(new Date(w.ends_at), "dd 'de' MMM yyyy, HH:mm", { locale: ptBR })}
                  </p>
                  {w.reason && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{w.reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Emergência</span>
                    <Switch
                      checked={w.allow_emergency}
                      onCheckedChange={(v) =>
                        toggleEmergency.mutate({ id: w.id, allow: v })
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (window.confirm(`Remover janela "${w.name}"?`)) {
                        remove.mutate(w.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
