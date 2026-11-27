/**
 * alertRulesService — persistência de regras de alerta por agente.
 *
 * Fonte da verdade: public.alert_rules (RLS por workspace). O localStorage
 * continua como cache de leitura para render imediato e para modo offline;
 * toda escrita vai para o banco e so depois atualiza o cache.
 *
 * Funcoes puras de avaliacao e simulacao sobre traces ficam em @/lib/alertMetrics.
 */
import { supabase } from '@/integrations/supabase/client';
import type { AgentTraceRow } from '@/services/agentTracesService';
import {
  computeMetric, compare, formatMetricValue, METRIC_CATALOG,
  type AlertMetric, type AlertAggregation,
} from '@/lib/alertMetrics';

export type AlertOperator = '>' | '<' | '>=' | '<=' | '==';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertChannel = 'toast' | 'email' | 'webhook';
export type AlertWindowMin = 5 | 15 | 60 | 1440;

export interface AlertRule {
  id: string;
  agent_id: string;
  workspace_id: string | null;
  name: string;
  description?: string;
  metric: AlertMetric;
  aggregation: AlertAggregation;
  operator: AlertOperator;
  threshold: number;
  window_minutes: AlertWindowMin;
  severity: AlertSeverity;
  channels: AlertChannel[];
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface RuleEvaluation {
  value: number;
  triggers: boolean;
  formatted: string;
  formattedThreshold: string;
}

export interface RuleSimulationBucket {
  ts: string;
  hour: string;
  value: number;
  triggered: boolean;
  trace_ids: string[];
}

export interface RuleSimulation {
  buckets: RuleSimulationBucket[];
  triggers: number;
  first_trigger?: string;
  last_trigger?: string;
  max_value: number;
}

const STORAGE_PREFIX = 'nexus.alert_rules';
const TABLE = 'alert_rules';

function storageKey(workspaceId: string | null, agentId: string): string {
  return `${STORAGE_PREFIX}.${workspaceId ?? 'local'}.${agentId}`;
}

function readCache(workspaceId: string | null, agentId: string): AlertRule[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId, agentId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AlertRule[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache(workspaceId: string | null, agentId: string, rules: AlertRule[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(workspaceId, agentId), JSON.stringify(rules));
  } catch {
    // cota cheia / modo privado: o banco ja tem a verdade
  }
}

function toRow(rule: AlertRule, workspaceId: string | null) {
  return {
    id: rule.id,
    agent_id: rule.agent_id,
    workspace_id: workspaceId,
    name: rule.name,
    description: rule.description ?? null,
    metric: rule.metric,
    aggregation: rule.aggregation,
    operator: rule.operator,
    threshold: rule.threshold,
    window_minutes: rule.window_minutes,
    severity: rule.severity,
    channels: rule.channels,
    is_enabled: rule.is_enabled,
  };
}

function fromRow(row: Record<string, unknown>): AlertRule {
  return {
    id: String(row.id),
    agent_id: String(row.agent_id ?? ''),
    workspace_id: (row.workspace_id as string | null) ?? null,
    name: String(row.name ?? ''),
    description: (row.description as string | undefined) ?? undefined,
    metric: row.metric as AlertMetric,
    aggregation: (row.aggregation as AlertAggregation) ?? 'avg',
    operator: row.operator as AlertOperator,
    threshold: Number(row.threshold ?? 0),
    window_minutes: Number(row.window_minutes ?? 60) as AlertWindowMin,
    severity: (row.severity as AlertSeverity) ?? 'warning',
    channels: (row.channels as AlertChannel[] | null) ?? ['toast'],
    is_enabled: Boolean(row.is_enabled),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

export const alertRulesService = {
  /** Cache sincrono — pinta a tela antes da resposta do banco. */
  peek(workspaceId: string | null, agentId: string): AlertRule[] {
    return readCache(workspaceId, agentId);
  },

  async list(workspaceId: string | null, agentId: string): Promise<AlertRule[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });
    if (error) {
      // Sem rede ou RLS negando: serve o cache em vez de esconder as regras.
      return readCache(workspaceId, agentId);
    }
    const rules = (data ?? []).map((r) => fromRow(r as Record<string, unknown>));
    writeCache(workspaceId, agentId, rules);
    return rules;
  },

  async upsert(workspaceId: string | null, agentId: string, rule: AlertRule): Promise<AlertRule> {
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(toRow(rule, workspaceId), { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    const saved = data ? fromRow(data as Record<string, unknown>) : rule;
    const cached = readCache(workspaceId, agentId).filter((r) => r.id !== saved.id);
    writeCache(workspaceId, agentId, [saved, ...cached]);
    return saved;
  },

  async remove(workspaceId: string | null, agentId: string, id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
    writeCache(workspaceId, agentId, readCache(workspaceId, agentId).filter((r) => r.id !== id));
  },

  async toggle(
    workspaceId: string | null,
    agentId: string,
    id: string,
    enabled: boolean,
  ): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .update({ is_enabled: enabled })
      .eq('id', id);
    if (error) throw error;
    const cache = readCache(workspaceId, agentId);
    const r = cache.find((x) => x.id === id);
    if (r) {
      r.is_enabled = enabled;
      writeCache(workspaceId, agentId, cache);
    }
  },
};

/* ─────────────── Templates ─────────────── */

export const ALERT_RULE_TEMPLATES: Array<Omit<AlertRule, 'id' | 'agent_id' | 'workspace_id' | 'created_at' | 'updated_at'>> = [
  {
    name: 'Latência p95 alta',
    description: 'Dispara quando o p95 de latência ultrapassa 800ms na janela.',
    metric: 'latency_ms', aggregation: 'p95', operator: '>', threshold: 800,
    window_minutes: 5, severity: 'warning', channels: ['toast'], is_enabled: true,
  },
  {
    name: 'Custo por execução estourado',
    description: 'Alguma execução custou mais do que $0.05.',
    metric: 'cost_per_exec', aggregation: 'max', operator: '>', threshold: 0.05,
    window_minutes: 60, severity: 'warning', channels: ['toast'], is_enabled: true,
  },
  {
    name: 'Tool failure rate crítico',
    description: 'Mais de 10% das chamadas de tools falharam.',
    metric: 'tool_failure_rate', aggregation: 'rate', operator: '>', threshold: 10,
    window_minutes: 60, severity: 'critical', channels: ['toast'], is_enabled: true,
  },
  {
    name: 'Memória excedida',
    description: 'Pico de memória ultrapassou 800MB.',
    metric: 'memory_mb', aggregation: 'max', operator: '>', threshold: 800,
    window_minutes: 5, severity: 'info', channels: ['toast'], is_enabled: true,
  },
];

export function makeRuleFromTemplate(
  tpl: typeof ALERT_RULE_TEMPLATES[number],
  agentId: string,
  workspaceId: string | null,
): AlertRule {
  const now = new Date().toISOString();
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `rule-${Date.now()}`,
    agent_id: agentId,
    workspace_id: workspaceId,
    created_at: now,
    updated_at: now,
    ...tpl,
  };
}

/* ─────────────── Evaluation ─────────────── */

function filterByWindow(traces: AgentTraceRow[], windowMin: AlertWindowMin): AgentTraceRow[] {
  const cutoff = Date.now() - windowMin * 60_000;
  return traces.filter((t) => +new Date(t.created_at) >= cutoff);
}

export function evaluateRule(rule: AlertRule, traces: AgentTraceRow[]): RuleEvaluation {
  const window = filterByWindow(traces, rule.window_minutes);
  const value = computeMetric(rule.metric, rule.aggregation, window);
  return {
    value,
    triggers: compare(value, rule.operator, rule.threshold),
    formatted: formatMetricValue(rule.metric, value),
    formattedThreshold: formatMetricValue(rule.metric, rule.threshold),
  };
}

/**
 * Walks the last 24h in fixed buckets (default 60min), computing the metric
 * inside each bucket and flagging those that would trigger.
 */
export function simulateRule24h(
  rule: AlertRule,
  traces: AgentTraceRow[],
  bucketMinutes = 60,
): RuleSimulation {
  const now = Date.now();
  const horizon = now - 24 * 60 * 60_000;
  const bucketMs = bucketMinutes * 60_000;
  const buckets: RuleSimulationBucket[] = [];
  let triggers = 0;
  let first: string | undefined;
  let last: string | undefined;
  let maxValue = 0;

  for (let start = horizon; start < now; start += bucketMs) {
    const end = start + bucketMs;
    const inBucket = traces.filter((t) => {
      const ts = +new Date(t.created_at);
      return ts >= start && ts < end;
    });
    const value = computeMetric(rule.metric, rule.aggregation, inBucket);
    const triggered = inBucket.length > 0 && compare(value, rule.operator, rule.threshold);
    if (triggered) {
      triggers++;
      const iso = new Date(start).toISOString();
      if (!first) first = iso;
      last = iso;
    }
    if (value > maxValue) maxValue = value;
    buckets.push({
      ts: new Date(start).toISOString(),
      hour: new Date(start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      value,
      triggered,
      trace_ids: inBucket.slice(0, 5).map((t) => t.id),
    });
  }

  return { buckets, triggers, first_trigger: first, last_trigger: last, max_value: maxValue };
}

export { METRIC_CATALOG };
