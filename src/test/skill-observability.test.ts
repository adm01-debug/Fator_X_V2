/**
 * Invariantes da camada de observabilidade de skills.
 * Toda função recebe `now` injetável — nenhum teste depende do relógio real.
 */
import { describe, it, expect } from 'vitest';
import {
  summarizeIngestion,
  summarizeQueue,
  summarizeHumanReclassification,
  deriveObservabilityAlerts,
  pct,
  formatDuration,
  QUEUE_STALE_DAYS,
  type HarvestRunInput,
  type ReviewQueueRowInput,
} from '@/lib/skills/observability';
import type { ClassificationDecision } from '@/lib/skills/classificationEfficacy';
import type { ThresholdCalibration } from '@/lib/skills/thresholdCalibration';

const NOW = new Date('2026-07-28T12:00:00.000Z');
const diasAtras = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function decision(over: Partial<ClassificationDecision>): ClassificationDecision {
  return {
    auditId: Math.random().toString(36).slice(2),
    reviewId: 'r',
    skillId: 's',
    slug: 'slug',
    approved: true,
    from: null,
    to: null,
    confidence: 0.6,
    margin: 0.1,
    origin: 'lexico',
    previousSource: 'heuristic',
    previousConfidence: 0.5,
    registryTouched: true,
    scale: 'dominio',

    verdict: 'confirmado',
    decidedAt: diasAtras(1),
    decidedAtMs: NOW.getTime() - 86_400_000,
    reason: '',
    ...over,
  };
}

describe('summarizeIngestion', () => {
  const runs: HarvestRunInput[] = [
    { id: '1', status: 'completed', candidates_found: 10, candidates_accepted: 4, duration_ms: 2000, created_at: diasAtras(1) },
    { id: '2', status: 'failed', candidates_found: 0, candidates_accepted: 0, duration_ms: 500, created_at: diasAtras(2) },
    { id: '3', status: 'completed', candidates_found: 10, candidates_accepted: 6, duration_ms: 4000, created_at: diasAtras(40) },
  ];

  it('ignora execuções fora da janela', () => {
    const s = summarizeIngestion(runs, { now: NOW, windowDays: 14 });
    expect(s.runs).toBe(2);
    expect(s.candidatesAccepted).toBe(4);
  });

  it('calcula taxas com denominador seguro', () => {
    const s = summarizeIngestion(runs, { now: NOW, windowDays: 14 });
    expect(s.acceptRate).toBeCloseTo(0.4);
    expect(s.failureRate).toBeCloseTo(0.5);
    expect(summarizeIngestion([], { now: NOW }).acceptRate).toBeNull();
  });

  it('produz série diária do tamanho da janela', () => {
    const s = summarizeIngestion(runs, { now: NOW, windowDays: 7 });
    expect(s.daily).toHaveLength(7);
    expect(s.daily.reduce((a, d) => a + d.runs, 0)).toBe(2);
  });
});

describe('summarizeQueue', () => {
  const rows: ReviewQueueRowInput[] = [
    { id: 'a', status: 'pendente', source: 'ia', confidence: 0.4, created_at: diasAtras(10) },
    { id: 'b', status: 'pendente', source: 'lexico', confidence: 0.6, created_at: diasAtras(1) },
    { id: 'c', status: 'aprovado', created_at: diasAtras(3), reviewed_at: diasAtras(2) },
    { id: 'd', status: 'rejeitado', created_at: diasAtras(5), reviewed_at: diasAtras(4) },
  ];

  it('separa pendentes, idade e origem', () => {
    const s = summarizeQueue(rows, { now: NOW });
    expect(s.pending).toBe(2);
    expect(s.pendingByOrigin).toEqual({ ia: 1, lexico: 1 });
    expect(s.oldestPendingDays).toBe(10);
    expect(s.stalePending).toBe(1);
    expect(QUEUE_STALE_DAYS).toBe(7);
  });

  it('usa mediana para o tempo de decisão', () => {
    const s = summarizeQueue(rows, { now: NOW });
    expect(s.decided).toBe(2);
    expect(s.approvalRate).toBeCloseTo(0.5);
    expect(s.medianDecisionHours).toBe(24);
  });

  it('não divide por zero em fila vazia', () => {
    const s = summarizeQueue([], { now: NOW });
    expect(s.approvalRate).toBeNull();
    expect(s.avgPendingConfidence).toBeNull();
    expect(s.oldestPendingDays).toBe(0);
  });
});

describe('summarizeHumanReclassification', () => {
  it('exclui preenchidos e descartados do denominador', () => {
    const s = summarizeHumanReclassification([
      decision({ verdict: 'corrigido' }),
      decision({ verdict: 'confirmado' }),
      decision({ verdict: 'preenchido' }),
      decision({ verdict: 'descartado' }),
    ]);
    expect(s.judged).toBe(2);
    expect(s.rate).toBeCloseTo(0.5);
    expect(s.filled).toBe(1);
    expect(s.discarded).toBe(1);
  });

  it('retorna taxa nula sem julgamentos', () => {
    expect(summarizeHumanReclassification([]).rate).toBeNull();
  });

  it('detecta melhora quando as correções caem na metade recente', () => {
    const antigos = Array.from({ length: 6 }, (_, i) =>
      decision({ verdict: 'corrigido', decidedAtMs: NOW.getTime() - (20 - i) * 86_400_000 }),
    );
    const recentes = Array.from({ length: 6 }, (_, i) =>
      decision({ verdict: 'confirmado', decidedAtMs: NOW.getTime() - (6 - i) * 86_400_000 }),
    );
    expect(summarizeHumanReclassification([...recentes, ...antigos]).trend).toBe('melhorando');
  });
});

describe('deriveObservabilityAlerts', () => {
  const base = {
    ingestion: summarizeIngestion([], { now: NOW }),
    queue: summarizeQueue([], { now: NOW }),
    human: summarizeHumanReclassification([]),
    calibrations: [] as ThresholdCalibration[],
    now: NOW,
  };

  it('não alerta quando tudo está saudável', () => {
    expect(deriveObservabilityAlerts(base).alerts).toHaveLength(0);
  });

  it('alerta fila parada e ingestão falhando', () => {
    const r = deriveObservabilityAlerts({
      ...base,
      ingestion: summarizeIngestion(
        [{ id: '1', status: 'failed', created_at: diasAtras(1) }],
        { now: NOW },
      ),
      queue: summarizeQueue(
        [{ id: 'a', status: 'pendente', created_at: diasAtras(20) }],
        { now: NOW },
      ),
    });
    expect(r.alerts.map((a) => a.id).sort()).toEqual(['fila-parada', 'ingestao-falhando']);
  });

  it('não acusa o classificador com amostra pequena', () => {
    const r = deriveObservabilityAlerts({
      ...base,
      human: summarizeHumanReclassification([decision({ verdict: 'corrigido' })]),
    });
    expect(r.alerts.some((a) => a.id === 'classificador-impreciso')).toBe(false);
  });

  it('alerta instabilidade de calibração por volume', () => {
    const calibrations: ThresholdCalibration[] = [0, 1, 2].map((i) => ({
      auditId: `c${i}`,
      from: 0.5,
      to: 0.6,
      sampleSize: 10,
      accuracy: 0.8,
      overriddenInstability: false,
      overrideReason: null,
      at: diasAtras(i + 1),
    }));
    const r = deriveObservabilityAlerts({ ...base, calibrations });
    expect(r.instability.unstable).toBe(true);
    expect(r.alerts.some((a) => a.id === 'calibracao-instavel')).toBe(true);
  });
});

describe('formatadores', () => {
  it('pct e formatDuration lidam com ausência de sinal', () => {
    expect(pct(null)).toBe('—');
    expect(pct(0.256, 1)).toBe('25,6%');
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(1500)).toBe('1,5 s');
    expect(formatDuration(90_000)).toBe('1 min 30 s');
  });
});
