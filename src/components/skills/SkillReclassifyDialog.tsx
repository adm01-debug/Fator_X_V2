/**
 * SkillReclassifyDialog — revisão humana obrigatória antes de qualquer escrita.
 *
 * O plano é calculado localmente pelo classificador determinístico; este
 * diálogo só existe para que um curador confirme item a item. Nada é aplicado
 * sem seleção explícita, e o resultado (inclusive falhas parciais) fica
 * visível em vez de virar um toast genérico.
 *
 * Fallback LLM: as skills sem evidência léxica suficiente já não são um beco
 * sem saída — podem ser enviadas em lote para classificação por IA. Essas
 * propostas entram na lista DESMARCADAS por padrão: evidência léxica é
 * verificável termo a termo, palpite de modelo não é, e as duas não podem
 * receber o mesmo grau de confiança automática.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  Download,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { departmentLabel } from '@/config/skill-departments';
import {
  MAX_RECLASSIFY_BATCH,
  MIN_RECLASSIFY_CONFIDENCE,
  buildReclassificationPlan,
  mergeLlmProposals,
  reclassificationToCsv,
  selectProposals,
  type ReclassifyCandidate,
  type ReclassifyProposal,
} from '@/lib/skills/departmentReclassification';
import type { QueueSnapshot } from '@/lib/skills/llmClassificationQueue';
import {
  applyReclassification,
  runLlmFallbackQueue,
  type LlmClassificationVerdict,
  type ReclassifyFailure,
} from '@/services/skillReclassificationService';
import {
  ReviewOperationError,
  submitReclassificationReviews,
} from '@/services/skillReclassificationReviewService';
import { logger } from '@/lib/logger';

const FAILURE_LABEL: Record<ReclassifyFailure['kind'], string> = {
  permission: 'Sem permissão',
  conflict: 'Conflito de estado',
  network: 'Falha de rede',
  unknown: 'Erro',
};

/** Rótulos das falhas por item da fila (`QueueWorkerError.kind`). */
const QUEUE_ERROR_LABEL: Record<string, string> = {
  creditos: 'Créditos de IA esgotados',
  permissao: 'Sem permissão',
  taxa: 'Limite de taxa',
  invalido: 'Payload inválido',
  rede: 'Falha de rede',
  servidor: 'Erro no servidor',
  contrato: 'Resposta inesperada',
  erro: 'Erro',
};

export interface SkillReclassifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: readonly ReclassifyCandidate[];
  /**
   * Limiar persistido nas preferências do curador. Opcional para manter o
   * componente utilizável isoladamente (testes, storybook), caindo no piso.
   */
  confidenceThreshold?: number;
  /** Notifica o dono das preferências para persistir a escolha. */
  onConfidenceThresholdChange?: (value: number) => void;
  /**
   * Dispara a classificação por IA assim que o diálogo abre com candidatos
   * sem evidência léxica. Usado pelo atalho "Sugerir depto. com IA" da fila
   * "Sem depto." — abrir o diálogo e pedir mais um clique seria fricção pura,
   * já que aquele recorte existe justamente porque o léxico falhou.
   * Nada é escrito: as propostas continuam nascendo DESMARCADAS.
   */
  autoRunLlm?: boolean;
  /** Chamado após aplicar com sucesso ao menos uma troca. */
  onApplied: () => void;
}

export function SkillReclassifyDialog({
  open,
  onOpenChange,
  candidates,
  confidenceThreshold,
  onConfidenceThresholdChange,
  autoRunLlm = false,
  onApplied,
}: SkillReclassifyDialogProps) {
  // Limiar ajustável pelo curador, persistido nas preferências. O piso é o
  // default do módulo: afrouxar abaixo dele reabriria a porta para trocas sem
  // evidência, que é exatamente o que o classificador existe para impedir.
  // Só é possível ENDURECER. Um valor persistido corrompido degrada para o piso.
  const limiar = useMemo(() => {
    const v = confidenceThreshold;
    if (typeof v !== 'number' || !Number.isFinite(v)) return MIN_RECLASSIFY_CONFIDENCE;
    return Math.min(Math.max(Math.round(v * 100) / 100, MIN_RECLASSIFY_CONFIDENCE), 0.95);
  }, [confidenceThreshold]);
  const setLimiar = useCallback(
    (v: number) => onConfidenceThresholdChange?.(v),
    [onConfidenceThresholdChange],
  );
  const plano = useMemo(
    () => buildReclassificationPlan(candidates, { minConfidence: limiar }),
    [candidates, limiar],
  );
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falhas, setFalhas] = useState<ReclassifyFailure[]>([]);

  const [propostasIa, setPropostasIa] = useState<ReclassifyProposal[]>([]);
  const [fila, setFila] = useState<QueueSnapshot<LlmClassificationVerdict> | null>(null);
  const [classificando, setClassificando] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Fechar o diálogo (ou trocar o recorte) tem que MATAR a fila. Sem isso, um
  // lote continua consumindo créditos em background para escrever num
  // componente que ninguém mais está olhando.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Um novo recorte invalida tudo que a IA produziu para o recorte anterior.
  useEffect(() => {
    abortRef.current?.abort();
    setPropostasIa([]);
    setFila(null);
    setDesmarcados(new Set());
    setFalhas([]);
  }, [plano]);

  const propostas = useMemo(() => mergeLlmProposals(plano, propostasIa), [plano, propostasIa]);

  // Seleção por exclusão: o padrão é aplicar tudo que o plano propôs, já que
  // cada proposta passou pela barra de confiança E de margem. Propostas de IA
  // são a exceção — nascem desmarcadas e exigem um clique consciente.
  const selecionados = useMemo(
    () => propostas.filter((p) => !desmarcados.has(p.skillId)).map((p) => p.skillId),
    [propostas, desmarcados],
  );

  const alternar = useCallback((skillId: string) => {
    setDesmarcados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(skillId)) proximo.delete(skillId);
      else proximo.add(skillId);
      return proximo;
    });
  }, []);

  const classificarComIa = useCallback(async () => {
    if (plano.llmCandidates.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setClassificando(true);
    setFila(null);
    try {
      const { proposals, snapshot } = await runLlmFallbackQueue({
        candidates: plano.llmCandidates,
        signal: controller.signal,
        onSnapshot: setFila,
      });
      setFila(snapshot);
      setPropostasIa(proposals);
      // Nascem desmarcadas: o curador opta por cada uma.
      setDesmarcados((atual) => {
        const proximo = new Set(atual);
        for (const p of proposals) proximo.add(p.skillId);
        return proximo;
      });

      const falhou = snapshot.items.filter((i) => i.status === 'falhou');
      const semCredito = falhou.some((i) => i.errorKind === 'creditos');
      if (semCredito) {
        toast.error('Créditos de IA esgotados — o lote foi interrompido.');
      } else if (proposals.length === 0) {
        toast.info('A IA não encontrou nenhuma classificação defensável neste recorte.');
      } else {
        toast.success(
          `${proposals.length} sugestão${proposals.length === 1 ? '' : 'ões'} da IA para revisar.`,
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      logger.error('runLlmFallbackQueue failed', { error: (error as Error).message });
      toast.error('Não foi possível concluir a classificação por IA.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setClassificando(false);
    }
  }, [plano]);

  /**
   * Auto-disparo do lote de IA quando o diálogo é aberto pelo atalho da fila
   * "Sem depto.".
   *
   * O marcador é por PLANO (identidade do objeto memoizado), não um booleano
   * global: se o curador ajustar o limiar ou o recorte mudar, um novo plano
   * nasce e merece um novo lote. Sem esse controle, o efeito re-dispararia a
   * cada render e queimaria créditos em duplicidade.
   */
  const autoDisparadoRef = useRef<unknown>(null);
  useEffect(() => {
    if (!open || !autoRunLlm) return;
    if (classificando) return;
    if (autoDisparadoRef.current === plano) return;
    if (plano.llmCandidates.length === 0) return;
    autoDisparadoRef.current = plano;
    void classificarComIa();
  }, [open, autoRunLlm, plano, classificando, classificarComIa]);

  // Fechar zera o marcador: reabrir é uma intenção nova do curador.
  useEffect(() => {
    if (!open) autoDisparadoRef.current = null;
  }, [open]);

  const cancelarIa = useCallback(() => {
    abortRef.current?.abort();
    setClassificando(false);
  }, []);

  const exportar = useCallback(() => {
    const blob = new Blob([reclassificationToCsv(propostas)], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `plano-reclassificacao-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [propostas]);

  /**
   * Enfileira as propostas selecionadas para revisão manual.
   *
   * Diferente de `aplicar`, este caminho não escreve no Registry: cria um
   * registro auditável (antes/depois + evidência) que um administrador decide
   * depois. Duplicatas não são erro — significam que a proposta já está na
   * fila, e reportá-las como falha treinaria o curador a ignorar avisos.
   */
  const enviarParaRevisao = useCallback(async () => {
    const lote = selectProposals(propostas, selecionados);
    if (lote.length === 0) return;
    setEnviando(true);
    try {
      const { queued, duplicates, failures } = await submitReclassificationReviews(lote, {
        confidenceThreshold: limiar,
      });
      if (queued > 0) {
        toast.success(
          `${queued} proposta${queued === 1 ? '' : 's'} enviada${queued === 1 ? '' : 's'} para revisão.`,
        );
        onApplied();
      }
      if (duplicates.length > 0) {
        toast.info(`${duplicates.length} já estavam na fila de revisão.`);
      }
      if (failures.length > 0) {
        toast.error(`${failures.length} não puderam ser enfileiradas.`);
      } else if (queued > 0) {
        onOpenChange(false);
      }
    } catch (error) {
      const mensagem =
        error instanceof ReviewOperationError
          ? error.message
          : 'Não foi possível enviar para revisão.';
      logger.error('submitReclassificationReviews failed', { error: (error as Error).message });
      toast.error(mensagem);
    } finally {
      setEnviando(false);
    }
  }, [propostas, selecionados, limiar, onApplied, onOpenChange]);

  const aplicar = useCallback(async () => {
    const lote = selectProposals(propostas, selecionados);
    if (lote.length === 0) return;
    setAplicando(true);
    setFalhas([]);
    try {
      const resultado = await applyReclassification(lote);
      setFalhas(resultado.failures);
      if (resultado.applied.length > 0) {
        toast.success(
          `${resultado.applied.length} skill${resultado.applied.length === 1 ? '' : 's'} reclassificada${resultado.applied.length === 1 ? '' : 's'}.`,
        );
        onApplied();
      }
      if (resultado.failures.length > 0) {
        toast.error(`${resultado.failures.length} não puderam ser aplicadas — veja o detalhe.`);
      } else {
        onOpenChange(false);
      }
    } catch (error) {
      logger.error('applyReclassification failed', { error: (error as Error).message });
      toast.error('Não foi possível aplicar a reclassificação.');
    } finally {
      setAplicando(false);
    }
  }, [propostas, selecionados, onApplied, onOpenChange]);

  const excedeLote = selecionados.length > MAX_RECLASSIFY_BATCH;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" aria-hidden />
            Reclassificar departamento
            {/* Origem do lote: o curador precisa saber que a IA já rodou
                sozinha (e consumiu créditos) antes de interpretar a tela. */}
            <Badge variant="outline" className="text-meta font-normal">
              {autoRunLlm ? 'lote automático (fila sem depto.)' : 'lote manual'}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {autoRunLlm
              ? 'Aberto pelo atalho da fila "Sem depto.": a classificação por IA é disparada automaticamente, mas nada é gravado sem sua marcação explícita.'
              : 'Propostas geradas pelo classificador determinístico. Só entram trocas com evidência léxica forte e vantagem clara sobre o segundo departamento mais provável.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{plano.summary.evaluated} avaliadas</Badge>
          <Badge variant="outline" className="border-primary/40 text-primary">
            {plano.summary.proposed} propostas
          </Badge>
          <Badge variant="outline">{plano.summary.unchanged} já corretas</Badge>
          <Badge variant="outline">{plano.summary.ambiguous} ambíguas</Badge>
          <Badge variant="outline">{plano.summary.lowConfidence} sem evidência</Badge>
          {propostasIa.length > 0 && (
            <Badge variant="outline" className="border-accent/50 text-accent-foreground">
              {propostasIa.length} sugestões de IA
            </Badge>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card/40 px-3 py-2 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="limiar-confianca" className="text-meta text-muted-foreground">
              Confiança mínima para propor
            </label>
            <span className="text-body-sm font-medium tabular-nums">{limiar.toFixed(2)}</span>
          </div>
          <Slider
            id="limiar-confianca"
            value={[limiar]}
            min={MIN_RECLASSIFY_CONFIDENCE}
            max={0.95}
            step={0.05}
            disabled={aplicando || classificando || enviando}
            onValueChange={(v) => setLimiar(v[0] ?? MIN_RECLASSIFY_CONFIDENCE)}
            aria-label="Confiança mínima para propor reclassificação"
          />
          <p className="text-meta text-muted-foreground">
            O piso é {MIN_RECLASSIFY_CONFIDENCE.toFixed(2)} e não pode ser afrouxado. Subir o limiar
            reduz propostas e descarta as sugestões de IA já geradas neste recorte.
          </p>
        </div>

        {plano.llmCandidates.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <p className="text-meta text-muted-foreground">
                <span className="text-foreground font-medium">
                  {plano.llmCandidates.length} skill
                  {plano.llmCandidates.length === 1 ? '' : 's'} sem evidência léxica.
                </span>{' '}
                A IA pode sugerir um departamento — as sugestões entram desmarcadas e continuam
                exigindo sua aprovação.
              </p>
              {classificando ? (
                <Button variant="outline" size="sm" onClick={cancelarIa} className="shrink-0">
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void classificarComIa()}
                  disabled={aplicando}
                  className="shrink-0"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Classificar com IA
                </Button>
              )}
            </div>

            {fila && (
              <div className="space-y-1">
                <Progress
                  value={fila.total > 0 ? (fila.done / fila.total) * 100 : 0}
                  aria-label="Progresso da classificação por IA"
                />
                <p className="text-meta text-muted-foreground">
                  {fila.done} de {fila.total} processadas
                  {(() => {
                    const retry = fila.items.filter((i) => i.status === 'aguardando_retry').length;
                    return retry > 0 ? ` · ${retry} aguardando nova tentativa` : '';
                  })()}
                </p>
                {(() => {
                  // Agrupa as falhas por causa. Listar 40 linhas de "limite de
                  // taxa" esconderia o único "créditos esgotados" no meio.
                  const porCausa = new Map<string, number>();
                  for (const item of fila.items) {
                    if (item.status !== 'falhou') continue;
                    const chave = item.errorKind ?? 'erro';
                    porCausa.set(chave, (porCausa.get(chave) ?? 0) + 1);
                  }
                  if (porCausa.size === 0) return null;
                  return (
                    <p className="text-meta text-destructive">
                      {[...porCausa.entries()]
                        .map(([causa, n]) => `${QUEUE_ERROR_LABEL[causa] ?? causa}: ${n}`)
                        .join(' · ')}
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {propostas.length === 0 ? (
          <p className="text-body-sm text-muted-foreground py-8 text-center">
            Nenhuma troca segura a propor neste recorte. Enriqueça as tags e a descrição das skills
            para dar mais sinal ao classificador.
          </p>
        ) : (
          <ScrollArea className="max-h-[320px] pr-3">
            <ul className="space-y-2">
              {propostas.map((p) => (
                <li
                  key={p.skillId}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card/50 px-3 py-2"
                >
                  <Checkbox
                    checked={!desmarcados.has(p.skillId)}
                    onCheckedChange={() => alternar(p.skillId)}
                    aria-label={`Aplicar reclassificação de ${p.name}`}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-medium truncate flex items-center gap-2">
                      <span className="truncate">{p.name}</span>
                      {p.source === 'ia' && (
                        <Badge
                          variant="outline"
                          className="shrink-0 border-accent/50 text-accent-foreground gap-1"
                        >
                          <Sparkles className="h-3 w-3" aria-hidden />
                          IA
                        </Badge>
                      )}
                    </p>
                    <p className="text-meta text-muted-foreground flex items-center gap-1 flex-wrap">
                      <span>{departmentLabel(p.from)}</span>
                      <ArrowRight className="h-3 w-3" aria-hidden />
                      <span className="text-primary">{departmentLabel(p.to)}</span>
                      <span>
                        · confiança {p.confidence}
                        {p.source === 'ia' ? '' : ` · margem ${p.margin}`}
                      </span>
                    </p>
                    {p.matchedTerms.length > 0 && (
                      <p className="text-meta text-muted-foreground truncate">
                        termos: {p.matchedTerms.join(', ')}
                      </p>
                    )}
                    {p.rationale && (
                      <p className="text-meta text-muted-foreground italic truncate">
                        {p.rationale}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}

        {falhas.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
            <p className="text-body-sm font-medium flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {falhas.length} falha{falhas.length === 1 ? '' : 's'}
            </p>
            {falhas.slice(0, 6).map((f) => (
              <p key={f.skillId} className="text-meta text-muted-foreground truncate">
                {f.slug} — {FAILURE_LABEL[f.kind]}: {f.message}
              </p>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={exportar} disabled={propostas.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar plano
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={aplicando || classificando || enviando}
            >
              Cancelar
            </Button>
            {/* Caminho auditável: em vez de escrever direto, enfileira a
                proposta com evidência para decisão de um administrador. */}
            <Button
              variant="secondary"
              onClick={() => void enviarParaRevisao()}
              disabled={aplicando || classificando || enviando || selecionados.length === 0}
            >
              {enviando ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ClipboardCheck className="h-4 w-4 mr-2" />
              )}
              Enviar para revisão
            </Button>
            <Button
              onClick={() => void aplicar()}
              disabled={aplicando || classificando || selecionados.length === 0}
            >
              {aplicando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Aplicar {Math.min(selecionados.length, MAX_RECLASSIFY_BATCH)}
              {excedeLote ? ` de ${selecionados.length}` : ''}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
