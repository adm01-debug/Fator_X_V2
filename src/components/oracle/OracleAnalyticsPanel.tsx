import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  BarChart3,
  TrendingUp,
  DollarSign,
  Clock,
  Award,
  Activity,
  Zap,
  Target
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchOracleHistory, type OracleHistoryEntry } from "@/lib/oracleHistory";
import { getOracleStats } from "@/services/oracleService";
import { ORACLE_MODES, type OracleMode } from "@/stores/oracleStore";

interface ModeMetrics {
  mode: string;
  count: number;
  avg_confidence: number;
  avg_consensus: number;
  total_cost: number;
  avg_latency_s: number;
  total_tokens: number;
}

function aggregateByMode(history: OracleHistoryEntry[]): ModeMetrics[] {
  const byMode = new Map<string, OracleHistoryEntry[]>();
  for (const entry of history) {
    const key = entry.mode || 'unknown';
    if (!byMode.has(key)) byMode.set(key, []);
    byMode.get(key)!.push(entry);
  }

  const result: ModeMetrics[] = [];
  for (const [mode, entries] of byMode.entries()) {
    const validConf = entries.filter((e) => e.confidence_score != null);
    const validCons = entries.filter((e) => e.consensus_degree != null);
    result.push({
      mode,
      count: entries.length,
      avg_confidence:
        validConf.length > 0
          ? validConf.reduce((a, e) => a + (e.confidence_score ?? 0), 0) / validConf.length
          : 0,
      avg_consensus:
        validCons.length > 0
          ? validCons.reduce((a, e) => a + (e.consensus_degree ?? 0), 0) / validCons.length
          : 0,
      total_cost: entries.reduce((a, e) => a + (e.total_cost_usd ?? 0), 0),
      avg_latency_s:
        entries.reduce((a, e) => a + (e.total_latency_ms ?? 0), 0) / entries.length / 1000,
      total_tokens: entries.reduce((a, e) => a + (e.total_tokens ?? 0), 0),
    });
  }

  return result.sort((a, b) => b.count - a.count);
}

export function OracleAnalyticsPanel() {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['oracle-history-analytics'],
    queryFn: () => fetchOracleHistory({}),
  });

  // Enrich with oracleService stats (cross-database aggregation)
  const { data: serviceStats } = useQuery({
    queryKey: ['oracle-service-stats'],
    queryFn: () => getOracleStats().catch(() => null),
    staleTime: 60_000,
  });

  const metrics = useMemo(() => aggregateByMode(history), [history]);

  const totals = useMemo(() => {
    const totalQueries = history.length;
    const totalCost = history.reduce((a, e) => a + (e.total_cost_usd ?? 0), 0);
    const avgConfidence =
      history.filter((e) => e.confidence_score != null).reduce((a, e) => a + (e.confidence_score ?? 0), 0) /
      Math.max(1, history.filter((e) => e.confidence_score != null).length);
    const avgLatencyS =
      history.reduce((a, e) => a + (e.total_latency_ms ?? 0), 0) / Math.max(1, history.length) / 1000;

    // Find best mode (highest avg confidence with at least 2 queries)
    const eligibleModes = metrics.filter((m) => m.count >= 2);
    const bestMode = eligibleModes.length > 0
      ? eligibleModes.reduce((max, m) => (m.avg_confidence > max.avg_confidence ? m : max))
      : null;

    // Merge with cross-database stats from oracleService if available
    const totalTokens = serviceStats?.totalTokens ?? history.reduce((a, e) => a + (e.total_tokens ?? 0), 0);
    return { totalQueries, totalCost, avgConfidence, avgLatencyS, bestMode, totalTokens };
  }, [history, metrics, serviceStats]);

  return (
    <Card className="p-8 bg-card border-border rounded-3xl shadow-sm relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/[0.02] rounded-full -translate-y-1/2 translate-x-1/2" />
      
      <div className="flex items-center justify-between mb-8 relative">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/15">
            <BarChart3 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">Oracle Analytics</h3>
            <p className="text-xs text-muted-foreground max-w-lg leading-relaxed">
              Métricas consolidadas de performance e custo acumulado do conselho de especialistas.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
        </div>
      ) : history.length === 0 ? (
        <div className="py-20 text-center opacity-40">
          <Target className="h-12 w-12 mx-auto mb-4" />
          <p className="text-sm font-bold uppercase tracking-widest">Sem Dados Operacionais</p>
          <p className="text-xs text-muted-foreground mt-1">As métricas surgirão após a primeira sessão do conselho.</p>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-700">
          {/* Top stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: <Activity className="h-4 w-4" />, label: 'Sessões', value: totals.totalQueries, cls: 'text-primary' },
              { icon: <DollarSign className="h-4 w-4" />, label: 'Custo Total', value: `$${totals.totalCost.toFixed(4)}`, cls: 'text-nexus-emerald' },
              { icon: <TrendingUp className="h-4 w-4" />, label: 'Confiança', value: `${totals.avgConfidence.toFixed(0)}%`, cls: 'text-nexus-purple' },
              { icon: <Clock className="h-4 w-4" />, label: 'Latência', value: `${totals.avgLatencyS.toFixed(1)}s`, cls: 'text-nexus-amber' },
            ].map(stat => (
              <Card key={stat.label} className="p-4 bg-secondary/20 border-border/40 text-center">
                <div className="flex justify-center mb-1.5 opacity-60">{stat.icon}</div>
                <p className={`text-sm font-extrabold ${stat.cls}`}>{stat.value}</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{stat.label}</p>
              </Card>
            ))}
          </div>

          {/* Best mode highlight */}
          {totals.bestMode && (
            <Card className="p-6 bg-primary/5 border-primary/20 rounded-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Award className="h-12 w-12" />
              </div>
              <div className="flex items-center gap-4 relative">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Trophy className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold text-primary uppercase tracking-widest">Configuração com Maior Acurácia</p>
                  <p className="text-lg font-bold text-foreground">
                    {ORACLE_MODES[totals.bestMode.mode as OracleMode]?.icon}{' '}
                    {ORACLE_MODES[totals.bestMode.mode as OracleMode]?.label ?? totals.bestMode.mode}
                    <span className="text-[11px] text-primary font-mono ml-3 px-2 py-0.5 rounded bg-primary/10">
                      {totals.bestMode.avg_confidence.toFixed(0)}% AVG Confiança
                    </span>
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Per-mode breakdown */}
          <Card className="p-6 rounded-2xl border-border/60 bg-card/60">
            <h4 className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest mb-6 px-1 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-primary" /> Performance por Algoritmo
            </h4>
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-3 px-2 font-bold text-muted-foreground uppercase tracking-tighter">Modo Operacional</th>
                    <th className="text-right py-3 px-2 font-bold text-muted-foreground uppercase tracking-tighter">Sessões</th>
                    <th className="text-right py-3 px-2 font-bold text-muted-foreground uppercase tracking-tighter">Confiança</th>
                    <th className="text-right py-3 px-2 font-bold text-muted-foreground uppercase tracking-tighter">Custo</th>
                    <th className="text-right py-3 px-2 font-bold text-muted-foreground uppercase tracking-tighter">Latência</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => {
                    const modeInfo = ORACLE_MODES[m.mode as OracleMode];
                    return (
                      <tr key={m.mode} className="border-b border-border/10 hover:bg-secondary/40 transition-colors group">
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg group-hover:scale-110 transition-transform">{modeInfo?.icon ?? '❓'}</span>
                            <span className="font-bold text-foreground">{modeInfo?.label ?? m.mode}</span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-2 font-mono font-bold opacity-60">{m.count}</td>
                        <td className="text-right py-3 px-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] font-bold px-2 rounded-lg border-none"
                            style={{
                              backgroundColor:
                                m.avg_confidence >= 80 ? 'hsl(var(--nexus-emerald) / 0.15)' :
                                m.avg_confidence >= 60 ? 'hsl(var(--nexus-yellow) / 0.15)' : 'hsl(var(--nexus-red) / 0.15)',
                              color:
                                m.avg_confidence >= 80 ? 'hsl(var(--nexus-emerald))' :
                                m.avg_confidence >= 60 ? 'hsl(var(--nexus-yellow))' : 'hsl(var(--nexus-red))',
                            }}
                          >
                            {m.avg_confidence.toFixed(0)}%
                          </Badge>
                        </td>
                        <td className="text-right py-3 px-2 font-mono font-bold text-foreground/80">
                          ${m.total_cost.toFixed(4)}
                        </td>
                        <td className="text-right py-3 px-2 font-mono font-bold text-nexus-amber">
                          {m.avg_latency_s.toFixed(1)}s
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
