/**
 * Feed de curadoria manual recente (template ↔ skill).
 *
 * Consome `fetchRecentCurations`, cuja consulta casa com o índice parcial
 * `idx_tsl_manual_recent` — o custo não cresce com o volume de vínculos
 * automáticos, que hoje representam a maioria absoluta da tabela.
 */
import { useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, History, Link2, Loader2, Sparkles, Undo2, Unlink, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  fetchRecentCurationsPage,
  mergeCurationFeeds,
  restoreTemplateSkillLink,
  type CurationActorScope,
  type CurationFeedFilter,
} from '@/services/templateSkillLinkService';
import { useCurationRealtime } from '@/hooks/useCurationRealtime';
import { AGENT_TEMPLATES } from '@/data/agentTemplates';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const FILTROS: Array<{ value: CurationFeedFilter; label: string }> = [
  { value: 'all', label: 'Tudo' },
  { value: 'linked', label: 'Vínculos' },
  { value: 'unlinked', label: 'Remoções' },
];

const ESCOPOS: Array<{ value: CurationActorScope; label: string }> = [
  { value: 'everyone', label: 'Todos' },
  { value: 'me', label: 'Minhas' },
];

/** Ordenado por nome: a lista tem dezenas de itens e é varrida visualmente. */
const TEMPLATES_ORDENADOS = [...AGENT_TEMPLATES].sort((a, b) =>
  a.name.localeCompare(b.name, 'pt-BR'),
);




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

  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<CurationFeedFilter>('all');
  const [escopo, setEscopo] = useState<CurationActorScope>('everyone');


  // Curadoria é colaborativa: sem realtime, dois admins veem estados divergentes
  // até o staleTime de 30s expirar.
  useCurationRealtime(filtro);



  const desfazer = useMutation({
    mutationFn: ({ templateId, skillId }: { templateId: string; skillId: string }) =>
      restoreTemplateSkillLink(templateId, skillId),
    onSuccess: () => {
      toast({ title: 'Vínculo restaurado', description: 'A skill voltou a ser recomendada.' });
      queryClient.invalidateQueries({ queryKey: ['recent_curations'] });
      queryClient.invalidateQueries({ queryKey: ['template_skill_links'] });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Não foi possível restaurar',
        description: error instanceof Error ? error.message : 'Erro desconhecido.',
        variant: 'destructive',
      });
    },
  });

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['recent_curations', limit, currentUserId, filtro, escopo],
    queryFn: ({ pageParam }) =>
      fetchRecentCurationsPage(limit, currentUserId, filtro, pageParam as string | null, escopo),

    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.nextCursor,
    staleTime: 30_000,
    retry: false,
  });

  // As páginas são mescladas fora do render loop: a dedup por (template, skill)
  // é O(n) e não deve rodar a cada re-render por hover/estado local.
  const feed = useMemo(
    () => mergeCurationFeeds((data?.pages ?? []).map((p) => p.days)),
    [data],
  );


  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-body">
          <History className="h-4 w-4 text-primary" aria-hidden />
          Curadoria recente
        </CardTitle>
        <CardDescription>
          Vínculos e desvinculações manuais entre templates e skills, do mais recente ao mais
          antigo. Remoções são reversíveis.
        </CardDescription>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <ToggleGroup
            type="single"
            value={filtro}
            // ToggleGroup devolve '' ao desmarcar o item ativo — preservamos o
            // filtro atual em vez de cair num estado sem seleção.
            onValueChange={(valor) => valor && setFiltro(valor as CurationFeedFilter)}
            className="justify-start"
            aria-label="Filtrar eventos de curadoria"
          >
            {FILTROS.map((opcao) => (
              <ToggleGroupItem key={opcao.value} value={opcao.value} className="text-meta h-7 px-3">
                {opcao.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <ToggleGroup
            type="single"
            value={escopo}
            onValueChange={(valor) => valor && setEscopo(valor as CurationActorScope)}
            className="justify-start"
            aria-label="Filtrar por autoria"
          >
            {ESCOPOS.map((opcao) => (
              <ToggleGroupItem key={opcao.value} value={opcao.value} className="text-meta h-7 px-3">
                {opcao.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
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
            <p className="text-body-sm text-muted-foreground">
              {filtro === 'unlinked'
                ? 'Nenhuma remoção registrada.'
                : filtro === 'linked'
                  ? 'Nenhum vínculo manual ativo.'
                  : 'Nenhuma curadoria manual registrada ainda.'}
            </p>
            <p className="text-meta text-muted-foreground">
              Vincule skills a um template na galeria para que apareçam aqui.
            </p>
          </div>
        ) : (
          feed.map((dia) => (
            <section key={dia.dayKey} className="space-y-2">
              <h3 className="text-meta font-medium uppercase tracking-wide text-muted-foreground">
                {dia.dayLabel}
              </h3>

              <ul className="space-y-2">
                {dia.entries.map((entrada) => (
                  <li
                    key={`${entrada.templateId}-${entrada.skillId}`}
                    className="rounded-md border border-border/60 bg-card/40 p-3 transition-colors hover:border-primary/40"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={entrada.kind === 'unlinked' ? 'outline' : 'secondary'}
                        className="font-normal"
                      >
                        {entrada.kind === 'unlinked' ? (
                          <Unlink className="mr-1 h-3 w-3" aria-hidden />
                        ) : (
                          <Link2 className="mr-1 h-3 w-3" aria-hidden />
                        )}
                        {entrada.templateName}
                      </Badge>
                      <span className="text-muted-foreground" aria-hidden>
                        →
                      </span>
                      <span
                        className={
                          entrada.kind === 'unlinked'
                            ? 'text-body-sm font-medium text-muted-foreground line-through'
                            : 'text-body-sm font-medium text-foreground'
                        }
                      >
                        {entrada.skillName}
                      </span>

                      {entrada.kind === 'unlinked' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto h-7 px-2 text-meta"
                          disabled={desfazer.isPending}
                          onClick={() =>
                            desfazer.mutate({
                              templateId: entrada.templateId,
                              skillId: entrada.skillId,
                            })
                          }
                        >
                          <Undo2 className="mr-1 h-3 w-3" aria-hidden />
                          Desfazer
                        </Button>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted-foreground">
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

        {hasNextPage && (
          <div className="pt-1 text-center">
            <Button
              variant="outline"
              size="sm"
              className="text-meta"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <ChevronDown className="mr-1 h-3 w-3" aria-hidden />
              )}
              Carregar mais
            </Button>
          </div>
        )}
      </CardContent>
    </Card>


  );
}
