/**
 * Nexus Agents Studio — Billing Service
 * Budget management, cost tracking, pricing.
 */
export interface UsageSummary {
  totalCost: number;
  totalTokens: number;
  byType: Record<string, number>;
  recordCount: number;
  period: string;
  since: string;
}

export interface AgentUsageRow {
  id: string;
  agent_id: string;
  date: string;
  total_cost_usd: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  requests: number | null;
  error_count: number | null;
}

export interface UsageRecordRow {
  id: string;
  workspace_id: string;
  record_type: string;
  tokens: number | null;
  cost_usd: number | null;
  created_at: string;
}

export interface BudgetRow {
  id: string;
  workspace_id: string;
  name: string;
  limit_usd: number;
  current_usd: number | null;
  alert_threshold: number | null;
  period: string;
  is_active: boolean;
  created_at: string;
}

export interface ModelPricingRow {
  id: string;
  model_pattern: string;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
}
import { supabaseExternal } from '@/integrations/supabase/externalClient';

// ═══ Usage ═══

export async function getUsageSummary(
  period: 'day' | 'week' | 'month' = 'week',
): Promise<UsageSummary> {
  const now = new Date();
  const periodMs = period === 'day' ? 86400000 : period === 'week' ? 604800000 : 2592000000;
  const since = new Date(now.getTime() - periodMs).toISOString();

  // Usa o client EXTERNO — `usage_records` vive no banco de dados externo, o
  // mesmo lido por `getUsageRecords`. Ler pelo client local devolvia zero
  // consumo, o que fazia `checkBudgetStatus` reportar "ok" com o orçamento
  // estourado (o budget vem do externo, o consumo vinha do local).
  const { data, error } = await supabaseExternal
    .from('usage_records')
    .select('cost_usd, record_type, tokens, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) throw error;

  type UsageRow = {
    cost_usd: number | null;
    record_type: string | null;
    tokens: number | null;
    created_at: string;
  };
  const records = (data || []) as UsageRow[];
  const totalCost = records.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  const totalTokens = records.reduce((s, r) => s + Number(r.tokens || 0), 0);

  const byType: Record<string, number> = {};
  records.forEach((r) => {
    const type = String(r.record_type || 'llm');
    byType[type] = (byType[type] || 0) + Number(r.cost_usd || 0);
  });

  return { totalCost, totalTokens, byType, recordCount: records.length, period, since };
}

export async function getAgentUsage(days = 30): Promise<AgentUsageRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabaseExternal
    .from('agent_usage')
    .select('*')
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: true });
  if (error) throw error;
  return (data as unknown as AgentUsageRow[]) ?? [];
}

export async function getUsageRecords(limit = 50): Promise<UsageRecordRow[]> {
  const { data, error } = await supabaseExternal
    .from('usage_records')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as UsageRecordRow[]) ?? [];
}

// ═══ Budgets ═══

export async function listBudgets(): Promise<BudgetRow[]> {
  const { data, error } = await supabaseExternal
    .from('budgets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as BudgetRow[]) ?? [];
}

export async function getBudget(workspaceId: string) {
  const { data } = await supabaseExternal
    .from('budgets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return data;
}

export async function createBudget(workspaceId: string, name: string, limitUsd: number) {
  const { data, error } = await supabaseExternal
    .from('budgets')
    .insert({ name, limit_usd: limitUsd, workspace_id: workspaceId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBudget(id: string) {
  const { error } = await supabaseExternal.from('budgets').delete().eq('id', id);
  if (error) throw error;
}

export async function setBudget(workspaceId: string, monthlyLimit: number) {
  const { data, error } = await supabaseExternal
    .from('budgets')
    .upsert({ workspace_id: workspaceId, limit_usd: monthlyLimit, alert_threshold: 0.8 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function checkBudgetStatus(workspaceId: string) {
  const budget = await getBudget(workspaceId);
  if (!budget) return { status: 'no_budget', used: 0, limit: 0, percentage: 0 };

  const usage = await getUsageSummary('month');
  const limit = budget.limit_usd ?? 0;
  const percentage = limit > 0 ? (usage.totalCost / limit) * 100 : 0;

  return {
    status: percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'ok',
    used: usage.totalCost,
    limit,
    percentage: Math.round(percentage),
  };
}

// ═══ Pricing ═══

export async function getModelPricing(): Promise<ModelPricingRow[]> {
  const { data, error } = await supabaseExternal
    .from('model_pricing')
    .select('*')
    .order('model_pattern');
  if (error) throw error;
  return (data as unknown as ModelPricingRow[]) ?? [];
}
