/**
 * SkillReclassificationReviewPanel — fila de aprovação com trilha de auditoria.
 *
 * O que esta tela resolve: até agora uma classificação automática virava um
 * UPDATE imediato e o "antes" sumia. Aqui cada proposta é um registro com
 * ANTES → DEPOIS, a evidência que a sustenta (confiança, margem, termos ou
 * justificativa da IA) e a decisão humana com motivo.
 *
 * Decisões de design:
 *  - **Nada de checagem de permissão no cliente.** Quem pode aprovar é o banco
 *    que decide; a UI só traduz o erro. Esconder o botão daria uma falsa
 *    sensação de controle e ainda assim não protegeria nada.
 *  - **Rejeitar exige motivo.** Aprovar não: a evidência já está registrada.
 *    Uma rejeição sem justificativa apaga a informação mais valiosa da trilha —
 *    por que o classificador errou.
 *  - **Decisão é otimista na lista, autoritativa no servidor.** A linha é
 *    substituída pelo registro que a RPC devolve, não por um palpite local.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowRight,
  Check,
  Clock,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { departmentLabel } from '@/config/skill-departments';
import { logger } from '@/lib/logger';
import {
  MAX_DECISION_REASON,
  ReviewOperationError,
  decideReclassificationReview,
  fetchReclassificationReviews,
  type ReclassificationReview,
  type ReviewStatus,
} from '@/services/skillReclassificationReviewService';

type Aba = ReviewStatus | 'todos';

const ABAS: { value: Aba; label: string }[] = [
  { value: 'pendente', label: 'Pendentes' },
  { value: 'aprovado', label: 'Aprovadas' },
  { value: 'rejeitado', label: 'Rejeitadas' },
  { value: 'todos', label: 'Todas' },
];

const STATUS_BADGE: Record<ReviewStatus, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'border-nexus-amber/40 text-nexus-amber' },
  aprovado: { label: 'Aprovada', className: 'border-nexus-emerald/40 text-nexus-emerald' },
  rejeitado: { label: 'Rejeitada', className: 'border-destructive/40 text-destructive' },
};

function formatarData(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pt-BR');
}

function pct(valor: number): string {
  return `${Math.round(valor * 100)}%`;
}

export interface SkillReclassificationReviewPanelProps {
  /** Chamado após uma aprovação — o Registry mudou, a lista de origem precisa recarregar. */
  onApproved?: () => void;
}

export function SkillReclassificationReviewPanel({
  onApproved,
}: SkillReclassificationReviewPanelProps) {
  const [aba, setAba] = useState<Aba>('pendente');
  const [reviews, setReviews] = useState<ReclassificationReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [decidindo, setDecidindo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setReviews(await fetchReclassificationReviews({ status: aba }));
    } catch (error) {
      logger.error('fetchReclassificationReviews failed', { error: (error as Error).message });
      toast.error('Não foi possível carregar a fila de revisão.');
    } finally {
      setLoading(false);
    }
  }, [aba]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const pendentes = useMemo(() => reviews.filter((r) => r.status === 'pendente').length, [reviews]);

  const decidir = useCallback(
    async (review: ReclassificationReview, aprovar: boolean) => {
      const motivo = (motivos[review.id] ?? '').trim();
      if (!aprovar && motivo.length === 0) {
        toast.error('Descreva o motivo da rejeição — é o que fica na auditoria.');
        return;
      }

      setDecidindo(review.id);
      try {
        const atualizada = await decideReclassificationReview({
          reviewId: review.id,
          approve: aprovar,
          reason: motivo,
        });

        setReviews((atual) =>
          aba === 'pendente'
            ? atual.filter((r) => r.id !== review.id)
            : atual.map((r) => (r.id === review.id ? atualizada : r)),
        );
        setMotivos((atual) => {
          const proximo = { ...atual };
          delete proximo[review.id];
          return proximo;
        });

        toast.success(
          aprovar
            ? `${review.slug || review.name} movida para ${departmentLabel(review.to)}.`
            : 'Proposta rejeitada e registrada na auditoria.',
        );
        if (aprovar) onApproved?.();
      } catch (error) {
        const mensagem =
          error instanceof ReviewOperationError ? error.message : 'Não foi possível decidir.';
        toast.error(mensagem);
        // Conflito e "já decidida" significam que a lista está velha: só um
        // recarregamento devolve o estado real.
        if (
          error instanceof ReviewOperationError &&
          (error.kind === 'conflict' || error.kind === 'already_decided')
        ) {
          void carregar();
        }
      } finally {
        setDecidindo(null);
      }
    },
    [motivos, aba, carregar, onApproved],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-body">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            Revisão de classificações
            {pendentes > 0 && aba === 'pendente' && (
              <Badge variant="outline" className="border-nexus-amber/40 text-nexus-amber">
                {pendentes} aguardando
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Cada proposta guarda o antes, o depois, a evidência e a decisão. Aprovar aplica a troca
            no Registry; rejeitar preserva o histórico. Apenas administradores decidem.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          <span className="sr-only">Recarregar fila</span>
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
          <TabsList className="grid w-full grid-cols-4">
            {ABAS.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="text-meta">
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Clock className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-body-sm text-muted-foreground">
              {aba === 'pendente'
                ? 'Nenhuma proposta aguardando revisão.'
                : 'Nenhum registro nesta situação.'}
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[26rem] pr-3">
            <ul className="space-y-3">
              {reviews.map((review) => {
                const badge = STATUS_BADGE[review.status];
                const ocupado = decidindo === review.id;
                return (
                  <li key={review.id} className="rounded-lg border bg-card/50 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body-sm font-medium">{review.name}</span>
                      <code className="text-meta text-muted-foreground">{review.slug}</code>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                      {review.source === 'ia' && (
                        <Badge variant="outline" className="border-primary/40 text-primary">
                          <Sparkles className="mr-1 h-3 w-3" aria-hidden />
                          IA
                        </Badge>
                      )}
                    </div>

                    {/* ANTES → DEPOIS: o coração da auditoria. */}
                    <div className="flex flex-wrap items-center gap-2 text-meta">
                      <Badge variant="secondary">
                        {review.from ? departmentLabel(review.from) : 'Sem departamento'}
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                        {departmentLabel(review.to)}
                      </Badge>
                      <span className="text-muted-foreground">
                        confiança {pct(review.confidence)} · margem {pct(review.margin)}
                        {review.confidenceThreshold !== null
                          ? ` · limiar ${pct(review.confidenceThreshold)}`
                          : ''}
                        {review.runnerUp ? ` · 2º ${departmentLabel(review.runnerUp)}` : ''}
                      </span>
                    </div>

                    {review.matchedTerms.length > 0 && (
                      <p className="text-meta text-muted-foreground">
                        Termos: {review.matchedTerms.slice(0, 8).join(', ')}
                      </p>
                    )}
                    {review.rationale && (
                      <p className="text-meta italic text-muted-foreground">“{review.rationale}”</p>
                    )}

                    {review.status === 'pendente' ? (
                      <div className="space-y-2">
                        <Textarea
                          value={motivos[review.id] ?? ''}
                          onChange={(e) =>
                            setMotivos((atual) => ({
                              ...atual,
                              [review.id]: e.target.value.slice(0, MAX_DECISION_REASON),
                            }))
                          }
                          placeholder="Motivo da decisão (obrigatório ao rejeitar)"
                          className="min-h-[3rem] text-meta"
                          disabled={ocupado}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void decidir(review, false)}
                            disabled={ocupado}
                          >
                            {ocupado ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                            ) : (
                              <X className="mr-1 h-3 w-3" aria-hidden />
                            )}
                            Rejeitar
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => void decidir(review, true)}
                            disabled={ocupado}
                          >
                            {ocupado ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                            ) : (
                              <Check className="mr-1 h-3 w-3" aria-hidden />
                            )}
                            Aprovar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-meta text-muted-foreground">
                        Decidida em {formatarData(review.reviewedAt ?? review.createdAt)}
                        {review.decisionReason ? ` — ${review.decisionReason}` : ''}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
