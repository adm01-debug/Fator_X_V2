/**
 * IP Whitelist — restrição de acesso administrativo por endereço IP.
 * Suporta IPs individuais e blocos CIDR (ex.: 192.168.0.0/24).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Globe, Plus, Trash2, ShieldCheck, ShieldOff, Info } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId } from "@/hooks/use-data";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type IPEntry = {
  id: string;
  workspace_id: string;
  ip_address: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const IPV4_REGEX =
  /^((25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(25[0-5]|2[0-4]\d|[01]?\d?\d)(\/([0-9]|[12]\d|3[0-2]))?$/;
const IPV6_REGEX = /^([0-9a-fA-F:]+)(\/\d{1,3})?$/;

function isValidIp(input: string): boolean {
  const v = input.trim();
  if (!v) return false;
  if (IPV4_REGEX.test(v)) return true;
  // Very loose IPv6 fallback — Postgres CIDR type will do the final validation.
  return v.includes(":") && IPV6_REGEX.test(v);
}

export default function IPWhitelistPage() {
  const { data: workspaceId } = useWorkspaceId();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ip, setIp] = useState("");
  const [label, setLabel] = useState("");

  const { data: entries, isLoading } = useQuery({
    queryKey: ["ip_whitelist", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ip_whitelist")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IPEntry[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Workspace não carregado");
      const trimmed = ip.trim();
      if (!isValidIp(trimmed)) throw new Error("IP ou CIDR inválido");
      const { error } = await supabase.from("ip_whitelist").insert({
        workspace_id: workspaceId,
        ip_address: trimmed,
        label: label.trim() || null,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("IP adicionado à whitelist");
      qc.invalidateQueries({ queryKey: ["ip_whitelist"] });
      setDialogOpen(false);
      setIp("");
      setLabel("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("ip_whitelist")
        .update({ is_active: active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ip_whitelist"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ip_whitelist").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entrada removida");
      qc.invalidateQueries({ queryKey: ["ip_whitelist"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    const total = entries?.length ?? 0;
    const active = entries?.filter((e) => e.is_active).length ?? 0;
    const cidrs = entries?.filter((e) => e.ip_address.includes("/")).length ?? 0;
    return { total, active, cidrs };
  }, [entries]);

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="IP Whitelist"
        description="Restrinja o acesso administrativo do workspace a endereços IP e blocos CIDR confiáveis."
      />

      {stats.total === 0 && !isLoading && (
        <Alert>
          <Info className="size-4" />
          <AlertTitle>Whitelist desativada</AlertTitle>
          <AlertDescription>
            Nenhum IP cadastrado — o acesso está aberto a qualquer origem. Adicione pelo menos um IP
            confiável para ativar a proteção.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Entradas totais</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{stats.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ativas</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-nexus-emerald">
            {stats.active}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Blocos CIDR</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{stats.cidrs}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="size-5 text-primary" />
            <CardTitle>Endereços permitidos</CardTitle>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4 mr-2" /> Adicionar IP
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo endereço na whitelist</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="ip">Endereço IP ou CIDR</Label>
                  <Input
                    id="ip"
                    placeholder="Ex.: 200.150.10.5 ou 10.0.0.0/24"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Rótulo (opcional)</Label>
                  <Input
                    id="label"
                    placeholder="Ex.: Escritório SP, VPN corporativa"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? "Adicionando..." : "Adicionar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <Skeleton className="h-24 w-full" />}
          {!isLoading && entries?.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum IP cadastrado ainda.
            </p>
          )}
          {entries?.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border bg-card/40 hover:bg-card/60 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm font-mono font-semibold">{entry.ip_address}</code>
                  {entry.ip_address.includes("/") && (
                    <Badge variant="outline" className="text-xs">
                      CIDR
                    </Badge>
                  )}
                  {entry.is_active ? (
                    <Badge className="bg-nexus-emerald/15 text-nexus-emerald border-nexus-emerald/30">
                      <ShieldCheck className="size-3 mr-1" /> Ativo
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <ShieldOff className="size-3 mr-1" /> Inativo
                    </Badge>
                  )}
                </div>
                {entry.label && (
                  <p className="text-sm text-muted-foreground mt-1">{entry.label}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Adicionado em{" "}
                  {format(new Date(entry.created_at), "dd 'de' MMM yyyy, HH:mm", { locale: ptBR })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={entry.is_active}
                  onCheckedChange={(v) => toggle.mutate({ id: entry.id, active: v })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (window.confirm(`Remover ${entry.ip_address} da whitelist?`)) {
                      remove.mutate(entry.id);
                    }
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
