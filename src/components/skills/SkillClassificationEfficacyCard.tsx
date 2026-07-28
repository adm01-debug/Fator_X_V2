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
import { AlertTriangle, Gauge, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { logger } from '@/lib/logger';
import { audit } from '@/lib/auditService';
import { fetchClassificationTimeline } from '@/services/skillClassificationTimelineService';
import { fetchThresholdCalibrations } from '@/services/thresholdCalibrationService';
import {
  INSTABILITY_WINDOW_DAYS,
  OVERRIDE_REASON_MAX,
  OVERRIDE_REASON_MIN,
  calibrationDirection,
  detectCalibrationInstability,
  filterCalibrations,
  isOverrideReasonValid,
  normalizeOverrideReason,
  type CalibrationTimelineFilter,
  type ThresholdCalibration,
} from '@/lib/skills/thresholdCalibration';
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

const DIRECTION_LABEL: Record<ReturnType<typeof calibrationDirection>, string> = {
  aumentou: 'mais rigoroso',
  reduziu: 'mais permissivo',
  manteve: 'sem variação',
};

const DIRECTION_STYLE: Record<ReturnType<typeof calibrationDirection>, string> = {
  aumentou: 'border-primary/40 text-primary',
  reduziu: 'border-destructive/40 text-destructive',
  manteve: 'border-muted-foreground/40 text-muted-foreground',
};

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
  const [calibracoes, setCalibracoes] = useState<ThresholdCalibration[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<EfficacyFilter>('all');
  const [filtroCalib, setFiltroCalib] = useState<CalibrationTimelineFilter>('all');
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const instabilidade = useMemo(() => detectCalibrationInstability(calibracoes), [calibracoes]);
  const totalSobAlerta = useMemo(
    () => calibracoes.filter((c) => c.overriddenInstability).length,
    [calibracoes],
  );
  const calibracoesVisiveis = useMemo(
    () => filterCalibrations(calibracoes, filtroCalib),
    [calibracoes, filtroCalib],
  );
  const justificativaValida = isOverrideReasonValid(justificativa);




  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      // As duas leituras são independentes: uma falhar não pode zerar a outra.
      const [timeline, calibs] = await Promise.allSettled([
        fetchClassificationTimeline(),
        fetchThresholdCalibrations(),
      ]);

      if (timeline.status === 'fulfilled') {
        setDecisoes(timeline.value);
      } else {
        logger.error('fetchClassificationTimeline failed', {
          error: (timeline.reason as Error)?.message,
        });
        toast.error('Não foi possível carregar o histórico de classificação.');
      }

      if (calibs.status === 'fulfilled') {
        setCalibracoes(calibs.value);
      } else {
        // Falha aqui é diagnóstica, não impede o uso do card.
        logger.warn('fetchThresholdCalibrations failed', {
          error: (calibs.reason as Error)?.message,
        });
      }
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

  /**
   * Aplicar é sempre a MESMA operação; o que muda com instabilidade é a
   * fricção antes dela e a exigência de justificativa. Extraído para não
   * duplicar a auditoria em dois caminhos de UI (que fatalmente divergiriam).
   */
  const aplicarSugerido = useCallback(
    (motivo?: string) => {
      if (!onApplyThreshold || sugerido === null) return;
      const anterior =
        currentThreshold === undefined ? null : normalizeConfidenceThreshold(currentThreshold);
      // Justificativa só faz sentido quando houve override; fora disso não
      // poluímos a metadata com texto sem contexto.
      const razao = instabilidade.unstable ? normalizeOverrideReason(motivo) : null;
      onApplyThreshold(sugerido);
      // Auditoria não bloqueia a UI: falha vira log, não erro visível.
      void audit
        .skillThresholdCalibrated({
          from: anterior,
          to: sugerido,
          sampleSize: resumo.total,
          accuracy: resumo.accuracy,
          // Marca a decisão tomada CONTRA o alerta: sem isso, a série ruidosa
          // fica indistinguível de uma calibração saudável na trilha.
          overriddenInstability: instabilidade.unstable,
          instabilityReason: instabilidade.reason,
          eventsInWindow: instabilidade.eventsInWindow,
          reversals: instabilidade.reversals,
          overrideReason: razao,
        })
        // Só recarrega depois da escrita: refetch antes traria a lista sem a
        // linha nova e pareceria que nada foi gravado.
        .then(() => carregar());
      toast.success(`Limiar de revisão ajustado para ${sugerido.toFixed(2)}`);
    },
    [
      onApplyThreshold,
      sugerido,
      currentThreshold,
      resumo.total,
      resumo.accuracy,
      instabilidade,
      carregar,
    ],
  );

  const confirmarOverride = useCallback(() => {
    if (!justificativaValida) return;
    aplicarSugerido(justificativa);
    setJustificativa('');
    setOverrideOpen(false);
  }, [aplicarSugerido, justificativa, justificativaValida]);

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
                {instabilidade.unstable ? (
                  /* Instabilidade detectada: o sugerido nasce de uma amostra
                     que ainda oscila. Aplicar sem fricção transformaria ruído
                     em política. Não bloqueamos de vez (o curador pode ter
                     contexto que os dados não têm), mas exigimos justificativa
                     textual — que fica na trilha para revisão de governança. */
                  <Dialog
                    open={overrideOpen}
                    onOpenChange={(aberto) => {
                      setOverrideOpen(aberto);
                      // Fechar sem confirmar descarta o rascunho: reabrir com
                      // texto antigo induziria justificativa reaproveitada.
                      if (!aberto) setJustificativa('');
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" disabled={!podeAplicar}>
                        <AlertTriangle className="mr-2 h-4 w-4 text-warning" aria-hidden />
                        Aplicar limiar sugerido
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Calibração instável — justifique o override</DialogTitle>
                        <DialogDescription>
                          {instabilidade.reason === 'volume'
                            ? `Houve ${instabilidade.eventsInWindow} calibrações nos últimos ${INSTABILITY_WINDOW_DAYS} dias`
                            : `Houve ${instabilidade.reversals} inversões de sentido nos últimos ${INSTABILITY_WINDOW_DAYS} dias`}
                          {` (amplitude de ${instabilidade.spread.toFixed(2)}). Recalibrar agora tende a perseguir ruído da amostra. Registre por que aplicar ${sugerido.toFixed(2)} mesmo assim.`}
                        </DialogDescription>
                      </DialogHeader>
                      <Textarea
                        value={justificativa}
                        onChange={(e) => setJustificativa(e.target.value)}
                        placeholder="Ex.: lote de skills de vendas importado hoje distorceu a amostra; limiar manual acordado com o time."
                        maxLength={OVERRIDE_REASON_MAX}
                        rows={4}
                        aria-label="Justificativa do override"
                      />
                      <p className="text-meta text-muted-foreground">
                        Mínimo de {OVERRIDE_REASON_MIN} caracteres · {justificativa.trim().length}/
                        {OVERRIDE_REASON_MAX}
                      </p>
                      <DialogFooter>
                        <Button
                          size="sm"
                          onClick={confirmarOverride}
                          disabled={!justificativaValida || !podeAplicar}
                        >
                          Aplicar {sugerido.toFixed(2)}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!podeAplicar}
                    onClick={() => aplicarSugerido()}
                  >
                    <Gauge className="mr-2 h-4 w-4" />
                    Aplicar limiar sugerido
                  </Button>
                )}
                <span className="text-caption text-muted-foreground">
                  {podeAplicar
                    ? `Atual: ${(currentThreshold ?? 0).toFixed(2)}`
                    : 'Já é o limiar em vigor'}
                </span>
              </div>
            )}
          </div>
        )}

        {calibracoes.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-body-sm font-medium">Calibrações recentes</p>
              {/* Governança revisa exceções, não a série inteira: o filtro
                  isola justamente as decisões tomadas contra o alerta. */}
              <Button
                size="sm"
                variant={filtroCalib === 'overridden' ? 'secondary' : 'ghost'}
                onClick={() =>
                  setFiltroCalib((atual) => (atual === 'overridden' ? 'all' : 'overridden'))
                }
                disabled={totalSobAlerta === 0 && filtroCalib === 'all'}
              >
                <AlertTriangle className="mr-2 h-3.5 w-3.5" />
                Somente sob alerta ({totalSobAlerta})
              </Button>
            </div>
            {instabilidade.unstable && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-meta text-warning-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <span>
                  {instabilidade.reason === 'volume'
                    ? `${instabilidade.eventsInWindow} calibrações em ${INSTABILITY_WINDOW_DAYS} dias`
                    : `${instabilidade.reversals} inversões de sentido em ${INSTABILITY_WINDOW_DAYS} dias`}
                  {' — '}amplitude de {instabilidade.spread.toFixed(2)}. Sinal de amostra pequena ou
                  léxico instável: acumule mais decisões antes de recalibrar.
                </span>
              </div>
            )}

            {calibracoesVisiveis.length === 0 ? (
              <p className="text-meta text-muted-foreground">
                Nenhuma calibração aplicada sob alerta de instabilidade.
              </p>
            ) : (
              <ul className="space-y-1">
                {calibracoesVisiveis.map((c) => (
                  <li key={c.auditId} className="flex flex-wrap items-center gap-2 text-meta">
                    <Badge
                      variant="outline"
                      className={cn('text-meta', DIRECTION_STYLE[calibrationDirection(c)])}
                    >
                      {DIRECTION_LABEL[calibrationDirection(c)]}
                    </Badge>
                    {c.overriddenInstability && (
                      <Badge
                        variant="outline"
                        className="text-meta border-amber-500/40 text-amber-600 dark:text-amber-400"
                        title="Aplicado apesar do alerta de instabilidade"
                      >
                        sob alerta
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      {c.from === null ? '—' : c.from.toFixed(2)} → {c.to.toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">
                      amostra {c.sampleSize} · acerto {pct(c.accuracy)}
                    </span>
                    {c.at && (
                      <span className="ml-auto text-muted-foreground">
                        {new Date(c.at).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                    {c.overriddenInstability && (
                      <p className="w-full text-meta text-muted-foreground">
                        {c.overrideReason
                          ? `Justificativa: ${c.overrideReason}`
                          : 'Sem justificativa registrada (decisão anterior à exigência).'}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
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
