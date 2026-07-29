/**
 * Leitura das calibrações de limiar registradas no `audit_log`.
 *
 * Por que um parser dedicado em vez de confiar no shape gravado: o metadata é
 * `jsonb` livre e sobrevive a refatorações da UI. Linhas antigas (ou escritas
 * por outra versão do app) podem trazer números como string, `from` ausente,
 * `accuracy` nula ou até valores fora de [0,1]. Descartar a linha inteira
 * nesses casos perderia trilha de auditoria; então normalizamos o que dá para
 * normalizar e só rejeitamos quando o campo essencial (`to`) é irrecuperável.
 */

export const THRESHOLD_CALIBRATION_ACTION = 'skill.threshold_calibrate' as const;

/**
 * Régua de confiança de uma calibração.
 *
 * Espelha `ConfidenceScale` de `classificationEfficacy`, mas é declarada aqui
 * para não acoplar o parser de auditoria ao motor de eficácia: este módulo lê
 * linhas históricas e precisa continuar compilando mesmo que o motor mude.
 */
export type CalibrationScale = 'dominio' | 'plataforma';

export const CALIBRATION_SCALE_LABEL: Record<CalibrationScale, string> = {
  dominio: 'Domínio',
  plataforma: 'Plataforma',
};

/** Legado (sem `scale`) é sempre domínio — era a única régua governada. */
export function coerceCalibrationScale(value: unknown): CalibrationScale {
  return value === 'plataforma' ? 'plataforma' : 'dominio';
}


export interface ThresholdCalibrationRowInput {
  id?: unknown;
  action?: unknown;
  created_at?: unknown;
  metadata?: unknown;
}

export interface ThresholdCalibration {
  auditId: string;
  /** Limiar anterior; `null` quando a origem não registrou (linhas legadas). */
  from: number | null;
  to: number;
  /** Tamanho da amostra usada na sugestão; 0 quando ausente/inválido. */
  sampleSize: number;
  accuracy: number | null;
  /**
   * `true` quando o curador aplicou mesmo com alerta de instabilidade.
   * Linhas legadas (sem o campo) valem `false` — ausência não é override.
   */
  overriddenInstability: boolean;
  /**
   * Justificativa textual exigida quando houve override. `null` para linhas
   * legadas ou quando o texto veio vazio/ilegível.
   */
  overrideReason: string | null;
  /**
   * Régua de confiança da calibração. Linhas legadas (gravadas antes da
   * segmentação de escalas) valem `dominio`: era a única régua que o slider
   * governava, então assumir isso preserva a leitura histórica correta.
   */
  scale: CalibrationScale;
  /** ISO válido, ou `null` quando a data veio corrompida. */
  at: string | null;

}

/** Mínimo de caracteres úteis para uma justificativa ser aceita. */
export const OVERRIDE_REASON_MIN = 12;
/** Teto de armazenamento — metadata de auditoria não é campo de texto livre. */
export const OVERRIDE_REASON_MAX = 280;

/**
 * Normaliza a justificativa de override.
 *
 * Remove caracteres de controle (colagem de logs), colapsa espaços e trunca no
 * teto. Devolve `null` quando não sobra texto — assim o chamador nunca grava
 * string vazia em `metadata.override_reason`, o que faria a auditoria parecer
 * justificada sem estar.
 */
export function normalizeOverrideReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const limpo = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (limpo === '') return null;
  return limpo.length > OVERRIDE_REASON_MAX ? limpo.slice(0, OVERRIDE_REASON_MAX).trim() : limpo;
}

/** `true` quando a justificativa tem substância suficiente para ser aceita. */
export function isOverrideReasonValid(value: unknown): boolean {
  const norm = normalizeOverrideReason(value);
  return norm !== null && norm.length >= OVERRIDE_REASON_MIN;
}

/** Filtro de governança da linha do tempo de calibrações. */
export type CalibrationTimelineFilter = 'all' | 'overridden';

export function normalizeCalibrationFilter(value: unknown): CalibrationTimelineFilter {
  return value === 'overridden' ? 'overridden' : 'all';
}

/** Filtro por régua; `all` preserva ambas. */
export type CalibrationScaleFilter = CalibrationScale | 'all';

export function normalizeCalibrationScaleFilter(value: unknown): CalibrationScaleFilter {
  return value === 'dominio' || value === 'plataforma' ? value : 'all';
}

/**
 * Separa as calibrações por régua.
 *
 * Necessário porque comparar um limiar de plataforma (teto 0,40) com um de
 * domínio (teto 0,95) na mesma série produz "quedas" e "saltos" que nunca
 * existiram — a leitura de tendência só é válida dentro de uma escala.
 */
export function filterCalibrationsByScale(
  items: readonly ThresholdCalibration[],
  filter: CalibrationScaleFilter,
): ThresholdCalibration[] {
  return filter === 'all' ? [...items] : items.filter((i) => i.scale === filter);
}

/** Aplica o filtro sem mutar a lista original. */
export function filterCalibrations(
  items: readonly ThresholdCalibration[],
  filter: CalibrationTimelineFilter,
): ThresholdCalibration[] {
  return filter === 'overridden' ? items.filter((i) => i.overriddenInstability) : [...items];
}

/** Aceita number ou string numérica; devolve `null` para o resto. */
function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // `Number('')` é 0 — string vazia não pode virar limiar zero silenciosamente.
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceRatio(value: unknown): number | null {
  const n = coerceNumber(value);
  if (n === null) return null;
  return Math.min(Math.max(n, 0), 1);
}

function coerceIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : new Date(ts).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseThresholdCalibrations(
  rows: readonly ThresholdCalibrationRowInput[],
): ThresholdCalibration[] {
  const vistos = new Set<string>();
  const saida: ThresholdCalibration[] = [];

  for (const row of rows) {
    if (row?.action !== THRESHOLD_CALIBRATION_ACTION) continue;

    const auditId = typeof row.id === 'string' && row.id !== '' ? row.id : null;
    // Sem id estável não há chave de lista nem deduplicação confiável.
    if (auditId === null || vistos.has(auditId)) continue;

    const meta = asRecord(row.metadata);
    const to = coerceRatio(meta.to);
    if (to === null) continue;

    const sample = coerceNumber(meta.sample_size);

    vistos.add(auditId);
    saida.push({
      auditId,
      from: coerceRatio(meta.from),
      to,
      sampleSize: sample === null || sample < 0 ? 0 : Math.floor(sample),
      accuracy: coerceRatio(meta.accuracy),
      // Só o booleano literal `true` conta como override; string "true" ou
      // 1 vindos de metadata livre não devem virar acusação de burla.
      overriddenInstability: meta.overridden_instability === true,
      overrideReason: normalizeOverrideReason(meta.override_reason),
      scale: coerceCalibrationScale(meta.scale),
      at: coerceIsoDate(row.created_at),
    });
  }

  return saida;
}

/** Direção da mudança — usada só para o rótulo visual. */
export function calibrationDirection(
  item: ThresholdCalibration,
): 'aumentou' | 'reduziu' | 'manteve' {
  if (item.from === null) return 'manteve';
  if (item.to > item.from) return 'aumentou';
  if (item.to < item.from) return 'reduziu';
  return 'manteve';
}

/** Janela padrão para julgar "calibrações frequentes". */
export const INSTABILITY_WINDOW_DAYS = 7;
/** A partir de quantas calibrações na janela o volume já é suspeito. */
export const INSTABILITY_MIN_EVENTS = 3;

export interface CalibrationInstability {
  unstable: boolean;
  /** Calibrações datadas dentro da janela. */
  eventsInWindow: number;
  /** Trocas de sentido (subiu→desceu ou vice-versa) dentro da janela. */
  reversals: number;
  /** Amplitude entre o menor e o maior limiar aplicado na janela. */
  spread: number;
  reason: 'estavel' | 'volume' | 'oscilacao';
  /**
   * Régua sobre a qual o veredito foi calculado. `null` quando a chamada
   * recebeu uma lista heterogênea (leitura agregada legada) — nesse caso o
   * resultado não deve ser exibido como diagnóstico de um slider específico.
   */
  scale: CalibrationScale | null;
}


/**
 * Detecta instabilidade de calibração.
 *
 * Dois sintomas distintos justificam alerta e por motivos diferentes:
 * - VOLUME: muitas calibrações na janela indicam que o limiar sugerido oscila
 *   porque a amostra ainda é pequena — calibrar mais só amplifica o ruído.
 * - OSCILAÇÃO: poucas calibrações, mas alternando de sentido, indicam léxico
 *   instável (a acurácia sobe e desce), não amostra insuficiente.
 *
 * Linhas sem data são ignoradas: não dá para situá-las na janela, e assumir
 * "agora" inflaria o contador artificialmente.
 */
export function detectCalibrationInstability(
  items: readonly ThresholdCalibration[],
  options?: { now?: Date; windowDays?: number; minEvents?: number },
): CalibrationInstability {
  const agora = options?.now?.getTime() ?? Date.now();
  const janelaDias = Math.max(options?.windowDays ?? INSTABILITY_WINDOW_DAYS, 1);
  const minimo = Math.max(options?.minEvents ?? INSTABILITY_MIN_EVENTS, 2);
  const corte = agora - janelaDias * 24 * 60 * 60 * 1000;

  const naJanela = items
    .filter((i) => {
      if (i.at === null) return false;
      const ts = Date.parse(i.at);
      // Datas futuras (relógio torto do cliente) não são descartadas: ainda
      // são eventos recentes e contam para o volume.
      return !Number.isNaN(ts) && ts >= corte;
    })
    .sort((a, b) => Date.parse(a.at as string) - Date.parse(b.at as string));

  let reversals = 0;
  let anterior: 'aumentou' | 'reduziu' | null = null;
  for (const item of naJanela) {
    const dir = calibrationDirection(item);
    if (dir === 'manteve') continue;
    if (anterior !== null && dir !== anterior) reversals += 1;
    anterior = dir;
  }

  const valores = naJanela.map((i) => i.to);
  const spread = valores.length === 0 ? 0 : Math.max(...valores) - Math.min(...valores);

  const porVolume = naJanela.length >= minimo;
  const porOscilacao = reversals >= 2;

  // A régua só é declarada quando toda a amostra pertence à mesma escala;
  // lista heterogênea produz `null` para impedir que a UI rotule o veredito
  // como diagnóstico de um slider que não foi o único a se mover.
  const escalas = new Set(items.map((i) => i.scale));
  const scale: CalibrationScale | null = escalas.size === 1 ? [...escalas][0] : null;

  return {
    unstable: porVolume || porOscilacao,
    eventsInWindow: naJanela.length,
    reversals,
    spread: Number(spread.toFixed(4)),
    reason: porVolume ? 'volume' : porOscilacao ? 'oscilacao' : 'estavel',
    scale,
  };
}

/**
 * Instabilidade segmentada por régua.
 *
 * Motivo: um limiar de plataforma (teto 0,40) e um de domínio (teto 0,95)
 * nunca disputam o mesmo espaço. Avaliados juntos, três calibrações rotineiras
 * de plataforma disparavam alerta de "domínio instável" — falso positivo
 * reproduzido em 300/300 cenários simulados antes desta partição.
 */
export function detectCalibrationInstabilityByScale(
  items: readonly ThresholdCalibration[],
  options?: { now?: Date; windowDays?: number; minEvents?: number },
): Record<CalibrationScale, CalibrationInstability> {
  // A régua é reafirmada explicitamente: fatia vazia não tem como inferir a
  // escala sozinha, e devolver `null` ali faria a UI perder o rótulo do card.
  const porEscala = (scale: CalibrationScale): CalibrationInstability => ({
    ...detectCalibrationInstability(filterCalibrationsByScale(items, scale), options),
    scale,
  });
  return { dominio: porEscala('dominio'), plataforma: porEscala('plataforma') };
}




/** Prazo de revisão de um override antes de virar pendência de governança. */
export const OVERRIDE_REVIEW_DEADLINE_DAYS = 30;

export interface StaleOverrideReport {
  /** Overrides datados que passaram do prazo sem calibração posterior. */
  stale: ThresholdCalibration[];
  /** Idade em dias do override vencido mais antigo; 0 quando não há vencidos. */
  oldestDays: number;
}

/**
 * Aponta overrides de instabilidade que envelheceram sem revisão.
 *
 * "Revisão" aqui é qualquer calibração posterior ao override DENTRO DA MESMA
 * RÉGUA: se o curador voltou a mexer naquele limiar depois, a decisão
 * excepcional já foi reavaliada na prática. Uma calibração de plataforma NÃO
 * revisa um override de domínio — são sliders distintos, com tetos distintos,
 * governando decisões distintas. Antes da partição, qualquer atividade recente
 * em qualquer régua zerava o alerta do override antigo da outra (mascaramento
 * confirmado em 300/300 cenários simulados).
 *
 * Overrides sem data são ignorados — sem timestamp não há prazo a contar, e
 * tratá-los como vencidos criaria alarme permanente e irreparável.
 */
export function findStaleOverrides(
  items: readonly ThresholdCalibration[],
  options?: { now?: Date; deadlineDays?: number },
): StaleOverrideReport {
  const agora = options?.now?.getTime() ?? Date.now();
  const prazo = Math.max(options?.deadlineDays ?? OVERRIDE_REVIEW_DEADLINE_DAYS, 1);
  const limiteMs = prazo * 24 * 60 * 60 * 1000;

  const datados = items
    .map((item) => ({ item, ts: item.at === null ? NaN : Date.parse(item.at) }))
    .filter((e) => !Number.isNaN(e.ts));

  // Marco de "última atividade" por régua — nunca global.
  const maisRecentePorEscala = new Map<CalibrationScale, number>();
  for (const e of datados) {
    const atual = maisRecentePorEscala.get(e.item.scale);
    if (atual === undefined || e.ts > atual) maisRecentePorEscala.set(e.item.scale, e.ts);
  }

  const stale = datados
    .filter(({ item, ts }) => {
      if (!item.overriddenInstability) return false;
      // Houve calibração posterior na MESMA régua → considerado revisado.
      const marco = maisRecentePorEscala.get(item.scale) ?? ts;
      if (ts < marco) return false;
      return agora - ts >= limiteMs;
    })
    .map((e) => e.item);

  const oldestDays =
    stale.length === 0
      ? 0
      : Math.floor(
          Math.max(...stale.map((i) => agora - Date.parse(i.at as string))) / (24 * 60 * 60 * 1000),
        );

  return { stale, oldestDays };
}

/**
 * Overrides vencidos segmentados por régua.
 *
 * Consumidores que precisam nomear a escala no alerta ("override de domínio
 * vencido") usam este mapa; o agregado acima continua servindo quem só quer
 * saber se existe pendência.
 */
export function findStaleOverridesByScale(
  items: readonly ThresholdCalibration[],
  options?: { now?: Date; deadlineDays?: number },
): Record<CalibrationScale, StaleOverrideReport> {
  return {
    dominio: findStaleOverrides(filterCalibrationsByScale(items, 'dominio'), options),
    plataforma: findStaleOverrides(filterCalibrationsByScale(items, 'plataforma'), options),
  };
}

