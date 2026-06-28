import { useMemo, useState } from "react";
import { LightAreaChart, LightBarChart, ComparisonToggle, generateComparisonData } from "@/components/charts";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { TooltipExtraSection } from "@/components/charts/types";

interface UsageRow {
  date: string;
  requests: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  total_cost_usd: number | null;
  avg_latency_ms: number | null;
  error_count?: number | null;
}

interface UsageChartsProps {
  data: UsageRow[];
}

function buildDailyMap(data: UsageRow[]) {
  const map = new Map<string, {
    requests: number;
    tokensIn: number;
    tokensOut: number;
    cost: number;
    latency: number;
    latencyCount: number;
    errors: number;
  }>();

  for (const row of data) {
    const key = row.date;
    const existing = map.get(key) ?? { requests: 0, tokensIn: 0, tokensOut: 0, cost: 0, latency: 0, latencyCount: 0, errors: 0 };
    existing.requests += row.requests ?? 0;
    existing.tokensIn += row.tokens_input ?? 0;
    existing.tokensOut += row.tokens_output ?? 0;
    existing.cost += Number(row.total_cost_usd ?? 0);
    if (row.avg_latency_ms) {
      existing.latency += row.avg_latency_ms;
      existing.latencyCount += 1;
    }
    existing.errors += row.error_count ?? 0;
    map.set(key, existing);
  }

  return map;
}

export function UsageCharts({ data }: UsageChartsProps) {
  const navigate = useNavigate();
  const [compareRequests, setCompareRequests] = useState(false);
  const [compareCost, setCompareCost] = useState(false);

  const chartData = useMemo(() => {
    const today = new Date();
    const start = subDays(today, 29);
    const days = eachDayOfInterval({ start, end: today });
    const map = buildDailyMap(data);

    return days.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      const entry = map.get(key);
      return {
        date: key,
        label: format(d, "dd MMM", { locale: ptBR }),
        requests: entry?.requests ?? 0,
        tokensIn: entry?.tokensIn ?? 0,
        tokensOut: entry?.tokensOut ?? 0,
        cost: Number((entry?.cost ?? 0).toFixed(4)),
        latency: entry?.latencyCount ? Math.round(entry.latency / entry.latencyCount) : 0,
        errors: entry?.errors ?? 0,
      };
    });
  }, [data]);

  // Comparison data: shift 15 days back
  const requestsData = useMemo(
    () => compareRequests ? generateComparisonData(chartData, ['requests'], 15) : chartData,
    [chartData, compareRequests]
  );

  const costData = useMemo(
    () => compareCost ? generateComparisonData(chartData, ['cost'], 15) : chartData,
    [chartData, compareCost]
  );

  // Auto-detect peak day for annotation
  const peakRequestIdx = useMemo(() => {
    let maxIdx = 0, maxVal = 0;
    chartData.forEach((d, i) => {
      if (d.requests > maxVal) { maxVal = d.requests; maxIdx = i; }
    });
    return maxVal > 0 ? maxIdx : -1;
  }, [chartData]);

  const peakCostIdx = useMemo(() => {
    let maxIdx = 0, maxVal = 0;
    chartData.forEach((d, i) => {
      if (d.cost > maxVal) { maxVal = d.cost; maxIdx = i; }
    });
    return maxVal > 0 ? maxIdx : -1;
  }, [chartData]);

  const hasData = data.length > 0 && chartData.some(d => d.requests > 0 || d.cost > 0);

  if (!hasData) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {['Requests & Erros', 'Custo USD', 'Latência média', 'Tokens'].map(title => (
          <div key={title} className="nexus-card">
            <h3 className="text-title-sm text-foreground mb-4">
              {title} <span className="text-muted-foreground font-normal">(30 dias)</span>
            </h3>
            <div className="flex flex-col items-center justify-center h-[220px] text-center">
              <div className="h-12 w-12 rounded-xl bg-muted/20 flex items-center justify-center mb-3">
                <span className="text-2xl opacity-40" aria-hidden="true">📊</span>
              </div>
              <p className="text-body-sm text-muted-foreground">Sem dados neste período</p>
              <p className="text-meta text-muted-foreground/60 mt-1">Os dados aparecerão quando seus agentes processarem requisições</p>

            </div>
          </div>
        ))}
      </div>
    );
  }

  const handleDrilldown = (d: any) => {
    const from = new Date(d.date);
    from.setHours(0, 0, 0, 0);
    const to = new Date(d.date);
    to.setHours(23, 59, 59, 999);
    navigate(`/traces?from=${from.toISOString()}&to=${to.toISOString()}`);
  };

  const drilldownExtras = (d: any) => {
    const sections: TooltipExtraSection[] = [];
    if (d.requests > 0 || d.errors > 0 || d.cost > 0) {
      sections.push({
        title: "Ações Rápidas",
        rows: [
          { label: "Ver Traces", value: "Clique para inspecionar", color: "hsl(var(--primary))" }
        ]
      });
    }
    return sections;
  };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Requests & Errors Elevated */}
      <div className="nexus-card bg-card/50 border-border/40 p-8 rounded-[2.5rem] shadow-lg shadow-primary/[0.02] hover:shadow-2xl hover:shadow-primary/[0.05] transition-all duration-500">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-1">
            <h3 className="text-title-sm font-black text-foreground uppercase tracking-tight">
              Requests &amp; Erros
            </h3>
            <p className="text-meta font-bold text-muted-foreground uppercase tracking-widest">Neural Load Tracking</p>
          </div>
          <ComparisonToggle enabled={compareRequests} onToggle={setCompareRequests} label="vs anterior" />
        </div>
        <LightAreaChart
          data={requestsData}
          xKey="label"
          height={240}
          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          showLegend
          onPointClick={handleDrilldown}
          tooltipExtras={drilldownExtras}
          series={[
            { dataKey: "requests", name: "Requests", stroke: "hsl(var(--primary))", gradientFrom: "hsl(var(--primary))", strokeWidth: 3 },
            { dataKey: "errors", name: "Erros", stroke: "#f43f5e", gradientFrom: "#f43f5e", strokeWidth: 2 },
            ...(compareRequests ? [{ dataKey: "prev_requests", name: "Anterior", stroke: "hsl(var(--muted-foreground))", gradientFrom: "hsl(var(--muted-foreground))", strokeWidth: 1.5 }] : []),
          ]}
        />
        {peakRequestIdx >= 0 && (
          <div className="mt-6 flex items-center justify-between pt-4 border-t border-border/10">
            <p className="text-meta font-bold text-muted-foreground flex items-center gap-2 uppercase tracking-widest">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
              Pico: {chartData[peakRequestIdx]?.label}
            </p>
            <Badge variant="outline" className="text-meta font-black border-primary/20 text-primary">{chartData[peakRequestIdx]?.requests} Req</Badge>
          </div>
        )}
      </div>

      {/* Cost Elevated */}
      <div className="nexus-card bg-card/50 border-border/40 p-8 rounded-[2.5rem] shadow-lg shadow-primary/[0.02] hover:shadow-2xl hover:shadow-primary/[0.05] transition-all duration-500">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-1">
            <h3 className="text-title-sm font-black text-foreground uppercase tracking-tight">
              Cloud Cost USD
            </h3>
            <p className="text-meta font-bold text-muted-foreground uppercase tracking-widest">Budget Utilization</p>
          </div>
          <ComparisonToggle enabled={compareCost} onToggle={setCompareCost} label="vs anterior" />
        </div>
        <LightBarChart
          data={costData}
          xKey="label"
          height={240}
          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          yFormatter={(v) => `$${v}`}
          tooltipFormatter={(v) => `$${v.toFixed(4)}`}
          showLegend={compareCost}
          onBarClick={handleDrilldown}
          series={[
            { dataKey: "cost", name: "Custo", color: "hsl(var(--primary))", radius: 6 },
            ...(compareCost ? [{ dataKey: "prev_cost", name: "Anterior", color: "hsl(var(--muted-foreground))", radius: 6 }] : []),
          ]}
        />
        {peakCostIdx >= 0 && (
          <div className="mt-6 flex items-center justify-between pt-4 border-t border-border/10">
            <p className="text-meta font-bold text-muted-foreground flex items-center gap-2 uppercase tracking-widest">
              <span className="h-2 w-2 rounded-full bg-nexus-amber shadow-[0_0_8px_rgba(var(--nexus-amber),0.5)]" />
              Pico: {chartData[peakCostIdx]?.label}
            </p>
            <Badge variant="outline" className="text-meta font-black border-nexus-amber/20 text-nexus-amber">${chartData[peakCostIdx]?.cost}</Badge>
          </div>
        )}
      </div>

      {/* Latency Elevated */}
      <div className="nexus-card bg-card/50 border-border/40 p-8 rounded-[2.5rem] shadow-lg shadow-primary/[0.02] hover:shadow-2xl hover:shadow-primary/[0.05] transition-all duration-500">
        <div className="space-y-1 mb-8">
          <h3 className="text-title-sm font-black text-foreground uppercase tracking-tight">
            Latência Média
          </h3>
          <p className="text-meta font-bold text-muted-foreground uppercase tracking-widest">Cognitive Delay ms</p>
        </div>
        <LightAreaChart
          data={chartData}
          xKey="label"
          height={240}
          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          yFormatter={(v) => `${v}ms`}
          tooltipFormatter={(v) => `${v}ms`}
          onPointClick={handleDrilldown}
          tooltipExtras={drilldownExtras}
          series={[
            { dataKey: "latency", name: "Latência", stroke: "#f59e0b", gradientFrom: "#f59e0b", strokeWidth: 3 },
          ]}
        />
      </div>

      {/* Tokens Elevated */}
      <div className="nexus-card bg-card/50 border-border/40 p-8 rounded-[2.5rem] shadow-lg shadow-primary/[0.02] hover:shadow-2xl hover:shadow-primary/[0.05] transition-all duration-500">
        <div className="space-y-1 mb-8">
          <h3 className="text-title-sm font-black text-foreground uppercase tracking-tight">
            Vazão de Tokens
          </h3>
          <p className="text-meta font-bold text-muted-foreground uppercase tracking-widest">Neural Processing Units</p>
        </div>
        <LightBarChart
          data={chartData}
          xKey="label"
          height={240}
          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          yFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          showLegend
          onBarClick={handleDrilldown}
          series={[
            { dataKey: "tokensIn", name: "Input", color: "hsl(var(--primary))", radius: 6, stackId: "tokens" },
            { dataKey: "tokensOut", name: "Output", color: "#8b5cf6", radius: 6, stackId: "tokens" },
          ]}
        />
      </div>
    </div>
  );
}
