
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InfoHint } from "@/components/shared/InfoHint";
import { AnimatedCounter } from "@/components/shared/AnimatedCounter";
import { DateRangePicker, getDateRangeDays, type DateRange } from "@/components/dashboard/DateRangePicker";
import { Button } from "@/components/ui/button";
import { Bot, Plus, ArrowRight, TrendingUp, DollarSign, Clock, Zap, Sparkles, BookOpen, Activity, GitBranch } from "lucide-react";
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

function DashboardLoadingSkeleton() {
  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto" aria-busy="true">
      <div className="flex items-center justify-between"><div className="space-y-2"><div className="h-7 w-40 rounded-md skeleton-shimmer" /><div className="h-4 w-64 rounded-md skeleton-shimmer" /></div><div className="h-10 w-36 rounded-lg skeleton-shimmer" /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="nexus-card text-center space-y-2"><div className="h-8 w-8 mx-auto rounded-lg skeleton-shimmer" /><div className="h-7 w-16 mx-auto rounded skeleton-shimmer" /><div className="h-3 w-20 mx-auto rounded skeleton-shimmer" /></div>)}</div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const { data: agents = [], isLoading } = useQuery({ queryKey: ['agents'], queryFn: listAgentsForDashboard, retry: 2 });
  const days = getDateRangeDays(dateRange);
  const { data: usageData = [] } = useQuery({ queryKey: ['dashboard_usage', dateRange], queryFn: () => getUsageInRange(days) });

  const usageStats = usageData.length ? {
    totalCost: usageData.reduce((s, u) => s + Number(u.total_cost_usd || 0), 0),
    totalRequests: usageData.reduce((s, u) => s + (u.requests || 0), 0),
    avgLatency: Math.round(usageData.reduce((s, u) => s + (u.avg_latency_ms || 0), 0) / usageData.length),
    totalTokens: usageData.reduce((s, u) => s + (u.tokens_input || 0) + (u.tokens_output || 0), 0),
  } : null;

  const { data: recentTraces = [] } = useQuery({ queryKey: ['dashboard_traces'], queryFn: () => getRecentDashboardTraces(5) });
  const activeCount = agents.filter(a => a.status === 'production' || a.status === 'monitoring').length;
  const draftCount = agents.filter(a => a.status === 'draft').length;

  const getGreeting = () => { const hour = new Date().getHours(); const name = user?.email?.split('@')[0] || ''; const prefix = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'; return name ? `${prefix}, ${name}` : prefix; };
  const getSummary = () => {
    if (agents.length === 0) return null;
    const parts: string[] = [];
    if (activeCount > 0) parts.push(`${activeCount} agente${activeCount > 1 ? 's' : ''} em produção`);
    if (draftCount > 0) parts.push(`${draftCount} rascunho${draftCount > 1 ? 's' : ''}`);
    if (usageStats) { parts.push(`$${usageStats.totalCost.toFixed(2)} de custo nos últimos ${days} dias`); }
    return parts.length > 0 ? parts.join(' · ') : null;
  };

  if (isLoading) return <DashboardLoadingSkeleton />;
  const summary = getSummary();

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter" role="main">
      <div className="space-y-1">
        <PageHeader title={`${getGreeting()} 👋`} description="Visão executiva da operação de agentes de IA" gradient={false} actions={
          <div className="flex items-center gap-3">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            {agents.length > 0 && <Button onClick={() => navigate('/agents/new')} className="nexus-gradient-bg text-primary-foreground gap-2 hover:opacity-90 min-h-[44px]"><Plus className="h-4 w-4" /> <span className="hidden sm:inline">Criar agente</span></Button>}
          </div>
        } />
        {summary && <div className="flex items-center gap-2 mt-2"><Zap className="h-3.5 w-3.5 text-primary shrink-0" /><p className="text-xs text-muted-foreground">{summary}</p></div>}
      </div>

      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 sm:py-20 text-center px-4">
          <div className="relative mb-6"><div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center border border-primary/10 mx-auto nexus-glow-sm"><span className="text-4xl">⚡</span></div></div>
          <h2 className="text-xl sm:text-2xl font-heading font-bold nexus-gradient-text mb-2">Bem-vindo ao Fator X!</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md leading-relaxed">Crie, configure, avalie e opere agentes de IA com governança completa.</p>
          <Button onClick={() => navigate('/agents/new')} size="lg" className="nexus-gradient-bg text-primary-foreground gap-2 hover:opacity-90 min-h-[48px] shadow-lg shadow-primary/20"><Plus className="h-4 w-4" /> Criar seu primeiro agente</Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {[{ label: 'Novo Agente', icon: Plus, path: '/agents/new' }, { label: 'Conhecimento', icon: BookOpen, path: '/knowledge' }, { label: 'Monitoramento', icon: Activity, path: '/monitoring' }, { label: 'Workflows', icon: GitBranch, path: '/workflows' }].map(action => (
              <button key={action.label} onClick={() => navigate(action.path)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border/40 bg-card/80 backdrop-blur-sm text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all min-h-[36px]">
                <action.icon className="h-3.5 w-3.5" />{action.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 stagger-children" role="region" aria-label="Métricas principais">
            {[
              { icon: Bot, color: "text-primary", bgColor: "bg-primary/10", value: agents.length, label: "Total de agentes", path: '/agents' },
              { icon: Zap, color: "text-nexus-emerald", bgColor: "bg-nexus-emerald/10", value: activeCount, label: "Em produção", path: '/deployments' },
              { icon: DollarSign, color: "text-nexus-amber", bgColor: "bg-nexus-amber/10", value: usageStats?.totalCost ?? 0, label: `Custo (${dateRange})`, prefix: "$", decimals: 2, noData: !usageStats, path: '/billing' },
              { icon: TrendingUp, color: "text-primary", bgColor: "bg-primary/10", value: usageStats?.totalRequests ?? 0, label: `Requests (${dateRange})`, noData: !usageStats, path: '/monitoring' },
            ].map((metric) => (
              <div key={metric.label} className="nexus-card nexus-metric-card nexus-card-interactive group cursor-pointer" onClick={() => navigate(metric.path)}>
                <div className="flex items-start justify-between mb-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{metric.label}</p>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${metric.bgColor}`}><metric.icon className={`h-4 w-4 ${metric.color}`} /></div>
                </div>
                <p className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight text-foreground">
                  {metric.noData ? '—' : <AnimatedCounter value={metric.value} prefix={metric.prefix} decimals={metric.decimals} />}
                </p>
              </div>
            ))}
          </div>

          {usageStats && (
            <div className="grid grid-cols-3 gap-4 sm:gap-5">
              {[{ icon: Clock, color: "text-nexus-purple", bgColor: "bg-nexus-purple/10", value: usageStats.avgLatency > 0 ? `${usageStats.avgLatency}ms` : '—', label: "Latência média" }, { icon: Sparkles, color: "text-nexus-cyan", bgColor: "bg-nexus-cyan/10", value: usageStats.totalTokens > 0 ? `${(usageStats.totalTokens / 1000).toFixed(0)}k` : '—', label: "Tokens totais" }, { icon: Bot, color: "text-muted-foreground", bgColor: "bg-muted/10", value: `${draftCount}`, label: "Rascunhos" }].map((m) => (
                <div key={m.label} className="nexus-card nexus-metric-card py-3 sm:py-4 flex items-center gap-3 hover:border-primary/30 transition-colors">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${m.bgColor}`}><m.icon className={`h-4 w-4 ${m.color}`} /></div>
                  <div><p className="text-sm sm:text-lg font-heading font-extrabold text-foreground">{m.value}</p><p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">{m.label}</p></div>
                </div>
              ))}
            </div>
          )}

          <div className="animate-chart-reveal"><UsageCharts data={usageData ?? []} /></div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="nexus-card flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" /> Agentes recentes
                </h3>
                <Button variant="ghost" size="sm" onClick={() => navigate('/agents')} className="text-[10px] h-7 px-2">Ver tudo</Button>
              </div>
              <div className="stagger-list flex-1" role="list">
                {agents.slice(0, 5).map(agent => (
                  <div key={agent.id} role="listitem" className="flex items-center justify-between cursor-pointer hover:bg-primary/5 border border-transparent hover:border-primary/10 rounded-xl p-3 mb-2 last:mb-0 transition-all group" onClick={() => navigate(`/builder/${agent.id}`)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/10 to-accent/5 flex items-center justify-center text-lg shrink-0 group-hover:scale-110 transition-transform shadow-sm">
                        {agent.avatar_emoji || '🤖'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">{agent.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{agent.model} • v{agent.version}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={agent.status || 'draft'} size="sm" />
                      <div className="h-7 w-7 rounded-full bg-secondary/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowRight className="h-3.5 w-3.5 text-primary" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="nexus-card flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-nexus-emerald" /> Atividade em tempo real
                </h3>
                <Button variant="ghost" size="sm" onClick={() => navigate('/monitoring')} className="text-[10px] h-7 px-2">Logs</Button>
              </div>
              {recentTraces.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 py-8 opacity-50">
                  <div className="h-12 w-12 rounded-full bg-muted/20 flex items-center justify-center mb-2">
                    <Activity className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">Nenhuma atividade registrada.</p>
                </div>
              ) : (
                <div className="stagger-list flex-1" role="list">
                  {recentTraces.map((trace: any) => (
                    <div key={trace.id} role="listitem" className="flex items-center justify-between p-3 mb-2 last:mb-0 rounded-xl border border-border/40 bg-card/50 hover:bg-secondary/30 cursor-pointer transition-all group" onClick={() => navigate('/monitoring')}>
                      <div className="flex items-center gap-3">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${
                          trace.level === 'error' || trace.level === 'critical' ? 'bg-destructive animate-pulse' : 
                          trace.level === 'warning' ? 'bg-nexus-amber' : 'bg-primary'
                        }`} />
                        <div>
                          <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{trace.event}</p>
                          <p className="text-[10px] text-muted-foreground font-medium">{new Date(trace.created_at).toLocaleTimeString('pt-BR')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {trace.latency_ms && (
                          <span className="text-[10px] font-mono text-muted-foreground bg-secondary/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />{(trace.latency_ms / 1000).toFixed(2)}s
                          </span>
                        )}
                        <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="nexus-card"><h3 className="text-sm font-heading font-semibold text-foreground mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Feed de Atividades</h3><ActivityFeed /></div>
          <AutomationOverviewWidget />
          <DashboardInsight agents={agents} usageStats={usageStats} recentTraces={recentTraces} />
          <DashboardAlerts />
        </>
      )}
      <InfoHint title="O que são superagentes de IA?">Superagentes combinam modelos de linguagem, memória persistente, ferramentas externas e RAG para executar tarefas complexas de forma autônoma.</InfoHint>
    </div>
  );
}
