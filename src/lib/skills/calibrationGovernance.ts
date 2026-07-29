/**
 * Diagnóstico de governança das calibrações de limiar, segmentado por régua.
 *
 * Por que um módulo separado: a UI já sabe detectar instabilidade e overrides
 * vencidos, mas cada consumidor recombinava esses sinais à mão — e cada um
 * combinava de um jeito. O resultado era um card dizendo "estável" enquanto
 * havia override vencido há 60 dias, e outro dizendo "crítico" por uma régua
 * que sequer estava em uso. Aqui o veredito é calculado uma vez, com regra
 * explícita de precedência, e distribuído pronto.
 *
 * Precedência (do pior para o melhor), aplicada por régua:
 *   1. `critico`   — existe override de instabilidade vencido sem revisão.
 *   2. `atencao`   — a régua está instável (volume ou oscilação), OU existe
 *                    override recente ainda dentro do prazo de revisão.
 *   3. `saudavel`  — há histórico datado e nenhum dos sintomas acima.
 *   4. `sem-dados` — nenhuma calibração datada nessa régua.
 *
 * `sem-dados` é status próprio, não `saudavel`: ausência de evidência não é
 * evidência de saúde, e tratar as duas como iguais faria uma régua nunca
 * calibrada exibir selo verde no comitê.
 */
import {
  CALIBRATION_SCALE_LABEL,
  detectCalibrationInstabilityByScale,
  findStaleOverridesByScale,
  filterCalibrationsByScale,
  type CalibrationInstability,
  type CalibrationScale,
  type StaleOverrideReport,
  type ThresholdCalibration,
} from './thresholdCalibration';

export type CalibrationPostureStatus = 'sem-dados' | 'saudavel' | 'atencao' | 'critico';

/** Ordem de severidade — usada para consolidar o veredito global. */
const SEVERITY_RANK: Record<CalibrationPostureStatus, number> = {
  'sem-dados': 0,
  saudavel: 1,
  atencao: 2,
  critico: 3,
};

export const CALIBRATION_POSTURE_LABEL: Record<CalibrationPostureStatus, string> = {
  'sem-dados': 'Sem dados',
  saudavel: 'Saudável',
  atencao: 'Atenção',
  critico: 'Crítico',
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CalibrationPosture {
  scale: CalibrationScale;
  scaleLabel: string;
  status: CalibrationPostureStatus;
  /** Frase curta e determinística para exibir sem o consumidor recombinar sinais. */
  headline: string;
  /** Total de calibrações registradas nessa régua (inclui linhas sem data). */
  total: number;
  /** Quantas foram aplicadas sob alerta de instabilidade. */
  overrides: number;
  /** Proporção de overrides sobre o total; 0 quando não há histórico. */
  overrideRate: number;
  /** ISO da calibração mais recente datada; `null` quando não há nenhuma. */
  lastAt: string | null;
  /** Idade em dias da última calibração datada; `null` quando não há nenhuma. */
  daysSinceLast: number | null;
  instability: CalibrationInstability;
  staleOverrides: StaleOverrideReport;
}

export interface CalibrationGovernanceDigest {
  byScale: Record<CalibrationScale, CalibrationPosture>;
  /** Pior status entre as réguas — o que o comitê vê no topo. */
  worstStatus: CalibrationPostureStatus;
  /** Réguas cujo status exige ação (`atencao` ou `critico`). */
  scalesNeedingAction: CalibrationScale[];
}

function latestTimestamp(items: readonly ThresholdCalibration[]): number | null {
  let maior: number | null = null;
  for (const item of items) {
    if (item.at === null) continue;
    const ts = Date.parse(item.at);
    if (Number.isNaN(ts)) continue;
    if (maior === null || ts > maior) maior = ts;
  }
  return maior;
}

function buildHeadline(
  status: CalibrationPostureStatus,
  scale: CalibrationScale,
  instability: CalibrationInstability,
  stale: StaleOverrideReport,
  overrides: number,
): string {
  const regua = CALIBRATION_SCALE_LABEL[scale].toLowerCase();
  switch (status) {
    case 'critico':
      return `${stale.stale.length} override(s) de ${regua} sem revisão há ${stale.oldestDays} dia(s).`;
    case 'atencao':
      if (instability.unstable) {
        return instability.reason === 'volume'
          ? `Régua de ${regua} recalibrada ${instability.eventsInWindow}x na janela — amostra provavelmente insuficiente.`
          : `Régua de ${regua} oscilando de sentido (${instability.reversals} inversões) — léxico instável.`;
      }
      return `${overrides} override(s) de ${regua} dentro do prazo de revisão.`;
    case 'saudavel':
      return `Régua de ${regua} estável, sem pendências de revisão.`;
    default:
      return `Nenhuma calibração datada na régua de ${regua}.`;
  }
}

/**
 * Consolida o diagnóstico das duas réguas.
 *
 * `now` é injetável para manter o teste determinístico — a idade de um
 * override não pode depender do relógio da máquina que roda a suíte.
 */
export function summarizeCalibrationGovernance(
  items: readonly ThresholdCalibration[],
  options?: { now?: Date; deadlineDays?: number; windowDays?: number; minEvents?: number },
): CalibrationGovernanceDigest {
  const agoraDate = options?.now;
  const agora =
    agoraDate !== undefined && !Number.isNaN(agoraDate.getTime()) ? agoraDate.getTime() : Date.now();

  const instabilidades = detectCalibrationInstabilityByScale(items, {
    now: options?.now,
    windowDays: options?.windowDays,
    minEvents: options?.minEvents,
  });
  const vencidos = findStaleOverridesByScale(items, {
    now: options?.now,
    deadlineDays: options?.deadlineDays,
  });

  const montar = (scale: CalibrationScale): CalibrationPosture => {
    const fatia = filterCalibrationsByScale(items, scale);
    const overrides = fatia.filter((i) => i.overriddenInstability).length;
    const ultimo = latestTimestamp(fatia);
    const instability = instabilidades[scale];
    const staleOverrides = vencidos[scale];

    let status: CalibrationPostureStatus;
    if (staleOverrides.stale.length > 0) {
      status = 'critico';
    } else if (instability.unstable || overrides > 0) {
      status = 'atencao';
    } else if (ultimo !== null) {
      status = 'saudavel';
    } else {
      status = 'sem-dados';
    }

    return {
      scale,
      scaleLabel: CALIBRATION_SCALE_LABEL[scale],
      status,
      headline: buildHeadline(status, scale, instability, staleOverrides, overrides),
      total: fatia.length,
      overrides,
      overrideRate: fatia.length === 0 ? 0 : Number((overrides / fatia.length).toFixed(4)),
      lastAt: ultimo === null ? null : new Date(ultimo).toISOString(),
      // Relógio torto do cliente pode datar no futuro; idade negativa vira 0
      // em vez de "calibrado há -3 dias", que o comitê leria como bug.
      daysSinceLast: ultimo === null ? null : Math.max(Math.floor((agora - ultimo) / DAY_MS), 0),
      instability,
      staleOverrides,
    };
  };

  const byScale: Record<CalibrationScale, CalibrationPosture> = {
    dominio: montar('dominio'),
    plataforma: montar('plataforma'),
  };

  const escalas: CalibrationScale[] = ['dominio', 'plataforma'];
  const worstStatus = escalas.reduce<CalibrationPostureStatus>((pior, s) => {
    const atual = byScale[s].status;
    return SEVERITY_RANK[atual] > SEVERITY_RANK[pior] ? atual : pior;
  }, 'sem-dados');

  return {
    byScale,
    worstStatus,
    scalesNeedingAction: escalas.filter((s) => SEVERITY_RANK[byScale[s].status] >= 2),
  };
}
