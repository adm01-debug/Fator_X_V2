/**
 * Feed de curadoria manual recente (template ↔ skill).
 *
 * Consome `fetchRecentCurations`, cuja consulta casa com o índice parcial
 * `idx_tsl_manual_recent` — o custo não cresce com o volume de vínculos
 * automáticos, que hoje representam a maioria absoluta da tabela.
 */
import { useQuery } from '@tanstack/react-query';
import { History, Sparkles, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { fetchRecentCurations } from '@/services/templateSkillLinkService';

export interface RecentCurationsPanelProps {
  /** Quantos registros buscar (o feed agrupa por dia depois). */
  limit?: number;
  className?: string;
}

export function RecentCurationsPanel({ limit = 30, className }: RecentCurationsPanelProps) {
  const { data: currentUserId = null } = useQuery({
    queryKey: ['current_user_id'],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const { data: feed = [], isLoading } = useQuery({
    queryKey: ['recent_curations', limit, currentUserId],
    queryFn: () => fetchRecentCurations(limit, currentUserId),
    staleTime: 30_000,
    retry: false,
  });

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" aria-hidden />
          Curadoria recente
        </CardTitle>
        <CardDescription>
          Vínculos manuais entre templates e skills, do mais recente ao mais antigo.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : feed.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Nenhuma curadoria manual registrada ainda.
            </p>
            <p className="text-xs text-muted-foreground">
              Vincule skills a um template na galeria para que apareçam aqui.
            </p>
          </div>
        ) : (
          feed.map((dia) => (
            <section key={dia.dayKey} className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {dia.dayLabel}
              </h3>

              <ul className="space-y-2">
                {dia.entries.map((entrada) => (
                  <li
                    key={`${entrada.templateId}-${entrada.skillId}`}
                    className="rounded-md border border-border/60 bg-card/40 p-3 transition-colors hover:border-primary/40"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="font-normal">
                        {entrada.templateName}
                      </Badge>
                      <span className="text-muted-foreground" aria-hidden>
                        →
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {entrada.skillName}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {entrada.actorLabel && (
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3 w-3" aria-hidden />
                          {entrada.actorLabel}
                        </span>
                      )}
                      {entrada.timeLabel && <span>{entrada.timeLabel}</span>}
                      <span className="truncate">{entrada.reason}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}
