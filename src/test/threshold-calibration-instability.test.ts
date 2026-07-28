import { describe, expect, it } from 'vitest';
import {
  INSTABILITY_WINDOW_DAYS,
  detectCalibrationInstability,
  type ThresholdCalibration,
} from '@/lib/skills/thresholdCalibration';

const NOW = new Date('2026-07-28T12:00:00.000Z');

function diasAtras(dias: number): string {
  return new Date(NOW.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
}

function calib(partial: Partial<ThresholdCalibration> & { to: number }): ThresholdCalibration {
  return {
    auditId: Math.random().toString(36).slice(2),
    from: null,
    sampleSize: 10,
    accuracy: 0.8,
    overriddenInstability: false,
    overrideReason: null,
    at: diasAtras(1),
    ...partial,
  };
}

describe('detectCalibrationInstability', () => {
  it('lista vazia é estável', () => {
    const r = detectCalibrationInstability([], { now: NOW });
    expect(r).toMatchObject({ unstable: false, eventsInWindow: 0, reversals: 0, reason: 'estavel' });
  });

  it('duas calibrações na janela ainda são estáveis', () => {
    const r = detectCalibrationInstability(
      [calib({ to: 0.5, from: 0.4 }), calib({ to: 0.6, from: 0.5, at: diasAtras(2) })],
      { now: NOW },
    );
    expect(r.unstable).toBe(false);
    expect(r.eventsInWindow).toBe(2);
  });

  it('três calibrações na janela disparam alerta por volume', () => {
    const r = detectCalibrationInstability(
      [
        calib({ to: 0.5, from: 0.4, at: diasAtras(0.2) }),
        calib({ to: 0.55, from: 0.5, at: diasAtras(1) }),
        calib({ to: 0.6, from: 0.55, at: diasAtras(3) }),
      ],
      { now: NOW },
    );
    expect(r.unstable).toBe(true);
    expect(r.reason).toBe('volume');
    expect(r.spread).toBeCloseTo(0.1, 4);
  });

  it('eventos fora da janela não contam', () => {
    const r = detectCalibrationInstability(
      [
        calib({ to: 0.5, at: diasAtras(INSTABILITY_WINDOW_DAYS + 1) }),
        calib({ to: 0.6, at: diasAtras(30) }),
        calib({ to: 0.7, at: diasAtras(60) }),
      ],
      { now: NOW },
    );
    expect(r.eventsInWindow).toBe(0);
    expect(r.unstable).toBe(false);
  });

  it('datas nulas são ignoradas em vez de assumir "agora"', () => {
    const r = detectCalibrationInstability(
      [calib({ to: 0.5, at: null }), calib({ to: 0.6, at: null }), calib({ to: 0.7, at: null })],
      { now: NOW },
    );
    expect(r.eventsInWindow).toBe(0);
    expect(r.unstable).toBe(false);
  });

  it('oscilação com duas inversões alerta mesmo abaixo do volume mínimo', () => {
    const r = detectCalibrationInstability(
      [
        calib({ from: 0.4, to: 0.6, at: diasAtras(3) }),
        calib({ from: 0.6, to: 0.45, at: diasAtras(2) }),
        calib({ from: 0.45, to: 0.62, at: diasAtras(1) }),
      ],
      { now: NOW, minEvents: 99 },
    );
    expect(r.reversals).toBe(2);
    expect(r.unstable).toBe(true);
    expect(r.reason).toBe('oscilacao');
  });

  it('uma única inversão não é oscilação', () => {
    const r = detectCalibrationInstability(
      [
        calib({ from: 0.4, to: 0.6, at: diasAtras(3) }),
        calib({ from: 0.6, to: 0.45, at: diasAtras(1) }),
      ],
      { now: NOW, minEvents: 99 },
    );
    expect(r.reversals).toBe(1);
    expect(r.unstable).toBe(false);
  });

  it('"manteve" (from === to) não quebra a sequência de direção', () => {
    const r = detectCalibrationInstability(
      [
        calib({ from: 0.4, to: 0.6, at: diasAtras(4) }),
        calib({ from: 0.6, to: 0.6, at: diasAtras(3) }),
        calib({ from: 0.6, to: 0.7, at: diasAtras(2) }),
      ],
      { now: NOW, minEvents: 99 },
    );
    expect(r.reversals).toBe(0);
  });

  it('linhas legadas sem "from" não geram inversões fantasma', () => {
    const r = detectCalibrationInstability(
      [
        calib({ from: null, to: 0.6, at: diasAtras(3) }),
        calib({ from: null, to: 0.4, at: diasAtras(2) }),
        calib({ from: null, to: 0.8, at: diasAtras(1) }),
      ],
      { now: NOW, minEvents: 99 },
    );
    expect(r.reversals).toBe(0);
    expect(r.unstable).toBe(false);
  });

  it('datas futuras (relógio torto) continuam contando como recentes', () => {
    const futuro = new Date(NOW.getTime() + 3 * 60 * 60 * 1000).toISOString();
    const r = detectCalibrationInstability(
      [
        calib({ to: 0.5, at: futuro }),
        calib({ to: 0.55, at: diasAtras(1) }),
        calib({ to: 0.6, at: diasAtras(2) }),
      ],
      { now: NOW },
    );
    expect(r.eventsInWindow).toBe(3);
    expect(r.unstable).toBe(true);
  });

  it('janela e mínimo são configuráveis, com piso defensivo', () => {
    const itens = [
      calib({ to: 0.5, at: diasAtras(0.1) }),
      calib({ to: 0.6, at: diasAtras(0.2) }),
    ];
    expect(detectCalibrationInstability(itens, { now: NOW, minEvents: 0 }).unstable).toBe(true);
    expect(detectCalibrationInstability(itens, { now: NOW, windowDays: -5 }).eventsInWindow).toBe(2);
  });

  it('amplitude reflete apenas os limiares dentro da janela', () => {
    const r = detectCalibrationInstability(
      [
        calib({ to: 0.2, at: diasAtras(1) }),
        calib({ to: 0.9, at: diasAtras(2) }),
        calib({ to: 0.05, at: diasAtras(40) }),
      ],
      { now: NOW },
    );
    expect(r.spread).toBeCloseTo(0.7, 4);
  });

  it('a ordem de entrada não altera o resultado', () => {
    const itens = [
      calib({ from: 0.4, to: 0.6, at: diasAtras(3) }),
      calib({ from: 0.6, to: 0.45, at: diasAtras(2) }),
      calib({ from: 0.45, to: 0.62, at: diasAtras(1) }),
    ];
    const direto = detectCalibrationInstability(itens, { now: NOW, minEvents: 99 });
    const invertido = detectCalibrationInstability([...itens].reverse(), { now: NOW, minEvents: 99 });
    expect(invertido).toEqual(direto);
  });
});
