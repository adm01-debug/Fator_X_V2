/**
 * Cenários de parsing das calibrações de limiar.
 *
 * O foco é resiliência a metadata heterogêneo: o `audit_log` é append-only e
 * guarda linhas de versões antigas do app, então o parser precisa degradar
 * com elegância em vez de quebrar o card inteiro.
 */
import { describe, expect, it } from 'vitest';
import {
  calibrationDirection,
  parseThresholdCalibrations,
  THRESHOLD_CALIBRATION_ACTION,
  type ThresholdCalibrationRowInput,
} from '@/lib/skills/thresholdCalibration';

function row(overrides: Partial<ThresholdCalibrationRowInput> = {}): ThresholdCalibrationRowInput {
  return {
    id: 'a1',
    action: THRESHOLD_CALIBRATION_ACTION,
    created_at: '2026-07-20T10:00:00.000Z',
    metadata: { from: 0.5, to: 0.7, sample_size: 12, accuracy: 0.8 },
    ...overrides,
  };
}

describe('parseThresholdCalibrations', () => {
  it('converte uma linha completa', () => {
    const [item] = parseThresholdCalibrations([row()]);
    expect(item).toMatchObject({ auditId: 'a1', from: 0.5, to: 0.7, sampleSize: 12, accuracy: 0.8 });
    expect(item.at).toBe('2026-07-20T10:00:00.000Z');
  });

  it('ignora ações de outros domínios', () => {
    expect(parseThresholdCalibrations([row({ action: 'agent.update' })])).toHaveLength(0);
  });

  it('descarta linha sem id estável', () => {
    expect(parseThresholdCalibrations([row({ id: null })])).toHaveLength(0);
    expect(parseThresholdCalibrations([row({ id: '' })])).toHaveLength(0);
  });

  it('deduplica ids repetidos', () => {
    expect(parseThresholdCalibrations([row(), row()])).toHaveLength(1);
  });

  it('descarta linha sem limiar novo recuperável', () => {
    expect(parseThresholdCalibrations([row({ metadata: { from: 0.4 } })])).toHaveLength(0);
    expect(parseThresholdCalibrations([row({ metadata: { to: 'abc' } })])).toHaveLength(0);
    expect(parseThresholdCalibrations([row({ metadata: null })])).toHaveLength(0);
    expect(parseThresholdCalibrations([row({ metadata: [1, 2] })])).toHaveLength(0);
  });

  it('aceita números em string mas rejeita string vazia', () => {
    const [item] = parseThresholdCalibrations([
      row({ metadata: { from: '', to: '0.65', sample_size: '9', accuracy: '' } }),
    ]);
    expect(item.from).toBeNull();
    expect(item.to).toBeCloseTo(0.65);
    expect(item.sampleSize).toBe(9);
    expect(item.accuracy).toBeNull();
  });

  it('faz clamp de razões fora de [0,1]', () => {
    const [item] = parseThresholdCalibrations([
      row({ metadata: { from: -3, to: 4, accuracy: 2, sample_size: -5 } }),
    ]);
    expect(item.from).toBe(0);
    expect(item.to).toBe(1);
    expect(item.accuracy).toBe(1);
    expect(item.sampleSize).toBe(0);
  });

  it('normaliza amostra fracionada e trata data inválida como nula', () => {
    const [item] = parseThresholdCalibrations([
      row({ metadata: { to: 0.5, sample_size: 7.9 }, created_at: 'ontem' }),
    ]);
    expect(item.sampleSize).toBe(7);
    expect(item.at).toBeNull();
  });

  it('preserva a ordem recebida do banco', () => {
    const itens = parseThresholdCalibrations([
      row({ id: 'b', metadata: { to: 0.6 } }),
      row({ id: 'a', metadata: { to: 0.4 } }),
    ]);
    expect(itens.map((i) => i.auditId)).toEqual(['b', 'a']);
  });
});

describe('calibrationDirection', () => {
  it('classifica aumento, redução e estabilidade', () => {
    const base = { auditId: 'x', sampleSize: 1, accuracy: null, at: null };
    expect(calibrationDirection({ ...base, from: 0.4, to: 0.6 })).toBe('aumentou');
    expect(calibrationDirection({ ...base, from: 0.6, to: 0.4 })).toBe('reduziu');
    expect(calibrationDirection({ ...base, from: 0.5, to: 0.5 })).toBe('manteve');
  });

  it('trata origem desconhecida como sem variação', () => {
    expect(
      calibrationDirection({ auditId: 'x', from: null, to: 0.9, sampleSize: 0, accuracy: null, at: null }),
    ).toBe('manteve');
  });
});
