import { useNavigate } from "react-router-dom";
import { FileText, Search, Filter, History, Zap, Target, ArrowRight, CheckCircle, Beaker, Sparkles, Activity, Plus } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useQuery } from "@tanstack/react-query";
import { listAgentsBasic, listAllPromptVersions } from "@/services/promptVersionService";
import { CreatePromptDialog } from "@/components/dialogs/CreatePromptDialog";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const grouped = new Map<string, typeof prompts[0]>();
  for (const p of prompts) {
    if (!grouped.has(p.agent_id) || p.version > (grouped.get(p.agent_id)!.version)) {
      grouped.set(p.agent_id, p);
    }
  }
  
  const filteredPrompts = Array.from(grouped.values()).filter(p => {
    const agent = agentMap.get(p.agent_id);
    const agentName = (agent as { name?: string } | null)?.name?.toLowerCase() || "";
    const summary = (p.change_summary || "").toLowerCase();
    return agentName.includes(searchTerm.toLowerCase()) || summary.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-10 max-w-[1440px] mx-auto animate-page-enter">
      {/* Header Elevated 10/10 */}
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-nexus-2xl shadow-primary/5 mb-10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.04] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/[0.06] transition-colors duration-500 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-7">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-nexus-2xl shadow-primary/10 group-hover:scale-105 transition-transform duration-500">
              <History className="h-11 w-11 text-primary animate-float" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-5xl">Engine de Prompts</h1>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-nexus-cyan/10 text-nexus-cyan text-meta font-bold uppercase tracking-widest border border-nexus-cyan/20">
                  <Zap className="h-3 w-3 animate-pulse" /> Neural Versioning
                </div>
              </div>
              <p className="text-title-sm text-muted-foreground max-w-xl font-medium leading-relaxed">
                Repositório central de inteligência. Gerencie versões, realize testes A/B determinísticos e otimize a precisão dos seus agentes em escala industrial.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end gap-1 mr-4">
              <div className="flex items-center gap-2 text-nexus-emerald font-black text-body-sm uppercase tracking-tighter">
                <CheckCircle className="h-4 w-4" /> Versioning Nominal
              </div>
              <p className="text-meta text-muted-foreground font-bold tracking-widest uppercase">Safe-Rollback Enabled</p>
            </div>
            <div className="h-10 w-px bg-border/40 mx-2" />
            <div className="flex items-center gap-3">
              <Button variant="outline" size="lg" className="h-14 px-6 rounded-2xl border-border/40 font-bold gap-2" onClick={() => navigate('/prompts/experiments')}>
                <Beaker className="h-5 w-5 text-primary" /> A/B Testing
              </Button>
              <CreatePromptDialog agents={agents} onCreated={() => refetch()} />
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="library" className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <TabsList className="bg-secondary/20 p-1 rounded-2xl h-14 w-full md:w-auto border border-border/40">
            <TabsTrigger value="library" className="rounded-xl px-6 font-bold h-full data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-nexus-lg gap-2">
              <FileText className="h-4 w-4" /> Prompt Library
            </TabsTrigger>
            <TabsTrigger value="testing" className="rounded-xl px-6 font-bold h-full data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-nexus-lg gap-2">
              <Target className="h-4 w-4" /> Unit Testing
            </TabsTrigger>
            <TabsTrigger value="optimization" className="rounded-xl px-6 font-bold h-full data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-nexus-lg gap-2">
              <Sparkles className="h-4 w-4" /> Prompt Optimizer
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                placeholder="Pesquisar inteligência..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 h-14 rounded-2xl bg-card border-border/40 focus:ring-primary/20 text-title-sm"
              />
            </div>
            <Button variant="outline" size="lg" className="h-14 px-6 rounded-2xl border-border/40 font-bold gap-2">
              <Filter className="h-5 w-5" /> Filtros
            </Button>
          </div>
        </div>

        <TabsContent value="library" className="m-0 focus-visible:ring-0">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-[320px] rounded-[2.5rem] bg-card/50 border border-border/20 skeleton-shimmer" />
              ))}
            </div>
          ) : filteredPrompts.length === 0 ? (
            <div className="nexus-card flex flex-col items-center justify-center py-32 text-center bg-card/30 border border-dashed border-border/60 rounded-[3rem]">
              <div className="h-24 w-24 rounded-[2.5rem] bg-gradient-to-br from-primary/10 to-accent/5 flex items-center justify-center mb-6 border border-primary/10">
                <FileText className="h-12 w-12 text-primary/40" />
              </div>
              <h2 className="text-2xl font-heading font-black text-foreground mb-2">Engenharia de Prompts Vazia</h2>
              <p className="text-title-sm text-muted-foreground mb-8 max-w-md">Comece a estruturar o conhecimento dos seus agentes criando o primeiro prompt versionado.</p>
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
                    className="nexus-card group cursor-pointer p-8 rounded-[2.5rem] flex flex-col justify-between min-h-[320px] bg-gradient-to-br from-card to-card/95 border-border/40 hover:border-primary/40 hover:shadow-nexus-2xl hover:shadow-primary/5 transition-all duration-500 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.02] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:bg-primary/[0.05] transition-colors" />
                    
                    <div className="space-y-6 relative">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                            <Zap className="h-7 w-7 text-primary" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                              {(agent as { name?: string } | null)?.name || 'Agente Sem Nome'}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-meta h-5 px-1.5 bg-primary/5 border-primary/20 text-primary font-mono">v{p.version}</Badge>
                              <span className="text-meta text-muted-foreground font-black uppercase tracking-widest">
                                {new Date(p.created_at).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <StatusBadge status={p.is_active ? 'active' : 'draft'} />
                      </div>

                      <div className="space-y-3 p-5 rounded-2xl bg-secondary/20 border border-border/10 group-hover:border-primary/20 transition-colors">
                        <div className="flex items-center gap-2 text-meta font-black text-muted-foreground uppercase tracking-widest">
                          <Target className="h-3.5 w-3.5" />
                          <span>Last Neural Commit</span>
                        </div>
                        <p className="text-body-sm text-foreground/80 leading-relaxed line-clamp-3 italic font-medium">
                          "{p.change_summary || 'Nenhum sumário fornecido para esta versão.'}"
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-border/20 mt-6 relative">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="h-7 w-7 rounded-lg border-2 border-card bg-secondary/50 flex items-center justify-center text-meta font-black">
                              {i}
                            </div>
                          ))}
                        </div>
                        <span className="text-meta font-bold text-muted-foreground uppercase tracking-tighter ml-1">+12 testes</span>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-secondary/50 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110 group-hover:rotate-12 transition-all duration-500 shadow-nexus-lg">
                        <ArrowRight className="h-6 w-6" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="testing" className="m-0 focus-visible:ring-0">
          <div className="nexus-card flex flex-col items-center justify-center py-32 text-center bg-card/30 border-dashed">
            <Beaker className="h-16 w-16 text-primary/30 mb-6 animate-pulse" />
            <h2 className="text-xl font-black text-foreground mb-2">Sandbox de Testes Unitários</h2>
            <p className="text-body-sm text-muted-foreground max-w-sm mb-8">Valide seus prompts contra cenários críticos e meça a regressão de inteligência em tempo real.</p>
            <Button size="lg" className="rounded-2xl gap-2"><Plus className="h-5 w-5" /> Criar Suite de Teste</Button>
          </div>
        </TabsContent>

        <TabsContent value="optimization" className="m-0 focus-visible:ring-0">
          <div className="nexus-card flex flex-col items-center justify-center py-32 text-center bg-card/30 border-dashed">
            <Sparkles className="h-16 w-16 text-nexus-cyan/30 mb-6 animate-float" />
            <h2 className="text-xl font-black text-foreground mb-2">Neural Prompt Optimizer</h2>
            <p className="text-body-sm text-muted-foreground max-w-sm mb-8">Utilize IA para analisar e reescrever seus prompts, otimizando tokens e clareza semântica.</p>
            <Button variant="outline" size="lg" className="rounded-2xl gap-2 border-nexus-cyan/20 text-nexus-cyan hover:bg-nexus-cyan/5"><Activity className="h-5 w-5" /> Analisar Biblioteca</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

