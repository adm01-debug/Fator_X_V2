/**
 * e2eeSimulationService — Gera cenários sintéticos de sync conflitante em massa
 * e valida se `planReconciliation` + `encryptBundle`/`decryptBundle` classificam
 * corretamente cada caso (insert, update, keep, conflict).
 *
 * Não toca no banco. Tudo roda em memória no navegador.
 */
import {
  encryptBundle,
  decryptBundle,
  planReconciliation,
  type BundlePayload,
} from "@/services/e2eeService";

export type ExpectedOutcome = "insert" | "update" | "keep" | "conflict";

export interface ScenarioSpec {
  id: string;
  name: string;
  expected: ExpectedOutcome;
  /** Nota local (undefined = ainda não existe). */
  local?: BundlePayload["notes"][number];
  /** Nota recebida (undefined = não veio no bundle). */
  incoming: BundlePayload["notes"][number];
}

export interface ScenarioResult {
  id: string;
  name: string;
  expected: ExpectedOutcome;
  actual: ExpectedOutcome | "missing" | "error";
  pass: boolean;
  detail?: string;
}

export interface SimulationSummary {
  total: number;
  passed: number;
  failed: number;
  byOutcome: Record<ExpectedOutcome, { total: number; passed: number }>;
  cryptoRoundTripOk: boolean;
  cryptoDetail?: string;
  results: ScenarioResult[];
  elapsedMs: number;
}

// ─── Geração de cenários ────────────────────────────────────────────────
function makeNote(
  id: string,
  title: string,
  body: string,
  updatedAt: string,
): BundlePayload["notes"][number] {
  return { id, title, body_md: body, tags: [], updated_at: updatedAt, is_archived: false };
}

function iso(offsetMs: number, base = Date.now()): string {
  return new Date(base + offsetMs).toISOString();
}

export interface GenerateOptions {
  count: number;
  /** % de cenários "insert" (só incoming). */
  pctInsert: number;
  /** % de cenários "update" (incoming mais novo por muito). */
  pctUpdate: number;
  /** % de cenários "keep" (local mais novo por muito). */
  pctKeep: number;
  /** % de cenários "conflict" (edições próximas dentro da janela). */
  pctConflict: number;
  /** Janela de conflito em ms, usada tanto para gerar quanto para reconciliar. */
  conflictWindowMs: number;
}

export function generateScenarios(opts: GenerateOptions): ScenarioSpec[] {
  const { count, conflictWindowMs } = opts;
  const totalPct = opts.pctInsert + opts.pctUpdate + opts.pctKeep + opts.pctConflict;
  if (totalPct <= 0) return [];
  const nInsert = Math.round((opts.pctInsert / totalPct) * count);
  const nUpdate = Math.round((opts.pctUpdate / totalPct) * count);
  const nKeep = Math.round((opts.pctKeep / totalPct) * count);
  const nConflict = Math.max(0, count - nInsert - nUpdate - nKeep);

  const base = Date.now();
  const out: ScenarioSpec[] = [];
  const bigOffset = conflictWindowMs * 5; // bem fora da janela
  const tinyOffset = Math.max(1, Math.floor(conflictWindowMs / 4)); // dentro da janela

  for (let i = 0; i < nInsert; i++) {
    const id = `ins-${i}-${crypto.randomUUID()}`;
    out.push({
      id,
      name: `Insert #${i + 1}`,
      expected: "insert",
      incoming: makeNote(id, `Nova nota ${i}`, `corpo ${i}`, iso(0, base)),
    });
  }
  for (let i = 0; i < nUpdate; i++) {
    const id = `upd-${i}-${crypto.randomUUID()}`;
    out.push({
      id,
      name: `Update #${i + 1}`,
      expected: "update",
      local: makeNote(id, `Título antigo ${i}`, `corpo antigo ${i}`, iso(-bigOffset, base)),
      incoming: makeNote(id, `Título novo ${i}`, `corpo novo ${i}`, iso(0, base)),
    });
  }
  for (let i = 0; i < nKeep; i++) {
    const id = `keep-${i}-${crypto.randomUUID()}`;
    out.push({
      id,
      name: `Keep #${i + 1}`,
      expected: "keep",
      local: makeNote(id, `Local ${i}`, `local ${i}`, iso(0, base)),
      incoming: makeNote(id, `Recebida ${i}`, `recebida ${i}`, iso(-bigOffset, base)),
    });
  }
  for (let i = 0; i < nConflict; i++) {
    const id = `cf-${i}-${crypto.randomUUID()}`;
    out.push({
      id,
      name: `Conflict #${i + 1}`,
      expected: "conflict",
      local: makeNote(id, `Local ${i}`, `local ${i}`, iso(0, base)),
      incoming: makeNote(id, `Recebida ${i}`, `recebida ${i}`, iso(tinyOffset, base)),
    });
  }
  return out;
}

// ─── Execução ───────────────────────────────────────────────────────────
export interface RunOptions {
  conflictWindowMs: number;
  /** Se true, também roda encrypt→decrypt no bundle para checar integridade. */
  cryptoRoundTrip?: boolean;
  passphrase?: string;
  notebookId?: string;
}

function classify(
  id: string,
  plan: ReturnType<typeof planReconciliation>,
): ExpectedOutcome | "missing" {
  if (plan.toInsert.find((n) => n.id === id)) return "insert";
  if (plan.toUpdate.find((n) => n.id === id)) return "update";
  if (plan.toKeep.includes(id)) return "keep";
  if (plan.conflicts.find((c) => c.id === id)) return "conflict";
  return "missing";
}

export async function runSimulation(
  scenarios: ScenarioSpec[],
  opts: RunOptions,
): Promise<SimulationSummary> {
  const started = performance.now();
  const notebookId = opts.notebookId ?? "sim-notebook";
  const incoming: BundlePayload = {
    notebook_id: notebookId,
    exported_at: new Date().toISOString(),
    notes: scenarios.map((s) => s.incoming),
  };
  const local = scenarios.filter((s) => s.local).map((s) => s.local!);

  // Crypto round-trip opcional
  let cryptoRoundTripOk = true;
  let cryptoDetail: string | undefined;
  if (opts.cryptoRoundTrip) {
    try {
      const pass = opts.passphrase ?? "simulacao-passphrase-123";
      const bundle = await encryptBundle(incoming, pass);
      const back = await decryptBundle(bundle, pass);
      if (back.notes.length !== incoming.notes.length) {
        cryptoRoundTripOk = false;
        cryptoDetail = `Contagem divergente após decrypt: ${back.notes.length} vs ${incoming.notes.length}`;
      } else {
        // amostragem: primeira e última
        const okFirst = back.notes[0]?.id === incoming.notes[0]?.id;
        const okLast = back.notes.at(-1)?.id === incoming.notes.at(-1)?.id;
        if (!okFirst || !okLast) {
          cryptoRoundTripOk = false;
          cryptoDetail = "Ordem/ids das notas mudou após round-trip";
        }
      }
    } catch (e) {
      cryptoRoundTripOk = false;
      cryptoDetail = e instanceof Error ? e.message : String(e);
    }
  }

  const plan = planReconciliation(incoming, local, opts.conflictWindowMs);

  const byOutcome: SimulationSummary["byOutcome"] = {
    insert: { total: 0, passed: 0 },
    update: { total: 0, passed: 0 },
    keep: { total: 0, passed: 0 },
    conflict: { total: 0, passed: 0 },
  };

  const results: ScenarioResult[] = scenarios.map((s) => {
    const actual = classify(s.id, plan);
    const pass = actual === s.expected;
    byOutcome[s.expected].total += 1;
    if (pass) byOutcome[s.expected].passed += 1;
    return {
      id: s.id,
      name: s.name,
      expected: s.expected,
      actual,
      pass,
      detail: pass
        ? undefined
        : actual === "missing"
        ? "Nota não apareceu em nenhum bucket do plano."
        : `Esperava ${s.expected}, obteve ${actual}.`,
    };
  });

  const passed = results.filter((r) => r.pass).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    byOutcome,
    cryptoRoundTripOk,
    cryptoDetail,
    results,
    elapsedMs: performance.now() - started,
  };
}
