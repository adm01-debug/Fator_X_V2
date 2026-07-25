/**
 * Skillbook Audit Service
 * Consolida a trilha de auditoria de skills aprendidas (self-evolution) e instaladas (registry),
 * correlacionando com métricas de execução do agente.
 */
import { supabaseExternal } from '@/integrations/supabase/externalClient';

export interface LearnedSkillEntry {
  id: string;
  agent_id: string;
  agent_name: string | null;
  skill_name: string;
  description: string | null;
  confidence: number;
  success_count: number;
  failure_count: number;
  source_trace_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  successRate: number;
  totalUses: number;
}

export interface InstalledSkillEntry {
  id: string;
  agent_id: string;
  agent_name: string | null;
  skill_id: string;
  skill_name: string;
  skill_category: string | null;
  skill_version: string | null;
  installed_at: string;
  version: number;
  is_verified: boolean;
}

export interface SkillbookImpact {
  agent_id: string;
  agent_name: string | null;
  learnedCount: number;
  installedCount: number;
  avgConfidence: number;
  totalExecutions: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  errorRate: number;
  lastActivity: string | null;
}

/**
 * Timeline unificada — eventos de aquisição (learned + installed) ordenados por data.
 */
export type SkillbookTimelineEvent =
  | ({ kind: 'learned' } & LearnedSkillEntry)
  | ({ kind: 'installed' } & InstalledSkillEntry);

const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));

export async function fetchLearnedSkills(limit = 200): Promise<LearnedSkillEntry[]> {
  const { data, error } = await supabaseExternal
    .from('agent_skills')
    .select('id, agent_id, skill_name, description, confidence, success_count, failure_count, source_trace_id, version, created_at, updated_at, agents(name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => {
    const successCount = Number(row.success_count ?? 0);
    const failureCount = Number(row.failure_count ?? 0);
    const total = successCount + failureCount;
    const agentRel = row.agents as { name?: string } | null;
    return {
      id: String(row.id),
      agent_id: String(row.agent_id),
      agent_name: agentRel?.name ?? null,
      skill_name: String(row.skill_name ?? ''),
      description: (row.description as string | null) ?? null,
      confidence: clamp(Number(row.confidence ?? 0)),
      success_count: successCount,
      failure_count: failureCount,
      source_trace_id: (row.source_trace_id as string | null) ?? null,
      version: Number(row.version ?? 1),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at ?? row.created_at),
      successRate: total > 0 ? successCount / total : 0,
      totalUses: total,
    };
  });
}

export async function fetchInstalledSkills(limit = 200): Promise<InstalledSkillEntry[]> {
  const { data, error } = await supabaseExternal
    .from('agent_installed_skills')
    .select('id, agent_id, skill_id, installed_at, version, agents(name), skill_registry(name, category, version, is_verified)')
    .order('installed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => {
    const agentRel = row.agents as { name?: string } | null;
    const skillRel = row.skill_registry as { name?: string; category?: string; version?: string; is_verified?: boolean } | null;
    return {
      id: String(row.id),
      agent_id: String(row.agent_id),
      agent_name: agentRel?.name ?? null,
      skill_id: String(row.skill_id),
      skill_name: skillRel?.name ?? 'Skill removida',
      skill_category: skillRel?.category ?? null,
      skill_version: skillRel?.version ?? null,
      installed_at: String(row.installed_at),
      version: Number(row.version ?? 1),
      is_verified: Boolean(skillRel?.is_verified ?? false),
    };
  });
}

export async function fetchSkillbookImpact(): Promise<SkillbookImpact[]> {
  const [learned, installed] = await Promise.all([
    fetchLearnedSkills(500),
    fetchInstalledSkills(500),
  ]);

  const agentIds = Array.from(
    new Set([...learned.map((s) => s.agent_id), ...installed.map((s) => s.agent_id)]),
  );
  if (agentIds.length === 0) return [];

  const { data: usage, error } = await supabaseExternal
    .from('agent_usage')
    .select('agent_id, requests, total_cost_usd, avg_latency_ms, error_count, date')
    .in('agent_id', agentIds);
  if (error) throw error;

  const impactByAgent = new Map<string, SkillbookImpact>();

  for (const id of agentIds) {
    const agentLearned = learned.filter((s) => s.agent_id === id);
    const agentInstalled = installed.filter((s) => s.agent_id === id);
    const name = agentLearned[0]?.agent_name ?? agentInstalled[0]?.agent_name ?? null;
    impactByAgent.set(id, {
      agent_id: id,
      agent_name: name,
      learnedCount: agentLearned.length,
      installedCount: agentInstalled.length,
      avgConfidence:
        agentLearned.length > 0
          ? agentLearned.reduce((s, x) => s + x.confidence, 0) / agentLearned.length
          : 0,
      totalExecutions: 0,
      totalCostUsd: 0,
      avgLatencyMs: 0,
      errorRate: 0,
      lastActivity: null,
    });
  }

  const latencyAccum = new Map<string, { sum: number; count: number }>();

  for (const row of usage ?? []) {
    const target = impactByAgent.get(String(row.agent_id));
    if (!target) continue;
    const requests = Number(row.requests ?? 0);
    const errors = Number(row.error_count ?? 0);
    target.totalExecutions += requests;
    target.totalCostUsd += Number(row.total_cost_usd ?? 0);
    const latency = Number(row.avg_latency_ms ?? 0);
    if (latency > 0) {
      const acc = latencyAccum.get(target.agent_id) ?? { sum: 0, count: 0 };
      acc.sum += latency;
      acc.count += 1;
      latencyAccum.set(target.agent_id, acc);
    }
    if (requests > 0) {
      target.errorRate = (target.errorRate * target.totalExecutions + errors) / (target.totalExecutions + requests);
    }
    const date = String(row.date);
    if (!target.lastActivity || date > target.lastActivity) target.lastActivity = date;
  }

  for (const [id, acc] of latencyAccum.entries()) {
    const entry = impactByAgent.get(id);
    if (entry && acc.count > 0) entry.avgLatencyMs = Math.round(acc.sum / acc.count);
  }

  return Array.from(impactByAgent.values()).sort(
    (a, b) => b.learnedCount + b.installedCount - (a.learnedCount + a.installedCount),
  );
}

export async function fetchSkillbookTimeline(limit = 100): Promise<SkillbookTimelineEvent[]> {
  const [learned, installed] = await Promise.all([fetchLearnedSkills(limit), fetchInstalledSkills(limit)]);
  const events: SkillbookTimelineEvent[] = [
    ...learned.map((l) => ({ kind: 'learned' as const, ...l })),
    ...installed.map((i) => ({ kind: 'installed' as const, ...i })),
  ];
  return events
    .sort((a, b) => {
      const da = a.kind === 'learned' ? a.created_at : a.installed_at;
      const db = b.kind === 'learned' ? b.created_at : b.installed_at;
      return db.localeCompare(da);
    })
    .slice(0, limit);
}

export function confidenceLabel(confidence: number): 'baixa' | 'média' | 'alta' | 'muito alta' {
  if (confidence < 0.4) return 'baixa';
  if (confidence < 0.7) return 'média';
  if (confidence < 0.9) return 'alta';
  return 'muito alta';
}

// ─── Filtros de período ─────────────────────────────────────────────────
export type SkillbookPeriod = '7d' | '30d' | '90d' | 'all';

export function periodStartISO(period: SkillbookPeriod): string | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 24 * 3600_000).toISOString();
}

export function filterByPeriod<T extends { created_at?: string; installed_at?: string }>(
  rows: T[],
  period: SkillbookPeriod,
  field: 'created_at' | 'installed_at',
): T[] {
  const start = periodStartISO(period);
  if (!start) return rows;
  return rows.filter((r) => {
    const v = r[field];
    return typeof v === 'string' && v >= start;
  });
}

// ─── Série de evolução da confiança ─────────────────────────────────────
export interface ConfidencePoint {
  date: string; // yyyy-mm-dd
  avgConfidence: number;
  learnedCount: number;
  cumulativeLearned: number;
}

export function buildConfidenceSeries(
  learned: LearnedSkillEntry[],
  period: SkillbookPeriod,
): ConfidencePoint[] {
  const filtered = filterByPeriod(learned, period, 'created_at');
  const byDay = new Map<string, { sum: number; count: number }>();
  for (const s of filtered) {
    const day = s.created_at.slice(0, 10);
    const acc = byDay.get(day) ?? { sum: 0, count: 0 };
    acc.sum += s.confidence;
    acc.count += 1;
    byDay.set(day, acc);
  }
  const days = Array.from(byDay.keys()).sort();
  let cumulative = 0;
  return days.map((day) => {
    const acc = byDay.get(day)!;
    cumulative += acc.count;
    return {
      date: day,
      avgConfidence: acc.sum / acc.count,
      learnedCount: acc.count,
      cumulativeLearned: cumulative,
    };
  });
}

// ─── CSV export helpers ─────────────────────────────────────────────────
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], headers: (keyof T)[]): string {
  const head = headers.map((h) => escapeCsvCell(String(h))).join(',');
  const body = rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(',')).join('\n');
  return `${head}\n${body}`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

