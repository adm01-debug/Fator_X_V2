/**
 * agentDailyMetricsService — consulta a view `agent_daily_metrics`
 * (rollup diário por agente: tokens, custo, p95 de latência, erros).
 */
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';

export interface AgentDailyMetric {
  agent_id: string;
  day: string; // ISO
  executions: number;
  errors: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  total_tokens: number;
  total_cost_usd: number;
}

export interface AgentDailyMetricWithName extends AgentDailyMetric {
  agent_name: string;
}

export interface FetchDailyMetricsOptions {
  days?: number;         // default 30
  agentId?: string | null;
}

export async function fetchAgentDailyMetrics(
  opts: FetchDailyMetricsOptions = {},
): Promise<AgentDailyMetricWithName[]> {
  const days = Math.max(1, Math.min(90, opts.days ?? 30));
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();

  try {
    let query = supabaseExternal
      .from('agent_daily_metrics')
      .select('agent_id, day, executions, errors, avg_latency_ms, p95_latency_ms, total_tokens, total_cost_usd')
      .gte('day', since)
      .order('day', { ascending: true });

    if (opts.agentId) query = query.eq('agent_id', opts.agentId);

    const { data, error } = await query;
    if (error) {
      logger.error('fetchAgentDailyMetrics failed', { error: error.message });
      return [];
    }

    const rows = (data ?? []) as AgentDailyMetric[];
    const ids = Array.from(new Set(rows.map((r) => r.agent_id)));
    if (ids.length === 0) return [];

    const { data: agents } = await supabaseExternal
      .from('agents')
      .select('id, name')
      .in('id', ids);

    const nameMap = new Map<string, string>();
    for (const a of (agents ?? []) as Array<{ id: string; name: string }>) {
      nameMap.set(a.id, a.name);
    }

    return rows.map((r) => ({
      ...r,
      total_tokens: Number(r.total_tokens ?? 0),
      total_cost_usd: Number(r.total_cost_usd ?? 0),
      avg_latency_ms: Number(r.avg_latency_ms ?? 0),
      p95_latency_ms: Number(r.p95_latency_ms ?? 0),
      executions: Number(r.executions ?? 0),
      errors: Number(r.errors ?? 0),
      agent_name: nameMap.get(r.agent_id) ?? 'Agente desconhecido',
    }));
  } catch (e) {
    logger.error('fetchAgentDailyMetrics crashed', { error: String(e) });
    return [];
  }
}
