import { describe, it, expect } from 'vitest';
import {
  buildCalibrationCsv,
  calibrationCsvFilename,
  CALIBRATION_CSV_HEADERS,
} from '@/lib/skills/calibrationCsv';
import {
  findStaleOverrides,
  OVERRIDE_REVIEW_DEADLINE_DAYS,
  type ThresholdCalibration,
} from '@/lib/skills/thresholdCalibration';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-07-28T12:00:00.000Z');

function calib(over: Partial<ThresholdCalibration> = {}): ThresholdCalibration {
  return {
    auditId: Math.random().toString(36).slice(2),
    scale: 'dominio',
    from: 0.5,
    to: 0.6,
    sampleSize: 30,
    accuracy: 0.8,
    overriddenInstability: false,
    overrideReason: null,
    at: AGORA.toISOString(),
    ...over,
  };
}

describe('buildCalibrationCsv', () => {
  it('emite BOM, cabeçalho e CRLF', () => {
    const csv = buildCalibrationCsv([calib()]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain(CALIBRATION_CSV_HEADERS.join(';'));
    expect(csv).toContain('\r\n');
  });

  it('exporta apenas cabeçalho quando a lista está vazia', () => {
    expect(buildCalibrationCsv([])).toBe('\uFEFF' + CALIBRATION_CSV_HEADERS.join(';'));
  });

  it('escapa ponto e vírgula, aspas e quebras de linha na justificativa', () => {
    const csv = buildCalibrationCsv([
      calib({ overriddenInstability: true, overrideReason: 'a; b "c"\nd' }),
    ]);
    expect(csv).toContain('"a; b ""c""\nd"');
  });

  it('neutraliza injeção de fórmula', () => {
    for (const prefixo of ['=', '+', '-', '@']) {
      const csv = buildCalibrationCsv([
        calib({ overriddenInstability: true, overrideReason: `${prefixo}CMD()` }),
      ]);
      expect(csv).toContain(`'${prefixo}CMD()`);
    }
  });

  it('mantém células vazias para valores nulos em vez de "null"', () => {
    const csv = buildCalibrationCsv([calib({ from: null, accuracy: null, at: null })]);
    expect(csv).not.toContain('null');
    expect(csv).toContain(';;');
  });

  it('marca override com sim/nao', () => {
    expect(buildCalibrationCsv([calib({ overriddenInstability: true })])).toContain(';sim;');
    expect(buildCalibrationCsv([calib()])).toContain(';nao;');
  });

  it('não quebra com data corrompida', () => {
    expect(() => buildCalibrationCsv([calib({ at: 'nao-e-data' })])).not.toThrow();
  });

  it('gera nome de arquivo ordenável por escopo', () => {
    expect(calibrationCsvFilename('overridden', AGORA)).toBe('calibracoes-sob-alerta-2026-07-28.csv');
    expect(calibrationCsvFilename('all', AGORA)).toBe('calibracoes-todas-2026-07-28.csv');
  });

  it('tolera Date inválida no nome do arquivo', () => {
    expect(calibrationCsvFilename('all', new Date('x'))).toBe('calibracoes-todas-sem-data.csv');
  });
});

describe('findStaleOverrides', () => {
  it('não acusa override recente', () => {
    const r = findStaleOverrides(
      [calib({ overriddenInstability: true, at: new Date(AGORA.getTime() - 5 * DIA).toISOString() })],
      { now: AGORA },
    );
    expect(r.stale).toHaveLength(0);
    expect(r.oldestDays).toBe(0);
  });

  it('acusa override além do prazo', () => {
    const r = findStaleOverrides(
      [
        calib({
          overriddenInstability: true,
          at: new Date(AGORA.getTime() - (OVERRIDE_REVIEW_DEADLINE_DAYS + 10) * DIA).toISOString(),
        }),
      ],
      { now: AGORA },
    );
    expect(r.stale).toHaveLength(1);
    expect(r.oldestDays).toBe(OVERRIDE_REVIEW_DEADLINE_DAYS + 10);
  });

  it('considera revisado quando houve calibração posterior', () => {
    const r = findStaleOverrides(
      [
        calib({
          overriddenInstability: true,
          at: new Date(AGORA.getTime() - 90 * DIA).toISOString(),
        }),
        calib({ at: new Date(AGORA.getTime() - 2 * DIA).toISOString() }),
      ],
      { now: AGORA },
    );
    expect(r.stale).toHaveLength(0);
  });

  it('ignora overrides sem data para não gerar alarme perpétuo', () => {
    const r = findStaleOverrides([calib({ overriddenInstability: true, at: null })], { now: AGORA });
    expect(r.stale).toHaveLength(0);
  });

  it('ignora calibrações normais antigas', () => {
    const r = findStaleOverrides(
      [calib({ at: new Date(AGORA.getTime() - 200 * DIA).toISOString() })],
      { now: AGORA },
    );
    expect(r.stale).toHaveLength(0);
  });

  it('respeita prazo customizado e piso de 1 dia', () => {
    const item = calib({
      overriddenInstability: true,
      at: new Date(AGORA.getTime() - 3 * DIA).toISOString(),
    });
    expect(findStaleOverrides([item], { now: AGORA, deadlineDays: 2 }).stale).toHaveLength(1);
    expect(findStaleOverrides([item], { now: AGORA, deadlineDays: 0 }).stale).toHaveLength(1);
    expect(findStaleOverrides([item], { now: AGORA, deadlineDays: 10 }).stale).toHaveLength(0);
  });

  it('lista vazia é estável', () => {
    expect(findStaleOverrides([], { now: AGORA })).toEqual({ stale: [], oldestDays: 0 });
  });
});
