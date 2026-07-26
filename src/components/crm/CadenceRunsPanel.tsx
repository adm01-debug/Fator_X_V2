/**
 * CadenceRunsPanel — Histórico de execuções do runner de cadências.
 *
 * A tabela `crm_cadence_runs` é escrita exclusivamente pela Edge Function
 * (service_role); aqui o acesso é estritamente de leitura, então o painel não
 * expõe nenhuma ação de escrita — evitar histórico de auditoria editável pela
 * própria interface que ele audita é intencional.
 */
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { History, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { listCadenceRuns, type CrmCadenceRun } from '@/services/crmCadenceService';
import { cn } from '@/lib/utils';

interface MetricProps {
  label: string;
  value: number;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
}

function Metric({ label, value, tone = 'default' }: MetricProps) {
  return (
    <div className="min-w-[64px]">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-body-sm font-medium tabular-nums',
          tone === 'positive' && value > 0 && 'text-nexus-success',
          tone === 'warning' && value > 0 && 'text-nexus-warning',
          tone === 'danger' && value > 0 && 'text-destructive',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function RunRow({ run }: { run: CrmCadenceRun }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border border-border p-3">
      <div className="min-w-[180px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={run.triggered_by === 'cron' ? 'secondary' : 'outline'}>
            {run.triggered_by === 'cron' ? 'Agendado' : 'Manual'}
          </Badge>
          {run.dry_run && <Badge variant="outline">Simulação</Badge>}
          {run.failed > 0 && <Badge variant="destructive">Com falhas</Badge>}
        </div>
        <p className="mt-1 text-caption text-muted-foreground">
          {formatDistanceToNow(new Date(run.created_at), { addSuffix: true, locale: ptBR })} ·{' '}
          {run.duration_ms} ms
        </p>
      </div>

      <Metric label="Selecionadas" value={run.claimed} />
      <Metric label="Enviadas" value={run.sent} tone="positive" />
      <Metric label="Concluídas" value={run.completed} />
      <Metric label="Interrompidas" value={run.stopped} />
      <Metric label="Puladas" value={run.skipped} />
      <Metric label="Teto diário" value={run.capped} tone="warning" />
      <Metric label="Falhas" value={run.failed} tone="danger" />
    </div>
  );
}

export function CadenceRunsPanel() {
  const runsQuery = useQuery({
    queryKey: ['crm-cadence-runs'],
    queryFn: () => listCadenceRuns(50),
    // O runner roda a cada 15 min; recarregar ao focar a aba basta e evita
    // polling constante numa tabela de auditoria que só cresce.
    refetchOnWindowFocus: true,
  });

  const runs = runsQuery.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4" aria-hidden="true" />
          Histórico de execuções
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Atualizar histórico de execuções"
          onClick={() => void runsQuery.refetch()}
          disabled={runsQuery.isFetching}
        >
          <RefreshCw
            className={cn('h-4 w-4', runsQuery.isFetching && 'animate-spin')}
            aria-hidden="true"
          />
        </Button>
      </CardHeader>

      <CardContent className="space-y-2">
        {runsQuery.isLoading && (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        )}

        {runsQuery.isError && (
          <p className="text-body-sm text-destructive">
            Não foi possível carregar o histórico de execuções.
          </p>
        )}

        {!runsQuery.isLoading && !runsQuery.isError && runs.length === 0 && (
          <p className="text-body-sm text-muted-foreground">
            Nenhuma execução registrada ainda. O agendador roda a cada 15 minutos.
          </p>
        )}

        {runs.map((run) => (
          <RunRow key={run.id} run={run} />
        ))}
      </CardContent>
    </Card>
  );
}
