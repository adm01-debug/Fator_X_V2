/**
 * Regressão da régua de confiança na trilha de calibrações.
 *
 * O defeito coberto aqui: antes da segmentação, um limiar de plataforma
 * (teto 0,40) e um de domínio (teto 0,95) eram gravados sem distinção. A
 * leitura histórica então comparava números de escalas diferentes, inventando
 * "quedas" de limiar e inflando inversões no detector de instabilidade.
 */
import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_SCALE_LABEL,
  coerceCalibrationScale,
  detectCalibrationInstability,
  filterCalibrationsByScale,
  normalizeCalibrationScaleFilter,
  parseThresholdCalibrations,
  THRESHOLD_CALIBRATION_ACTION,
  type CalibrationScale,
  type ThresholdCalibration,
} from '@/lib/skills/thresholdCalibration';
import { buildCalibrationCsv, CALIBRATION_CSV_HEADERS } from '@/lib/skills/calibrationCsv';

const NOW = new Date('2026-07-29T12:00:00.000Z');
const DIA = 24 * 60 * 60 * 1000;

function row(id: string, scale: unknown, to = 0.5) {
  return {
    id,
    action: THRESHOLD_CALIBRATION_ACTION,
    created_at: NOW.toISOString(),
    metadata: { to, from: 0.4, sample_size: 10, accuracy: 0.8, scale },
  };
}

function calib(
  over: Partial<ThresholdCalibration> & { scale: CalibrationScale },
): ThresholdCalibration {
  return {
    auditId: Math.random().toString(36).slice(2),
    from: 0.4,
    to: 0.5,
    sampleSize: 10,
    accuracy: 0.8,
    overriddenInstability: false,
    overrideReason: null,
    at: NOW.toISOString(),
    ...over,
  };
}

describe('coerceCalibrationScale', () => {
  it('reconhece apenas o literal de plataforma', () => {
    expect(coerceCalibrationScale('plataforma')).toBe('plataforma');
  });

  it('trata legado e lixo como domínio', () => {
    const lixos: unknown[] = [
      undefined,
      null,
      '',
      'dominio',
      'domínio',
      'DOMINIO',
      'Plataforma',
      'platform',
      0,
      1,
      true,
      false,
      [],
      {},
      { scale: 'plataforma' },
      NaN,
    ];
    for (const v of lixos) {
      expect(coerceCalibrationScale(v)).toBe('dominio');
    }
  });

  it('é idempotente sobre a própria saída', () => {
    for (const v of ['plataforma', 'dominio', 'x', null]) {
      const uma = coerceCalibrationScale(v);
      expect(coerceCalibrationScale(uma)).toBe(uma);
    }
  });
});

describe('parseThresholdCalibrations — régua', () => {
  it('preserva plataforma e faz fallback para domínio', () => {
    const parsed = parseThresholdCalibrations([
      row('a', 'plataforma'),
      row('b', undefined),
      row('c', 'dominio'),
      row('d', 'ruido'),
    ]);
    expect(parsed.map((p) => p.scale)).toEqual(['plataforma', 'dominio', 'dominio', 'dominio']);
  });

  it('mantém a régua estável em 300 linhas alternadas', () => {
    const linhas = Array.from({ length: 300 }, (_, i) =>
      row(`r${i}`, i % 3 === 0 ? 'plataforma' : i % 3 === 1 ? undefined : 'dominio'),
    );
    const parsed = parseThresholdCalibrations(linhas);
    expect(parsed).toHaveLength(300);
    expect(parsed.filter((p) => p.scale === 'plataforma')).toHaveLength(100);
    expect(parsed.filter((p) => p.scale === 'dominio')).toHaveLength(200);
  });
});

describe('filterCalibrationsByScale', () => {
  const lista = [
    calib({ scale: 'dominio', to: 0.6 }),
    calib({ scale: 'plataforma', to: 0.18 }),
    calib({ scale: 'dominio', to: 0.55 }),
  ];

  it('separa sem mutar a origem', () => {
    const antes = [...lista];
    expect(filterCalibrationsByScale(lista, 'dominio')).toHaveLength(2);
    expect(filterCalibrationsByScale(lista, 'plataforma')).toHaveLength(1);
    expect(filterCalibrationsByScale(lista, 'all')).toHaveLength(3);
    expect(lista).toEqual(antes);
  });

  it('devolve cópia em "all", não a referência original', () => {
    expect(filterCalibrationsByScale(lista, 'all')).not.toBe(lista);
  });

  it('normaliza filtros inválidos para "all"', () => {
    for (const v of [undefined, null, '', 'x', 0, {}]) {
      expect(normalizeCalibrationScaleFilter(v)).toBe('all');
    }
    expect(normalizeCalibrationScaleFilter('dominio')).toBe('dominio');
    expect(normalizeCalibrationScaleFilter('plataforma')).toBe('plataforma');
  });
});

describe('instabilidade isolada por régua', () => {
  it('não conta inversões cruzando escalas', () => {
    // Série de domínio estritamente crescente intercalada com plataforma
    // decrescente: misturado, viraria oscilação; isolado, é estável.
    const misto: ThresholdCalibration[] = [];
    for (let i = 0; i < 6; i += 1) {
      misto.push(
        calib({
          scale: 'dominio',
          from: 0.4 + i * 0.01,
          to: 0.41 + i * 0.01,
          at: new Date(NOW.getTime() - (12 - i * 2) * DIA).toISOString(),
        }),
      );
      misto.push(
        calib({
          scale: 'plataforma',
          from: 0.3 - i * 0.01,
          to: 0.29 - i * 0.01,
          at: new Date(NOW.getTime() - (11 - i * 2) * DIA).toISOString(),
        }),
      );
    }

    const soDominio = filterCalibrationsByScale(misto, 'dominio');
    const janela = { now: NOW, windowDays: 30, minEvents: 99 };
    expect(detectCalibrationInstability(soDominio, janela).reversals).toBe(0);
    expect(detectCalibrationInstability(misto, janela).reversals).toBeGreaterThan(0);
  });

  it('amplitude não mistura tetos de escalas diferentes', () => {
    const itens = [
      calib({ scale: 'dominio', to: 0.9, at: new Date(NOW.getTime() - DIA).toISOString() }),
      calib({ scale: 'plataforma', to: 0.05, at: new Date(NOW.getTime() - DIA).toISOString() }),
    ];
    const opts = { now: NOW, windowDays: 30, minEvents: 99 };
    expect(detectCalibrationInstability(itens, opts).spread).toBeCloseTo(0.85, 4);
    expect(
      detectCalibrationInstability(filterCalibrationsByScale(itens, 'dominio'), opts).spread,
    ).toBe(0);
  });
});

describe('CSV com coluna de régua', () => {
  it('inclui o cabeçalho e o rótulo legível', () => {
    expect(CALIBRATION_CSV_HEADERS).toContain('regua');
    const csv = buildCalibrationCsv([calib({ scale: 'plataforma' }), calib({ scale: 'dominio' })]);
    const linhas = csv.replace('\uFEFF', '').split('\r\n');
    expect(linhas[0].split(';')[1]).toBe('regua');
    expect(linhas[1].split(';')[1]).toBe(CALIBRATION_SCALE_LABEL.plataforma);
    expect(linhas[2].split(';')[1]).toBe(CALIBRATION_SCALE_LABEL.dominio);
  });

  it('mantém contagem de colunas constante em 200 linhas', () => {
    const itens = Array.from({ length: 200 }, (_, i) =>
      calib({ scale: i % 2 === 0 ? 'dominio' : 'plataforma', to: 0.1 + (i % 8) * 0.05 }),
    );
    const linhas = buildCalibrationCsv(itens).replace('\uFEFF', '').split('\r\n');
    expect(linhas).toHaveLength(201);
    for (const l of linhas) {
      expect(l.split(';')).toHaveLength(CALIBRATION_CSV_HEADERS.length);
    }
  });
});
