/**
 * Skills Instaladas por Agente — gerenciamento visual de skills instaladas do marketplace.
 * Permite instalar, atualizar overrides e desinstalar skills por agente.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Puzzle,
  Plus,
  Trash2,
  Package,
  Search,
  Bot,
  Star,
  CheckCircle2,
  Settings2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";

type Agent = { id: string; name: string; avatar_emoji: string | null };

type Skill = {
  id: string;
  name: string;
  slug: string;
  description: string;
  version: string;
  category: string;
  tags: string[];
  install_count: number;
  rating: number;
  is_verified: boolean;
};

type Installed = {
  id: string;
  agent_id: string;
  skill_id: string;
  installed_at: string;
  config_overrides: Record<string, unknown> | null;
  version: number;
  skill: Skill;
};

export default function AgentInstalledSkillsPage() {
  const qc = useQueryClient();
  const [agentId, setAgentId] = useState<string>("");
  const [browseOpen, setBrowseOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configTarget, setConfigTarget] = useState<Installed | null>(null);
  const [configJson, setConfigJson] = useState("{}");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ["agents", "for-skills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, name, avatar_emoji")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Agent[];
    },
  });

  const { data: installed, isLoading: installedLoading } = useQuery({
    queryKey: ["agent_installed_skills", agentId],
    enabled: !!agentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_installed_skills")
        .select("*, skill:skill_registry(*)")
        .eq("agent_id", agentId)
        .order("installed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Installed[];
    },
  });

  const { data: catalog } = useQuery({
    queryKey: ["skill_registry_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("skill_registry")
        .select("*")
        .eq("is_public", true)
        .order("install_count", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Skill[];
    },
  });

  const installedIds = useMemo(
    () => new Set((installed ?? []).map((i) => i.skill_id)),
    [installed],
  );

  const filteredCatalog = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (catalog ?? []).filter((s) => {
      if (category !== "all" && s.category !== category) return false;
      if (!term) return true;
      return (
        s.name.toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term) ||
        s.tags.some((t) => t.toLowerCase().includes(term))
      );
    });
  }, [catalog, search, category]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    (catalog ?? []).forEach((s) => set.add(s.category));
    return Array.from(set).sort();
  }, [catalog]);

  const install = useMutation({
    mutationFn: async (skillId: string) => {
      if (!agentId) throw new Error("Selecione um agente");
      const { error } = await supabase.from("agent_installed_skills").insert({
        agent_id: agentId,
        skill_id: skillId,
        config_overrides: {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Skill instalada");
      qc.invalidateQueries({ queryKey: ["agent_installed_skills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uninstall = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("agent_installed_skills")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Skill removida");
      qc.invalidateQueries({ queryKey: ["agent_installed_skills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveConfig = useMutation({
    mutationFn: async () => {
      if (!configTarget) throw new Error("Nenhuma skill selecionada");
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(configJson);
      } catch {
        throw new Error("JSON inválido");
      }
      const { error } = await supabase
        .from("agent_installed_skills")
        .update({ config_overrides: parsed })
        .eq("id", configTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      setConfigOpen(false);
      setConfigTarget(null);
      qc.invalidateQueries({ queryKey: ["agent_installed_skills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openConfig = (row: Installed) => {
    setConfigTarget(row);
    setConfigJson(JSON.stringify(row.config_overrides ?? {}, null, 2));
    setConfigOpen(true);
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Skills dos Agentes"
        description="Instale, configure e remova skills do marketplace para cada agente do workspace."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            Selecione o agente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agentsLoading ? (
            <Skeleton className="h-10 w-full max-w-md" />
          ) : (agents?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum agente disponível — crie um agente primeiro.
            </p>
          ) : (
            <Select value={agentId} onValueChange={setAgentId}>
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
          )}
        </CardContent>
      </Card>

      {agentId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Puzzle className="size-5 text-primary" />
              <CardTitle>Skills instaladas ({installed?.length ?? 0})</CardTitle>
            </div>
            <Button size="sm" onClick={() => setBrowseOpen(true)}>
              <Plus className="size-4 mr-2" /> Instalar skill
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {installedLoading && <Skeleton className="h-24 w-full" />}
            {!installedLoading && (installed?.length ?? 0) === 0 && (
              <Alert>
                <Package className="size-4" />
                <AlertTitle>Nenhuma skill instalada</AlertTitle>
                <AlertDescription>
                  Explore o marketplace e instale skills para expandir as capacidades deste
                  agente.
                </AlertDescription>
              </Alert>
            )}
            {installed?.map((row) => (
              <div
                key={row.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border bg-card/40 hover:bg-card/60 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{row.skill?.name ?? "—"}</span>
                    <Badge variant="outline" className="text-xs">
                      v{row.skill?.version}
                    </Badge>
                    {row.skill?.is_verified && (
                      <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-xs">
                        <CheckCircle2 className="size-3 mr-1" /> Verificada
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {row.skill?.category}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {row.skill?.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Instalada em{" "}
                    {format(new Date(row.installed_at), "dd 'de' MMM yyyy, HH:mm", {
                      locale: ptBR,
                    })}{" "}
                    · revisão {row.version}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => openConfig(row)}>
                    <Settings2 className="size-4 mr-2" /> Config
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (window.confirm(`Remover skill "${row.skill?.name}"?`)) {
                        uninstall.mutate(row.id);
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
      )}

      {/* Browse marketplace dialog */}
      <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Marketplace de Skills</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row gap-2 py-2">
            <div className="relative flex-1">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar skills..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-y-auto space-y-2 flex-1">
            {filteredCatalog.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhuma skill encontrada.
              </p>
            ) : (
              filteredCatalog.map((s) => {
                const isInstalled = installedIds.has(s.id);
                return (
                  <div
                    key={s.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card/40"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{s.name}</span>
                        <Badge variant="outline" className="text-xs">
                          v{s.version}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {s.category}
                        </Badge>
                        {s.is_verified && (
                          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-xs">
                            <CheckCircle2 className="size-3 mr-1" /> Verificada
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {s.description}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Star className="size-3" /> {Number(s.rating).toFixed(1)}
                        </span>
                        <span>{s.install_count} instalações</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isInstalled ? "outline" : "default"}
                      disabled={isInstalled || install.isPending}
                      onClick={() => install.mutate(s.id)}
                    >
                      {isInstalled ? "Instalada" : "Instalar"}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Config overrides dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Configuração — {configTarget?.skill?.name ?? ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="config">Overrides (JSON)</Label>
            <Textarea
              id="config"
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Sobrepõe a configuração padrão da skill apenas para este agente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}>
              {saveConfig.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
