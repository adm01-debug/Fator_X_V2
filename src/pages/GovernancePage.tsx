import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId } from "@/hooks/use-data";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Snowflake, Globe2, Plus, Trash2, ShieldAlert, Info } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type FreezeWindow = {
  id: string;
  workspace_id: string;
  name: string;
  reason: string | null;
  starts_at: string;
  ends_at: string;
  allow_emergency: boolean;
  created_at: string;
};

type GeoCountry = {
  id: string;
  workspace_id: string;
  country_code: string;
  country_name: string | null;
  created_at: string;
};

const COMMON_COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "BR", name: "Brasil" },
  { code: "US", name: "Estados Unidos" },
  { code: "PT", name: "Portugal" },
  { code: "GB", name: "Reino Unido" },
  { code: "DE", name: "Alemanha" },
  { code: "FR", name: "França" },
  { code: "ES", name: "Espanha" },
  { code: "MX", name: "México" },
  { code: "AR", name: "Argentina" },
  { code: "CA", name: "Canadá" },
  { code: "JP", name: "Japão" },
  { code: "AU", name: "Austrália" },
];

const isActive = (w: FreezeWindow) => {
  const now = Date.now();
  return new Date(w.starts_at).getTime() <= now && new Date(w.ends_at).getTime() >= now;
};

export default function GovernancePage() {
  const { data: workspaceId } = useWorkspaceId();
  const qc = useQueryClient();

  const freezeQuery = useQuery({
    queryKey: ["governance", "freeze", workspaceId],
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

  const geoQuery = useQuery({
    queryKey: ["governance", "geo", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("geo_allowed_countries")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("country_code");
      if (error) throw error;
      return (data ?? []) as GeoCountry[];
    },
  });

  const [freezeOpen, setFreezeOpen] = useState(false);
  const [fName, setFName] = useState("");
  const [fReason, setFReason] = useState("");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fEmergency, setFEmergency] = useState(true);

  const createFreeze = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Workspace ausente");
      if (!fName.trim() || !fStart || !fEnd) {
        throw new Error("Nome, início e fim são obrigatórios");
      }
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Usuário não autenticado");
      const { error } = await supabase.from("freeze_windows").insert({
        workspace_id: workspaceId,
        name: fName.trim(),
        reason: fReason.trim() || null,
        starts_at: new Date(fStart).toISOString(),
        ends_at: new Date(fEnd).toISOString(),
        allow_emergency: fEmergency,
        created_by: uid,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Janela de congelamento criada");
      setFreezeOpen(false);
      setFName("");
      setFReason("");
      setFStart("");
      setFEnd("");
      setFEmergency(true);
      qc.invalidateQueries({ queryKey: ["governance", "freeze"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteFreeze = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("freeze_windows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Janela removida");
      qc.invalidateQueries({ queryKey: ["governance", "freeze"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleCountry = useMutation({
    mutationFn: async (opts: { code: string; name: string; enabled: boolean }) => {
      if (!workspaceId) throw new Error("Workspace ausente");
      if (opts.enabled) {
        const { error } = await supabase.from("geo_allowed_countries").insert({
          workspace_id: workspaceId,
          country_code: opts.code,
          country_name: opts.name,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("geo_allowed_countries")
          .delete()
          .eq("workspace_id", workspaceId)
          .eq("country_code", opts.code);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["governance", "geo"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const [customCode, setCustomCode] = useState("");
  const [customName, setCustomName] = useState("");
  const addCustomCountry = useMutation({
    mutationFn: async () => {
      const code = customCode.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(code)) {
        throw new Error("Código ISO 3166-1 alpha-2 (2 letras)");
      }
      if (!workspaceId) throw new Error("Workspace ausente");
      const { error } = await supabase.from("geo_allowed_countries").insert({
        workspace_id: workspaceId,
        country_code: code,
        country_name: customName.trim() || code,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("País adicionado");
      setCustomCode("");
      setCustomName("");
      qc.invalidateQueries({ queryKey: ["governance", "geo"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const freezes = freezeQuery.data ?? [];
  const countries = geoQuery.data ?? [];
  const activeFreeze = freezes.find(isActive);
  const enabledCodes = new Set(countries.map((c) => c.country_code));

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Governança e Compliance"
        description="Congelamento de mudanças, restrições geográficas e políticas operacionais do workspace."
      />

      {activeFreeze && (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          <AlertTitle>Janela de congelamento ativa</AlertTitle>
          <AlertDescription>
            <b>{activeFreeze.name}</b> — encerra em{" "}
            {format(new Date(activeFreeze.ends_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}.{" "}
            {activeFreeze.allow_emergency
              ? "Deploys emergenciais permitidos com aprovação."
              : "Deploys totalmente bloqueados."}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="freeze" className="w-full">
        <TabsList>
          <TabsTrigger value="freeze">
            <Snowflake className="h-4 w-4 mr-2" />
            Janelas de Congelamento
          </TabsTrigger>
          <TabsTrigger value="geo">
            <Globe2 className="h-4 w-4 mr-2" />
            Restrições Geográficas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="freeze" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={freezeOpen} onOpenChange={setFreezeOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova janela
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova janela de congelamento</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="fname">Nome</Label>
                    <Input
                      id="fname"
                      value={fName}
                      onChange={(e) => setFName(e.target.value)}
                      placeholder="Black Friday freeze"
                    />
                  </div>
                  <div>
                    <Label htmlFor="freason">Motivo</Label>
                    <Textarea
                      id="freason"
                      value={fReason}
                      onChange={(e) => setFReason(e.target.value)}
                      placeholder="Alta demanda comercial; bloquear alterações não-críticas."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="fstart">Início</Label>
                      <Input
                        id="fstart"
                        type="datetime-local"
                        value={fStart}
                        onChange={(e) => setFStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="fend">Fim</Label>
                      <Input
                        id="fend"
                        type="datetime-local"
                        value={fEnd}
                        onChange={(e) => setFEnd(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="font-medium text-sm">Permitir emergências</div>
                      <div className="text-xs text-muted-foreground">
                        Deploys críticos podem passar com aprovação dupla.
                      </div>
                    </div>
                    <Switch checked={fEmergency} onCheckedChange={setFEmergency} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFreezeOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => createFreeze.mutate()}
                    disabled={createFreeze.isPending}
                  >
                    Criar janela
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {freezeQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : freezes.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Nenhuma janela configurada</AlertTitle>
              <AlertDescription>
                Crie janelas para bloquear deploys durante períodos críticos (releases, feriados, campanhas).
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {freezes.map((w) => (
                <Card key={w.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{w.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        {isActive(w) && (
                          <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/40">
                            Ativa
                          </Badge>
                        )}
                        {w.allow_emergency && (
                          <Badge variant="outline">Emergência OK</Badge>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteFreeze.mutate(w.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    {w.reason && <p className="text-muted-foreground">{w.reason}</p>}
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(w.starts_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} →{" "}
                      {format(new Date(w.ends_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="geo" className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Whitelist geográfica</AlertTitle>
            <AlertDescription>
              Se nenhum país estiver selecionado, todas as origens são permitidas.
              Ao adicionar países, apenas requisições vindas deles serão aceitas.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Países comuns</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {COMMON_COUNTRIES.map((c) => {
                const enabled = enabledCodes.has(c.code);
                return (
                  <button
                    key={c.code}
                    onClick={() =>
                      toggleCountry.mutate({ code: c.code, name: c.name, enabled: !enabled })
                    }
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      enabled
                        ? "bg-primary/10 border-primary/40"
                        : "bg-card hover:bg-accent/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{c.code}</span>
                      {enabled && <Badge variant="secondary">Ativo</Badge>}
                    </div>
                    <div className="text-sm mt-1">{c.name}</div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Adicionar país personalizado</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 items-end">
              <div>
                <Label htmlFor="ccode">Código (ISO)</Label>
                <Input
                  id="ccode"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  maxLength={2}
                  className="w-24 font-mono uppercase"
                  placeholder="BR"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="cname">Nome</Label>
                <Input
                  id="cname"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Brasil"
                />
              </div>
              <Button
                onClick={() => addCustomCountry.mutate()}
                disabled={addCustomCountry.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar
              </Button>
            </CardContent>
          </Card>

          {countries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Países permitidos ({countries.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {countries.map((c) => (
                  <Badge
                    key={c.id}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() =>
                      toggleCountry.mutate({
                        code: c.country_code,
                        name: c.country_name ?? c.country_code,
                        enabled: false,
                      })
                    }
                  >
                    {c.country_code} — {c.country_name ?? "—"}
                    <Trash2 className="h-3 w-3 ml-2" />
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
