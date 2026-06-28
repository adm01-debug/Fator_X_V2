import { Sparkles } from 'lucide-react';

interface InsightProps {
  agents: Array<{ status: string | null; name: string }>;
  usageStats: { totalCost: number; totalRequests: number; avgLatency: number; totalTokens: number } | null;
  recentTraces: Array<{ level: string | null; event: string | null }>;
}

export function DashboardInsight({ agents, usageStats, recentTraces }: InsightProps) {
  const insights: Array<{ icon: string; text: string; type: 'info' | 'warning' | 'success' }> = [];

  const errorTraces = recentTraces.filter(t => t.level === 'error' || t.level === 'critical');
  if (errorTraces.length > 0) {
    insights.push({ icon: '⚠️', text: `${errorTraces.length} erro${errorTraces.length > 1 ? 's' : ''} detectado${errorTraces.length > 1 ? 's' : ''} recentemente — verifique o Monitoramento para detalhes.`, type: 'warning' });
  }
  if (usageStats && usageStats.avgLatency > 2000) {
    insights.push({ icon: '🐢', text: `Latência média de ${usageStats.avgLatency}ms está acima do ideal. Considere otimizar prompts ou trocar de modelo.`, type: 'warning' });
  }
  const draftAgents = agents.filter(a => a.status === 'draft');
  if (draftAgents.length > 2) {
    insights.push({ icon: '📝', text: `Você tem ${draftAgents.length} agentes em rascunho. Considere finalizá-los ou arquivar os que não serão usados.`, type: 'info' });
  }
  const productionAgents = agents.filter(a => a.status === 'production' || a.status === 'monitoring');
  if (productionAgents.length > 0 && errorTraces.length === 0) {
    insights.push({ icon: '✅', text: `${productionAgents.length} agente${productionAgents.length > 1 ? 's' : ''} em produção operando sem erros. Tudo funcionando bem!`, type: 'success' });
  }
  if (usageStats && usageStats.totalCost > 50) {
    insights.push({ icon: '💰', text: `Custo de $${usageStats.totalCost.toFixed(2)} nos últimos 30 dias. Confira o Faturamento para detalhes por agente.`, type: 'info' });
  }

  if (insights.length === 0) return null;

  return (
    <div className="nexus-card border-primary/15 bg-gradient-to-r from-card via-card to-primary/[0.04] relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.03] rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/[0.06] transition-colors" aria-hidden="true" />
      <div className="flex items-center gap-2 mb-3 relative">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center ring-4 ring-primary/5">
          <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" aria-hidden="true" />
        </div>
        <h3 className="text-title-sm text-foreground">Insights da IA</h3>
      </div>
      <div className="space-y-3">
        {insights.slice(0, 3).map((insight, i) => (
          <div key={i} className={`flex items-start gap-3 text-body-sm p-2.5 rounded-lg border transition-all ${

            insight.type === 'warning' ? 'bg-nexus-amber/5 border-nexus-amber/10 text-nexus-amber/90' :
            insight.type === 'success' ? 'bg-nexus-emerald/5 border-nexus-emerald/10 text-nexus-emerald/90' :
            'bg-primary/5 border-primary/10 text-muted-foreground'
          }`}>
            <span className="shrink-0 text-base" aria-hidden="true">{insight.icon}</span>
            <p className="leading-relaxed font-medium">{insight.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
