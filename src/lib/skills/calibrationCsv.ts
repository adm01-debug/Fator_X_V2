/**
 * Exportação CSV da linha do tempo de calibrações.
 *
 * Separado do componente porque a montagem do arquivo é lógica pura e
 * precisa de teste: o consumidor é um comitê de governança abrindo o arquivo
 * no Excel pt-BR, não um parser tolerante.
 */
import {
  CALIBRATION_SCALE_LABEL,
  calibrationDirection,
  type ThresholdCalibration,
} from './thresholdCalibration';

/** Excel pt-BR interpreta `;` como separador; `,` quebraria as colunas. */
const DELIMITER = ';';
/** Sem BOM o Excel lê UTF-8 como Latin-1 e destrói acentos. */
const BOM = '\uFEFF';

export const CALIBRATION_CSV_HEADERS = [
  'data',
  'regua',
  'de',
  'para',
  'direcao',
  'amostra',
  'acuracia',
  'sob_alerta',
  'justificativa',
] as const;

/**
 * Neutraliza injeção de fórmula: uma justificativa começando com `=`, `+`,
 * `-` ou `@` vira fórmula executável ao abrir a planilha. Prefixar com
 * apóstrofo mantém o texto legível e inerte.
 */
function neutralize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeCell(value: string | number | null): string {
  if (value === null) return '';
  const raw = typeof value === 'number' ? String(value) : neutralize(value);
  // Aspas duplicadas e envelope obrigatório quando há delimitador/quebra.
  return /["\n\r;,]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function formatRatio(value: number | null): string {
  return value === null ? '' : value.toFixed(2);
}

function formatDate(iso: string | null): string {
  if (iso === null) return '';
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? '' : new Date(ts).toISOString();
}

/** Monta o CSV completo (com cabeçalho) a partir da lista já filtrada. */
export function buildCalibrationCsv(items: readonly ThresholdCalibration[]): string {
  const linhas = [CALIBRATION_CSV_HEADERS.join(DELIMITER)];

  for (const item of items) {
    linhas.push(
      [
        escapeCell(formatDate(item.at)),
        escapeCell(CALIBRATION_SCALE_LABEL[item.scale]),
        escapeCell(formatRatio(item.from)),
        escapeCell(formatRatio(item.to)),
        escapeCell(calibrationDirection(item)),
        escapeCell(item.sampleSize),
        escapeCell(formatRatio(item.accuracy)),
        escapeCell(item.overriddenInstability ? 'sim' : 'nao'),
        escapeCell(item.overrideReason),
      ].join(DELIMITER),
    );
  }

  // `\r\n` é o que o Excel espera; `\n` puro gera linha única em versões antigas.
  return BOM + linhas.join('\r\n');
}

/** Nome de arquivo determinístico e ordenável. */
export function calibrationCsvFilename(scope: 'all' | 'overridden', now: Date = new Date()): string {
  const dia = Number.isNaN(now.getTime())
    ? 'sem-data'
    : now.toISOString().slice(0, 10);
  return `calibracoes-${scope === 'overridden' ? 'sob-alerta' : 'todas'}-${dia}.csv`;
}
