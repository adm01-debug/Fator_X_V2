/**
 * LlmCostByCallerPage — visualiza custo de LLM segregado por Edge Function chamadora.
 *
 * Consome `public.llm_cost_by_caller`, populada por `usage_records.metadata.caller`
 * (header `X-Caller-Function` propagado pelas edge functions ao chamar o `llm-gateway`).
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabaseExternal } from '@/integrations/supabase/externalClient';

interface Row {
  workspace_id: string | null;
  caller: string;
  provider: string;
  model: string;
  day: string;
  calls: number;
  tokens: number;
  cost_usd: number;
}

const RANGES: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

export default function LlmCostByCallerPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - RANGES[range] * 86400_000).toISOString();
      const { data, error } = await supabaseExternal
        .from('llm_cost_by_caller' as never)
        .select('*')
        .gte('day', since)
        .order('cost_usd', { ascending: false })
        .limit(1000);
      if (cancelled) return;
      if (error) {
        toast.error('Falha ao carregar custos por chamador', { description: error.message });
        setRows([]);
      } else {
        setRows((data ?? []) as unknown as Row[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range]);

  const byCaller = useMemo(() => {
    const map = new Map<string, { calls: number; tokens: number; cost: number }>();
    for (const r of rows) {
      const cur = map.get(r.caller) ?? { calls: 0, tokens: 0, cost: 0 };
      cur.calls += Number(r.calls) || 0;
      cur.tokens += Number(r.tokens) || 0;
      cur.cost += Number(r.cost_usd) || 0;
      map.set(r.caller, cur);
    }
    return Array.from(map.entries())
      .map(([caller, v]) => ({ caller, ...v }))
      .sort((a, b) => b.cost - a.cost);
  }, [rows]);

  const totals = useMemo(() => byCaller.reduce(
    (acc, r) => ({ calls: acc.calls + r.calls, tokens: acc.tokens + r.tokens, cost: acc.cost + r.cost }),
    { calls: 0, tokens: 0, cost: 0 },
  ), [byCaller]);

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Custo LLM por Edge Function"
        description="Rastreamento de gastos com LLM segregado pela função chamadora do gateway"
      />

      <div className="flex justify-end">
        <Select value={range} onValueChange={(v) => setRange(v as '7d' | '30d' | '90d')}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-body-sm">Chamadas</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{totals.calls.toLocaleString('pt-BR')}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-body-sm">Tokens</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{totals.tokens.toLocaleString('pt-BR')}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-body-sm">Custo total</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">${totals.cost.toFixed(4)}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Ranking por função chamadora</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : byCaller.length === 0 ? (
            <EmptyState title="Sem dados no período" description="Nenhuma chamada LLM registrada neste intervalo." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Caller</th>
                    <th className="py-2 pr-4">Chamadas</th>
                    <th className="py-2 pr-4">Tokens</th>
                    <th className="py-2 pr-4">Custo (USD)</th>
                    <th className="py-2 pr-4">% do total</th>
                  </tr>
                </thead>
                <tbody>
                  {byCaller.map((r) => (
                    <tr key={r.caller} className="border-t border-border/60">
                      <td className="py-2 pr-4"><Badge variant="outline">{r.caller}</Badge></td>
                      <td className="py-2 pr-4">{r.calls.toLocaleString('pt-BR')}</td>
                      <td className="py-2 pr-4">{r.tokens.toLocaleString('pt-BR')}</td>
                      <td className="py-2 pr-4 font-medium">${r.cost.toFixed(4)}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{totals.cost > 0 ? ((r.cost / totals.cost) * 100).toFixed(1) : '0.0'}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
