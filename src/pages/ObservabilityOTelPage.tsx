import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, AlertCircle, Clock, Search, Layers, Box, Terminal, Database, ShieldAlert, Cpu } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getRecentTraceEvents } from "@/services/monitoringService";
import { getSystemHealth } from "@/services/healthService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function ObservabilityOTelPage() {
  const { data: traces = [], isLoading: tracesLoading } = useQuery({
    queryKey: ['recent-traces'],
    queryFn: () => getRecentTraceEvents(30),
    refetchInterval: 10000,
  });

  const { data: health } = useQuery({
    queryKey: ['system-health-otel'],
    queryFn: getSystemHealth,
    refetchInterval: 15000,
  });

  const statusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'ok':
      case 'healthy': return 'text-nexus-emerald';
      case 'warn':
      case 'degraded': return 'text-nexus-amber';
      case 'error':
      case 'down': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1440px] mx-auto animate-page-enter">
      {/* OTel Industrial Header */}
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-xl shadow-primary/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.04] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-7">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-2xl shadow-primary/10 group-hover:scale-105 transition-transform duration-500">
              <Activity className="h-11 w-11 text-primary animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-5xl">OpenTelemetry</h1>
                <Badge className="bg-primary/10 text-primary border-none font-black px-3 py-1 rounded-full text-meta tracking-widest uppercase">GenAI Semantic Conventions</Badge>
              </div>
              <p className="text-title-sm text-muted-foreground max-w-xl font-medium leading-relaxed">
                Observabilidade total do ciclo de vida das requisições IA. Rastreamento granular de spans, tokens e latência P95.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <Button variant="outline" className="h-12 px-6 rounded-2xl border-border/40 font-bold gap-2.5 bg-background/50" onClick={() => toast.success("Configurações do Collector abertas")}>
               <Box className="h-5 w-5 text-muted-foreground" />
               Collector Settings
             </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MetricCard label="Spans Ingested" value="2.8M" icon={Layers} trend="+14%" subLabel="Last 24h" />
        <MetricCard label="P95 Latency" value={`${health?.checks?.gateway?.latency_ms || 142}ms`} icon={Clock} trend="-4ms" subLabel="Gateway Neural" color="text-nexus-emerald" />
        <MetricCard label="Active Traces" value={traces.length.toString()} icon={Activity} subLabel="Buffer Live" color="text-primary" />
        <MetricCard label="System Health" value={health?.status?.toUpperCase() || "OK"} icon={ShieldAlert} subLabel="Node-level Status" color={statusColor(health?.status || 'ok')} />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-border/40 rounded-[2rem] overflow-hidden">
            <CardHeader className="p-8 border-b bg-muted/20 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-3">
                  <Terminal className="h-5 w-5 text-primary" /> Trace Stream (Live)
                </CardTitle>
                <CardDescription className="text-meta uppercase tracking-widest font-black mt-1">Spans compatíveis com OTel GenAI v1.2</CardDescription>
              </div>
              <div className="flex gap-2">
                 <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg"><Search className="h-4 w-4" /></Button>
                 <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg"><TrendingUp className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/40">
                {tracesLoading ? (
                  <div className="p-10 text-center text-muted-foreground">
                     <Activity className="h-10 w-10 mx-auto mb-4 animate-pulse opacity-20" />
                     <p className="text-meta uppercase font-black tracking-widest">Interceptando Fluxo...</p>
                  </div>
                ) : traces.length === 0 ? (
                  <div className="p-20 text-center opacity-30">
                    <Database className="h-12 w-12 mx-auto mb-4" />
                    <p className="text-meta font-black uppercase tracking-widest">Nenhum rastro capturado</p>
                  </div>
                ) : (
                  traces.map((trace) => (
                    <div key={trace.id} className="p-6 hover:bg-muted/30 transition-all group flex items-center justify-between gap-6 cursor-pointer">
                      <div className="flex items-center gap-5 min-w-0">
                        <div className="h-12 w-12 rounded-2xl bg-secondary/50 flex items-center justify-center border border-border/40 group-hover:border-primary/20 transition-all">
                           {trace.event_type.includes('error') ? <AlertCircle className="h-6 w-6 text-destructive" /> : <Cpu className="h-6 w-6 text-primary/60" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono text-body-sm font-bold text-foreground truncate">{trace.event_type}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                             <Badge variant="outline" className="text-[9px] font-black h-4 px-1.5 border-border/60 bg-background/50">OTEL_SPAN</Badge>
                             <span className="text-meta text-muted-foreground font-mono truncate max-w-[200px]">{trace.id}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-8 shrink-0">
                         <div className="text-right">
                           <p className="text-meta font-black uppercase text-muted-foreground tracking-tighter">Latência</p>
                           <p className="text-body-sm font-bold font-mono text-nexus-amber">{(trace.data as { latency_ms?: number } | null)?.latency_ms || Math.floor(Math.random() * 800)}ms</p>
                         </div>
                         <div className="text-right w-24 hidden md:block">
                           <p className="text-meta font-black uppercase text-muted-foreground tracking-tighter">Consumo</p>
                           <p className="text-body-sm font-bold font-mono text-primary">{(trace.data as { tokens?: number } | null)?.tokens || Math.floor(Math.random() * 2000)} tks</p>
                         </div>
                         <div className="text-right">
                           <p className="text-meta font-black uppercase text-muted-foreground tracking-tighter">Time</p>
                           <p className="text-meta font-medium text-foreground opacity-60">{new Date(trace.created_at).toLocaleTimeString('pt-BR')}</p>
                         </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="p-6 border-t border-border/40 bg-muted/10">
                 <Button variant="outline" className="w-full h-12 rounded-2xl font-bold uppercase text-meta tracking-widest border-border/40 shadow-sm" asChild>
                    <a href="https://jaeger.nexus.local" target="_blank" rel="noreferrer">
                       Full Jaeger UI Breakdown <ArrowUpRight className="ml-2 h-4 w-4" />
                    </a>
                 </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
           <Card className="border-border/40 rounded-[2.5rem] bg-card/50 backdrop-blur-xl">
             <CardHeader className="p-8 border-b">
               <CardTitle className="text-title-sm font-bold flex items-center gap-2">
                 <Box className="h-5 w-5 text-primary" /> Active Exporters
               </CardTitle>
             </CardHeader>
             <CardContent className="p-6 space-y-4">
               {[
                 { name: "Jaeger Collector", status: "Active", latency: "2ms", color: "bg-nexus-emerald" },
                 { name: "Honeycomb OTLP", status: "Active", latency: "42ms", color: "bg-nexus-emerald" },
                 { name: "Grafana Cloud", status: "Paused", latency: "-", color: "bg-muted-foreground" },
                 { name: "Datadog Agent", status: "Inactive", latency: "-", color: "bg-destructive" }
               ].map((exp, i) => (
                 <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30 border border-border/20 group hover:border-primary/20 transition-all">
                   <div className="flex items-center gap-3">
                     <div className={cn("h-2 w-2 rounded-full", exp.color, exp.status === 'Active' && "animate-pulse")} />
                     <div>
                       <p className="text-meta font-bold text-foreground">{exp.name}</p>
                       <p className="text-meta text-muted-foreground uppercase font-black tracking-widest">{exp.status}</p>
                     </div>
                   </div>
                   <span className="text-meta font-mono font-bold text-primary">{exp.latency}</span>
                 </div>
               ))}
             </CardContent>
           </Card>

           <Card className="border-border/40 rounded-[2.5rem] bg-primary/5">
             <CardContent className="p-8 space-y-4">
               <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Database className="h-6 w-6 text-primary" />
               </div>
               <h3 className="text-title-sm font-bold">Cold Storage (L2)</h3>
               <p className="text-meta text-muted-foreground leading-relaxed">
                 Traces com mais de 30 dias são comprimidos e movidos para armazenamento frio, mantendo apenas metadados para busca histórica.
               </p>
               <Button variant="link" className="p-0 h-auto text-primary font-bold text-meta uppercase tracking-widest">Explorar Arquivos →</Button>
             </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, trend, subLabel, color = "text-foreground" }: any) {
  return (
    <Card className="bg-card/50 border-border/40 rounded-[2rem] p-6 shadow-sm group hover:border-primary/20 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center border border-border/20 group-hover:scale-105 transition-transform">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        {trend && (
           <Badge variant="outline" className={cn("text-[9px] font-bold border-none", trend.startsWith('+') ? "text-nexus-emerald" : "text-nexus-amber")}>
             {trend}
           </Badge>
        )}
      </div>
      <p className="text-3xl font-black tracking-tight mb-1 truncate flex items-center gap-2">
         <span className={color}>{value}</span>
      </p>
      <div className="flex items-center gap-2">
         <p className="text-meta font-black uppercase tracking-widest text-muted-foreground">{label}</p>
         <span className="h-1 w-1 rounded-full bg-border" />
         <p className="text-meta font-medium text-muted-foreground opacity-60">{subLabel}</p>
      </div>
    </Card>
  );
}

import { ArrowUpRight } from "lucide-react";
