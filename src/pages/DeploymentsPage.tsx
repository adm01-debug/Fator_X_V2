import { useState } from "react";
import { logger } from "@/lib/logger";
import { CardGridSkeleton } from "@/components/shared/PageSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Rocket, Copy, CheckCircle, Globe, Zap, Shield, Share2, Terminal, Code2, Layers, Cpu } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listDeployedAgents } from "@/services/deploymentsService";
import { getSystemHealth } from "@/services/healthService";
import { getDashboardMetrics } from "@/services/monitoringService";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { A2APanel } from '@/components/integrations/A2APanel';
import { WebWidgetPanel } from '@/components/deployments/WebWidgetPanel';
import { WhatsAppSendDialog } from '@/components/deployments/WhatsAppSendDialog';
import { WhatsAppInboxPanel } from '@/components/deployments/WhatsAppInboxPanel';
import { cn } from "@/lib/utils";
import { ApprovalQueuePanel } from "@/components/deployments/ApprovalQueuePanel";
import { DeploymentWizard } from "@/components/deployments/DeploymentWizard";

export default function DeploymentsPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<{id: string, name: string} | null>(null);

  const { data: deployments = [], isLoading } = useQuery({
    queryKey: ['deployments'],
    queryFn: listDeployedAgents,
  });

  const { data: health } = useQuery({
    queryKey: ['system-health'],
    queryFn: getSystemHealth,
    refetchInterval: 15000,
  });

  const { data: metrics } = useQuery({
    queryKey: ['live-metrics'],
    queryFn: getDashboardMetrics,
    refetchInterval: 30000,
  });

  const handleDeployClick = (agent: unknown) => {
    setSelectedAgent({ id: agent.id, name: agent.name });
    setWizardOpen(true);
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-10 max-w-[1440px] mx-auto animate-page-enter">
      {/* Header Elevated 10/10 */}
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-xl shadow-primary/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.04] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/[0.06] transition-colors duration-500 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-7">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-2xl shadow-primary/10 group-hover:scale-105 transition-transform duration-500">
              <Rocket className="h-11 w-11 text-primary animate-float" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-5xl">Implantações</h1>
                <Badge className="bg-nexus-emerald/10 text-nexus-emerald border-none font-black px-3 py-1 rounded-full text-meta tracking-widest uppercase">Live Operations</Badge>
              </div>
              <p className="text-title-sm text-muted-foreground max-w-xl font-medium leading-relaxed">
                Orquestre a distribuição global dos seus agentes. Gerencie canais, WebWidgets e endpoints de API em tempo real.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <WhatsAppSendDialog />
            <EndpointGeneratorButton />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <WebWidgetPanel agentId={deployments[0]?.id} agentName={deployments[0]?.name} />
          <WhatsAppInboxPanel />
          <ApprovalQueuePanel />
          
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Cpu className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-xl font-heading font-black text-foreground">Frota Ativa</h3>
              </div>
              <Badge variant="outline" className="h-8 px-4 rounded-xl text-meta font-bold border-border/40 bg-card/50">{deployments.length} Ativos</Badge>
            </div>

            {isLoading ? (
              <CardGridSkeleton count={6} cols={2} />
            ) : deployments.length === 0 ? (
              <EmptyState
                icon={Rocket}
                title="Centro de Operações Vazio"
                description="Seus agentes aparecerão aqui assim que forem promovidos para Staging ou Produção no Builder."
                illustration="agents"
              />
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {deployments.map((dep: unknown) => (
                  <div key={dep.id} className="nexus-card nexus-card-interactive group p-6 rounded-[2.5rem] bg-card/50 backdrop-blur-sm border-border/40 hover:border-primary/30 transition-all duration-500">
                    <div className="flex items-start justify-between mb-5">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center text-2xl shadow-sm border border-primary/10 group-hover:scale-105 transition-transform duration-300">
                          {dep.emoji || '🤖'}
                        </div>
                        <div>
                          <h3 className="text-title-sm font-bold text-foreground group-hover:text-primary transition-colors">{dep.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-meta font-black text-muted-foreground uppercase tracking-widest">{dep.environment}</span>
                            <div className="h-1 w-1 rounded-full bg-border" />
                            <span className="text-meta font-mono text-primary font-bold">v{dep.version}</span>
                          </div>
                        </div>
                      </div>
                      <StatusBadge status={dep.status || 'draft'} />
                    </div>

                    <div className="space-y-4">
                      {dep.channels.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {dep.channels.map((c: unknown) => (
                            <Badge 
                              key={c.name} 
                              variant="secondary" 
                              className={cn(
                                "h-7 px-3 rounded-xl border-none font-bold text-meta tracking-tight transition-all",
                                c.status === 'active' ? 'bg-nexus-emerald/10 text-nexus-emerald' : 'bg-muted text-muted-foreground'
                              )}
                            >
                              <Share2 className="h-3 w-3 mr-1.5 opacity-60" />
                              {c.name} {c.messages > 0 && <span className="ml-1 opacity-60">({c.messages})</span>}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <div className="h-7 flex items-center px-3 rounded-xl bg-muted/30 border border-dashed border-border/40">
                          <span className="text-meta font-bold text-muted-foreground uppercase tracking-widest">Nenhum Canal Conectado</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-4 border-t border-border/20">
                        <div className="flex items-center gap-2">
                          <Zap className="h-3.5 w-3.5 text-nexus-amber" />
                          <span className="text-meta font-bold text-muted-foreground uppercase tracking-widest">Updated {new Date(dep.updated).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg hover:bg-primary/10" onClick={() => handleDeployClick(dep)}>
                            <Rocket className="h-4 w-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg hover:bg-primary/10">
                            <Terminal className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-card/50 backdrop-blur-xl border border-border/40 p-8 rounded-[3rem] shadow-xl shadow-primary/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-nexus-purple/10 flex items-center justify-center">
                <Globe className="h-5 w-5 text-nexus-purple" />
              </div>
              <h3 className="text-xl font-heading font-black text-foreground">Orquestração A2A</h3>
            </div>
            <p className="text-body-sm text-muted-foreground mb-6 leading-relaxed">
              Protocolo Nexus Agent-to-Agent para comunicação inter-agentes em clusters distribuídos.
            </p>
            <A2APanel />
          </div>

          <div className="bg-card/50 backdrop-blur-xl border border-border/40 p-8 rounded-[3rem] shadow-xl shadow-primary/5">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-nexus-cyan/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-nexus-cyan" />
                </div>
                <h3 className="text-xl font-heading font-black text-foreground">Saúde & SLA</h3>
              </div>
              {health?.status === 'healthy' && <div className="h-2 w-2 rounded-full bg-nexus-emerald animate-pulse" />}
            </div>
            <div className="space-y-3">
              {[
                { label: 'Gateway Neural', status: health?.status || 'Online', val: '99.99%', color: health?.status === 'healthy' ? 'text-nexus-emerald' : 'text-nexus-amber' },
                { label: 'Latência Global', status: 'P95', val: `${health?.checks?.gateway?.latency_ms || 142}ms`, color: 'text-nexus-emerald' },
                { label: 'Consultas 24h', status: 'Throughput', val: metrics?.executions24h?.toLocaleString() || '0', color: 'text-primary' },
                { label: 'Custo Diário', status: 'FinOps', val: `$${metrics?.dailyCost?.toFixed(2) || '0.00'}`, color: 'text-nexus-purple' },
                { label: 'Alertas Ativos', status: 'Incidents', val: metrics?.activeAlerts || '0', color: (metrics?.activeAlerts || 0) > 0 ? 'text-destructive' : 'text-muted-foreground' },
              ].map((s, i) => (
                <div key={i} className="flex items-center justify-between p-3.5 rounded-2xl bg-secondary/30 border border-border/20 group hover:border-primary/20 transition-all">
                  <div className="flex flex-col">
                    <span className="text-meta font-bold text-foreground">{s.label}</span>
                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest">{s.status}</span>
                  </div>
                  <div className="text-right">
                    <span className={cn("text-meta font-black font-mono", s.color)}>{s.val}</span>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-6 h-10 rounded-xl text-meta font-bold uppercase tracking-widest border-border/40" asChild>
               <a href="/observability">Ver Detalhes OTel</a>
            </Button>
          </div>
        </div>
      </div>

      <DeploymentWizard 
        isOpen={wizardOpen}
        onOpenChange={setWizardOpen}
        agentName={selectedAgent?.name || ""}
        onDeploy={(env) => {
          logger.info(`Deploying to ${env}`, { agent_id: selectedAgent?.id });
        }}
      />
    </div>
  );
}

function EndpointGeneratorButton() {
  const [copied, setCopied] = useState<string | null>(null);
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'tdprnylgyrogbbhgdoik';
  const baseUrl = `https://${projectId}.supabase.co/functions/v1`;

  const endpoints = [
    { name: 'Neural Gateway', path: 'llm-gateway', method: 'POST', desc: 'Interface unificada para múltiplos modelos' },
    { name: 'Cerebro RAG', path: 'cerebro-query', method: 'POST', desc: 'Consulta com recuperação vetorial' },
    { name: 'Workflow Runtime', path: 'workflow-engine-v2', method: 'POST', desc: 'Execução de grafos multi-agente' },
    { name: 'Oracle Consensus', path: 'oracle-council', method: 'POST', desc: 'Validação cruzada de modelos' },
  ];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    toast.success('Copiado!');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-12 px-6 rounded-2xl border-border/40 font-bold gap-2.5 bg-background/50 hover:border-primary/30 transition-all">
          <Code2 className="h-5 w-5 text-muted-foreground" /> 
          <span className="font-bold">API Access</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl rounded-[2.5rem] border-border/40 p-8 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-heading font-black flex items-center gap-3">
            <Terminal className="h-6 w-6 text-primary" /> API Industrial Gateway
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 mt-6">
          <div className="bg-secondary/30 border border-border/40 p-5 rounded-2xl relative group">
            <p className="text-meta font-black text-muted-foreground uppercase tracking-widest mb-3">Endpoint Base de Produção</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-background/50 p-2.5 rounded-xl text-meta font-mono text-primary truncate">{baseUrl}</code>
              <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl hover:bg-primary/10 transition-colors" onClick={() => handleCopy(baseUrl, 'base')}>
                {copied === 'base' ? <CheckCircle className="h-4 w-4 text-nexus-emerald" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            {endpoints.map(ep => {
              const url = `${baseUrl}/${ep.path}`;
              const curl = `curl -X ${ep.method} '${url}' \\\n  -H 'Authorization: Bearer YOUR_ANON_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"model":"google/gemini-2.5-flash","messages":[{"role":"user","content":"Hello"}]}'`;
              return (
                <div key={ep.path} className="nexus-card p-5 rounded-2xl border-border/40 group hover:border-primary/30 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Layers className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-body-sm font-bold text-foreground">{ep.name}</p>
                        <p className="text-meta text-muted-foreground font-medium uppercase tracking-tight">{ep.desc}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-primary/5 text-primary border-none text-meta font-black">{ep.method}</Badge>
                  </div>
                  <div className="flex items-center gap-3 bg-muted/30 p-2 rounded-xl">
                    <code className="text-meta text-muted-foreground font-mono truncate flex-1">{url}</code>
                    <Button size="sm" variant="ghost" className="h-8 px-3 rounded-lg hover:bg-primary/10 text-meta font-bold" onClick={() => handleCopy(curl, ep.path)}>
                      {copied === ep.path ? "COPIADO" : "COPIAR CURL"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 p-4 rounded-2xl bg-nexus-amber/10 border border-nexus-amber/20">
            <Zap className="h-5 w-5 text-nexus-amber shrink-0" />
            <p className="text-meta text-nexus-amber/80 font-bold leading-relaxed">
              AVISO: Utilize sua 'ANON_KEY' no header de autorização para chamadas seguras. 
              Para automações internas críticas, utilize a 'SERVICE_ROLE_KEY' com extrema cautela.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
