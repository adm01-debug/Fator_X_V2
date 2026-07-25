import { useQuery } from "@tanstack/react-query";
import { listAgentCards } from "@/services/agentCardService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Network, Shield, Globe, Cpu } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function A2ARegistry() {
  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['a2a-registry'],
    queryFn: listAgentCards,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <Card key={i} className="nexus-card">
            <CardHeader>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Registro Global A2A
          </h2>
          <p className="text-body-sm text-muted-foreground">Agentes disponíveis para descoberta via protocolo A2A v1.0</p>
        </div>
        <Badge variant="outline" className="px-3 py-1 font-mono uppercase tracking-widest text-meta bg-primary/5">
          {cards.length} Agentes Ativos
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {cards.map((card) => (
          <Card key={card.humanReadableId} className="nexus-card group hover:border-primary/40 transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:scale-110 transition-transform">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <div className="flex gap-2">
                  {card.capabilities.streaming && <Badge variant="secondary" className="text-meta bg-nexus-emerald/10 text-nexus-emerald">SSE</Badge>}
                  {card.capabilities.mcpVersion && <Badge variant="secondary" className="text-meta bg-nexus-purple/10 text-nexus-purple">MCP {card.capabilities.mcpVersion}</Badge>}
                </div>
              </div>
              <div className="mt-4">
                <CardTitle className="text-title-sm group-hover:text-primary transition-colors">{card.name}</CardTitle>
                <CardDescription className="line-clamp-2 mt-1">{card.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-meta font-bold uppercase tracking-widest text-muted-foreground">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {card.skills.slice(0, 4).map(skill => (
                    <Badge key={skill.id} variant="outline" className="text-meta border-border/60">
                      {skill.name}
                    </Badge>
                  ))}
                  {card.skills.length > 4 && (
                    <Badge variant="outline" className="text-meta border-border/60">
                      +{card.skills.length - 4}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-border/40 grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center gap-1">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-meta text-muted-foreground">v{card.agentVersion}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-meta text-muted-foreground">{card.authentication.schemes[0].scheme}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Network className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-meta text-muted-foreground">JSON-Cards</span>
                </div>
              </div>

              <div className="pt-2">
                <p className="text-[9px] font-mono text-muted-foreground truncate opacity-50">
                  {card.url}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
