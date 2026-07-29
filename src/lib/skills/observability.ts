/**
 * Observabilidade da biblioteca de skills — camada PURA (sem I/O).
 *
 * Consolida quatro sinais independentes que hoje vivem espalhados:
 *   1. Ingestão .................. execuções do Harvester (volume e aceite)
 *   2. Fila de classificação ..... backlog pendente e idade do mais antigo
 *   3. Reclassificação humana .... quanto o curador precisa corrigir a máquina
 *   4. Instabilidade ............. calibrações de limiar sob alerta/vencidas
 *
 * Todas as funções são determinísticas e aceitam `now` injetável para que os
 * testes não dependam do relógio do ambiente.
 */

import {
  CALIBRATION_SCALE_LABEL,
  detectCalibrationInstabilityByScale,
  findStaleOverridesByScale,
  type CalibrationInstability,
  type CalibrationScale,
  type ThresholdCalibration,
} from '@/lib/skills/thresholdCalibration';
import type { ClassificationDecision } from '@/lib/skills/classificationEfficacy';

const DIA_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* 1. Ingestão                                                         */
/* ------------------------------------------------------------------ */

/** Linha crua de `skill_harvest_runs`, como chega do PostgREST. */
export interface HarvestRunInput {
  id?: string | null;
  status?: string | null;
  repos_scanned?: number | string | null;
  candidates_found?: number | string | null;
  candidates_accepted?: number | string | null;
  candidates_rejected?: number | string | null;
  duration_ms?: number | string | null;
  created_at?: string | null;
}

export interface IngestionSummary {
  /** Execuções consideradas na janela. */
  runs: number;
  /** Execuções que terminaram em erro. */
  failed: number;
  /** Execuções ainda em andamento no momento da leitura. */
  running: number;
  reposScanned: number;
  candidatesFound: number;
  candidatesAccepted: number;
  /** `accepted / found` em 0..1; `null` quando nada foi encontrado. */
  acceptRate: number | null;
  /** `failed / runs` em 0..1; `null` quando não houve execução. */
  failureRate: number | null;
  /** Duração média em ms das execuções concluídas; `null` sem amostra. */
  avgDurationMs: number | null;
  /** ISO da execução mais recente datada; `null` quando não há. */
  lastRunAt: string | null;
  /** Série diária (mais antigo → mais recente) para o sparkline. */
  daily: ReadonlyArray<{ date: string; runs: number; accepted: number }>;
}

function num(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function epochOf(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Chave `YYYY-MM-DD` em UTC — evita buckets deslocados por fuso do cliente. */
function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Resume a ingestão em uma janela deslizante.
 *
 * Execuções sem data são contadas nos totais (o trabalho existiu) mas ficam
 * fora da série diária — não há bucket onde encaixá-las sem inventar dados.
 */
export function summarizeIngestion(
  rows: readonly HarvestRunInput[],
  options?: { now?: Date; windowDays?: number },
): IngestionSummary {
  const agora = options?.now?.getTime() ?? Date.now();
  const janela = Math.max(Math.floor(options?.windowDays ?? 14), 1);
  const corte = agora - janela * DIA_MS;

  const buckets = new Map<string, { runs: number; accepted: number }>();
  for (let i = janela - 1; i >= 0; i -= 1) {
    buckets.set(dayKey(agora - i * DIA_MS), { runs: 0, accepted: 0 });
  }

  let runs = 0;
  let failed = 0;
  let running = 0;
  let reposScanned = 0;
  let candidatesFound = 0;
  let candidatesAccepted = 0;
  let duracaoTotal = 0;
  let duracaoAmostra = 0;
  let lastRunMs: number | null = null;

  for (const row of rows) {
    const ts = epochOf(row?.created_at);
    // Fora da janela → ignorado por completo (inclusive dos totais).
    if (ts !== null && ts < corte) continue;

    runs += 1;
    const status = typeof row?.status === 'string' ? row.status.toLowerCase() : '';
    if (status === 'failed' || status === 'error' || status === 'erro') failed += 1;
    if (status === 'running') running += 1;

    reposScanned += num(row?.repos_scanned);
    candidatesFound += num(row?.candidates_found);
    const aceitos = num(row?.candidates_accepted);
    candidatesAccepted += aceitos;

    const dur = num(row?.duration_ms);
    if (dur > 0) {
      duracaoTotal += dur;
      duracaoAmostra += 1;
    }

    if (ts !== null) {
      if (lastRunMs === null || ts > lastRunMs) lastRunMs = ts;
      const bucket = buckets.get(dayKey(ts));
      if (bucket) {
        bucket.runs += 1;
        bucket.accepted += aceitos;
      }
    }
  }

  return {
    runs,
    failed,
    running,
    reposScanned,
    candidatesFound,
    candidatesAccepted,
    acceptRate: candidatesFound > 0 ? candidatesAccepted / candidatesFound : null,
    failureRate: runs > 0 ? failed / runs : null,
    avgDurationMs: duracaoAmostra > 0 ? Math.round(duracaoTotal / duracaoAmostra) : null,
    lastRunAt: lastRunMs === null ? null : new Date(lastRunMs).toISOString(),
    daily: [...buckets.entries()].map(([date, v]) => ({ date, ...v })),
  };
}

/* ------------------------------------------------------------------ */
/* 2. Fila de classificação                                            */
/* ------------------------------------------------------------------ */

/** Linha crua de `skill_reclassification_reviews`. */
export interface ReviewQueueRowInput {
  id?: string | null;
  status?: string | null;
  source?: string | null;
  confidence?: number | string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
}

export interface QueueSummary {
  pending: number;
  /** Idade em dias do pendente mais antigo; 0 quando a fila está vazia. */
  oldestPendingDays: number;
  /** Pendentes parados há mais de `staleDays`. */
  stalePending: number;
  /** Confiança média das propostas pendentes; `null` sem amostra. */
  avgPendingConfidence: number | null;
  /** Distribuição de origem das propostas pendentes. */
  pendingByOrigin: Record<'lexico' | 'ia', number>;
  /** Decisões concluídas na amostra (aprovadas + rejeitadas). */
  decided: number;
  approved: number;
  /** `approved / decided` em 0..1; `null` sem decisões. */
  approvalRate: number | null;
  /** Tempo mediano entre criação e decisão, em horas; `null` sem amostra. */
  medianDecisionHours: number | null;
}

/** Dias parados a partir dos quais um pendente vira pendência de governança. */
export const QUEUE_STALE_DAYS = 7;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const ord = [...values].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 0 ? (ord[meio - 1] + ord[meio]) / 2 : ord[meio];
}

/**
 * Resume a fila de revisão.
 *
 * O tempo de decisão usa MEDIANA, não média: uma única revisão esquecida por
 * semanas distorce a média e faz o painel mentir sobre o ritmo real.
 */
export function summarizeQueue(
  rows: readonly ReviewQueueRowInput[],
  options?: { now?: Date; staleDays?: number },
): QueueSummary {
  const agora = options?.now?.getTime() ?? Date.now();
  const staleDays = Math.max(Math.floor(options?.staleDays ?? QUEUE_STALE_DAYS), 1);

  let pending = 0;
  let stalePending = 0;
  let decided = 0;
  let approved = 0;
  let confSoma = 0;
  let confAmostra = 0;
  let oldestPendingMs: number | null = null;
  const pendingByOrigin: Record<'lexico' | 'ia', number> = { lexico: 0, ia: 0 };
  const duracoesHoras: number[] = [];

  for (const row of rows) {
    const status = typeof row?.status === 'string' ? row.status.toLowerCase() : '';
    const criado = epochOf(row?.created_at);

    if (status === 'pendente') {
      pending += 1;
      const origem = typeof row?.source === 'string' && row.source.toLowerCase() === 'ia' ? 'ia' : 'lexico';
      pendingByOrigin[origem] += 1;

      const conf = typeof row?.confidence === 'string' ? Number(row.confidence) : row?.confidence;
      if (typeof conf === 'number' && Number.isFinite(conf)) {
        confSoma += Math.min(1, Math.max(0, conf));
        confAmostra += 1;
      }

      if (criado !== null) {
        if (oldestPendingMs === null || criado < oldestPendingMs) oldestPendingMs = criado;
        if (agora - criado >= staleDays * DIA_MS) stalePending += 1;
      }
      continue;
    }

    if (status === '') continue;
    decided += 1;
    if (status === 'aprovado' || status === 'approved') approved += 1;

    const revisado = epochOf(row?.reviewed_at);
    if (criado !== null && revisado !== null && revisado >= criado) {
      duracoesHoras.push((revisado - criado) / (60 * 60 * 1000));
    }
  }

  const medianaHoras = median(duracoesHoras);

  return {
    pending,
    oldestPendingDays:
      oldestPendingMs === null ? 0 : Math.max(0, Math.floor((agora - oldestPendingMs) / DIA_MS)),
    stalePending,
    avgPendingConfidence: confAmostra > 0 ? confSoma / confAmostra : null,
    pendingByOrigin,
    decided,
    approved,
    approvalRate: decided > 0 ? approved / decided : null,
    medianDecisionHours: medianaHoras === null ? null : Math.round(medianaHoras * 10) / 10,
  };
}

/* ------------------------------------------------------------------ */
/* 3. Taxa de reclassificação humana                                   */
/* ------------------------------------------------------------------ */

export interface HumanReclassificationSummary {
  /** Decisões que julgaram um rótulo preexistente (corrigido + confirmado). */
  judged: number;
  corrected: number;
  confirmed: number;
  /** `corrected / judged` em 0..1; `null` sem denominador. */
  rate: number | null;
  /** Preenchimentos de vazio — não contam como correção do classificador. */
  filled: number;
  discarded: number;
  /** Variação da taxa entre a metade mais antiga e a mais recente da amostra. */
  trend: 'melhorando' | 'piorando' | 'estavel' | 'indefinido';
}

/** Amostra mínima por metade para arriscar um veredito de tendência. */
export const TREND_MIN_HALF_SAMPLE = 5;
/** Variação absoluta a partir da qual a tendência deixa de ser ruído. */
export const TREND_MIN_DELTA = 0.05;

function correctionRate(decisions: readonly ClassificationDecision[]): number | null {
  let corrigido = 0;
  let confirmado = 0;
  for (const d of decisions) {
    if (d.verdict === 'corrigido') corrigido += 1;
    else if (d.verdict === 'confirmado') confirmado += 1;
  }
  const total = corrigido + confirmado;
  return total > 0 ? corrigido / total : null;
}

/**
 * Mede o quanto o humano precisa corrigir a máquina.
 *
 * Só `corrigido` e `confirmado` entram no denominador: `preenchido` (skill sem
 * departamento) não é erro do classificador, e `descartado` não tocou o
 * Registry. Misturá-los inflaria ou diluiria a taxa sem significado.
 */
export function summarizeHumanReclassification(
  decisions: readonly ClassificationDecision[],
): HumanReclassificationSummary {
  let corrected = 0;
  let confirmed = 0;
  let filled = 0;
  let discarded = 0;

  for (const d of decisions) {
    if (d.verdict === 'corrigido') corrected += 1;
    else if (d.verdict === 'confirmado') confirmed += 1;
    else if (d.verdict === 'preenchido') filled += 1;
    else discarded += 1;
  }

  const judged = corrected + confirmed;

  // A timeline chega do mais recente para o mais antigo; ordenamos por data
  // para que "metade antiga" e "metade recente" sejam de fato temporais.
  const datadas = decisions
    .filter((d) => d.decidedAtMs !== null && (d.verdict === 'corrigido' || d.verdict === 'confirmado'))
    .sort((a, b) => (a.decidedAtMs as number) - (b.decidedAtMs as number));

  let trend: HumanReclassificationSummary['trend'] = 'indefinido';
  if (datadas.length >= TREND_MIN_HALF_SAMPLE * 2) {
    const meio = Math.floor(datadas.length / 2);
    const antes = correctionRate(datadas.slice(0, meio));
    const depois = correctionRate(datadas.slice(meio));
    if (antes !== null && depois !== null) {
      const delta = depois - antes;
      trend =
        Math.abs(delta) < TREND_MIN_DELTA ? 'estavel' : delta < 0 ? 'melhorando' : 'piorando';
    }
  }

  return {
    judged,
    corrected,
    confirmed,
    rate: judged > 0 ? corrected / judged : null,
    filled,
    discarded,
    trend,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Alertas                                                          */
/* ------------------------------------------------------------------ */

export type ObservabilityAlertLevel = 'critico' | 'atencao';

export interface ObservabilityAlert {
  id: string;
  level: ObservabilityAlertLevel;
  title: string;
  detail: string;
}

export interface AlertInputs {
  ingestion: IngestionSummary;
  queue: QueueSummary;
  human: HumanReclassificationSummary;
  calibrations: readonly ThresholdCalibration[];
  now?: Date;
}

/** Taxa de falha de ingestão tolerada antes de alertar. */
export const INGESTION_FAILURE_ALERT = 0.25;
/** Taxa de correção humana a partir da qual o classificador é suspeito. */
export const HUMAN_CORRECTION_ALERT = 0.4;
/** Amostra mínima para acusar o classificador — evita alarme com 2 decisões. */
export const HUMAN_CORRECTION_MIN_SAMPLE = 10;

export interface ObservabilityAlertsResult {
  alerts: ObservabilityAlert[];
  /**
   * Veredito da régua de domínio — mantido no topo por compatibilidade com os
   * consumidores existentes, que só governam esse slider.
   */
  instability: CalibrationInstability;
  /** Veredito completo, uma entrada por régua. */
  instabilityByScale: Record<CalibrationScale, CalibrationInstability>;
}

/**
 * Deriva alertas acionáveis. Cada regra tem amostra mínima própria: alertar
 * com base em dois eventos gera ruído que o curador aprende a ignorar — e um
 * alerta ignorado é pior que nenhum alerta.
 */
export function deriveObservabilityAlerts(input: AlertInputs): ObservabilityAlertsResult {
  const agora = input.now ?? new Date();
  const alerts: ObservabilityAlert[] = [];

  /**
   * Instabilidade e overrides são avaliados POR RÉGUA. Domínio (teto 0,95) e
   * plataforma (teto 0,40) são sliders independentes: somar seus eventos
   * produzia alerta de "limiar instável" a partir de atividade rotineira da
   * outra escala, e uma calibração recente de plataforma zerava indevidamente
   * o alerta de override vencido do domínio.
   */
  const instabilityByScale = detectCalibrationInstabilityByScale(input.calibrations, { now: agora });
  const staleByScale = findStaleOverridesByScale(input.calibrations, { now: agora });
  const escalas: readonly CalibrationScale[] = ['dominio', 'plataforma'];

  for (const escala of escalas) {
    const instab = instabilityByScale[escala];
    if (!instab.unstable) continue;
    alerts.push({
      id: `calibracao-instavel-${escala}`,
      level: 'critico',
      title: `Limiar de revisão instável (${CALIBRATION_SCALE_LABEL[escala]})`,
      detail:
        instab.reason === 'volume'
          ? `${instab.eventsInWindow} calibrações nos últimos 7 dias — amostra ainda pequena para calibrar de novo.`
          : `${instab.reversals} inversões de sentido nos últimos 7 dias (amplitude ${(instab.spread * 100).toFixed(0)} p.p.).`,
    });
  }

  for (const escala of escalas) {
    const { stale, oldestDays } = staleByScale[escala];
    if (stale.length === 0) continue;
    alerts.push({
      id: `override-vencido-${escala}`,
      level: 'atencao',
      title: `Override de instabilidade sem revisão (${CALIBRATION_SCALE_LABEL[escala]})`,
      detail: `${stale.length} override(s) aplicados sob alerta há ${oldestDays} dia(s) sem reavaliação.`,
    });
  }

  if (input.ingestion.runs > 0 && (input.ingestion.failureRate ?? 0) >= INGESTION_FAILURE_ALERT) {
    alerts.push({
      id: 'ingestao-falhando',
      level: 'critico',
      title: 'Ingestão com falhas recorrentes',
      detail: `${input.ingestion.failed} de ${input.ingestion.runs} execuções do Harvester falharam na janela.`,
    });
  }

  if (input.queue.stalePending > 0) {
    alerts.push({
      id: 'fila-parada',
      level: 'atencao',
      title: 'Fila de classificação parada',
      detail: `${input.queue.stalePending} proposta(s) pendente(s) há mais de ${QUEUE_STALE_DAYS} dias; a mais antiga tem ${input.queue.oldestPendingDays} dia(s).`,
    });
  }

  if (
    input.human.judged >= HUMAN_CORRECTION_MIN_SAMPLE &&
    (input.human.rate ?? 0) >= HUMAN_CORRECTION_ALERT
  ) {
    alerts.push({
      id: 'classificador-impreciso',
      level: 'atencao',
      title: 'Classificador exigindo muita correção',
      detail: `${Math.round((input.human.rate ?? 0) * 100)}% das ${input.human.judged} decisões corrigiram o rótulo automático.`,
    });
  }

  return { alerts, instability: instabilityByScale.dominio, instabilityByScale };
}

/** Formata 0..1 como percentual pt-BR; `—` quando não há sinal. */
export function pct(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits).replace('.', ',')}%`;
}

/** Formata duração em ms para leitura humana curta. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1).replace('.', ',')} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s % 60)} s`;
}
