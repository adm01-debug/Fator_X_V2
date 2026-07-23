/**
 * e2eeAutoSync — Motor de sync E2EE automático em segundo plano por notebook.
 *
 * Ciclo por notebook:
 *  1. Lê passphrase da sessão. Sem passphrase = disabled (não roda).
 *  2. buildBundleFromNotebook → encryptBundle → decryptBundle (round-trip).
 *  3. planReconciliation contra o último checkpoint local cifrado.
 *  4. Persiste o novo checkpoint cifrado em localStorage.
 *  5. Sucesso → agenda próximo tick em `intervalMs`.
 *  6. Falha → backoff exponencial (base 5s, teto 5min).
 *
 * A UI se inscreve via `subscribe()` para renderizar status/última execução.
 */
import {
  buildBundleFromNotebook,
  encryptBundle,
  decryptBundle,
  planReconciliation,
  getSessionPassphrase,
  type BundlePayload,
  type EncryptedBundle,
  type ReconciliationPlan,
} from "@/services/e2eeService";
import { logger } from "@/lib/logger";

export type AutoSyncPhase =
  | "disabled"
  | "idle"
  | "running"
  | "success"
  | "error"
  | "conflicts";

export interface AutoSyncStatus {
  notebookId: string;
  phase: AutoSyncPhase;
  lastRunAt: string | null;
  lastError: string | null;
  attempt: number;
  nextRunAt: string | null;
  lastPlanSummary: {
    insert: number;
    update: number;
    keep: number;
    conflicts: number;
  } | null;
  intervalMs: number;
}

const CHECKPOINT_PREFIX = "nexus.e2ee.checkpoint:";
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const DEFAULT_INTERVAL_MS = 60_000;

interface Entry {
  status: AutoSyncStatus;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  listeners: Set<(s: AutoSyncStatus) => void>;
}

const entries = new Map<string, Entry>();

function makeInitial(notebookId: string, intervalMs: number): AutoSyncStatus {
  return {
    notebookId,
    phase: "idle",
    lastRunAt: null,
    lastError: null,
    attempt: 0,
    nextRunAt: null,
    lastPlanSummary: null,
    intervalMs,
  };
}

function emit(entry: Entry) {
  for (const l of entry.listeners) {
    try {
      l({ ...entry.status });
    } catch {
      /* ignore */
    }
  }
}

function getEntry(notebookId: string, intervalMs: number): Entry {
  let e = entries.get(notebookId);
  if (!e) {
    e = { status: makeInitial(notebookId, intervalMs), timer: null, running: false, listeners: new Set() };
    entries.set(notebookId, e);
  } else {
    e.status.intervalMs = intervalMs;
  }
  return e;
}

function saveCheckpoint(notebookId: string, bundle: EncryptedBundle) {
  try {
    localStorage.setItem(CHECKPOINT_PREFIX + notebookId, JSON.stringify(bundle));
  } catch {
    /* quota — ignore silenciosamente */
  }
}

function loadCheckpoint(notebookId: string): EncryptedBundle | null {
  try {
    const raw = localStorage.getItem(CHECKPOINT_PREFIX + notebookId);
    return raw ? (JSON.parse(raw) as EncryptedBundle) : null;
  } catch {
    return null;
  }
}

function scheduleNext(entry: Entry, delayMs: number) {
  if (entry.timer) clearTimeout(entry.timer);
  entry.status.nextRunAt = new Date(Date.now() + delayMs).toISOString();
  entry.timer = setTimeout(() => {
    void runOnce(entry).catch(() => {
      /* runOnce já trata */
    });
  }, delayMs);
  emit(entry);
}

async function runOnce(entry: Entry): Promise<void> {
  if (entry.running) return;
  const { notebookId } = entry.status;
  const pass = getSessionPassphrase(notebookId);
  if (!pass) {
    entry.status.phase = "disabled";
    entry.status.lastError = "Passphrase ausente na sessão.";
    entry.status.nextRunAt = null;
    emit(entry);
    return;
  }

  entry.running = true;
  entry.status.phase = "running";
  emit(entry);

  try {
    const payload = await buildBundleFromNotebook(notebookId);
    const bundle = await encryptBundle(payload, pass);

    // Round-trip: garante que a passphrase decripta o que acabamos de cifrar.
    const roundTrip = await decryptBundle(bundle, pass);
    if (roundTrip.notes.length !== payload.notes.length) {
      throw new Error("Round-trip AES-GCM divergente — sync abortado.");
    }

    // Compara com o último checkpoint (se houver) para reportar drift.
    let planSummary: AutoSyncStatus["lastPlanSummary"] = { insert: 0, update: 0, keep: 0, conflicts: 0 };
    let plan: ReconciliationPlan | null = null;
    const prev = loadCheckpoint(notebookId);
    if (prev) {
      try {
        const prevPayload = await decryptBundle(prev, pass);
        const localSlim: BundlePayload["notes"] = prevPayload.notes;
        plan = planReconciliation(payload, localSlim);
        planSummary = {
          insert: plan.toInsert.length,
          update: plan.toUpdate.length,
          keep: plan.toKeep.length,
          conflicts: plan.conflicts.length,
        };
      } catch (e) {
        // Passphrase mudou vs checkpoint antigo? Não é fatal — apenas re-carimba.
        logger.warn("e2ee.autosync.prev_decrypt_failed", {
          notebookId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    saveCheckpoint(notebookId, bundle);

    entry.status.phase = plan && plan.conflicts.length > 0 ? "conflicts" : "success";
    entry.status.lastRunAt = new Date().toISOString();
    entry.status.lastError = null;
    entry.status.attempt = 0;
    entry.status.lastPlanSummary = planSummary;
    scheduleNext(entry, entry.status.intervalMs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    entry.status.phase = "error";
    entry.status.lastError = msg;
    entry.status.attempt += 1;
    const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, entry.status.attempt - 1));
    logger.warn("e2ee.autosync.failed", { notebookId, attempt: entry.status.attempt, backoff, error: msg });
    scheduleNext(entry, backoff);
  } finally {
    entry.running = false;
    emit(entry);
  }
}

// ─── API pública ────────────────────────────────────────────────────────

export function startAutoSync(notebookId: string, intervalMs: number = DEFAULT_INTERVAL_MS): void {
  const entry = getEntry(notebookId, intervalMs);
  if (entry.timer) clearTimeout(entry.timer);
  // Executa uma primeira vez imediatamente; o próximo tick é agendado dentro.
  entry.timer = setTimeout(() => {
    void runOnce(entry);
  }, 0);
  entry.status.nextRunAt = new Date().toISOString();
  emit(entry);
}

export function stopAutoSync(notebookId: string): void {
  const entry = entries.get(notebookId);
  if (!entry) return;
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  entry.status.phase = "idle";
  entry.status.nextRunAt = null;
  emit(entry);
}

/** Dispara uma execução imediata (respeitando o "não sobrepor" flag). */
export function triggerAutoSyncNow(notebookId: string): void {
  const entry = entries.get(notebookId);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    void runOnce(entry);
  }, 0);
}

export function getAutoSyncStatus(notebookId: string): AutoSyncStatus | null {
  const e = entries.get(notebookId);
  return e ? { ...e.status } : null;
}

export function subscribeAutoSync(
  notebookId: string,
  listener: (s: AutoSyncStatus) => void,
): () => void {
  const entry = getEntry(notebookId, DEFAULT_INTERVAL_MS);
  entry.listeners.add(listener);
  listener({ ...entry.status });
  return () => {
    entry.listeners.delete(listener);
  };
}

export const E2EE_AUTOSYNC_DEFAULTS = {
  intervalMs: DEFAULT_INTERVAL_MS,
  baseBackoffMs: BASE_BACKOFF_MS,
  maxBackoffMs: MAX_BACKOFF_MS,
};
