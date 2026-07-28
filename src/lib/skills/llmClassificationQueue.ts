/**
 * Fila de execução em lote com controle de taxa e retry — motor genérico por
 * trás do fallback LLM de classificação de departamento.
 *
 * Por que uma fila e não um `Promise.all`:
 *  - Disparar 90 chamadas de LLM ao mesmo tempo garante 429 no gateway e queima
 *    o orçamento em retries inúteis. Precisamos limitar tanto o PICO
 *    (concorrência) quanto a TAXA SUSTENTADA (espaçamento mínimo entre
 *    disparos) — duas dimensões independentes: 2 em voo com 1 req/s é um
 *    perfil de carga completamente diferente de 2 em voo sem espaçamento.
 *  - Uma falha isolada não pode derrubar o lote. Cada item tem seu próprio
 *    ciclo de vida e seu próprio contador de tentativas.
 *  - O curador precisa ver o progresso item a item enquanto roda, não um
 *    spinner opaco por dois minutos.
 *
 * O módulo é PURO em relação ao tempo: `sleep`, `now` e `random` são
 * injetáveis, então a simulação de cenários (incluindo 429 em rajada) roda
 * instantânea e determinística nos testes, sem timers reais.
 */

/** Estados possíveis de um item. Terminais: `concluido`, `falhou`, `cancelado`. */
export type QueueItemStatus =
  | 'pendente'
  | 'executando'
  | 'aguardando_retry'
  | 'concluido'
  | 'falhou'
  | 'cancelado';

export const TERMINAL_STATUSES: readonly QueueItemStatus[] = [
  'concluido',
  'falhou',
  'cancelado',
];

export function isTerminal(status: QueueItemStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Erro que o worker lança para instruir a fila sobre o retry.
 *
 * A decisão de re-tentar pertence a quem conhece o protocolo (o serviço que
 * traduz o HTTP), não à fila. A fila só obedece.
 */
export class QueueWorkerError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** Dica do servidor (`Retry-After`) em ms — respeitada como PISO do backoff. */
    readonly retryAfterMs: number | null = null,
    /** Rótulo curto para agrupar falhas na UI. */
    readonly kind: string = 'erro',
  ) {
    super(message);
    this.name = 'QueueWorkerError';
  }
}

export interface QueueItemState<TOut> {
  id: string;
  status: QueueItemStatus;
  /** Tentativas já concluídas (0 antes do primeiro disparo). */
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  errorKind: string | null;
  result: TOut | null;
  /** Timestamp (ms) do próximo disparo quando em `aguardando_retry`. */
  nextRetryAt: number | null;
}

export interface QueueSnapshot<TOut> {
  items: QueueItemState<TOut>[];
  /** Itens em estado terminal. */
  done: number;
  total: number;
  running: boolean;
}

export interface QueueInput<TIn> {
  id: string;
  input: TIn;
}

export interface RunQueueOptions<TIn, TOut> {
  items: readonly QueueInput<TIn>[];
  worker: (input: TIn, ctx: { attempt: number; signal?: AbortSignal }) => Promise<TOut>;
  /** Máximo de chamadas simultâneas. Controla o PICO. Default 2. */
  concurrency?: number;
  /** Intervalo mínimo entre dois disparos. Controla a TAXA. Default 400ms. */
  minIntervalMs?: number;
  /** Tentativas totais por item (inclui a primeira). Default 3. */
  maxAttempts?: number;
  baseBackoffMs?: number;
  capBackoffMs?: number;
  signal?: AbortSignal;
  onSnapshot?: (snapshot: QueueSnapshot<TOut>) => void;
  // Injeções para teste determinístico.
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

export const DEFAULT_CONCURRENCY = 2;
export const DEFAULT_MIN_INTERVAL_MS = 400;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BASE_BACKOFF_MS = 800;
export const DEFAULT_CAP_BACKOFF_MS = 15_000;

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    function finish() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      // Aborto resolve em vez de rejeitar: quem observa o signal é o laço da
      // fila, que já trata o cancelamento de forma estruturada. Rejeitar aqui
      // criaria uma unhandled rejection para cada item pendente.
      resolve();
    }
    signal?.addEventListener('abort', finish, { once: true });
  });
}

/**
 * Backoff com *equal jitter*: metade fixa + metade aleatória.
 *
 * Divergimos do full-jitter usado em `_shared/retry.ts` de propósito. Lá o
 * retry cobre falhas de rede, onde um delay perto de zero é inofensivo. Aqui a
 * causa dominante é 429 — o servidor dizendo explicitamente "você está rápido
 * demais". Full-jitter pode sortear ~0ms, re-bater no limitador no mesmo
 * instante e queimar uma tentativa sem nunca esperar de verdade. O piso
 * garantido resolve isso mantendo a decorrelação entre itens concorrentes.
 */
export function computeBackoff(
  attempt: number,
  baseMs: number,
  capMs: number,
  random: () => number,
): number {
  const exp = Math.min(capMs, baseMs * Math.pow(2, Math.max(0, attempt)));
  const half = exp / 2;
  return Math.floor(half + random() * half);
}

interface PendingItem<TIn> {
  id: string;
  input: TIn;
  attempts: number;
  readyAt: number;
}

/**
 * Executa o lote respeitando concorrência, espaçamento e retry.
 *
 * Sempre resolve (nunca rejeita): o resultado do lote é o conjunto de estados
 * finais. Uma exceção aqui perderia o progresso parcial, que é justamente o
 * que o curador precisa ver.
 */
export async function runBatchQueue<TIn, TOut>(
  options: RunQueueOptions<TIn, TOut>,
): Promise<QueueSnapshot<TOut>> {
  const {
    items,
    worker,
    signal,
    onSnapshot,
    now = () => Date.now(),
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  const concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY));
  const minIntervalMs = Math.max(0, options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS);
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS));
  const baseBackoffMs = Math.max(0, options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS);
  const capBackoffMs = Math.max(baseBackoffMs, options.capBackoffMs ?? DEFAULT_CAP_BACKOFF_MS);

  // Dedupe por id: dois itens com o mesmo id colidiriam no mapa de estado e um
  // sobrescreveria o status do outro na UI.
  const state = new Map<string, QueueItemState<TOut>>();
  const pending: PendingItem<TIn>[] = [];
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || item.id.length === 0) continue;
    if (state.has(item.id)) continue;
    state.set(item.id, {
      id: item.id,
      status: 'pendente',
      attempts: 0,
      maxAttempts,
      lastError: null,
      errorKind: null,
      result: null,
      nextRetryAt: null,
    });
    pending.push({ id: item.id, input: item.input, attempts: 0, readyAt: 0 });
  }

  let running = true;

  const snapshot = (): QueueSnapshot<TOut> => {
    const list = Array.from(state.values(), (s) => ({ ...s }));
    return {
      items: list,
      done: list.filter((s) => isTerminal(s.status)).length,
      total: list.length,
      running,
    };
  };

  /**
   * Notifica o observador ISOLANDO suas exceções.
   *
   * O observador é código de UI (um `setState`). Se ele lançar — um render
   * quebrado, um componente desmontado — a exceção subiria pelo laço da fila e
   * abortaria um lote já pago em créditos, perdendo todo o progresso parcial.
   * Observabilidade é acessório: ela não pode derrubar o trabalho que observa.
   */
  const emit = () => {
    if (!onSnapshot) return;
    try {
      onSnapshot(snapshot());
    } catch (error) {
      logger.warn('llmClassificationQueue: onSnapshot lançou exceção', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  emit();

  if (pending.length === 0) {
    running = false;
    emit();
    return snapshot();
  }

  // Slot de disparo reservado ANTES de dormir. Sem a reserva, dois workers
  // leriam o mesmo `lastDispatchAt`, dormiriam o mesmo tempo e disparariam
  // juntos — o espaçamento viraria decorativo sob concorrência > 1.
  let lastDispatchAt = Number.NEGATIVE_INFINITY;

  /** Remove e devolve o pendente com o menor `readyAt` (o mais urgente). */
  function takeNext(): PendingItem<TIn> | null {
    if (pending.length === 0) return null;
    let melhorIdx = 0;
    for (let i = 1; i < pending.length; i += 1) {
      if (pending[i].readyAt < pending[melhorIdx].readyAt) melhorIdx = i;
    }
    return pending.splice(melhorIdx, 1)[0];
  }

  function cancelRemaining() {
    for (const p of pending.splice(0, pending.length)) {
      const s = state.get(p.id);
      if (s && !isTerminal(s.status)) {
        s.status = 'cancelado';
        s.nextRetryAt = null;
      }
    }
  }

  async function workerLoop(): Promise<void> {
    for (;;) {
      if (signal?.aborted) {
        cancelRemaining();
        return;
      }
      const item = takeNext();
      if (!item) return;

      const s = state.get(item.id);
      if (!s) continue;

      const agora = now();
      const dispatchAt = Math.max(agora, item.readyAt, lastDispatchAt + minIntervalMs);
      lastDispatchAt = dispatchAt;

      const espera = dispatchAt - agora;
      if (espera > 0) {
        s.status = 'aguardando_retry';
        s.nextRetryAt = dispatchAt;
        emit();
        await sleep(espera, signal);
      }

      if (signal?.aborted) {
        s.status = 'cancelado';
        s.nextRetryAt = null;
        cancelRemaining();
        emit();
        return;
      }

      s.status = 'executando';
      s.nextRetryAt = null;
      emit();

      try {
        const result = await worker(item.input, { attempt: item.attempts, signal });
        s.attempts = item.attempts + 1;
        s.status = 'concluido';
        s.result = result;
        s.lastError = null;
        s.errorKind = null;
        emit();
      } catch (error) {
        const tentativas = item.attempts + 1;
        s.attempts = tentativas;
        s.lastError = error instanceof Error ? error.message : String(error ?? 'Erro desconhecido');
        s.errorKind = error instanceof QueueWorkerError ? error.kind : 'erro';

        const retryable = error instanceof QueueWorkerError ? error.retryable : true;
        const podeRetentar = retryable && tentativas < maxAttempts && !signal?.aborted;

        if (!podeRetentar) {
          s.status = signal?.aborted ? 'cancelado' : 'falhou';
          s.nextRetryAt = null;
          emit();
          continue;
        }

        const backoff = computeBackoff(item.attempts, baseBackoffMs, capBackoffMs, random);
        const dica = error instanceof QueueWorkerError ? (error.retryAfterMs ?? 0) : 0;
        const atraso = Math.max(backoff, dica);

        s.status = 'aguardando_retry';
        s.nextRetryAt = now() + atraso;
        emit();

        pending.push({
          id: item.id,
          input: item.input,
          attempts: tentativas,
          readyAt: now() + atraso,
        });
      }
    }
  }

  const onAbort = () => {
    cancelRemaining();
    emit();
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, pending.length) }, () => workerLoop()),
    );
  } finally {
    signal?.removeEventListener('abort', onAbort);
    running = false;
    // Rede de segurança: nada pode terminar em estado não-terminal, senão a UI
    // exibiria um item "executando" para sempre.
    for (const s of state.values()) {
      if (!isTerminal(s.status)) {
        s.status = signal?.aborted ? 'cancelado' : 'falhou';
        s.lastError = s.lastError ?? 'Interrompido antes de concluir.';
        s.nextRetryAt = null;
      }
    }
    emit();
  }

  return snapshot();
}
