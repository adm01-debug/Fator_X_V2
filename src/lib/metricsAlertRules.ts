/**
 * metricsAlertRules — regras configuráveis (localStorage) que avaliam
 * o rollup `agent_daily_metrics` e disparam notificações na UI.
 */
import type { AgentDailyMetricWithName } from '@/services/agentDailyMetricsService';

export type MetricRuleMetric = 'total_cost_usd' | 'p95_latency_ms' | 'total_tokens' | 'error_rate';
export type MetricRuleOperator = '>' | '>=' | '<' | '<=';
export type MetricRuleSeverity = 'info' | 'warning' | 'critical';

export interface MetricAlertRule {
  id: string;
  name: string;
  metric: MetricRuleMetric;
  operator: MetricRuleOperator;
  threshold: number;
  severity: MetricRuleSeverity;
  enabled: boolean;
}

export interface MetricRuleViolation {
  rule: MetricAlertRule;
  agent_id: string;
  agent_name: string;
  day: string;
  value: number;
}

const KEY = 'nexus.metric_alert_rules.v1';

export function loadMetricRules(): MetricAlertRule[] {
  if (typeof window === 'undefined') return defaultMetricRules();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultMetricRules();
    const parsed = JSON.parse(raw) as MetricAlertRule[];
    return Array.isArray(parsed) && parsed.length ? parsed : defaultMetricRules();
  } catch {
    return defaultMetricRules();
  }
}

export function saveMetricRules(rules: MetricAlertRule[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(rules));
}

export function defaultMetricRules(): MetricAlertRule[] {
  return [
    { id: 'r-cost', name: 'Custo diário alto', metric: 'total_cost_usd', operator: '>', threshold: 5, severity: 'warning', enabled: true },
    { id: 'r-p95', name: 'Latência p95 crítica', metric: 'p95_latency_ms', operator: '>', threshold: 2000, severity: 'critical', enabled: true },
    { id: 'r-errors', name: 'Taxa de erros elevada', metric: 'error_rate', operator: '>', threshold: 0.05, severity: 'critical', enabled: true },
  ];
}

function compare(v: number, op: MetricRuleOperator, t: number): boolean {
  switch (op) {
    case '>': return v > t;
    case '>=': return v >= t;
    case '<': return v < t;
    case '<=': return v <= t;
  }
}

function metricValue(row: AgentDailyMetricWithName, metric: MetricRuleMetric): number {
  if (metric === 'error_rate') return row.executions > 0 ? row.errors / row.executions : 0;
  return Number(row[metric as keyof AgentDailyMetricWithName] ?? 0);
}

export function evaluateMetricRules(
  rows: AgentDailyMetricWithName[],
  rules: MetricAlertRule[],
): MetricRuleViolation[] {
  const violations: MetricRuleViolation[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const row of rows) {
      const value = metricValue(row, rule.metric);
      if (compare(value, rule.operator, rule.threshold)) {
        violations.push({ rule, agent_id: row.agent_id, agent_name: row.agent_name, day: row.day, value });
      }
    }
  }
  return violations;
}

export function formatMetricValue(metric: MetricRuleMetric, v: number): string {
  switch (metric) {
    case 'total_cost_usd': return `$${v.toFixed(4)}`;
    case 'p95_latency_ms': return `${Math.round(v)}ms`;
    case 'total_tokens': return v.toLocaleString('pt-BR');
    case 'error_rate': return `${(v * 100).toFixed(1)}%`;
  }
}

export const METRIC_LABELS: Record<MetricRuleMetric, string> = {
  total_cost_usd: 'Custo diário (USD)',
  p95_latency_ms: 'Latência p95 (ms)',
  total_tokens: 'Tokens/dia',
  error_rate: 'Taxa de erros',
};
