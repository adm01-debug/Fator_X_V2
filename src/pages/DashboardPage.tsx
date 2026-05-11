
import { AnimatedCounter } from "@/components/shared/AnimatedCounter";
import { DateRangePicker, getDateRangeDays, type DateRange } from "@/components/dashboard/DateRangePicker";
import { Button } from "@/components/ui/button";
import { 
  Bot, Plus, TrendingUp, DollarSign, Zap, 
  Sparkles, BookOpen, Activity, GitBranch, Shield, 
  Cpu, Target, ChevronRight, Globe, Layers, BarChart3, RadioTower
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

function DashboardLoadingSkeleton() {
  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1440px] mx-auto" aria-busy="true">
      <div className="h-64 w-full rounded-[2.5rem] skeleton-shimmer" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-[2rem] skeleton-shimmer" />
        ))}
      </div>
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
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-nexus-emerald/10 text-nexus-emerald text-[10px] font-bold uppercase tracking-widest border border-nexus-emerald/20">
                  <Globe className="h-3 w-3" /> Sistema Nominal
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest border border-primary/20">
                  <Activity className="h-3 w-3" /> {usageStats?.totalRequests || 0} Requests
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <Button onClick={() => navigate('/agents/new')} className="nexus-gradient-bg text-primary-foreground gap-3 h-14 px-8 rounded-2xl shadow-xl shadow-primary/25 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 group overflow-hidden relative">
              <Plus className="h-6 w-6 group-hover:rotate-90 transition-transform duration-300" /> 
              <span className="font-bold text-lg tracking-tight">Novo Agente</span>
            </Button>
          </div>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center bg-card/30 border border-dashed border-border/60 rounded-[3rem]">
          <div className="h-24 w-24 rounded-[2rem] bg-gradient-to-br from-primary/10 to-accent/5 flex items-center justify-center mb-6 border border-primary/10">
            <Sparkles className="h-12 w-12 text-primary/40 animate-pulse" />
          </div>
          <h2 className="text-3xl font-heading font-black text-foreground mb-4">Inicie sua Frota Neural</h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-md">Você ainda não possui agentes ativos. Comece criando um agente autônomo para automatizar sua operação.</p>
          <Button onClick={() => navigate('/agents/new')} size="lg" className="nexus-gradient-bg text-primary-foreground h-14 px-10 rounded-2xl font-bold text-lg shadow-xl shadow-primary/20">
            Criar Primeiro Agente
          </Button>
        </div>
      ) : (
        <>
          {/* Quick Actions Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
                className="flex flex-col items-center justify-center gap-3 p-5 rounded-[2rem] bg-card border border-border/40 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group"
              >
                <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-3", action.bg)}>
                  <action.icon className={cn("h-6 w-6", action.color)} />
                </div>
                <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{action.label}</span>
              </button>
            ))}
          </div>

          {/* Metrics Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Bot, color: "text-primary", bgColor: "bg-primary/10", value: agents.length, label: "Agentes Totais", trend: "+2", subLabel: "Frota Neural" },
              { icon: Zap, color: "text-nexus-emerald", bgColor: "bg-nexus-emerald/10", value: activeCount, label: "Live Deployment", trend: "Active", subLabel: "Em Produção" },
              { icon: DollarSign, color: "text-nexus-amber", bgColor: "bg-nexus-amber/10", value: usageStats?.totalCost ?? 0, label: "Cloud Cost", prefix: "$", decimals: 2, subLabel: `Budget ${dateRange}` },
              { icon: TrendingUp, color: "text-nexus-cyan", bgColor: "bg-nexus-cyan/10", value: usageStats?.totalRequests ?? 0, label: "Vazão Neural", subLabel: "Total Requests" },
            ].map((metric, i) => (
              <div 
                key={i} 
                className="bg-card border border-border/40 p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-primary/20 transition-all duration-500"
              >
                <div className="absolute -right-4 -bottom-4 h-24 w-24 bg-primary/[0.02] rounded-full blur-2xl group-hover:bg-primary/[0.04] transition-colors" />
                <div className="flex items-center justify-between mb-6">
                  <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-500", metric.bgColor)}>
                    <metric.icon className={cn("h-7 w-7", metric.color)} />
                  </div>
                  {metric.trend && (
                    <Badge className="bg-muted/50 text-muted-foreground border-none font-bold text-[10px] px-2.5 py-1">
                      {metric.trend}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">{metric.label}</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-4xl font-black text-foreground tracking-tight">
                      <AnimatedCounter value={metric.value} prefix={metric.prefix} decimals={metric.decimals} />
                    </p>
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pt-2">{metric.subLabel}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-card/30 border border-border/40 p-8 rounded-[3rem]">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="text-xl font-heading font-black text-foreground">Utilização da Infraestrutura</h3>
                  </div>
                </div>
                <UsageCharts data={usageData ?? []} />
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Recent Agents Widget */}
                <div className="bg-card/30 border border-border/40 p-8 rounded-[3rem] flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                        <Layers className="h-5 w-5 text-blue-500" />
                      </div>
                      <h3 className="text-lg font-heading font-black text-foreground">Top Agentes</h3>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/agents')} className="text-[10px] font-bold h-8 px-3 rounded-lg hover:bg-primary/10">FULL FLEET</Button>
                  </div>
                  <div className="space-y-3 flex-1">
                    {agents.slice(0, 4).map(agent => (
                      <div key={agent.id} className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border/40 hover:border-primary/30 hover:shadow-lg transition-all cursor-pointer group" onClick={() => navigate(`/builder/${agent.id}`)}>
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-xl bg-muted/30 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">{agent.avatar_emoji || '🤖'}</div>
                          <div>
                            <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">{agent.name}</p>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{agent.model?.split('-')[0]}</p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Real-time Activity Widget */}
                <div className="bg-card/30 border border-border/40 p-8 rounded-[3rem] flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-nexus-emerald/10 flex items-center justify-center">
                        <Radio className="h-5 w-5 text-nexus-emerald animate-pulse" />
                      </div>
                      <h3 className="text-lg font-heading font-black text-foreground">Live Telemetria</h3>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/monitoring')} className="text-[10px] font-bold h-8 px-3 rounded-lg hover:bg-nexus-emerald/10">LOGS</Button>
                  </div>
                  <div className="space-y-3 flex-1">
                    {recentTraces.slice(0, 4).map((trace: any) => (
                      <div key={trace.id} className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border/40 hover:border-nexus-emerald/30 hover:shadow-lg transition-all cursor-pointer group" onClick={() => navigate('/monitoring')}>
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={cn(
                            "h-2 w-2 rounded-full shrink-0",
                            trace.level === 'error' ? 'bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-nexus-emerald shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                          )} />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground group-hover:text-nexus-emerald transition-colors truncate">{trace.event}</p>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{new Date(trace.created_at).toLocaleTimeString('pt-BR')}</p>
                          </div>
                        </div>
                        {trace.latency_ms && <span className="text-[9px] font-black text-muted-foreground/60 bg-muted px-2 py-0.5 rounded-full">{trace.latency_ms}ms</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-card/30 border border-border/40 p-8 rounded-[3rem]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-xl bg-nexus-purple/10 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-nexus-purple" />
                  </div>
                  <h3 className="text-xl font-heading font-black text-foreground">Fluxo de Eventos</h3>
                </div>
                <ActivityFeed />
              </div>
              
              <div className="bg-card/30 border border-border/40 p-8 rounded-[3rem]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-xl bg-nexus-cyan/10 flex items-center justify-center">
                    <Target className="h-5 w-5 text-nexus-cyan" />
                  </div>
                  <h3 className="text-xl font-heading font-black text-foreground">Insights Cognitivos</h3>
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
