/**
 * Card de eficácia do classificador departamental.
 *
 * Existe para separar dois fenômenos que o painel de demanda mistura: rótulo
 * ERRADO (curador aprovou a troca) e rótulo CERTO mas inseguro (curador
 * rejeitou a troca, confirmando o que já estava lá). A ação corretiva é
 * oposta em cada caso, então exibi-los como um número só induz ao erro.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Gauge, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { fetchClassificationTimeline } from '@/services/skillClassificationTimelineService';
import { normalizeConfidenceThreshold } from '@/lib/skills/skillDemand';

import {
  EFFICACY_VERDICTS,
  EFFICACY_VERDICT_LABEL,
  filterByVerdict,
  normalizeEfficacyFilter,
  summarizeEfficacy,
  type ClassificationDecision,
  type EfficacyFilter,
  type EfficacyVerdict,
} from '@/lib/skills/classificationEfficacy';

const VERDICT_STYLE: Record<EfficacyVerdict, string> = {
  corrigido: 'border-destructive/40 text-destructive',
  preenchido: 'border-primary/40 text-primary',
  confirmado: 'border-success/40 text-success',
  descartado: 'border-muted-foreground/40 text-muted-foreground',
};

function pct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

export interface SkillClassificationEfficacyCardProps {
  /** Limiar hoje em vigor no painel de demanda (para comparar com o sugerido). */
  currentThreshold?: number;
  /** Aplica o limiar sugerido nas preferências do painel. Ausente = card só lê. */
  onApplyThreshold?: (value: number) => void;
}

export function SkillClassificationEfficacyCard({
  currentThreshold,
  onApplyThreshold,
}: SkillClassificationEfficacyCardProps = {}) {
  const [decisoes, setDecisoes] = useState<ClassificationDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<EfficacyFilter>('all');


  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setDecisoes(await fetchClassificationTimeline());
    } catch (error) {
      logger.error('fetchClassificationTimeline failed', { error: (error as Error).message });
      toast.error('Não foi possível carregar o histórico de classificação.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const resumo = useMemo(() => summarizeEfficacy(decisoes), [decisoes]);
  const visiveis = useMemo(() => filterByVerdict(decisoes, filtro), [decisoes, filtro]);

  /**
   * O sugerido passa pelo mesmo normalizador do painel (quantização em 0,01 e
   * clamp no piso/teto). Sem isso, aplicar poderia gravar um valor que o
   * painel reescreveria logo em seguida — o botão pareceria não funcionar.
   */
  const sugerido = useMemo(
    () =>
      resumo.suggestedThreshold === null
        ? null
        : normalizeConfidenceThreshold(resumo.suggestedThreshold),
    [resumo.suggestedThreshold],
  );

  const podeAplicar =
    sugerido !== null &&
    (currentThreshold === undefined ||
      normalizeConfidenceThreshold(currentThreshold) !== sugerido);


  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden />
              Eficácia do classificador
            </CardTitle>
            <CardDescription>
              Cada decisão de curadoria julga o rótulo automático. Confirmações indicam limiar
              conservador demais; correções indicam léxico incompleto.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void carregar()}
            disabled={loading}
            aria-label="Recarregar histórico de classificação"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant="outline">{resumo.total} decisões</Badge>
          <Badge variant="outline">Acerto: {pct(resumo.accuracy)}</Badge>
          <Badge variant="outline">
            Confiança quando acertou: {pct(resumo.avgConfidenceWhenRight)}
          </Badge>
          <Badge variant="outline">
            Confiança quando errou: {pct(resumo.avgConfidenceWhenWrong)}
          </Badge>
          {EFFICACY_VERDICTS.map((v) => (
            <Badge key={v} variant="outline" className={cn(VERDICT_STYLE[v])}>
              {EFFICACY_VERDICT_LABEL[v]}: {resumo.byVerdict[v]}
            </Badge>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {resumo.suggestedThreshold !== null && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-body-sm text-muted-foreground">
              O classificador acertou com confiança média de {pct(resumo.avgConfidenceWhenRight)}.
              Um limiar de revisão em torno de{' '}
              <span className="font-semibold text-foreground">{sugerido?.toFixed(2)}</span>{' '}
              reduziria confirmações redundantes sem esconder correções.
            </p>
            {onApplyThreshold && sugerido !== null && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!podeAplicar}
                  onClick={() => {
                    onApplyThreshold(sugerido);
                    toast.success(`Limiar de revisão ajustado para ${sugerido.toFixed(2)}`);
                  }}
                >
                  <Gauge className="mr-2 h-4 w-4" />
                  Aplicar limiar sugerido
                </Button>
                <span className="text-caption text-muted-foreground">
                  {podeAplicar
                    ? `Atual: ${(currentThreshold ?? 0).toFixed(2)}`
                    : 'Já é o limiar em vigor'}
                </span>
              </div>
            )}
          </div>
        )}


        <Select value={filtro} onValueChange={(v) => setFiltro(normalizeEfficacyFilter(v))}>
          <SelectTrigger className="w-[220px]" aria-label="Filtrar por veredito">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vereditos</SelectItem>
            {EFFICACY_VERDICTS.map((v) => (
              <SelectItem key={v} value={v}>
                {EFFICACY_VERDICT_LABEL[v]} ({resumo.byVerdict[v]})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {visiveis.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            {loading
              ? 'Carregando histórico…'
              : 'Nenhuma decisão de reclassificação registrada neste recorte.'}
          </p>
        ) : (
          <ScrollArea className="h-[320px] pr-3">
            <ul className="space-y-2">
              {visiveis.map((d) => (
                <li
                  key={d.auditId}
                  className="rounded-lg border border-border/60 p-3 flex flex-wrap items-center gap-2"
                >
                  <span className="font-medium text-body-sm">{d.slug}</span>
                  <Badge variant="outline" className={cn('text-meta', VERDICT_STYLE[d.verdict])}>
                    {EFFICACY_VERDICT_LABEL[d.verdict]}
                  </Badge>
                  <span className="text-meta text-muted-foreground">
                    {d.from ?? 'sem depto.'} → {d.to ?? '—'}
                  </span>
                  <Badge variant="outline" className="text-meta">
                    antes: {d.previousSource} {d.previousConfidence.toFixed(2)}
                  </Badge>
                  <Badge variant="outline" className="text-meta">
                    proposta {d.origin} {d.confidence.toFixed(2)}
                  </Badge>
                  {d.decidedAt && (
                    <span className="text-meta text-muted-foreground ml-auto">
                      {new Date(d.decidedAt).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
