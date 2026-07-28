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
  /** ISO válido, ou `null` quando a data veio corrompida. */
  at: string | null;
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
