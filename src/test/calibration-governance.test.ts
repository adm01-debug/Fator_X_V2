/**
 * Simulação exaustiva do digest de governança de calibração.
 *
 * A suíte gera combinações determinísticas de régua x volume x override x
 * idade para provar que: (a) as réguas nunca contaminam o veredito uma da
 * outra, (b) a precedência de severidade é estável, e (c) datas corrompidas
 * ou futuras não produzem números absurdos.
 */
import { describe, expect, it } from 'vitest';
import {
  summarizeCalibrationGovernance,
  CALIBRATION_POSTURE_LABEL,
  type CalibrationPostureStatus,
} from '@/lib/skills/calibrationGovernance';
import type { CalibrationScale, ThresholdCalibration } from '@/lib/skills/thresholdCalibration';

const NOW = new Date('2026-07-29T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;
function calib(
  scale: CalibrationScale,
  daysAgo: number | null,
  overridden = false,
  to = scale === 'dominio' ? 0.7 : 0.2,
  from: number | null = null,
): ThresholdCalibration {
  seq += 1;
  return {
    auditId: `a-${seq}`,
    from,
    to,
    sampleSize: 40,
    accuracy: 0.8,
    overriddenInstability: overridden,
    overrideReason: overridden ? 'justificativa suficiente para override' : null,
    scale,
    at: daysAgo === null ? null : new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
  };
}

describe('summarizeCalibrationGovernance — estados base', () => {
  it('marca sem-dados quando não há calibração alguma', () => {
    const d = summarizeCalibrationGovernance([], { now: NOW });
    expect(d.byScale.dominio.status).toBe('sem-dados');
    expect(d.byScale.plataforma.status).toBe('sem-dados');
    expect(d.worstStatus).toBe('sem-dados');
    expect(d.scalesNeedingAction).toEqual([]);
  });

  it('sem-dados quando só existem linhas sem data', () => {
    const d = summarizeCalibrationGovernance([calib('dominio', null)], { now: NOW });
    expect(d.byScale.dominio.status).toBe('sem-dados');
    expect(d.byScale.dominio.total).toBe(1);
    expect(d.byScale.dominio.daysSinceLast).toBeNull();
  });

  it('saudavel com histórico datado e sem override nem instabilidade', () => {
    const d = summarizeCalibrationGovernance([calib('dominio', 10)], { now: NOW });
    expect(d.byScale.dominio.status).toBe('saudavel');
    expect(d.byScale.dominio.daysSinceLast).toBe(10);
    expect(d.byScale.dominio.overrideRate).toBe(0);
  });

  it('critico quando há override vencido', () => {
    const d = summarizeCalibrationGovernance([calib('dominio', 45, true)], { now: NOW });
    expect(d.byScale.dominio.status).toBe('critico');
    expect(d.byScale.dominio.staleOverrides.oldestDays).toBe(45);
    expect(d.worstStatus).toBe('critico');
  });

  it('atencao para override recente ainda dentro do prazo', () => {
    const d = summarizeCalibrationGovernance([calib('dominio', 3, true)], { now: NOW });
    expect(d.byScale.dominio.status).toBe('atencao');
  });
});

describe('isolamento entre réguas', () => {
  it('override vencido de plataforma não contamina domínio', () => {
    const d = summarizeCalibrationGovernance([calib('plataforma', 60, true), calib('dominio', 5)], {
      now: NOW,
    });
    expect(d.byScale.plataforma.status).toBe('critico');
    expect(d.byScale.dominio.status).toBe('saudavel');
    expect(d.scalesNeedingAction).toEqual(['plataforma']);
  });

  it('volume de plataforma não torna domínio instável', () => {
    const itens = [
      calib('plataforma', 1),
      calib('plataforma', 2),
      calib('plataforma', 3),
      calib('dominio', 2),
    ];
    const d = summarizeCalibrationGovernance(itens, { now: NOW });
    expect(d.byScale.plataforma.instability.unstable).toBe(true);
    expect(d.byScale.dominio.instability.unstable).toBe(false);
    expect(d.byScale.dominio.status).toBe('saudavel');
  });

  it('cada régua reporta sua própria escala no veredito', () => {
    const d = summarizeCalibrationGovernance([calib('dominio', 1), calib('plataforma', 1)], {
      now: NOW,
    });
    expect(d.byScale.dominio.instability.scale).toBe('dominio');
    expect(d.byScale.plataforma.instability.scale).toBe('plataforma');
  });
});

describe('robustez numérica e temporal', () => {
  it('data futura não gera idade negativa', () => {
    const d = summarizeCalibrationGovernance([calib('dominio', -30)], { now: NOW });
    expect(d.byScale.dominio.daysSinceLast).toBe(0);
  });

  it('now inválido não quebra o digest', () => {
    const d = summarizeCalibrationGovernance([calib('dominio', 5)], { now: new Date('x') });
    expect(d.byScale.dominio.total).toBe(1);
    expect(Number.isFinite(d.byScale.dominio.daysSinceLast ?? 0)).toBe(true);
  });

  it('overrideRate fica sempre em [0,1] com 4 casas', () => {
    const itens = [calib('dominio', 40, true), calib('dominio', 41), calib('dominio', 42)];
    const d = summarizeCalibrationGovernance(itens, { now: NOW });
    expect(d.byScale.dominio.overrideRate).toBeGreaterThanOrEqual(0);
    expect(d.byScale.dominio.overrideRate).toBeLessThanOrEqual(1);
    expect(d.byScale.dominio.overrideRate).toBeCloseTo(0.3333, 4);
  });
});

describe('matriz de simulação (centenas de cenários)', () => {
  const escalas: CalibrationScale[] = ['dominio', 'plataforma'];
  const idades = [0, 1, 5, 15, 29, 31, 60, 120, null] as const;
  const volumes = [1, 2, 3, 5];
  const overrideFlags = [false, true];

  it('mantém invariantes em toda a matriz', () => {
    let cenarios = 0;
    for (const scale of escalas) {
      for (const idade of idades) {
        for (const volume of volumes) {
          for (const overridden of overrideFlags) {
            const itens: ThresholdCalibration[] = [];
            for (let i = 0; i < volume; i += 1) {
              itens.push(calib(scale, idade === null ? null : idade + i, overridden));
            }
            const d = summarizeCalibrationGovernance(itens, { now: NOW });
            const alvo = d.byScale[scale];
            const outra = d.byScale[scale === 'dominio' ? 'plataforma' : 'dominio'];

            cenarios += 1;

            // A régua não usada permanece intocada.
            expect(outra.status).toBe<CalibrationPostureStatus>('sem-dados');
            expect(outra.total).toBe(0);

            expect(alvo.total).toBe(volume);
            expect(alvo.overrides).toBe(overridden ? volume : 0);
            expect(CALIBRATION_POSTURE_LABEL[alvo.status]).toBeTruthy();
            expect(alvo.headline.length).toBeGreaterThan(10);

            if (idade === null) {
              // Sem data: nunca crítico (não há prazo a contar).
              expect(alvo.staleOverrides.stale).toHaveLength(0);
              expect(alvo.daysSinceLast).toBeNull();
              expect(alvo.status).toBe(overridden ? 'atencao' : 'sem-dados');
            } else {
              expect(alvo.daysSinceLast).toBeGreaterThanOrEqual(0);
              // Só a calibração mais recente da régua conta como pendência:
              // as anteriores foram revisadas na prática pela seguinte.
              if (overridden && idade >= 30) {
                expect(alvo.status).toBe('critico');
              }

              if (!overridden && !alvo.instability.unstable) {
                expect(alvo.status).toBe('saudavel');
              }
            }

            // worstStatus nunca é menos severo do que a régua avaliada.
            const rank: Record<CalibrationPostureStatus, number> = {
              'sem-dados': 0,
              saudavel: 1,
              atencao: 2,
              critico: 3,
            };
            expect(rank[d.worstStatus]).toBeGreaterThanOrEqual(rank[alvo.status]);
            expect(d.scalesNeedingAction.includes(scale)).toBe(rank[alvo.status] >= 2);
          }
        }
      }
    }
    expect(cenarios).toBe(escalas.length * idades.length * volumes.length * overrideFlags.length);
  });

  it('combinação cruzada das duas réguas preserva independência', () => {
    let cenarios = 0;
    const perfis = [
      { idade: null as number | null, overridden: false },
      { idade: 2, overridden: false },
      { idade: 2, overridden: true },
      { idade: 90, overridden: true },
      { idade: 90, overridden: false },
    ];
    for (const pd of perfis) {
      for (const pp of perfis) {
        const itens = [
          calib('dominio', pd.idade, pd.overridden),
          calib('plataforma', pp.idade, pp.overridden),
        ];
        const d = summarizeCalibrationGovernance(itens, { now: NOW });
        const soDominio = summarizeCalibrationGovernance([itens[0]], { now: NOW });
        const soPlataforma = summarizeCalibrationGovernance([itens[1]], { now: NOW });

        expect(d.byScale.dominio.status).toBe(soDominio.byScale.dominio.status);
        expect(d.byScale.plataforma.status).toBe(soPlataforma.byScale.plataforma.status);
        expect(d.byScale.dominio.headline).toBe(soDominio.byScale.dominio.headline);
        cenarios += 1;
      }
    }
    expect(cenarios).toBe(perfis.length * perfis.length);
  });
});
