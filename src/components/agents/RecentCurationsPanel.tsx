/**
 * Feed de curadoria manual recente (template ↔ skill).
 *
 * Consome `fetchRecentCurations`, cuja consulta casa com o índice parcial
 * `idx_tsl_manual_recent` — o custo não cresce com o volume de vínculos
 * automáticos, que hoje representam a maioria absoluta da tabela.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Download, History, Link2, Loader2, RefreshCw, Sparkles, Undo2, Unlink, UserRound } from 'lucide-react';
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
  bulkRestoreAllRemovals,
  retryFailedRestores,
  type BulkRestoreAllResult,
  type BulkRestoreFailure,
  RESTORE_FAILURE_LABEL,
  isRetriableFailure,
  groupRemovalsByTemplate,
  shouldConfirmBulkRestore,
  type CurationActorScope,
  type CurationFeedFilter,
} from '@/services/templateSkillLinkService';
import {
  applyCurationPendingEventByFilter,
  clearPendingForFilter,
  formatPendingBadge,
  formatPendingLabel,
  useCurationRealtime,
  EMPTY_PENDING_BY_FILTER,
  type CurationPendingByFilter,
  type CurationRealtimeEvent,
} from '@/hooks/useCurationRealtime';
import { AGENT_TEMPLATES } from '@/data/agentTemplates';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { buildCurationCsv, buildCurationCsvFilename } from '@/services/templateSkillLinkService';
import {
  beginHighlight,
  highlightKey,
  isHighlighted,
  pruneHighlights,
  CURATION_HIGHLIGHT_TTL_MS,
  EMPTY_HIGHLIGHTS,
  type CurationHighlightMap,
} from '@/lib/curationHighlight';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';



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
  const [templateId, setTemplateId] = useState<string>('all');

  // Novidades chegam por realtime mas NÃO entram na tela sozinhas: invalidar
  // durante a leitura reinicia a paginação infinita e faz o item lido saltar
  // de posição. Acumulamos e deixamos a atualização a cargo de um clique.
  //
  // Contamos os três recortes em paralelo: com uma contagem única, alternar de
  // aba obrigava a zerar tudo e o curador perdia o rastro do que havia chegado
  // no recorte que ele não estava olhando.
  const [pendentes, setPendentes] = useState<CurationPendingByFilter>(
    EMPTY_PENDING_BY_FILTER,
  );

  const registrarPendente = useCallback((evento: CurationRealtimeEvent) => {
    setPendentes((atual) => applyCurationPendingEventByFilter(atual, evento));
  }, []);

  // Assinamos com 'all' de propósito: ele é a união exata de 'linked' e
  // 'unlinked', então um único canal alimenta os três contadores — e o canal
  // deixa de ser reassinado a cada troca de aba (reassinar perde eventos).
  useCurationRealtime('all', true, registrarPendente);

  // Escopo e template mudam o conjunto de linhas na tela, não o predicado dos
  // recortes: as contagens acumuladas deixam de descrever o recorte visível.
  useEffect(() => {
    setPendentes(EMPTY_PENDING_BY_FILTER);
  }, [escopo, templateId]);

  const pendentesDoFiltro = pendentes[filtro];
  const rotuloPendentes = formatPendingLabel(pendentesDoFiltro.size);


  // Destaque das linhas que acabaram de entrar. Sinal de transição, não estado:
  // expira sozinho para não passar a mentir sobre o que ainda é "novo".
  const [destaques, setDestaques] = useState<CurationHighlightMap>(EMPTY_HIGHLIGHTS);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (destaques.size === 0) return;
    // Tick curto o suficiente para o apagamento parecer imediato, e barato
    // porque `pruneHighlights` preserva identidade enquanto nada expira.
    const timer = window.setInterval(() => {
      const t = Date.now();
      setAgora(t);
      setDestaques((atual) => pruneHighlights(atual, t));
    }, 500);
    return () => window.clearInterval(timer);
  }, [destaques.size]);

  // Trocar de recorte descarta o destaque: ele descrevia a tela anterior.
  useEffect(() => {
    setDestaques(EMPTY_HIGHLIGHTS);
  }, [filtro, escopo, templateId]);

  const aplicarNovidades = () => {
    const t = Date.now();
    setDestaques(beginHighlight(pendentesDoFiltro, t));
    setAgora(t);
    // Zera só a aba atualizada: as outras guardam novidades ainda não vistas.
    setPendentes((atual) => clearPendingForFilter(atual, filtro));
    queryClient.invalidateQueries({ queryKey: ['recent_curations'] });
    queryClient.invalidateQueries({ queryKey: ['template_skill_links'] });
  };







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

  // Templates cujo lote falhou na última tentativa. Guardar aqui (e não só no
  // toast) permite oferecer um retry cirúrgico, sem reprocessar o que já foi
  // restaurado com sucesso.
  const [falhas, setFalhas] = useState<BulkRestoreFailure[]>([]);
  // Reprocessar um lote negado por RLS só repete o erro: o retry fica restrito
  // às falhas transitórias, e as de permissão ficam visíveis para escalar.
  const templatesRetentaveis = useMemo(
    () => falhas.filter((f) => isRetriableFailure(f.kind)).map((f) => f.templateId),
    [falhas],
  );

  const aplicarResultado = useCallback(
    ({ restored, failures }: BulkRestoreAllResult) => {
      queryClient.invalidateQueries({ queryKey: ['recent_curations'] });
      queryClient.invalidateQueries({ queryKey: ['template_skill_links'] });
      setFalhas(failures);
      if (failures.length > 0) {
        const pendentes = failures.reduce((acc, f) => acc + f.skillCount, 0);
        toast({
          title: 'Restauração parcial',
          description: `${restored} vínculo(s) restaurado(s). Pendentes: ${pendentes} em ${failures
            .map((f) => f.templateName)
            .join(', ')} — ${failures[0].message}`,
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Remoções desfeitas',
        description: `${restored} vínculo(s) voltaram a ser recomendados.`,
      });
    },
    [queryClient],
  );

  const aoFalhar = useCallback((error: unknown) => {
    toast({
      title: 'Não foi possível restaurar em massa',
      description: error instanceof Error ? error.message : 'Erro desconhecido.',
      variant: 'destructive',
    });
  }, []);

  const restaurarTodas = useMutation({
    mutationFn: () => bulkRestoreAllRemovals(feedRef.current),
    onSuccess: aplicarResultado,
    onError: aoFalhar,
  });

  const tentarNovamente = useMutation({
    mutationFn: () => retryFailedRestores(feedRef.current, templatesRetentaveis),
    onSuccess: aplicarResultado,
    onError: aoFalhar,
  });

  // Confirmação só para lotes grandes: pedir confirmação para 1 ou 2 itens
  // treina o curador a clicar "Sim" sem ler, e o diálogo perde a função.
  const [confirmarAberto, setConfirmarAberto] = useState(false);





  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['recent_curations', limit, currentUserId, filtro, escopo, templateId],
    queryFn: ({ pageParam }) =>
      fetchRecentCurationsPage(
        limit,
        currentUserId,
        filtro,
        pageParam as string | null,
        escopo,
        templateId,
      ),


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

  // O plano de restauração é derivado do que está na tela — nunca reconsultado
  // — para que o botão prometa exatamente o que o curador está vendo.
  const removocoesVisiveis = useMemo(
    () => groupRemovalsByTemplate(feed).reduce((acc, g) => acc + g.skillIds.length, 0),
    [feed],
  );

  const pedirRestauracaoEmMassa = useCallback(() => {
    if (shouldConfirmBulkRestore(removocoesVisiveis)) {
      setConfirmarAberto(true);
      return;
    }
    restaurarTodas.mutate();
  }, [removocoesVisiveis, restaurarTodas]);


  // Ref evita recriar a mutation a cada página carregada do feed infinito.
  const feedRef = useRef(feed);
  feedRef.current = feed;

  const totalEntradas = useMemo(
    () => feed.reduce((acc, dia) => acc + dia.entries.length, 0),
    [feed],
  );

  // Exporta exatamente o que está na tela (páginas já carregadas + filtros
  // ativos). Reconsultar o banco aqui devolveria linhas que o curador não
  // estava vendo — o arquivo deixaria de ser auditável contra a UI.
  const exportarCsv = () => {
    try {
      const csv = buildCurationCsv(feed);
      // BOM: sem ele o Excel em pt-BR lê UTF-8 como Latin-1 e quebra acentos.
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = buildCurationCsvFilename();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Revogar libera o blob; sem isso a aba retém o arquivo em memória.
      URL.revokeObjectURL(url);
      toast({
        title: 'CSV exportado',
        description: `${totalEntradas} evento(s) de curadoria no arquivo.`,
      });
    } catch (erro) {
      logger.error('exportarCsv failed', {
        error: erro instanceof Error ? erro.message : String(erro),
      });
      toast({
        title: 'Falha ao exportar',
        description: 'Não foi possível gerar o arquivo CSV.',
        variant: 'destructive',
      });
    }
  };




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
            {FILTROS.map((opcao) => {
              const badge = formatPendingBadge(pendentes[opcao.value].size);
              return (
                <ToggleGroupItem
                  key={opcao.value}
                  value={opcao.value}
                  className="text-meta h-7 gap-1.5 px-3"
                  // O número é lido junto do rótulo: quem usa leitor de tela
                  // não enxerga o badge e ficaria sem saber que há novidades.
                  aria-label={badge ? `${opcao.label}, ${badge} novidades` : opcao.label}
                >
                  {opcao.label}
                  {badge && (
                    <span
                      aria-hidden
                      className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.6875rem] font-medium leading-none text-primary"
                    >
                      {badge}
                    </span>
                  )}
                </ToggleGroupItem>
              );
            })}

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

          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="text-meta h-7 w-[220px]" aria-label="Filtrar por template">
              <SelectValue placeholder="Todos os templates" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all" className="text-meta">
                Todos os templates
              </SelectItem>
              {TEMPLATES_ORDENADOS.map((template) => (
                <SelectItem key={template.id} value={template.id} className="text-meta">
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-meta ml-auto h-7 px-3"
            onClick={exportarCsv}
            disabled={totalEntradas === 0}
            aria-label="Exportar curadoria filtrada em CSV"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Exportar CSV
          </Button>

          {removocoesVisiveis > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-meta h-7 px-3"
              onClick={pedirRestauracaoEmMassa}
              disabled={restaurarTodas.isPending}
              aria-label={`Restaurar ${removocoesVisiveis} remoções visíveis`}
            >
              {restaurarTodas.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              Restaurar todas ({removocoesVisiveis})
            </Button>
          )}

          {falhas.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="text-meta h-7 px-3"
              onClick={() => tentarNovamente.mutate()}
              disabled={tentarNovamente.isPending || templatesRetentaveis.length === 0}
              aria-label={`Tentar novamente ${falhas.length} template(s) que falharam`}
              title={falhas.map((f) => `${f.templateName}: ${f.message}`).join('\n')}
            >
              {tentarNovamente.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              Tentar novamente ({templatesRetentaveis.length})
            </Button>
          )}
        </div>

        {falhas.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-2">
            {falhas.map((f) => (
              <li key={f.templateId} className="text-meta flex flex-wrap items-center gap-1.5">
                <Badge variant="destructive" className="text-meta">
                  {RESTORE_FAILURE_LABEL[f.kind]}
                </Badge>
                <span className="font-medium text-foreground">{f.templateName}</span>
                <span className="text-muted-foreground">
                  {f.skillCount} vínculo(s) pendente(s) — {f.message}
                </span>
              </li>
            ))}
          </ul>
        )}

        {rotuloPendentes && (
          <div className="pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-meta h-7 px-3"
              onClick={aplicarNovidades}
              aria-live="polite"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {rotuloPendentes} — atualizar
            </Button>
          </div>
        )}


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
                {dia.entries.map((entrada) => {
                  const novo = isHighlighted(
                    destaques,
                    highlightKey(entrada.templateId, entrada.skillId),
                    agora,
                  );
                  return (
                  <li
                    key={`${entrada.templateId}-${entrada.skillId}`}
                    className={cn(
                      'rounded-md border p-3 transition-colors hover:border-primary/40',
                      novo
                        ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border/60 bg-card/40',
                    )}
                    // Anunciado ao leitor de tela: o realce é a única pista de
                    // que a linha acabou de chegar, e cor sozinha não acessível.
                    aria-label={novo ? 'Novidade recém-chegada' : undefined}
                  >
                    {novo && (
                      <span className="sr-only">
                        Atualizado nos últimos {Math.round(CURATION_HIGHLIGHT_TTL_MS / 1000)}{' '}
                        segundos.
                      </span>
                    )}

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
                  );
                })}
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

      <AlertDialog open={confirmarAberto} onOpenChange={setConfirmarAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar {removocoesVisiveis} vínculos?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as remoções visíveis no recorte atual voltarão a ser recomendadas nos
              respectivos templates. A ação vale apenas para o que está carregado na tela e pode
              ser desfeita removendo os vínculos novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmarAberto(false);
                restaurarTodas.mutate();
              }}
            >
              Restaurar todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>


  );
}
