/**
 * RandomRecallMetricsCard — visualização das métricas de Random Recall.
 *
 * Consome `audit_events` filtrando `event_type = 'random_recall'` para exibir:
 * - Quantidade de recalls disparados no período (7d / 30d)
 * - Distribuição por agente (top 5)
 * - Timeline diária
 *
 * Serve como feedback loop da Autograph Memory Layer: permite ao operador
 * medir o quanto o mecanismo de "recordação espontânea" está enriquecendo
 * as respostas dos agentes.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Brain, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { LightBarChart } from '@/components/charts';
import { supabaseExternal } from '@/integrations/supabase/externalClient';

interface RandomRecallMetricsCardProps {
  workspaceId: string | null;
  /** Janela em dias (default 30). */
  days?: number;
}

interface RecallEvent {
  created_at: string;
  metadata: Record<string, unknown> | null;
}

function toDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function RandomRecallMetricsCard({ workspaceId, days = 30 }: RandomRecallMetricsCardProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['random-recall-metrics', workspaceId, days],
    enabled: !!workspaceId,
    queryFn: async (): Promise<RecallEvent[]> => {
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabaseExternal
        .from('audit_events')
        .select('created_at, metadata')
        .eq('workspace_id', workspaceId as string)
        .eq('event_type', 'random_recall')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as RecallEvent[];
    },
    staleTime: 60_000,
  });

  const { timeline, byAgent, total } = useMemo(() => {
    const events = data ?? [];
    const dayMap = new Map<string, number>();
    const agentMap = new Map<string, number>();

    for (const ev of events) {
      const day = ev.created_at.slice(0, 10);
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
      const meta = ev.metadata ?? {};
      const agentName =
        (typeof meta.agent_name === 'string' && meta.agent_name) ||
        (typeof meta.agent_id === 'string' && meta.agent_id) ||
        'desconhecido';
      agentMap.set(agentName, (agentMap.get(agentName) ?? 0) + 1);
    }

    const timeline = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ label: toDayLabel(day), count }));

    const byAgent = Array.from(agentMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ label: name.length > 18 ? `${name.slice(0, 15)}…` : name, count }));

    return { timeline, byAgent, total: events.length };
  }, [data]);

  if (!workspaceId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Random Recall — métricas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState title="Sem workspace" description="Selecione um workspace para ver métricas de recall." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Random Recall — últimos {days} dias
          </span>
          <span className="text-meta text-muted-foreground">{total} eventos</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : isError ? (
          <EmptyState title="Falha ao carregar" description="Não foi possível consultar audit_events." />
        ) : total === 0 ? (
          <EmptyState
            title="Nenhum recall no período"
            description="Nenhum evento de recall aleatório registrado. Ative Random Recall em algum agente."
          />
        ) : (
          <>
            <div>
              <p className="text-meta text-muted-foreground mb-2">Timeline diária</p>
              <LightBarChart
                data={timeline}
                xKey="label"
                series={[{ dataKey: 'count', name: 'Recalls', color: '#a855f7' }]}
                height={180}
                yFormatter={(v) => v.toLocaleString('pt-BR')}
              />
            </div>
            <div>
              <p className="text-meta text-muted-foreground mb-2">Top 5 agentes</p>
              <LightBarChart
                data={byAgent}
                xKey="label"
                series={[{ dataKey: 'count', name: 'Recalls', color: '#06b6d4' }]}
                height={160}
                yFormatter={(v) => v.toLocaleString('pt-BR')}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
