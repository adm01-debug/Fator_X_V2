/**
 * SkillInstallCapLedgerCard — leitura da trilha `skill.install_over_cap`.
 *
 * Responde a três perguntas que a trilha crua não responde: quais agentes
 * estão degradados AGORA, quantas skills o runtime está descartando, e quais
 * skills são as vítimas mais frequentes do corte.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck, Scissors, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { fetchInstallCapLedger } from '@/services/installCapLedgerService';
import { summarizeInstallCapLedger } from '@/lib/skills/installCapLedger';

function formatDate(iso: string): string {
  if (iso === '') return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const MAX_LISTED = 6;

export function SkillInstallCapLedgerCard() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['skill_install_cap_ledger'],
    queryFn: fetchInstallCapLedger,
    staleTime: 120_000,
  });

  const entries = useMemo(() => data ?? [], [data]);
  const resumo = useMemo(() => summarizeInstallCapLedger(entries), [entries]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-body">
          <Scissors className="h-4 w-4 text-muted-foreground" />
          Trilha de estouro do teto
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          Atualizar
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Não foi possível ler a trilha de auditoria. Tente novamente em instantes.
            </AlertDescription>
          </Alert>
        ) : resumo.total === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 p-4 text-body-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-nexus-green" />
            Nenhuma instalação estourou o teto até agora — os agentes estão íntegros.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Eventos', value: resumo.total },
                { label: 'Agentes degradados', value: resumo.degradedAgents.length },
                { label: 'Skills descartadas hoje', value: resumo.droppedSkillsNow },
                { label: 'Sem reconhecimento', value: resumo.unacknowledged },
              ].map((m) => (
                <div key={m.label} className="rounded-md border border-border/60 p-3">
                  <p className="text-meta text-muted-foreground">{m.label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
                    {m.value.toLocaleString('pt-BR')}
                  </p>
                </div>
              ))}
            </div>

            {resumo.degradedAgents.length > 0 && (
              <div className="space-y-2">
                <p className="text-meta font-medium uppercase tracking-wide text-muted-foreground">
                  Agentes acima do teto
                </p>
                {resumo.degradedAgents.slice(0, MAX_LISTED).map((a) => (
                  <div
                    key={a.agentId || a.agentName}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-nexus-amber/40 bg-nexus-amber/5 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-medium">{a.agentName}</p>
                      <p className="text-meta text-muted-foreground">
                        {a.slotsAfter} slots · última operação {formatDate(a.lastAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.hasUnacknowledged && (
                        <Badge variant="outline" className="gap-1 text-meta">
                          <AlertTriangle className="h-3 w-3" /> sem reconhecimento
                        </Badge>
                      )}
                      <Badge variant="destructive" className="text-meta">
                        {a.droppedNow} descartada(s)
                      </Badge>
                    </div>
                  </div>
                ))}
                {resumo.degradedAgents.length > MAX_LISTED && (
                  <p className="text-meta text-muted-foreground">
                    +{resumo.degradedAgents.length - MAX_LISTED} agente(s) não listado(s).
                  </p>
                )}
              </div>
            )}

            {resumo.topDropped.length > 0 && (
              <div className="space-y-2">
                <p className="text-meta font-medium uppercase tracking-wide text-muted-foreground">
                  Skills mais descartadas
                </p>
                <div className="flex flex-wrap gap-2">
                  {resumo.topDropped.map((s) => (
                    <Badge key={s.name} variant="secondary" className="text-meta">
                      {s.name} · {s.count}×
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <p className="text-meta text-muted-foreground">
              {resumo.crossings} operação(ões) cruzaram o teto pela primeira vez · {resumo.agents}{' '}
              agente(s) na trilha · último registro em {formatDate(resumo.lastAt)}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
