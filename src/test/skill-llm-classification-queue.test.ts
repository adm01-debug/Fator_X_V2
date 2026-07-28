/**
 * Fila de classificação em lote — invariantes de concorrência, taxa e retry.
 *
 * Estratégia: relógio e sleep FALSOS. Um teste de fila que depende de
 * `setTimeout` real ou vira lento, ou vira instável, ou (pior) passa a validar
 * o agendador do Node em vez da nossa lógica. Aqui o tempo é uma variável que
 * o próprio teste avança, então as asserções sobre espaçamento e backoff são
 * exatas em vez de aproximadas.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_ATTEMPTS,
  QueueWorkerError,
  computeBackoff,
  isTerminal,
  runBatchQueue,
  type QueueSnapshot,
} from '@/lib/skills/llmClassificationQueue';

/**
 * Relógio virtual: `sleep` apenas empurra o "agora" para frente e cede o
 * controle ao event loop, sem consumir tempo real.
 */
function fakeClock() {
  let agora = 0;
  return {
    now: () => agora,
    sleep: async (ms: number) => {
      agora += Math.max(0, ms);
      await Promise.resolve();
    },
    avancar: (ms: number) => {
      agora += ms;
    },
  };
}

function itens(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, input: i }));
}

describe('runBatchQueue — resultados e invariantes básicas', () => {
  it('processa todos os itens e resolve com um snapshot completo', async () => {
    const clock = fakeClock();
    const snapshot = await runBatchQueue<number, string>({
      items: itens(25),
      worker: async (n) => `ok-${n}`,
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
    });

    expect(snapshot.total).toBe(25);
    expect(snapshot.done).toBe(25);
    expect(snapshot.running).toBe(false);
    expect(snapshot.items).toHaveLength(25);
    for (const item of snapshot.items) {
      expect(item.status).toBe('concluido');
      expect(isTerminal(item.status)).toBe(true);
      expect(item.result).toBe(`ok-${item.id.slice(1)}`);
      expect(item.lastError).toBeNull();
      expect(item.attempts).toBe(1);
    }
  });

  it('deduplica ids repetidos em vez de sobrescrever estado', async () => {
    const clock = fakeClock();
    const worker = vi.fn(async (n: number) => n);
    const snapshot = await runBatchQueue<number, number>({
      items: [
        { id: 'dup', input: 1 },
        { id: 'dup', input: 2 },
        { id: 'ok', input: 3 },
      ],
      worker,
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
    });

    expect(snapshot.total).toBe(2);
    expect(worker).toHaveBeenCalledTimes(2);
    // O primeiro vence — descartar o duplicado silenciosamente seria pior que
    // processar duas vezes o mesmo id e mostrar um progresso mentiroso.
    expect(snapshot.items.find((i) => i.id === 'dup')?.result).toBe(1);
  });

  it('ignora entradas malformadas sem derrubar o lote', async () => {
    const clock = fakeClock();
    const snapshot = await runBatchQueue<number, number>({
      items: [
        { id: '', input: 1 },
        null as unknown as { id: string; input: number },
        { id: 'valido', input: 2 },
      ],
      worker: async (n) => n,
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
    });
    expect(snapshot.total).toBe(1);
    expect(snapshot.items[0].id).toBe('valido');
  });

  it('lote vazio resolve imediatamente, sem chamar o worker', async () => {
    const worker = vi.fn();
    const snapshot = await runBatchQueue<number, number>({ items: [], worker });
    expect(worker).not.toHaveBeenCalled();
    expect(snapshot).toMatchObject({ total: 0, done: 0, running: false });
  });
});

describe('runBatchQueue — controle de pico e de taxa', () => {
  it('nunca ultrapassa a concorrência configurada', async () => {
    const clock = fakeClock();
    let emVoo = 0;
    let pico = 0;

    await runBatchQueue<number, number>({
      items: itens(40),
      concurrency: 3,
      minIntervalMs: 0,
      worker: async (n) => {
        emVoo += 1;
        pico = Math.max(pico, emVoo);
        await Promise.resolve();
        emVoo -= 1;
        return n;
      },
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
    });

    expect(pico).toBeLessThanOrEqual(3);
    expect(pico).toBeGreaterThan(1);
  });

  it('respeita o espaçamento mínimo entre disparos', async () => {
    const clock = fakeClock();
    const disparos: number[] = [];

    await runBatchQueue<number, number>({
      items: itens(10),
      concurrency: 1,
      minIntervalMs: 500,
      worker: async (n) => {
        disparos.push(clock.now());
        return n;
      },
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
    });

    expect(disparos).toHaveLength(10);
    for (let i = 1; i < disparos.length; i += 1) {
      expect(disparos[i] - disparos[i - 1]).toBeGreaterThanOrEqual(500);
    }
  });
});

describe('runBatchQueue — política de retry', () => {
  it('re-tenta erros marcados como retryable até o teto e então falha', async () => {
    const clock = fakeClock();
    const worker = vi.fn(async () => {
      throw new QueueWorkerError('instável', true, null, 'servidor');
    });

    const snapshot = await runBatchQueue<number, number>({
      items: [{ id: 'a', input: 1 }],
      worker,
      minIntervalMs: 0,
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
    });

    expect(worker).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
    expect(snapshot.items[0].status).toBe('falhou');
    expect(snapshot.items[0].attempts).toBe(DEFAULT_MAX_ATTEMPTS);
    expect(snapshot.items[0].errorKind).toBe('servidor');
    expect(snapshot.done).toBe(1);
  });

  it('NÃO re-tenta erros fatais — 402 não melhora com insistência', async () => {
    const clock = fakeClock();
    const worker = vi.fn(async () => {
      throw new QueueWorkerError('sem créditos', false, null, 'creditos');
    });

    const snapshot = await runBatchQueue<number, number>({
      items: itens(5),
      worker,
      minIntervalMs: 0,
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
    });

    // Uma tentativa por item, nunca três. Insistir queimaria 15 chamadas
    // contra a mesma parede.
    expect(worker).toHaveBeenCalledTimes(5);
    for (const item of snapshot.items) {
      expect(item.status).toBe('falhou');
      expect(item.attempts).toBe(1);
      expect(item.errorKind).toBe('creditos');
    }
  });

  it('sucesso após falha transitória mantém a contagem de tentativas', async () => {
    const clock = fakeClock();
    let chamadas = 0;
    const snapshot = await runBatchQueue<number, string>({
      items: [{ id: 'a', input: 1 }],
      minIntervalMs: 0,
      worker: async () => {
        chamadas += 1;
        if (chamadas < 3) throw new QueueWorkerError('429', true, null, 'taxa');
        return 'ok';
      },
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
    });

    expect(snapshot.items[0].status).toBe('concluido');
    expect(snapshot.items[0].result).toBe('ok');
    expect(snapshot.items[0].attempts).toBe(3);
  });

  it('erro comum (não-QueueWorkerError) é tratado como transitório', async () => {
    const clock = fakeClock();
    const worker = vi.fn(async () => {
      throw new Error('falha genérica');
    });
    const snapshot = await runBatchQueue<number, number>({
      items: [{ id: 'a', input: 1 }],
      worker,
      minIntervalMs: 0,
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
    });
    expect(worker).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
    expect(snapshot.items[0].lastError).toContain('falha genérica');
  });

  it('Retry-After do servidor é respeitado como PISO da espera', async () => {
    const clock = fakeClock();
    const disparos: number[] = [];
    let chamadas = 0;

    await runBatchQueue<number, string>({
      items: [{ id: 'a', input: 1 }],
      concurrency: 1,
      minIntervalMs: 0,
      baseBackoffMs: 10,
      capBackoffMs: 20,
      worker: async () => {
        disparos.push(clock.now());
        chamadas += 1;
        // O servidor pede 5s — muito acima do backoff calculado (≤20ms).
        if (chamadas === 1) throw new QueueWorkerError('429', true, 5_000, 'taxa');
        return 'ok';
      },
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
    });

    expect(disparos).toHaveLength(2);
    expect(disparos[1] - disparos[0]).toBeGreaterThanOrEqual(5_000);
  });
});

describe('computeBackoff — equal jitter', () => {
  it('garante um piso de espera mesmo com sorteio zerado', () => {
    // A razão de existir do equal jitter: full-jitter poderia devolver 0 e
    // re-bater no limitador de taxa no mesmo instante.
    for (let tentativa = 0; tentativa < 6; tentativa += 1) {
      const minimo = computeBackoff(tentativa, 1_000, 30_000, () => 0);
      const esperadoPiso = Math.min(30_000, 1_000 * 2 ** tentativa) / 2;
      expect(minimo).toBe(Math.floor(esperadoPiso));
      expect(minimo).toBeGreaterThan(0);
    }
  });

  it('cresce exponencialmente e satura no teto', () => {
    const valores = Array.from({ length: 10 }, (_, i) => computeBackoff(i, 800, 15_000, () => 0.5));
    for (let i = 1; i < valores.length; i += 1) {
      expect(valores[i]).toBeGreaterThanOrEqual(valores[i - 1]);
    }
    expect(valores.at(-1)).toBeLessThanOrEqual(15_000);
  });

  it('permanece dentro de [exp/2, exp] para qualquer sorteio', () => {
    for (let tentativa = 0; tentativa < 8; tentativa += 1) {
      for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
        const exp = Math.min(15_000, 800 * 2 ** tentativa);
        const valor = computeBackoff(tentativa, 800, 15_000, () => r);
        expect(valor).toBeGreaterThanOrEqual(Math.floor(exp / 2));
        expect(valor).toBeLessThanOrEqual(exp);
      }
    }
  });

  it('tentativa negativa não produz espera negativa', () => {
    expect(computeBackoff(-5, 800, 15_000, () => 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('runBatchQueue — cancelamento', () => {
  it('aborto interrompe o lote e marca os pendentes como cancelados', async () => {
    const clock = fakeClock();
    const controller = new AbortController();
    let processados = 0;

    const snapshot = await runBatchQueue<number, number>({
      items: itens(30),
      concurrency: 1,
      minIntervalMs: 0,
      signal: controller.signal,
      worker: async (n) => {
        processados += 1;
        if (processados === 4) controller.abort();
        return n;
      },
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
    });

    // Nada além do que já estava em voo pode ser disparado após o aborto.
    expect(processados).toBeLessThanOrEqual(5);
    expect(snapshot.items.filter((i) => i.status === 'cancelado').length).toBeGreaterThan(0);
    // Ainda assim resolve com o progresso parcial, que é o que a UI mostra.
    expect(snapshot.running).toBe(false);
    for (const item of snapshot.items) expect(isTerminal(item.status)).toBe(true);
  });

  it('signal já abortado não dispara nenhum worker', async () => {
    const worker = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const snapshot = await runBatchQueue<number, number>({
      items: itens(10),
      worker,
      signal: controller.signal,
    });
    expect(worker).not.toHaveBeenCalled();
    for (const item of snapshot.items) expect(item.status).toBe('cancelado');
  });
});

describe('runBatchQueue — observabilidade', () => {
  it('emite snapshots monotônicos e termina com running=false', async () => {
    const clock = fakeClock();
    const snapshots: QueueSnapshot<number>[] = [];

    const final = await runBatchQueue<number, number>({
      items: itens(12),
      concurrency: 2,
      minIntervalMs: 0,
      worker: async (n) => n,
      onSnapshot: (s) => snapshots.push(s),
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
    });

    expect(snapshots.length).toBeGreaterThan(0);
    // `done` nunca regride: a barra de progresso não pode andar para trás.
    let anterior = -1;
    for (const s of snapshots) {
      expect(s.done).toBeGreaterThanOrEqual(anterior);
      expect(s.total).toBe(12);
      anterior = s.done;
    }
    expect(final.running).toBe(false);
    expect(final.done).toBe(12);
  });

  it('um onSnapshot que lança não derruba a fila', async () => {
    const clock = fakeClock();
    const snapshot = await runBatchQueue<number, number>({
      items: itens(5),
      minIntervalMs: 0,
      worker: async (n) => n,
      onSnapshot: () => {
        throw new Error('render explodiu');
      },
      now: clock.now,
      sleep: clock.sleep,
      random: () => 0.5,
    });
    // Observabilidade é acessório; quebrar o lote por causa dela seria
    // trocar um bug de UI por perda de trabalho já pago em créditos.
    expect(snapshot.done).toBe(5);
  });
});
