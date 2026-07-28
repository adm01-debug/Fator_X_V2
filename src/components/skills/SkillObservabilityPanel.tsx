/**
 * SkillObservabilityPanel — observabilidade da biblioteca de skills.
 *
 * Quatro blocos: ingestão (Harvester), fila de classificação, taxa de
 * reclassificação humana e alertas de instabilidade de calibração.
 */
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Activity, Inbox, UserCheck, Radar } from 'lucide-react';
import { SkillObservabilityAlerts } from '@/components/skills/SkillObservabilityAlerts';
import {
  ObservabilityMetric,
  ObservabilitySparkline,
} from '@/components/skills/SkillObservabilityMetrics';
import { fetchSkillObservability } from '@/services/skillObservabilityService';
import { formatDuration, pct, QUEUE_STALE_DAYS } from '@/lib/skills/observability';

const TREND_LABEL: Record<string, { text: string; tone: 'positivo' | 'atencao' | 'default' }> = {
  melhorando: { text: 'Melhorando', tone: 'positivo' },
  piorando: { text: 'Piorando', tone: 'atencao' },
  estavel: { text: 'Estável', tone: 'default' },
  indefinido: { text: 'Amostra curta', tone: 'default' },
};

export function SkillObservabilityPanel() {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['skill_observability'],
    queryFn: () => fetchSkillObservability(),
    staleTime: 60_000,
  });

  const ingestion = data?.ingestion;
  const queue = data?.queue;
  const human = data?.human;
  const trend = TREND_LABEL[human?.trend ?? 'indefinido'];

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="h-4 w-4 text-nexus-cyan" aria-hidden />
            Observabilidade de Skills
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Ingestão, curadoria e estabilidade da classificação
            {data ? ` — janela de ${data.windowDays} dias` : ''}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          Atualizar
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {error ? (
          <p className="rounded-lg border border-nexus-rose/40 bg-nexus-rose/10 p-3 text-sm text-foreground">
            Não foi possível carregar as métricas: {(error as Error).message}
          </p>
        ) : null}

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : null}

        {data ? (
          <>
            <SkillObservabilityAlerts alerts={data.alerts} />

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Activity className="h-4 w-4 text-nexus-cyan" aria-hidden /> Ingestão (Harvester)
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ObservabilityMetric
                  label="Execuções"
                  value={String(ingestion?.runs ?? 0)}
                  hint={`${ingestion?.running ?? 0} em andamento`}
                />
                <ObservabilityMetric
                  label="Candidatos aceitos"
                  value={String(ingestion?.candidatesAccepted ?? 0)}
                  hint={`de ${ingestion?.candidatesFound ?? 0} encontrados`}
                />
                <ObservabilityMetric
                  label="Taxa de aceite"
                  value={pct(ingestion?.acceptRate ?? null)}
                  tone={(ingestion?.acceptRate ?? 1) < 0.1 ? 'atencao' : 'positivo'}
                />
                <ObservabilityMetric
                  label="Duração média"
                  value={formatDuration(ingestion?.avgDurationMs ?? null)}
                  hint={`${ingestion?.failed ?? 0} falha(s)`}
                  tone={(ingestion?.failed ?? 0) > 0 ? 'atencao' : 'default'}
                />
              </div>
              <ObservabilitySparkline data={ingestion?.daily ?? []} />
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Inbox className="h-4 w-4 text-nexus-purple" aria-hidden /> Fila de classificação
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ObservabilityMetric
                  label="Pendentes"
                  value={String(queue?.pending ?? 0)}
                  hint={`${queue?.pendingByOrigin.ia ?? 0} IA · ${queue?.pendingByOrigin.lexico ?? 0} léxico`}
                  tone={(queue?.pending ?? 0) > 0 ? 'atencao' : 'positivo'}
                />
                <ObservabilityMetric
                  label="Mais antigo"
                  value={`${queue?.oldestPendingDays ?? 0} d`}
                  hint={`${queue?.stalePending ?? 0} parado(s) > ${QUEUE_STALE_DAYS} d`}
                  tone={(queue?.stalePending ?? 0) > 0 ? 'critico' : 'default'}
                />
                <ObservabilityMetric
                  label="Taxa de aprovação"
                  value={pct(queue?.approvalRate ?? null)}
                  hint={`${queue?.decided ?? 0} decisão(ões)`}
                />
                <ObservabilityMetric
                  label="Tempo mediano"
                  value={
                    queue?.medianDecisionHours === null || queue?.medianDecisionHours === undefined
                      ? '—'
                      : `${queue.medianDecisionHours.toString().replace('.', ',')} h`
                  }
                  hint="criação → decisão"
                />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                <UserCheck className="h-4 w-4 text-nexus-emerald" aria-hidden /> Reclassificação
                humana
                <Badge variant="outline" className="ml-1 text-[11px]">
                  {trend.text}
                </Badge>
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ObservabilityMetric
                  label="Taxa de correção"
                  value={pct(human?.rate ?? null)}
                  hint={`${human?.corrected ?? 0} de ${human?.judged ?? 0} julgadas`}
                  tone={(human?.rate ?? 0) >= 0.4 ? 'critico' : 'positivo'}
                />
                <ObservabilityMetric
                  label="Confirmados"
                  value={String(human?.confirmed ?? 0)}
                  hint="classificador acertou"
                  tone="positivo"
                />
                <ObservabilityMetric
                  label="Preenchidos"
                  value={String(human?.filled ?? 0)}
                  hint="skills sem depto."
                />
                <ObservabilityMetric
                  label="Calibrações"
                  value={String(data.calibrations.length)}
                  hint={
                    data.instability.unstable
                      ? `instável (${data.instability.reason})`
                      : 'limiar estável'
                  }
                  tone={data.instability.unstable ? 'critico' : 'default'}
                />
              </div>
            </section>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
