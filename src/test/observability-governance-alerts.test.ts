/**
 * Simulação exaustiva dos alertas derivados do digest de governança.
 *
 * O que está sob teste não é apenas "o alerta aparece": é a garantia de que a
 * emissão vinda do digest NÃO duplica os alertas que já eram produzidos a
 * partir das mesmas fontes (instabilidade e override vencido), e de que uma
 * instalação nova permanece silenciosa. Um painel que grita no primeiro dia é
 * um painel que o curador aprende a ignorar.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveObservabilityAlerts,
  summarizeIngestion,
  summarizeQueue,
  summarizeHumanReclassification,
  CALIBRATION_STALE_DAYS,
} from '@/lib/skills/observability';
import type {
  CalibrationScale,
  ThresholdCalibration,
} from '@/lib/skills/thresholdCalibration';

const NOW = new Date('2026-07-28T12:00:00.000Z');
const diasAtras = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function calib(over: Partial<ThresholdCalibration> = {}): ThresholdCalibration {
  return {
    auditId: Math.random().toString(36).slice(2),
    from: 0.5,
    to: 0.6,
    sampleSize: 40,
    accuracy: 0.8,
    overriddenInstability: false,
    overrideReason: null,
    scale: 'dominio',
    at: diasAtras(10),
    ...over,
  };
}

/** Entradas neutras: nenhum alerta vem de ingestão, fila ou correção humana. */
function inputsBase(calibrations: readonly ThresholdCalibration[]) {
  return {
    ingestion: summarizeIngestion([], { now: NOW }),
    queue: summarizeQueue([], { now: NOW }),
    human: summarizeHumanReclassification([], { now: NOW }),
    calibrations,
    now: NOW,
  };
}

const ids = (calibrations: readonly ThresholdCalibration[]) =>
  deriveObservabilityAlerts(inputsBase(calibrations)).alerts.map((a) => a.id);

const ESCALAS: readonly CalibrationScale[] = ['dominio', 'plataforma'];

describe('silêncio em instalação nova', () => {
  it('não emite nenhum alerta quando não há calibração alguma', () => {
    expect(ids([])).toEqual([]);
  });

  it('expõe o digest mesmo sem histórico, com as duas réguas em sem-dados', () => {
    const { governance } = deriveObservabilityAlerts(inputsBase([]));
    expect(governance.byScale.dominio.status).toBe('sem-dados');
    expect(governance.byScale.plataforma.status).toBe('sem-dados');
    expect(governance.worstStatus).toBe('sem-dados');
  });
});

describe('calibração envelhecida', () => {
  it.each(ESCALAS)('não alerta exatamente no limite para %s', (scale) => {
    const lista = ids([calib({ scale, at: diasAtras(CALIBRATION_STALE_DAYS - 1) })]);
    expect(lista).not.toContain(`calibracao-envelhecida-${scale}`);
  });

  it.each(ESCALAS)('alerta ao atingir o limite para %s', (scale) => {
    const lista = ids([calib({ scale, at: diasAtras(CALIBRATION_STALE_DAYS) })]);
    expect(lista).toContain(`calibracao-envelhecida-${scale}`);
  });

  /**
   * Varredura de fronteira: para cada idade entre 0 e 120 dias o alerta deve
   * aparecer se e somente se a idade cruzou o limite. Isso trava a regra
   * contra um `>` virar `>=` numa refatoração futura.
   */
  it.each(ESCALAS)('respeita a fronteira em toda a faixa 0..120 dias para %s', (scale) => {
    for (let idade = 0; idade <= 120; idade += 1) {
      const lista = ids([calib({ scale, at: diasAtras(idade) })]);
      const esperado = idade >= CALIBRATION_STALE_DAYS;
      expect(lista.includes(`calibracao-envelhecida-${scale}`)).toBe(esperado);
    }
  });

  it('usa a calibração MAIS RECENTE da régua, não a mais antiga', () => {
    const lista = ids([
      calib({ scale: 'dominio', at: diasAtras(300) }),
      calib({ scale: 'dominio', at: diasAtras(2) }),
    ]);
    expect(lista).not.toContain('calibracao-envelhecida-dominio');
  });

  it('não contamina a régua vizinha: domínio velho não envelhece plataforma', () => {
    const lista = ids([
      calib({ scale: 'dominio', at: diasAtras(200) }),
      calib({ scale: 'plataforma', at: diasAtras(1) }),
    ]);
    expect(lista).toContain('calibracao-envelhecida-dominio');
    expect(lista).not.toContain('calibracao-envelhecida-plataforma');
  });

  it('ignora linhas com data corrompida em vez de tratá-las como idade zero', () => {
    const lista = ids([
      calib({ scale: 'dominio', at: null }),
      calib({ scale: 'dominio', at: diasAtras(90) }),
    ]);
    expect(lista).toContain('calibracao-envelhecida-dominio');
  });

  it('não produz idade negativa quando o relógio do cliente data no futuro', () => {
    const futuro = new Date(NOW.getTime() + 10 * 86_400_000).toISOString();
    const { governance, alerts } = deriveObservabilityAlerts(
      inputsBase([calib({ scale: 'dominio', at: futuro })]),
    );
    expect(governance.byScale.dominio.daysSinceLast).toBe(0);
    expect(alerts.map((a) => a.id)).not.toContain('calibracao-envelhecida-dominio');
  });
});

describe('régua nunca calibrada', () => {
  it('alerta apenas a régua vazia quando a outra já tem histórico', () => {
    const lista = ids([calib({ scale: 'dominio', at: diasAtras(3) })]);
    expect(lista).toContain('calibracao-ausente-plataforma');
    expect(lista).not.toContain('calibracao-ausente-dominio');
  });

  it('vale nos dois sentidos: plataforma calibrada acusa domínio ausente', () => {
    const lista = ids([calib({ scale: 'plataforma', at: diasAtras(3) })]);
    expect(lista).toContain('calibracao-ausente-dominio');
    expect(lista).not.toContain('calibracao-ausente-plataforma');
  });

  it('some quando as duas réguas têm histórico', () => {
    const lista = ids([
      calib({ scale: 'dominio', at: diasAtras(3) }),
      calib({ scale: 'plataforma', at: diasAtras(3) }),
    ]);
    expect(lista.filter((id) => id.startsWith('calibracao-ausente-'))).toEqual([]);
  });

  it('linha sem data não conta como histórico e mantém a régua ausente', () => {
    const lista = ids([
      calib({ scale: 'dominio', at: diasAtras(3) }),
      calib({ scale: 'plataforma', at: null }),
    ]);
    expect(lista).toContain('calibracao-ausente-plataforma');
  });
});

describe('ausência de duplicação com os alertas pré-existentes', () => {
  /**
   * Instabilidade por volume: várias calibrações na mesma janela curta. O
   * digest enxerga o mesmo sintoma, mas não pode emitir um segundo alerta.
   */
  const instavel = Array.from({ length: 5 }, (_, i) =>
    calib({ scale: 'dominio', at: diasAtras(i), to: 0.5 + i * 0.05 }),
  );

  it('emite o alerta de instabilidade uma única vez', () => {
    const lista = ids(instavel);
    const ocorrencias = lista.filter((id) => id === 'calibracao-instavel-dominio');
    expect(ocorrencias).toHaveLength(1);
  });

  it('emite o alerta de override vencido uma única vez', () => {
    const lista = ids([
      calib({
        scale: 'dominio',
        at: diasAtras(120),
        overriddenInstability: true,
        overrideReason: 'amostra revisada manualmente pelo curador',
      }),
    ]);
    expect(lista.filter((id) => id === 'override-vencido-dominio')).toHaveLength(1);
  });

  it('nunca repete um mesmo id de alerta em nenhum cenário combinado', () => {
    const cenarios: ThresholdCalibration[][] = [
      [],
      instavel,
      [...instavel, calib({ scale: 'plataforma', at: diasAtras(200) })],
      [
        calib({ scale: 'dominio', at: diasAtras(120), overriddenInstability: true }),
        calib({ scale: 'plataforma', at: diasAtras(120), overriddenInstability: true }),
      ],
      [calib({ scale: 'plataforma', at: diasAtras(400) })],
    ];
    for (const cenario of cenarios) {
      const lista = ids(cenario);
      expect(new Set(lista).size).toBe(lista.length);
    }
  });
});

describe('matriz combinatória de idades entre as duas réguas', () => {
  /**
   * 11 × 11 combinações de idade. Para cada par, a presença de cada alerta é
   * verificada de forma independente por régua — nenhuma contaminação cruzada
   * é tolerada.
   */
  const IDADES = [0, 5, 15, 30, 44, 45, 60, 90, 120, 200, 400];

  it('mantém o veredito por régua independente do estado da vizinha', () => {
    for (const idadeD of IDADES) {
      for (const idadeP of IDADES) {
        const lista = ids([
          calib({ scale: 'dominio', at: diasAtras(idadeD) }),
          calib({ scale: 'plataforma', at: diasAtras(idadeP) }),
        ]);
        expect(lista.includes('calibracao-envelhecida-dominio')).toBe(
          idadeD >= CALIBRATION_STALE_DAYS,
        );
        expect(lista.includes('calibracao-envelhecida-plataforma')).toBe(
          idadeP >= CALIBRATION_STALE_DAYS,
        );
        expect(lista.some((id) => id.startsWith('calibracao-ausente-'))).toBe(false);
      }
    }
  });
});

describe('coerência entre digest e alertas', () => {
  it('toda régua com alerta de envelhecimento tem daysSinceLast acima do limite', () => {
    const entradas = inputsBase([
      calib({ scale: 'dominio', at: diasAtras(80) }),
      calib({ scale: 'plataforma', at: diasAtras(10) }),
    ]);
    const { alerts, governance } = deriveObservabilityAlerts(entradas);
    for (const escala of ESCALAS) {
      const temAlerta = alerts.some((a) => a.id === `calibracao-envelhecida-${escala}`);
      const idade = governance.byScale[escala].daysSinceLast;
      expect(temAlerta).toBe(idade !== null && idade >= CALIBRATION_STALE_DAYS);
    }
  });

  it('todo alerta possui título e detalhe não vazios', () => {
    const { alerts } = deriveObservabilityAlerts(
      inputsBase([calib({ scale: 'dominio', at: diasAtras(300) })]),
    );
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(a.title.trim().length).toBeGreaterThan(0);
      expect(a.detail.trim().length).toBeGreaterThan(0);
      expect(['critico', 'atencao']).toContain(a.level);
    }
  });
});
