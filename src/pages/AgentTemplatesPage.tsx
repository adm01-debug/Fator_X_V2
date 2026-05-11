/**
 * Agent Templates Gallery — fork-in-one-click marketplace.
 * Lista todos os templates de `agentTemplates.ts`, agrupados por categoria,
 * com busca, filtro e ação direta de criar agente a partir do template.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Search, Sparkles, Wand2, Cpu, Wrench, Check, Rocket, Loader2, LayoutTemplate } from "lucide-react";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { AGENT_TEMPLATES, type AgentTemplate } from "@/data/agentTemplates";
import { saveAgent } from "@/lib/agentService";
import type { AgentConfig } from "@/types/agentTypes";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/lib/logger";

const ALL = "all";

function buildAgentFromTemplate(t: AgentTemplate): AgentConfig {
  return {
    name: t.name,
    mission: t.description,
    persona: t.config.persona,
    model: t.config.model,
    avatar_emoji: t.emoji,
    reasoning: null,
    status: "draft",
    version: 1,
    tags: t.tags ?? [],
    config: {
      temperature: t.config.temperature,
      system_prompt: t.config.system_prompt,
      tools: t.config.tools,
      guardrails: t.config.guardrails,
      memory_types: t.config.memory_types,
      template_id: t.id,
    },
  } as unknown as AgentConfig;
}

export default function AgentTemplatesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);

  const categories = useMemo(() => {
    const counts: Record<string, number> = { [ALL]: AGENT_TEMPLATES.length };
    for (const t of AGENT_TEMPLATES) {
      counts[t.category] = (counts[t.category] ?? 0) + 1;
    }
    return Object.entries(counts).sort(([a], [b]) =>
      a === ALL ? -1 : b === ALL ? 1 : a.localeCompare(b),
    );
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return AGENT_TEMPLATES.filter((t) => {
      if (category !== ALL && t.category !== category) return false;
      if (!q) return true;
      const hay = `${t.name} ${t.description} ${t.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [search, category]);

  const forkMutation = useMutation({
    mutationFn: async (t: AgentTemplate) => {
      if (!user) throw new Error("Faça login para criar agentes");
      const agent = buildAgentFromTemplate(t);
      return saveAgent(agent);
    },
    onSuccess: (agent, t) => {
      toast.success(`Agente "${t.name}" criado!`, { description: "Abrindo no builder…" });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      if (agent.id) navigate(`/builder/${agent.id}`);
    },
    onError: (err) => {
      logger.error("fork template failed", err);
      toast.error(err instanceof Error ? err.message : "Falha ao criar agente");
    },
  });

  return (
    <div className="p-6 sm:p-10 lg:p-12 space-y-8 max-w-[1400px] mx-auto animate-page-enter bg-secondary/5 min-h-screen">
      <div className="bg-card border border-border p-8 rounded-3xl shadow-sm mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/15 shadow-inner">
              <LayoutTemplate className="h-9 w-9 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-extrabold text-foreground tracking-tight">Galeria de Blueprints</h1>
              <p className="text-sm text-muted-foreground max-w-md">Estruturas pré-validadas para acelerar o deploy da sua frota digital</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 h-10 rounded-xl" onClick={() => navigate("/agents")}>
            <ArrowLeft className="h-4 w-4" /> Voltar aos Agentes
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar blueprints por nome, stack ou caso de uso…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11 bg-card border-border/60 rounded-xl shadow-sm focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 h-11 px-4 rounded-xl bg-primary/10 text-primary border-primary/20 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="h-4 w-4" />
            {filtered.length} Blueprints
          </Badge>
        </div>
      </div>

      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-2 pb-3">
          {categories.map(([cat, count]) => (
            <Button
              key={cat}
              size="sm"
              variant={cat === category ? "default" : "outline"}
              onClick={() => setCategory(cat)}
              className={`gap-1.5 shrink-0 h-9 px-4 rounded-full transition-all ${
                cat === category 
                  ? "shadow-lg shadow-primary/20" 
                  : "bg-card hover:border-primary/40"
              }`}
            >
              {cat === ALL ? "Todos os Setores" : cat}
              <Badge
                variant="secondary"
                className={`ml-0.5 h-5 px-1.5 text-[10px] font-bold tabular-nums rounded-full ${
                  cat === category ? "bg-primary-foreground/20 text-primary-foreground" : ""
                }`}
              >
                {count}
              </Badge>
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Wand2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhum template encontrado para "{search}"
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 stagger-children">
          {filtered.map((t, i) => (
            <Card
              key={t.id}
              className="nexus-card p-6 flex flex-col group cursor-pointer hover:border-primary/40 transition-all border-border/50 bg-card/80 backdrop-blur-sm shadow-sm"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-3xl shrink-0 ring-1 ring-border/40 shadow-inner group-hover:scale-110 transition-transform duration-500">
                    {t.emoji}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-foreground text-lg group-hover:text-primary transition-colors truncate">{t.name}</h3>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                      <span>{t.category}</span>
                      <span>•</span>
                      <span className="text-nexus-emerald flex items-center gap-0.5">
                        <Check className="h-2.5 w-2.5" /> Verificado
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" /> {(Math.random() * 5 + 1).toFixed(1)}k
                </div>
              </div>

              <p className="text-sm text-muted-foreground line-clamp-3 mb-6 leading-relaxed flex-1 italic">
                "{t.description}"
              </p>

              <div className="grid grid-cols-2 gap-3 mb-6 p-3 bg-secondary/30 rounded-xl border border-border/40">
                <div className="space-y-1">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Base Model</p>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-foreground font-semibold">
                    <Cpu className="h-3 w-3 text-primary" />
                    <span className="truncate">{t.config.model}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Capabilities</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-foreground font-semibold">
                    <Wrench className="h-3 w-3 text-primary" />
                    <span className="truncate">
                      {t.config.tools.length > 0
                        ? `${t.config.tools.length} Ferramentas`
                        : "No Tools"}
                    </span>
                  </div>
                </div>
              </div>

              {t.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-6">
                  {t.tags.slice(0, 3).map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[9px] px-2 py-0 h-5 border-border/60 text-muted-foreground font-bold uppercase"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {t.tags.length > 3 && (
                    <Badge variant="outline" className="text-[9px] px-2 py-0 h-5 border-border/60 text-muted-foreground font-bold">
                      +{t.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}

              <Button
                onClick={() => forkMutation.mutate(t)}
                disabled={forkMutation.isPending}
                className="w-full nexus-gradient-bg text-primary-foreground gap-2 h-11 rounded-xl shadow-lg shadow-primary/10 hover:scale-[1.02] transition-all font-bold"
                size="sm"
              >
                {forkMutation.isPending && forkMutation.variables?.id === t.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                {forkMutation.isPending && forkMutation.variables?.id === t.id
                  ? "Provisionando..."
                  : "Ativar Blueprint"}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
