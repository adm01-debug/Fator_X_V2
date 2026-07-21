/**
 * AgentMetricsPage — dashboard consumindo `agent_daily_metrics`.
 *
 * - Gráficos de tokens, custo e latência p95 por agente/dia
 * - Regras de alerta configuráveis para custo e p95 com notificações toast
 * - Score de maturidade (Prototype / Tested / Production-ready) por agente
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, BellRing, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { LightBarChart, LightLineChart } from '@/components/charts';
import { EmptyState } from '@/components/shared/EmptyState';
import { useAgentDailyMetrics } from '@/hooks/useAgentDailyMetrics';
import type { AgentDailyMetricWithName } from '@/services/agentDailyMetricsService';
import { computeMaturity, maturityLabel, maturityTone } from '@/lib/maturityScore';
import {
  defaultMetricRules, evaluateMetricRules, formatMetricValue, loadMetricRules, saveMetricRules,
  METRIC_LABELS,
  type MetricAlertRule, type MetricRuleMetric, type MetricRuleOperator, type MetricRuleSeverity,
} from '@/lib/metricsAlertRules';
import { KnowledgeGraphHealthCard } from '@/components/metrics/KnowledgeGraphHealthCard';
import { useCurrentWorkspace } from '@/hooks/useCurrentWorkspace';

type DayKey = string;

interface DailySeriesRow {
  day: DayKey;
  label: string;
  [agentSeriesKey: string]: number | string;
}

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#84cc16'];

function toDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function buildSeriesByAgent(
  rows: AgentDailyMetricWithName[],
  valueOf: (r: AgentDailyMetricWithName) => number,
): { data: DailySeriesRow[]; series: { dataKey: string; name: string; color: string; stroke: string }[] } {
  const agents = new Map<string, string>();
  for (const r of rows) agents.set(r.agent_id, r.agent_name);
  const days = Array.from(new Set(rows.map((r) => r.day.slice(0, 10)))).sort();

  const data: DailySeriesRow[] = days.map((day) => {
    const row: DailySeriesRow = { day, label: toDayLabel(day) };
    for (const [agentId] of agents) row[`a_${agentId}`] = 0;
    return row;
  });
  const idx = new Map(data.map((d, i) => [d.day, i]));

  for (const r of rows) {
    const i = idx.get(r.day.slice(0, 10));
    if (i == null) continue;
    data[i][`a_${r.agent_id}`] = valueOf(r);
  }

  const agentIds = Array.from(agents.keys());
  const series = agentIds.map((id, i) => ({
    dataKey: `a_${id}`,
    name: agents.get(id) || 'Agente',
    color: PALETTE[i % PALETTE.length],
    stroke: PALETTE[i % PALETTE.length],
  }));

  return { data, series };
}

export default function AgentMetricsPage() {
  const [days, setDays] = useState<number>(30);
  const { data: rows = [], isLoading, isError, refetch } = useAgentDailyMetrics({ days });
  const { workspaceId } = useCurrentWorkspace();

  const [rules, setRules] = useState<MetricAlertRule[]>(() => loadMetricRules());
  useEffect(() => { saveMetricRules(rules); }, [rules]);

  const violations = useMemo(() => evaluateMetricRules(rows, rules), [rows, rules]);

  // Notificações — dispara toast ao encontrar novas violações
  const notifiedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const v of violations) {
      const key = `${v.rule.id}:${v.agent_id}:${v.day}`;
      if (notifiedRef.current.has(key)) continue;
      notifiedRef.current.add(key);
      const msg = `${v.agent_name} — ${v.rule.name}: ${formatMetricValue(v.rule.metric, v.value)}`;
      if (v.rule.severity === 'critical') toast.error(msg);
      else if (v.rule.severity === 'warning') toast.warning(msg);
      else toast(msg);
    }
  }, [violations]);

  // Agregações por agente para maturidade
  const perAgent = useMemo(() => {
    const map = new Map<string, AgentDailyMetricWithName[]>();
    for (const r of rows) {
      const arr = map.get(r.agent_id) ?? [];
      arr.push(r);
      map.set(r.agent_id, arr);
    }
    return Array.from(map.entries()).map(([id, list]) => ({
      agent_id: id,
      agent_name: list[0].agent_name,
      maturity: computeMaturity(list),
    })).sort((a, b) => b.maturity.score - a.maturity.score);
  }, [rows]);

  // Séries dos 3 gráficos
  const tokens = useMemo(() => buildSeriesByAgent(rows, (r) => r.total_tokens), [rows]);
  const cost = useMemo(() => buildSeriesByAgent(rows, (r) => Number(r.total_cost_usd.toFixed(6))), [rows]);
  const p95 = useMemo(() => buildSeriesByAgent(rows, (r) => r.p95_latency_ms), [rows]);

  const totals = useMemo(() => {
    const execs = rows.reduce((s, r) => s + r.executions, 0);
    const errs = rows.reduce((s, r) => s + r.errors, 0);
    return {
      executions: execs,
      totalCost: rows.reduce((s, r) => s + r.total_cost_usd, 0),
      totalTokens: rows.reduce((s, r) => s + r.total_tokens, 0),
      errorRate: execs > 0 ? errs / execs : 0,
      maxP95: rows.length ? Math.max(...rows.map((r) => r.p95_latency_ms)) : 0,
    };
  }, [rows]);

  const addRule = () => {
    const r: MetricAlertRule = {
      id: `r-${Date.now()}`,
      name: 'Nova regra',
      metric: 'total_cost_usd',
      operator: '>',
      threshold: 1,
      severity: 'warning',
      enabled: true,
    };
    setRules((prev) => [r, ...prev]);
  };
  const updateRule = (id: string, patch: Partial<MetricAlertRule>) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRule = (id: string) => setRules((prev) => prev.filter((r) => r.id !== id));

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Métricas Diárias por Agente"
        description="Tokens, custo e latência p95 consolidados a partir de agent_daily_metrics."
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="14">Últimos 14 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => refetch()}>Atualizar</Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Execuções" value={totals.executions.toLocaleString('pt-BR')} />
        <KpiCard label="Tokens" value={totals.totalTokens.toLocaleString('pt-BR')} />
        <KpiCard label="Custo total" value={`$${totals.totalCost.toFixed(4)}`} />
        <KpiCard label="p95 máx." value={`${Math.round(totals.maxP95)}ms`} />
        <KpiCard label="Taxa de erros" value={`${(totals.errorRate * 100).toFixed(2)}%`} />
      </div>

      {isLoading ? (
        <div className="grid gap-4"><Skeleton className="h-72 w-full" /><Skeleton className="h-72 w-full" /></div>
      ) : isError ? (
        <EmptyState title="Falha ao carregar métricas" description="Não foi possível consultar agent_daily_metrics." />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sem dados no período"
          description="Nenhuma execução registrada em agent_traces nesta janela. Ajuste o período ou execute agentes."
        />
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle>Tokens por agente / dia</CardTitle></CardHeader>
            <CardContent>
              <LightBarChart
                data={tokens.data}
                xKey="label"
                series={tokens.series.map((s) => ({ dataKey: s.dataKey, name: s.name, color: s.color }))}
                height={280}
                yFormatter={(v) => v.toLocaleString('pt-BR')}
                showLegend
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Custo (USD) por agente / dia</CardTitle></CardHeader>
              <CardContent>
                <LightLineChart
                  data={cost.data}
                  xKey="label"
                  series={cost.series.map((s) => ({ dataKey: s.dataKey, name: s.name, stroke: s.stroke, strokeWidth: 2 }))}
                  height={260}
                  yFormatter={(v) => `$${v.toFixed(2)}`}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Latência p95 (ms) por agente / dia</CardTitle></CardHeader>
              <CardContent>
                <LightLineChart
                  data={p95.data}
                  xKey="label"
                  series={p95.series.map((s) => ({ dataKey: s.dataKey, name: s.name, stroke: s.stroke, strokeWidth: 2 }))}
                  height={260}
                  yFormatter={(v) => `${Math.round(v)}ms`}
                />
              </CardContent>
            </Card>
          </div>

          {/* Maturidade */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Maturidade de produção por agente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {perAgent.length === 0 ? (
                <p className="text-meta text-muted-foreground">Sem agentes no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-body-sm">
                    <thead className="text-muted-foreground text-meta">
                      <tr className="border-b border-border">
                        <th className="py-2 text-left">Agente</th>
                        <th className="py-2 text-right">Execuções</th>
                        <th className="py-2 text-right">Erros</th>
                        <th className="py-2 text-right">p95</th>
                        <th className="py-2 text-right">Custo/exec</th>
                        <th className="py-2 text-right">Score</th>
                        <th className="py-2 text-left pl-4">Nível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perAgent.map((a) => {
                        const m = a.maturity;
                        const tone = maturityTone(m.level);
                        return (
                          <tr key={a.agent_id} className="border-b border-border/50 hover:bg-secondary/30">
                            <td className="py-2 font-medium">{a.agent_name}</td>
                            <td className="py-2 text-right">{m.executions.toLocaleString('pt-BR')}</td>
                            <td className="py-2 text-right">{(m.errorRate * 100).toFixed(2)}%</td>
                            <td className="py-2 text-right">{Math.round(m.p95Latency)}ms</td>
                            <td className="py-2 text-right">${m.costPerExec.toFixed(4)}</td>
                            <td className="py-2 text-right font-semibold">{m.score}/100</td>
                            <td className="py-2 pl-4">
                              <Badge
                                variant={tone === 'success' ? 'default' : tone === 'warning' ? 'secondary' : 'outline'}
                                title={m.reasons.join(' · ')}
                              >
                                {maturityLabel(m.level)}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Autograph: saúde do knowledge graph */}
      <KnowledgeGraphHealthCard workspaceId={workspaceId} />

      {/* Regras de alerta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-primary" />
              Regras de alerta — custo, p95 e erros
            </span>
            <Button size="sm" onClick={addRule}><Plus className="h-3.5 w-3.5 mr-1" /> Nova regra</Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.length === 0 ? (
            <div className="flex items-center justify-between">
              <p className="text-meta text-muted-foreground">Sem regras. Restaurar padrão?</p>
              <Button size="sm" variant="outline" onClick={() => setRules(defaultMetricRules())}>Restaurar padrão</Button>
            </div>
          ) : rules.map((r) => (
            <div key={r.id} className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr_.6fr_1fr_.8fr_auto_auto] gap-2 items-center rounded-lg border border-border p-3">
              <input
                value={r.name}
                onChange={(e) => updateRule(r.id, { name: e.target.value })}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-body-sm"
              />
              <Select value={r.metric} onValueChange={(v) => updateRule(r.id, { metric: v as MetricRuleMetric })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(METRIC_LABELS) as MetricRuleMetric[]).map((k) => (
                    <SelectItem key={k} value={k}>{METRIC_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={r.operator} onValueChange={(v) => updateRule(r.id, { operator: v as MetricRuleOperator })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value=">">&gt;</SelectItem>
                  <SelectItem value=">=">&gt;=</SelectItem>
                  <SelectItem value="<">&lt;</SelectItem>
                  <SelectItem value="<=">&lt;=</SelectItem>
                </SelectContent>
              </Select>
              <input
                type="number"
                step="0.01"
                value={r.threshold}
                onChange={(e) => updateRule(r.id, { threshold: Number(e.target.value) })}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-body-sm"
              />
              <Select value={r.severity} onValueChange={(v) => updateRule(r.id, { severity: v as MetricRuleSeverity })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 justify-end">
                <Switch checked={r.enabled} onCheckedChange={(v) => updateRule(r.id, { enabled: v })} />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeRule(r.id)} className="text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {violations.length > 0 && (
            <div className="mt-4 rounded-lg border border-warning/40 bg-warning/5 p-3">
              <p className="text-body-sm font-semibold flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                {violations.length} violação(ões) no período
              </p>
              <ul className="space-y-1 text-meta text-muted-foreground max-h-48 overflow-auto">
                {violations.slice(0, 30).map((v, i) => (
                  <li key={i}>
                    <span className="font-medium text-foreground">{v.agent_name}</span> · {toDayLabel(v.day)} ·{' '}
                    <span className="text-foreground">{v.rule.name}</span> ={' '}
                    {formatMetricValue(v.rule.metric, v.value)}{' '}
                    <Badge variant={v.rule.severity === 'critical' ? 'destructive' : 'outline'} className="ml-1 text-meta">
                      {v.rule.severity}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-meta text-muted-foreground">{label}</p>
        <p className="text-heading-md font-heading font-semibold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
