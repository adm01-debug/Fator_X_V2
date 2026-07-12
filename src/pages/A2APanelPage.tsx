/**
 * A2A Panel — Registro global de agentes A2A, cartões de identidade
 * e visualizador de handoffs de workflow em um só lugar.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Network, Globe, GitBranch, Copy, Loader2, Bot } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { A2ARegistry } from "@/components/agents/A2ARegistry";
import { AgentCardViewer } from "@/components/agents/AgentCardViewer";
import { WorkflowHandoffVisualizer } from "@/components/workflows/WorkflowHandoffVisualizer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
}

export default function A2APanelPage() {
  const [tab, setTab] = useState("registry");

  const { data: agents = [], isLoading } = useQuery<AgentRow[]>({
    queryKey: ["agents_for_a2a"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, name, description, status")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AgentRow[];
    },
  });

  const wellKnownUrl = `${window.location.origin}/.well-known/agent-card.json`;

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Painel A2A"
        description="Descoberta de agentes via protocolo Agent-to-Agent, geração de Agent Cards oficiais e visualização de handoffs entre workflows."
      />

      <Card className="p-5 border-primary/30 bg-primary/5">
        <div className="flex flex-wrap items-center gap-3">
          <Globe className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-[200px]">
            <p className="text-body-sm font-bold text-foreground">Endpoint público de descoberta A2A</p>
            <code className="text-meta font-mono text-muted-foreground break-all">{wellKnownUrl}</code>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(wellKnownUrl);
              toast.success("URL copiada");
            }}
          >
            <Copy className="h-4 w-4 mr-2" /> Copiar
          </Button>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-2xl">
          <TabsTrigger value="registry" className="gap-2">
            <Globe className="h-4 w-4" /> Registro
          </TabsTrigger>
          <TabsTrigger value="cards" className="gap-2">
            <Bot className="h-4 w-4" /> Agent Cards
          </TabsTrigger>
          <TabsTrigger value="handoffs" className="gap-2">
            <GitBranch className="h-4 w-4" /> Handoffs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registry" className="mt-6">
          <A2ARegistry />
        </TabsContent>

        <TabsContent value="cards" className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : agents.length === 0 ? (
            <Card className="p-10 text-center">
              <Network className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-body font-bold text-foreground">Nenhum agente cadastrado</p>
              <p className="text-body-sm text-muted-foreground">Crie um agente para gerar seu Agent Card A2A.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <Card key={agent.id} className="hover:border-primary/40 transition-colors">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-bold text-foreground truncate">{agent.name}</p>
                        <p className="text-meta text-muted-foreground line-clamp-2">
                          {agent.description || "Sem descrição"}
                        </p>
                      </div>
                    </div>
                    <AgentCardViewer agentId={agent.id} agentName={agent.name} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="handoffs" className="mt-6">
          <WorkflowHandoffVisualizer />
        </TabsContent>
      </Tabs>
    </div>
  );
}
