import { useNavigate } from "react-router-dom";
import { FileText, Search, Filter, History, Zap, Target, ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useQuery } from "@tanstack/react-query";
import { listAgentsBasic, listAllPromptVersions } from "@/services/promptVersionService";
import { CreatePromptDialog } from "@/components/dialogs/CreatePromptDialog";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function PromptsPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: agents = [] } = useQuery({
    queryKey: ['agents_for_prompts'],
    queryFn: listAgentsBasic,
  });

  const { data: prompts = [], isLoading, refetch } = useQuery({
    queryKey: ['prompt_versions'],
    queryFn: listAllPromptVersions,
  });

  const agentMap = new Map(agents.map((a: any) => [a.id, a]));
  const grouped = new Map<string, typeof prompts[0]>();
  for (const p of prompts) {
    if (!grouped.has(p.agent_id) || p.version > (grouped.get(p.agent_id)!.version)) {
      grouped.set(p.agent_id, p);
    }
  }
  
  const filteredPrompts = Array.from(grouped.values()).filter(p => {
    const agent = agentMap.get(p.agent_id);
    const agentName = (agent as any)?.name?.toLowerCase() || "";
    const summary = (p.change_summary || "").toLowerCase();
    return agentName.includes(searchTerm.toLowerCase()) || summary.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1440px] mx-auto animate-page-enter">
      {/* Header Elevated 10/10 */}
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-xl shadow-primary/5 mb-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.04] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-7">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-2xl shadow-primary/10 group-hover:scale-105 transition-transform duration-500">
              <History className="h-11 w-11 text-primary animate-float" />
            </div>
            <div className="space-y-1">
              <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-5xl">Engine de Prompts</h1>
              <p className="text-base text-muted-foreground max-w-xl font-medium leading-relaxed">
                Repositório central de inteligência. Gerencie versões, realize testes A/B e otimize a precisão dos seus agentes.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CreatePromptDialog agents={agents} onCreated={() => refetch()} />
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
          <Input 
            placeholder="Buscar por agente ou sumário..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-12 rounded-2xl bg-card border-border/40 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-10 rounded-xl gap-2 border-border/40">
            <Filter className="h-4 w-4" /> Filtros
          </Button>
          <Badge variant="secondary" className="h-10 px-4 rounded-xl text-xs font-bold border-none bg-primary/10 text-primary">
            {filteredPrompts.length} Prompts Ativos
          </Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 rounded-[2rem] bg-card/50 border border-border/20 skeleton-shimmer" />
          ))}
        </div>
      ) : filteredPrompts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center bg-card/30 border border-dashed border-border/60 rounded-[3rem]">
          <div className="h-24 w-24 rounded-[2rem] bg-gradient-to-br from-primary/10 to-accent/5 flex items-center justify-center mb-6 border border-primary/10">
            <FileText className="h-12 w-12 text-primary/40" />
          </div>
          <h2 className="text-2xl font-heading font-black text-foreground mb-2">Engenharia de Prompts Vazia</h2>
          <p className="text-base text-muted-foreground mb-8 max-w-md">Comece a estruturar o conhecimento dos seus agentes criando o primeiro prompt versionado.</p>
          <CreatePromptDialog agents={agents} onCreated={() => refetch()} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPrompts.map((p) => {
            const agent = agentMap.get(p.agent_id);
            return (
              <div 
                key={p.id} 
                onClick={() => navigate(`/prompts/${p.agent_id}`)}
                className="nexus-card nexus-card-interactive group p-7 rounded-[2.5rem] flex flex-col justify-between min-h-[280px] bg-gradient-to-br from-card to-card/95 border-border/40 hover:border-primary/30 transition-all duration-500"
              >
                <div className="space-y-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/10 group-hover:scale-110 transition-transform duration-500">
                        <Zap className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                          {(agent as any)?.name || 'Agente Sem Nome'}
                        </h3>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                          v{p.version} • {new Date(p.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={p.is_active ? 'active' : 'draft'} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground/60 uppercase tracking-tighter">
                      <Target className="h-3.5 w-3.5" />
                      <span>Última Alteração</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed line-clamp-3 italic">
                      "{p.change_summary || 'Nenhum sumário fornecido para esta versão.'}"
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-border/20 mt-6">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] h-6 bg-primary/5 border-primary/20 text-primary font-bold">
                      PROMPT_ENGINE
                    </Badge>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-secondary/50 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
