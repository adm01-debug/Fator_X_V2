/**
 * SkillClassificationStatusCard — saúde da curadoria de departamentos.
 * Mostra a origem da classificação (léxico / LLM / humano) e as filas abertas.
 */
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { curationHealth, share, type SkillLibraryOverview } from '@/services/skillLibraryService';

interface SkillClassificationStatusCardProps {
  overview?: SkillLibraryOverview;
  isLoading?: boolean;
}

const SOURCE_META = [
  { key: 'human', label: 'Humano', hint: 'confiança 1.0', bar: 'bg-nexus-emerald' },
  { key: 'llm', label: 'LLM', hint: 'fila em lote', bar: 'bg-nexus-purple' },
  { key: 'lexical', label: 'Léxico', hint: 'determinístico', bar: 'bg-nexus-cyan' },
] as const;

export function SkillClassificationStatusCard({
  overview,
  isLoading,
}: SkillClassificationStatusCardProps) {
  const health = overview ? curationHealth(overview) : null;
  const pending = overview ? overview.unclassified + overview.needsReview : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">Status de classificação</CardTitle>
          {health !== null && (
            <Badge
              variant="outline"
              className={cn(
                'shrink-0 gap-1',
                health >= 80
                  ? 'border-nexus-emerald/30 text-nexus-emerald'
                  : 'border-nexus-amber/30 text-nexus-amber',
              )}
            >
              <ShieldCheck className="h-3 w-3" /> {health}% curado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !overview ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : (
          <>
            {SOURCE_META.map((meta) => {
              const value = overview.bySource[meta.key];
              const pct = Math.round(share(value, overview.total));
              return (
                <div key={meta.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {meta.label}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {meta.hint}
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {value.toLocaleString('pt-BR')} ({pct}%)
                    </span>
                  </div>
                  {/* Barra própria (em vez de <Progress/>) para colorir por origem
                      sem sobrescrever o token do indicador global. */}
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Classificadas por ${meta.label}`}
                  >
                    <div
                      className={cn('h-full rounded-full transition-all', meta.bar)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Sem departamento</p>
                <p className="text-lg font-semibold tabular-nums">
                  {overview.unclassified.toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Rever depto.</p>
                <p className="text-lg font-semibold tabular-nums">
                  {overview.needsReview.toLocaleString('pt-BR')}
                </p>
              </div>
            </div>

            {pending > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-nexus-amber/30 bg-nexus-amber/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-nexus-amber" />
                <p className="text-muted-foreground">
                  {pending.toLocaleString('pt-BR')} skills aguardam curadoria de departamento.
                </p>
              </div>
            )}

            <Button asChild variant="outline" size="sm" className="w-full gap-2">
              <Link to="/skills/audit">
                Abrir painel de curadoria <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
