/**
 * Painel de enriquecimento de descrições vazias.
 *
 * Skills importadas do GitHub que chegaram sem texto são invisíveis na busca e
 * ignoradas pelo recomendador. Este painel gera a descrição via IA e grava
 * SOMENTE o que passou do piso de confiança; o resto fica listado como
 * sugestão para o curador decidir.
 *
 * Escolhas de interface que carregam intenção:
 *  - O botão principal só GERA. A gravação é um segundo clique explícito,
 *    porque escrever no catálogo é irreversível na prática.
 *  - Cada proposta mostra confiança e o motivo do modelo. Sem isso o curador
 *    aprovaria no atacado, que é o mesmo que não revisar.
 *  - As recusadas aparecem com o motivo. "Por que esta continuou vazia?" é a
 *    primeira pergunta depois do lote, e a resposta não pode estar só no log.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Download, Loader2, PenLine, RefreshCw, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MIN_ENRICH_CONFIDENCE,
  REJECTION_LABEL,
  autoApplicable,
  needsReview,
  proposalsToCsv,
  type DescriptionProposal,
  type EnrichCandidate,
  type RejectedProposal,
} from '@/lib/skills/descriptionEnrichment';
import {
  applyDescriptions,
  fetchEnrichCandidates,
  runDescriptionEnrichQueue,
} from '@/services/skillEnrichmentService';
import {
  formatFailureSummary,
  summarizeQueueFailures,
  type FailureSummary,
} from '@/lib/skills/queueFailureSummary';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

interface SkillDescriptionEnrichPanelProps {
  /** Recarrega a lista do chamador quando o catálogo muda. */
  onApplied?: () => void;
  className?: string;
}

export function SkillDescriptionEnrichPanel({
  onApplied,
  className,
}: SkillDescriptionEnrichPanelProps) {
  const [carregando, setCarregando] = useState(true);
  const [candidatos, setCandidatos] = useState<EnrichCandidate[]>([]);
  const [gerando, setGerando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [progresso, setProgresso] = useState({ concluidos: 0, total: 0 });
  const [propostas, setPropostas] = useState<DescriptionProposal[]>([]);
  const [recusadas, setRecusadas] = useState<RejectedProposal[]>([]);
  const [descartadas, setDescartadas] = useState<string[]>([]);
  /** Resumo por causa raiz do último lote; `null` quando não houve falha. */
  const [falhas, setFalhas] = useState<FailureSummary | null>(null);

  // Aborta a fila se o painel desmontar no meio: sem isso, os `setState` do
  // onSnapshot continuariam disparando contra um componente morto.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await fetchEnrichCandidates();
      setCandidatos(lista);
    } catch (error) {
      logger.error('SkillDescriptionEnrichPanel: falha ao carregar', {
        message: error instanceof Error ? error.message : String(error),
      });
      toast.error('Não foi possível carregar as skills sem descrição.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const gerar = useCallback(async () => {
    if (candidatos.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setGerando(true);
    setPropostas([]);
    setRecusadas([]);
    setDescartadas([]);
    setFalhas(null);
    setProgresso({ concluidos: 0, total: candidatos.length });

    try {
      const resultado = await runDescriptionEnrichQueue({
        candidates: candidatos,
        signal: controller.signal,
        onSnapshot: (snapshot) => {
          // Isolamento: um erro de render aqui não pode derrubar a fila.
          try {
            setProgresso({
              concluidos: snapshot.items.filter((i) => i.status !== 'pendente' && i.status !== 'executando')
                .length,
              total: candidatos.length,
            });
          } catch {
            /* progresso é cosmético */
          }
        },
      });

      setPropostas(resultado.proposals);
      setRecusadas([...resultado.rejections, ...resultado.skipped]);
      setDescartadas(resultado.skipped.map((s) => s.slug));

      // Resumo por causa raiz: "N falharam" não diz se retentar adianta.
      const resumo = summarizeQueueFailures(resultado.snapshot);
      setFalhas(resumo.totalFailed > 0 ? resumo : null);

      if (resumo.totalFailed > 0 && resumo.retryPointless) {
        toast.error(`Lote bloqueado: ${formatFailureSummary(resumo)}.`);
      } else if (resultado.proposals.length === 0) {
        toast.info('Nenhuma descrição defensável foi gerada nesta rodada.');
      } else {
        toast.success(
          `${resultado.proposals.length} descriç${resultado.proposals.length === 1 ? 'ão gerada' : 'ões geradas'}.`,
        );
      }
    } catch (error) {
      logger.error('SkillDescriptionEnrichPanel: falha na geração', {
        message: error instanceof Error ? error.message : String(error),
      });
      toast.error('Falha ao gerar descrições.');
    } finally {
      setGerando(false);
      abortRef.current = null;
    }
  }, [candidatos]);

  const automaticas = useMemo(() => autoApplicable(propostas), [propostas]);
  const revisaveis = useMemo(() => needsReview(propostas), [propostas]);

  const gravar = useCallback(
    async (lote: readonly DescriptionProposal[]) => {
      if (lote.length === 0) return;
      setGravando(true);
      try {
        const { applied, failures } = await applyDescriptions(lote);
        if (applied.length > 0) {
          const aplicados = new Set(applied.map((p) => p.skillId));
          setPropostas((atual) => atual.filter((p) => !aplicados.has(p.skillId)));
          setCandidatos((atual) => atual.filter((c) => !aplicados.has(c.skillId)));
          toast.success(`${applied.length} descriç${applied.length === 1 ? 'ão gravada' : 'ões gravadas'}.`);
          onApplied?.();
        }
        if (failures.length > 0) {
          toast.error(`${failures.length} não puderam ser gravadas: ${failures[0].message}`);
        }
      } finally {
        setGravando(false);
      }
    },
    [onApplied],
  );

  const descartar = useCallback((skillId: string) => {
    setPropostas((atual) => atual.filter((p) => p.skillId !== skillId));
  }, []);

  const exportar = useCallback(() => {
    const blob = new Blob([proposalsToCsv(propostas)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `descricoes-geradas-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [propostas]);

  const pct = progresso.total > 0 ? Math.round((progresso.concluidos / progresso.total) * 100) : 0;

  return (
    <Card className={cn('border-border/60', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-title-sm">
            <PenLine className="h-4 w-4 text-primary" aria-hidden="true" />
            Descrições ausentes
          </CardTitle>
          <CardDescription>
            Skills importadas sem descrição não aparecem na busca nem no recomendador. A
            geração usa nome, tags e repositório de origem; só grava automaticamente acima de{' '}
            {Math.round(MIN_ENRICH_CONFIDENCE * 100)}% de confiança.
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void carregar()}
            disabled={carregando || gerando}
            aria-label="Recarregar lista"
          >
            <RefreshCw className={cn('h-4 w-4', carregando && 'animate-spin')} aria-hidden="true" />
          </Button>
          <Button size="sm" onClick={() => void gerar()} disabled={gerando || candidatos.length === 0}>
            {gerando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <PenLine className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Gerar descrições
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {carregando ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <p className="text-body-sm text-muted-foreground">
            {candidatos.length === 0
              ? 'Nenhuma skill importada está sem descrição. Catálogo completo.'
              : `${candidatos.length} skill${candidatos.length === 1 ? '' : 's'} importada${
                  candidatos.length === 1 ? '' : 's'
                } sem descrição.`}
          </p>
        )}

        {gerando && (
          <div className="space-y-1">
            <Progress value={pct} aria-label="Progresso da geração" />
            <p className="text-meta text-muted-foreground">
              {progresso.concluidos} de {progresso.total} processadas
            </p>
          </div>
        )}

        {falhas && !gerando && (
          <div
            className={cn(
              'space-y-2 rounded-md border p-3',
              falhas.retryPointless
                ? 'border-destructive/40 bg-destructive/5'
                : 'border-border bg-muted/40',
            )}
            role="status"
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle
                className={cn(
                  'h-4 w-4 shrink-0',
                  falhas.retryPointless ? 'text-destructive' : 'text-muted-foreground',
                )}
                aria-hidden="true"
              />
              <p className="text-body-sm font-medium">
                {falhas.totalFailed} não {falhas.totalFailed === 1 ? 'processada' : 'processadas'}
              </p>
              {falhas.retryPointless && (
                <Badge variant="destructive">Retentar não resolve</Badge>
              )}
            </div>
            <ul className="space-y-1">
              {falhas.buckets.map((b) => (
                <li key={b.category} className="text-meta text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {b.count}× {b.label}
                  </span>{' '}
                  — {b.hint}
                </li>
              ))}
            </ul>
          </div>
        )}



        {propostas.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{automaticas.length} com confiança alta</Badge>
              {revisaveis.length > 0 && (
                <Badge variant="outline">{revisaveis.length} para revisar</Badge>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={exportar}>
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  CSV
                </Button>
                <Button
                  size="sm"
                  onClick={() => void gravar(automaticas)}
                  disabled={gravando || automaticas.length === 0}
                >
                  {gravando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Gravar {automaticas.length} automática{automaticas.length === 1 ? '' : 's'}
                </Button>
              </div>
            </div>

            <ScrollArea className="max-h-96 pr-3">
              <ul className="space-y-3">
                {propostas.map((p) => (
                  <li key={p.skillId} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-body-sm font-medium">{p.name}</span>
                          <Badge
                            variant={p.autoApply ? 'secondary' : 'outline'}
                            className="text-meta"
                          >
                            {Math.round(p.confidence * 100)}% confiança
                          </Badge>
                        </div>
                        <p className="text-body-sm text-muted-foreground">{p.description}</p>
                        {p.rationale && (
                          <p className="text-meta text-muted-foreground/80">{p.rationale}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void gravar([p])}
                          disabled={gravando || !p.autoApply}
                          aria-label={`Gravar descrição de ${p.name}`}
                          title={
                            p.autoApply
                              ? 'Gravar no catálogo'
                              : 'Confiança abaixo do mínimo para gravação'
                          }
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => descartar(p.skillId)}
                          aria-label={`Descartar sugestão de ${p.name}`}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        {recusadas.length > 0 && (
          <details className="rounded-lg border border-border/60 p-3">
            <summary className="cursor-pointer text-body-sm text-muted-foreground">
              {recusadas.length} skill{recusadas.length === 1 ? '' : 's'} continuaram sem descrição
              {descartadas.length > 0 && ` (${descartadas.length} sem sinal suficiente)`}
            </summary>
            <ul className="mt-2 space-y-1">
              {recusadas.map((r) => (
                <li key={`${r.skillId}-${r.reason}`} className="text-meta text-muted-foreground">
                  <span className="font-mono">{r.slug}</span> — {REJECTION_LABEL[r.reason]}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
