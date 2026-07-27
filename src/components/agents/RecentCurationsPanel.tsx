/**
 * Feed de curadoria manual recente (template ↔ skill).
 *
 * Consome `fetchRecentCurations`, cuja consulta casa com o índice parcial
 * `idx_tsl_manual_recent` — o custo não cresce com o volume de vínculos
 * automáticos, que hoje representam a maioria absoluta da tabela.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  type CurationActorScope,
  type CurationFeedFilter,
} from '@/services/templateSkillLinkService';
import {
  applyCurationPendingEvent,
  formatPendingLabel,
  useCurationRealtime,
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
  const [pendentes, setPendentes] = useState<ReadonlySet<string>>(() => new Set());

  const registrarPendente = useCallback(
    (evento: CurationRealtimeEvent) => {
      setPendentes((atual) => applyCurationPendingEvent(atual, evento, filtro));
    },
    [filtro],
  );

  // Curadoria é colaborativa: sem realtime, dois admins veem estados divergentes
  // até o staleTime de 30s expirar.
  useCurationRealtime(filtro, true, registrarPendente);

  // Trocar de filtro invalida a contagem: os eventos acumulados foram avaliados
  // contra o recorte anterior e não descrevem mais o que está na tela.
  useEffect(() => {
    setPendentes(new Set());
  }, [filtro, escopo, templateId]);

  const rotuloPendentes = formatPendingLabel(pendentes.size);

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
    setDestaques(beginHighlight(pendentes, t));
    setAgora(t);
    setPendentes(new Set());
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
        </div>

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
