/**
 * Regressão da partição por régua nos detectores de calibração.
 *
 * Contexto do defeito: `detectCalibrationInstability` e `findStaleOverrides`
 * eram cegos à escala. Como `deriveObservabilityAlerts` passava a lista
 * completa, atividade rotineira da régua de plataforma (teto 0,40) gerava
 * alerta de "limiar de domínio instável", e uma calibração recente de
 * plataforma mascarava override de domínio vencido. A simulação prévia
 * reproduziu o defeito em 600/600 cenários; estes testes fixam o contrato.
 */
import { describe, it, expect } from 'vitest';
import {
  detectCalibrationInstability,
  detectCalibrationInstabilityByScale,
  findStaleOverrides,
  findStaleOverridesByScale,
  parseThresholdCalibrations,
  type ThresholdCalibration,
} from '@/lib/skills/thresholdCalibration';
import { calibrationCsvFilename } from '@/lib/skills/calibrationCsv';

const DAY = 86_400_000;
const NOW = new Date('2026-07-29T12:00:00.000Z');

function row(
  id: number,
  scale: 'dominio' | 'plataforma',
  to: number,
  ageDays: number,
  extra: { from?: number; overridden?: boolean } = {},
) {
  return {
    id: `audit-${id}`,
    action: 'skill.threshold_calibrate',
    created_at: new Date(NOW.getTime() - ageDays * DAY).toISOString(),
    metadata: {
      from: extra.from ?? 0.2,
      to,
      scale,
      sample_size: 50,
      accuracy: 0.8,
      overridden_instability: extra.overridden === true,
      override_reason: extra.overridden === true ? 'amostra suficiente na prática' : null,
    },
  };
}

function parse(rows: ReturnType<typeof row>[]): ThresholdCalibration[] {
  return parseThresholdCalibrations(rows);
}

describe('instabilidade segmentada por régua', () => {
  it('não acusa domínio instável por volume de calibrações de plataforma', () => {
    let falsos = 0;
    for (let s = 0; s < 300; s++) {
      const items = parse([
        row(0, 'dominio', 0.5 + (s % 3) * 0.01, 1),
        row(1, 'plataforma', 0.15, 1),
        row(2, 'plataforma', 0.2, 2),
        row(3, 'plataforma', 0.25, 3),
      ]);
      const porEscala = detectCalibrationInstabilityByScale(items, { now: NOW });
      if (porEscala.dominio.unstable) falsos += 1;
      // A plataforma, essa sim, está instável por volume — o alerta não some.
      expect(porEscala.plataforma.unstable).toBe(true);
      expect(porEscala.plataforma.reason).toBe('volume');
    }
    expect(falsos).toBe(0);
  });

  it('rotula a régua no veredito e devolve null para lista heterogênea', () => {
    const items = parse([row(0, 'dominio', 0.5, 1), row(1, 'plataforma', 0.2, 1)]);
    expect(detectCalibrationInstability(items).scale).toBeNull();
    const porEscala = detectCalibrationInstabilityByScale(items, { now: NOW });
    expect(porEscala.dominio.scale).toBe('dominio');
    expect(porEscala.plataforma.scale).toBe('plataforma');
  });

  it('mantém a régua rotulada mesmo quando a fatia está vazia', () => {
    const porEscala = detectCalibrationInstabilityByScale(parse([row(0, 'dominio', 0.5, 1)]), {
      now: NOW,
    });
    expect(porEscala.plataforma.eventsInWindow).toBe(0);
    expect(porEscala.plataforma.scale).toBe('plataforma');
    expect(porEscala.plataforma.unstable).toBe(false);
  });

  it('detecta oscilação apenas dentro da própria régua', () => {
    // Domínio sobe/desce/sobe (2 inversões); plataforma é monotônica.
    const items = parse([
      row(0, 'dominio', 0.6, 5, { from: 0.5 }),
      row(1, 'dominio', 0.4, 4, { from: 0.6 }),
      row(2, 'dominio', 0.7, 3, { from: 0.4 }),
      row(3, 'plataforma', 0.2, 2, { from: 0.1 }),
    ]);
    const porEscala = detectCalibrationInstabilityByScale(items, { now: NOW, minEvents: 99 });
    expect(porEscala.dominio.reversals).toBe(2);
    expect(porEscala.dominio.reason).toBe('oscilacao');
    expect(porEscala.plataforma.reversals).toBe(0);
    expect(porEscala.plataforma.unstable).toBe(false);
  });
});

describe('overrides vencidos por régua', () => {
  it('não considera revisado um override de domínio por calibração de plataforma', () => {
    let mascarados = 0;
    for (let s = 0; s < 300; s++) {
      const items = parse([
        row(0, 'dominio', 0.5, 60 + (s % 30), { overridden: true }),
        row(1, 'plataforma', 0.2, 1),
      ]);
      if (findStaleOverrides(items, { now: NOW }).stale.length === 0) mascarados += 1;
    }
    expect(mascarados).toBe(0);
  });

  it('continua considerando revisado quando a calibração posterior é da mesma régua', () => {
    const items = parse([
      row(0, 'dominio', 0.5, 60, { overridden: true }),
      row(1, 'dominio', 0.55, 2),
    ]);
    expect(findStaleOverrides(items, { now: NOW }).stale).toHaveLength(0);
  });

  it('segmenta o relatório e preserva a idade do vencido mais antigo', () => {
    const items = parse([
      row(0, 'dominio', 0.5, 90, { overridden: true }),
      row(1, 'plataforma', 0.2, 45, { overridden: true }),
    ]);
    const porEscala = findStaleOverridesByScale(items, { now: NOW });
    expect(porEscala.dominio.stale).toHaveLength(1);
    expect(porEscala.dominio.oldestDays).toBe(90);
    expect(porEscala.plataforma.stale).toHaveLength(1);
    expect(porEscala.plataforma.oldestDays).toBe(45);
  });

  it('ignora overrides sem data em qualquer régua', () => {
    const items = parse([row(0, 'dominio', 0.5, 90, { overridden: true })]).map((c) => ({
      ...c,
      at: null,
    }));
    expect(findStaleOverrides(items, { now: NOW }).stale).toHaveLength(0);
  });
});

describe('nome do arquivo de evidência', () => {
  it('separa exportações de réguas distintas no mesmo dia', () => {
    const dom = calibrationCsvFilename('all', NOW, 'dominio');
    const plat = calibrationCsvFilename('all', NOW, 'plataforma');
    expect(dom).not.toBe(plat);
    expect(dom).toBe('calibracoes-todas-dominio-2026-07-29.csv');
    expect(plat).toBe('calibracoes-todas-plataforma-2026-07-29.csv');
  });

  it('mantém rótulo explícito quando nenhuma régua é filtrada', () => {
    expect(calibrationCsvFilename('overridden', NOW)).toBe(
      'calibracoes-sob-alerta-todas-reguas-2026-07-29.csv',
    );
  });

  it('não quebra com data inválida', () => {
    expect(calibrationCsvFilename('all', new Date('inválido'), 'dominio')).toBe(
      'calibracoes-todas-dominio-sem-data.csv',
    );
  });
});
