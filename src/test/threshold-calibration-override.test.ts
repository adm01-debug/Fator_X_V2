import { describe, expect, it } from 'vitest';
import {
  OVERRIDE_REASON_MAX,
  OVERRIDE_REASON_MIN,
  filterCalibrations,
  isOverrideReasonValid,
  normalizeCalibrationFilter,
  normalizeOverrideReason,
  parseThresholdCalibrations,
  type ThresholdCalibration,
} from '@/lib/skills/thresholdCalibration';

function calib(partial: Partial<ThresholdCalibration> & { auditId: string }): ThresholdCalibration {
  return {
    from: 0.4,
    to: 0.6,
    sampleSize: 10,
    accuracy: 0.8,
    overriddenInstability: false,
    overrideReason: null,
    at: '2026-07-20T10:00:00.000Z',
    ...partial,
  };
}

describe('normalizeOverrideReason', () => {
  it('descarta valores não textuais e vazios', () => {
    expect(normalizeOverrideReason(null)).toBeNull();
    expect(normalizeOverrideReason(42)).toBeNull();
    expect(normalizeOverrideReason('   ')).toBeNull();
    expect(normalizeOverrideReason('\n\t')).toBeNull();
  });

  it('colapsa espaços e remove caracteres de controle', () => {
    expect(normalizeOverrideReason('  lote   de\tvendas\n distorceu ')).toBe(
      'lote de vendas distorceu',
    );
    expect(normalizeOverrideReason('a\u0000b')).toBe('a b');
  });

  it('trunca no teto sem deixar espaço final', () => {
    const longo = 'x'.repeat(OVERRIDE_REASON_MAX + 50);
    expect(normalizeOverrideReason(longo)).toHaveLength(OVERRIDE_REASON_MAX);
  });
});

describe('isOverrideReasonValid', () => {
  it('exige substância mínima', () => {
    expect(isOverrideReasonValid('curto')).toBe(false);
    expect(isOverrideReasonValid('x'.repeat(OVERRIDE_REASON_MIN - 1))).toBe(false);
    expect(isOverrideReasonValid('x'.repeat(OVERRIDE_REASON_MIN))).toBe(true);
  });

  it('não aceita espaços como preenchimento', () => {
    expect(isOverrideReasonValid('   '.repeat(20))).toBe(false);
  });
});

describe('parseThresholdCalibrations · override_reason', () => {
  it('lê e normaliza a justificativa', () => {
    const [item] = parseThresholdCalibrations([
      {
        id: 'a',
        action: 'skill.threshold_calibrate',
        created_at: '2026-07-20T10:00:00.000Z',
        metadata: {
          to: 0.7,
          overridden_instability: true,
          override_reason: '  amostra  contaminada por importação ',
        },
      },
    ]);
    expect(item.overrideReason).toBe('amostra contaminada por importação');
  });

  it('linhas legadas ficam sem justificativa', () => {
    const [item] = parseThresholdCalibrations([
      { id: 'b', action: 'skill.threshold_calibrate', created_at: null, metadata: { to: 0.5 } },
    ]);
    expect(item.overrideReason).toBeNull();
    expect(item.overriddenInstability).toBe(false);
  });
});

describe('filterCalibrations', () => {
  const itens = [
    calib({ auditId: 'a' }),
    calib({ auditId: 'b', overriddenInstability: true, overrideReason: 'motivo registrado' }),
  ];

  it('all devolve tudo sem mutar a origem', () => {
    const saida = filterCalibrations(itens, 'all');
    expect(saida).toHaveLength(2);
    expect(saida).not.toBe(itens);
  });

  it('overridden isola só as decisões sob alerta', () => {
    expect(filterCalibrations(itens, 'overridden').map((i) => i.auditId)).toEqual(['b']);
  });

  it('normaliza filtros desconhecidos para all', () => {
    expect(normalizeCalibrationFilter('lixo')).toBe('all');
    expect(normalizeCalibrationFilter(undefined)).toBe('all');
    expect(normalizeCalibrationFilter('overridden')).toBe('overridden');
  });
});
