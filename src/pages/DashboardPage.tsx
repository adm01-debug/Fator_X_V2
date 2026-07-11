
import { AnimatedCounter } from "@/components/shared/AnimatedCounter";
import { DateRangePicker, getDateRangeDays, type DateRange } from "@/components/dashboard/DateRangePicker";
import { Button } from "@/components/ui/button";
import { 
  Bot, Plus, TrendingUp, DollarSign, Zap, 
  Sparkles, BookOpen, Activity, GitBranch, Shield, 
  Cpu, Target, ChevronRight, Globe, Layers, BarChart3, Radio
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAgentsForDashboard, getUsageInRange, getRecentDashboardTraces } from "@/services/dashboardService";
import { UsageCharts } from "@/components/dashboard/UsageCharts";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { AutomationOverviewWidget } from "@/components/automation/AutomationOverviewWidget";
import { DashboardAlerts } from "@/components/dashboard/DashboardAlerts";
import { DashboardInsight } from "@/components/dashboard/DashboardInsight";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SkeletonLoader } from "@/components/shared/SkeletonLoader";
import { SharedEmptyState } from "@/components/shared/SharedEmptyState";
import { AccessControl } from "@/components/rbac";



function DashboardLoadingSkeleton() {
  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1440px] mx-auto" aria-busy="true">
      <SkeletonLoader variant="dashboard" />
    </div>
  );
}


export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  
  const { data: agents = [], isLoading } = useQuery({ 
    queryKey: ['agents'], 
    queryFn: listAgentsForDashboard, 
    retry: 2 
  });
  
  const days = getDateRangeDays(dateRange);
  const { data: usageData = [] } = useQuery({ 
    queryKey: ['dashboard_usage', dateRange], 
    queryFn: () => getUsageInRange(days) 
  });

  const usageStats = usageData.length ? {
    totalCost: usageData.reduce((s, u) => s + Number(u.total_cost_usd || 0), 0),
    totalRequests: usageData.reduce((s, u) => s + (u.requests || 0), 0),
    avgLatency: Math.round(usageData.reduce((s, u) => s + (u.avg_latency_ms || 0), 0) / usageData.length),
    totalTokens: usageData.reduce((s, u) => s + (u.tokens_input || 0) + (u.tokens_output || 0), 0),
  } : null;

  const { data: recentTraces = [] } = useQuery({ 
    queryKey: ['dashboard_traces'], 
    queryFn: () => getRecentDashboardTraces(5) 
  });
  
  const activeCount = agents.filter(a => a.status === 'production' || a.status === 'monitoring').length;

  const getGreeting = () => { 
    const hour = new Date().getHours(); 
    return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'; 
  };

  if (isLoading) return <DashboardLoadingSkeleton />;

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-10 max-w-[1440px] mx-auto animate-page-enter">
      {/* Header Elevated 10/10 */}
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-2xl shadow-primary/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/[0.04] rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:bg-primary/[0.06] transition-colors duration-700" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 relative">
          <div className="flex items-center gap-8">
            <div className="h-24 w-24 rounded-[2rem] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-2xl shadow-primary/10 group-hover:scale-105 transition-transform duration-500">
              <Cpu className="h-12 w-12 text-primary animate-float" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-6xl">{getGreeting()}, {user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Nexus'}</h1>
              </div>
              <p className="text-lg text-muted-foreground max-w-2xl font-medium leading-relaxed">
                Bem-vindo ao Centro de Comando Nexus. Sua infraestrutura de agentes está processando em alta performance.
              </p>
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-nexus-emerald/10 text-nexus-emerald text-meta font-bold uppercase tracking-widest border border-nexus-emerald/20">
                  <Globe className="h-3 w-3" /> Sistema Nominal
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-meta font-bold uppercase tracking-widest border border-primary/20">
                  <Activity className="h-3 w-3" /> {usageStats?.totalRequests || 0} Requests
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <AccessControl permission="agents.create">
              <Button onClick={() => navigate('/agents/new')} className="nexus-gradient-bg text-primary-foreground gap-3 h-14 px-8 rounded-2xl shadow-xl shadow-primary/25 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 group overflow-hidden relative">
                <Plus className="h-6 w-6 group-hover:rotate-90 transition-transform duration-300" /> 
                <span className="font-bold text-lg tracking-tight">Novo Agente</span>
              </Button>
            </AccessControl>
          </div>

        </div>
      </div>

      {agents.length === 0 ? (
        <SharedEmptyState
          icon={Sparkles}
          title="Inicie sua Frota Neural"
          description="Sua infraestrutura Nexus está pronta. Comece criando um agente autônomo para orquestrar sua operação com inteligência industrial."
          actionLabel="Criar Primeiro Agente"
          onAction={() => navigate('/agents/new')}
          className="bg-card/30 border border-dashed border-border/60 rounded-[4rem]"
        />

      ) : (
        <>
      {/* Matrix System Performance Elevated 10/10 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { icon: Bot, color: "text-primary", bgColor: "bg-primary/10", value: agents.length, label: "Agentes Totais", trend: "+2", subLabel: "Frota Neural", status: "Nominal" },
          { icon: Zap, color: "text-nexus-emerald", bgColor: "bg-nexus-emerald/10", value: activeCount, label: "Live Deployment", trend: "Active", subLabel: "Em Produção", status: "Online" },
          { icon: DollarSign, color: "text-nexus-amber", bgColor: "bg-nexus-amber/10", value: usageStats?.totalCost ?? 0, label: "Cloud Cost", prefix: "$", decimals: 2, subLabel: `Budget ${dateRange}`, status: "Optimized" },
          { icon: TrendingUp, color: "text-nexus-cyan", bgColor: "bg-nexus-cyan/10", value: usageStats?.totalRequests ?? 0, label: "Vazão Neural", subLabel: "Total Requests", status: "High Cap" },
        ].map((metric, i) => (
          <div 
            key={i} 
            className="bg-card border border-border/40 p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500"
          >
            <div className="absolute -right-4 -bottom-4 h-24 w-24 bg-primary/[0.02] rounded-full blur-2xl group-hover:bg-primary/[0.06] transition-colors" />
            <div className="flex items-center justify-between mb-6">
              <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-500", metric.bgColor)}>
                <metric.icon className={cn("h-7 w-7", metric.color)} />
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className="bg-muted/50 text-muted-foreground border-none font-black text-meta px-2.5 py-1 uppercase tracking-widest">
                  {metric.trend}
                </Badge>
                <span className="text-[9px] font-black text-nexus-emerald uppercase tracking-tighter">{metric.status}</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-meta font-black uppercase tracking-widest text-muted-foreground/60">{metric.label}</p>
              <div className="flex items-baseline gap-1">
                <p className="text-5xl font-black text-foreground tracking-tighter">
                  <AnimatedCounter value={metric.value} prefix={metric.prefix} decimals={metric.decimals} />
                </p>
              </div>
              <div className="flex items-center gap-2 pt-3">
                <div className="h-1 flex-1 bg-border/40 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all duration-1000", i === 0 ? 'w-[75%] bg-primary' : i === 1 ? 'w-[90%] bg-nexus-emerald' : i === 2 ? 'w-[45%] bg-nexus-amber' : 'w-[82%] bg-nexus-cyan')} />
                </div>
                <span className="text-meta font-black text-muted-foreground uppercase tracking-widest">{metric.subLabel}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Industrial Quick Actions Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
        {[
          { label: 'Conhecimento', icon: BookOpen, path: '/knowledge', color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Workflows', icon: GitBranch, path: '/workflows', color: 'text-purple-500', bg: 'bg-purple-500/10' },
          { label: 'Monitoramento', icon: Activity, path: '/monitoring', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Segurança', icon: Shield, path: '/security', color: 'text-orange-500', bg: 'bg-orange-500/10' },
          { label: 'Ferramentas', icon: Zap, path: '/tools', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
          { label: 'Analytics', icon: BarChart3, path: '/monitoring', color: 'text-pink-500', bg: 'bg-pink-500/10' },
        ].map((action, i) => (
          <button
            key={i}
            onClick={() => navigate(action.path)}
            className="flex flex-col items-center justify-center gap-4 p-7 rounded-[2.5rem] bg-card/50 border border-border/40 hover:border-primary/40 hover:bg-card hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className={cn("h-16 w-16 rounded-[1.5rem] flex items-center justify-center relative z-10 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 shadow-lg", action.bg)}>
              <action.icon className={cn("h-8 w-8", action.color)} />
            </div>
            <span className="text-body-sm font-black text-foreground group-hover:text-primary transition-colors relative z-10 uppercase tracking-tight">{action.label}</span>
          </button>
        ))}
      </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-card/30 border border-border/40 p-10 rounded-[3.5rem] shadow-xl shadow-primary/[0.02]">
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-heading font-black text-foreground tracking-tight">Utilização da Infraestrutura</h3>
                      <p className="text-meta font-bold text-muted-foreground uppercase tracking-widest mt-1">Sincronização em Tempo Real</p>
                    </div>
                  </div>
                </div>
                <UsageCharts data={usageData ?? []} />
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Recent Agents Widget Elevated */}
                <div className="bg-card/30 border border-border/40 p-8 rounded-[3rem] flex flex-col shadow-xl shadow-primary/[0.02] hover:shadow-2xl hover:shadow-primary/[0.04] transition-all duration-500">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                        <Layers className="h-6 w-6 text-blue-500" />
                      </div>
                      <h3 className="text-xl font-heading font-black text-foreground tracking-tight">Top Agentes</h3>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/agents')} className="text-meta font-black h-8 px-4 rounded-xl hover:bg-primary/10 tracking-widest uppercase">Full Fleet</Button>
                  </div>
                  <div className="space-y-4 flex-1">
                    {agents.slice(0, 4).map(agent => (
                      <div key={agent.id} className="flex items-center justify-between p-5 rounded-[2rem] bg-card border border-border/40 hover:border-primary/40 hover:bg-background/80 hover:shadow-xl transition-all duration-300 cursor-pointer group" onClick={() => navigate(`/builder/${agent.id}`)}>
                        <div className="flex items-center gap-5">
                          <div className="h-14 w-14 rounded-2xl bg-muted/30 flex items-center justify-center text-2xl group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-sm">{agent.avatar_emoji || '🤖'}</div>
                          <div>
                            <p className="text-base font-black text-foreground group-hover:text-primary transition-colors line-clamp-1">{agent.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-[9px] font-black uppercase tracking-tighter border-primary/20 text-primary">{agent.model?.split('-')[0]}</Badge>
                              <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                              <span className="text-meta font-bold text-muted-foreground uppercase tracking-widest">Active</span>
                            </div>
                          </div>
                        </div>
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center text-muted-foreground/30 group-hover:text-primary group-hover:bg-primary/10 transition-all duration-300">
                          <ChevronRight className="h-5 w-5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Real-time Activity Widget Elevated */}
                <div className="bg-card/30 border border-border/40 p-8 rounded-[3rem] flex flex-col shadow-xl shadow-primary/[0.02] hover:shadow-2xl hover:shadow-primary/[0.04] transition-all duration-500">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-nexus-emerald/10 flex items-center justify-center">
                        <Radio className="h-6 w-6 text-nexus-emerald animate-pulse" />
                      </div>
                      <h3 className="text-xl font-heading font-black text-foreground tracking-tight">Live Telemetria</h3>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/monitoring')} className="text-meta font-black h-8 px-4 rounded-xl hover:bg-nexus-emerald/10 tracking-widest uppercase">Logs</Button>
                  </div>
                  <div className="space-y-4 flex-1">
                    {recentTraces.slice(0, 4).map((trace: any) => (
                      <div key={trace.id} className="flex items-center justify-between p-5 rounded-[2rem] bg-card border border-border/40 hover:border-nexus-emerald/40 hover:bg-background/80 hover:shadow-xl transition-all duration-300 cursor-pointer group" onClick={() => navigate('/monitoring')}>
                        <div className="flex items-center gap-5 min-w-0">
                          <div className={cn(
                            "h-3 w-3 rounded-full shrink-0",
                            trace.level === 'error' ? 'bg-destructive shadow-[0_0_12px_rgba(239,68,68,0.6)]' : 'bg-nexus-emerald shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                          )} />
                          <div className="min-w-0">
                            <p className="text-base font-black text-foreground group-hover:text-nexus-emerald transition-colors truncate">{trace.event}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-meta font-black text-muted-foreground uppercase tracking-widest">{new Date(trace.created_at).toLocaleTimeString('pt-BR')}</span>
                              <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                              <Badge variant="outline" className="text-[9px] font-black uppercase tracking-tighter border-nexus-emerald/20 text-nexus-emerald">Verified</Badge>
                            </div>
                          </div>
                        </div>
                        {trace.latency_ms && <span className="text-meta font-black text-muted-foreground/60 bg-muted px-2.5 py-1 rounded-lg border border-border/40">{trace.latency_ms}ms</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-card/30 border border-border/40 p-10 rounded-[3rem] shadow-xl shadow-primary/[0.02]">
                <div className="flex items-center gap-4 mb-8">
                  <div className="h-12 w-12 rounded-2xl bg-nexus-purple/10 flex items-center justify-center">
                    <Activity className="h-6 w-6 text-nexus-purple" />
                  </div>
                  <h3 className="text-2xl font-heading font-black text-foreground tracking-tight">Fluxo de Eventos</h3>
                </div>
                <ActivityFeed />
              </div>
              
              <div className="bg-card/30 border border-border/40 p-10 rounded-[3rem] shadow-xl shadow-primary/[0.02]">
                <div className="flex items-center gap-4 mb-8">
                  <div className="h-12 w-12 rounded-2xl bg-nexus-cyan/10 flex items-center justify-center">
                    <Target className="h-6 w-6 text-nexus-cyan" />
                  </div>
                  <h3 className="text-2xl font-heading font-black text-foreground tracking-tight">Cognitive Insights</h3>
                </div>
                <DashboardInsight agents={agents} usageStats={usageStats} recentTraces={recentTraces} />
              </div>

              <DashboardAlerts />
            </div>
          </div>
          
          <AutomationOverviewWidget />
        </>
      )}
    </div>
  );
}
