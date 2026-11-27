import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
let kbRows: unknown[] = [{ id: "kb-1" }];
let colRows: unknown[] = [{ id: "col-1" }];
let docRows: unknown[] = [{ id: "doc-1" }];
let counts: Record<string, number> = { pending: 4, failed: 2, dead: 1 };

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = ["select", "eq", "in", "is", "lt", "gte", "order", "limit"];
  for (const m of chain) b[m] = (...args: unknown[]) => (b.calls = [...((b.calls as unknown[]) ?? []), { m, args }], b);
  (b as { calls?: unknown[] }).calls = [];
  b.then = (resolve: (v: unknown) => void) => {
    let data: unknown[] = [];
    if (table === "knowledge_bases") data = kbRows;
    else if (table === "collections") data = colRows;
    else if (table === "documents") data = docRows;
    const c = (b as { calls?: Array<{ m: string; args: unknown[] }> }).calls ?? [];
    let count = counts.pending;
    if (c.some((x) => x.m === "eq" && x.args[0] === "embedding_status" && x.args[1] === "failed")) count = counts.failed;
    if (c.some((x) => x.m === "gte" && x.args[0] === "embed_attempts")) count = counts.dead;
    calls.push({ table, op: "select", args: c.map((x) => x.args) });
    resolve({ data, count, error: null });
    return Promise.resolve({ data, count, error: null });
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => makeBuilder(t) },
}));

describe("getEmbeddingHealth", () => {
  beforeEach(() => {
    calls.length = 0;
    kbRows = [{ id: "kb-1" }];
    colRows = [{ id: "col-1" }];
    docRows = [{ id: "doc-1" }];
    counts = { pending: 4, failed: 2, dead: 1 };
  });

  it("resolve documento do workspace antes de contar chunks", async () => {
    const mod = await import("@/services/knowledgeManagementService");
    const health = await mod.getEmbeddingHealth("ws-1");
    expect(health).toEqual({ pending: 4, failed_retryable: 2, dead_letter: 1 });
    const chunkCalls = calls.filter((c) => c.table === "chunks");
    expect(chunkCalls.length).toBe(3);
    for (const c of chunkCalls) {
      const inArg = c.args.find(
        (a) => Array.isArray(a) && a.length === 2 && a[0] === "document_id",
      ) as [string, string[]] | undefined;
      expect(inArg?.[1]).toEqual(["doc-1"]);
    }
  });

  it("devolve zero sem tocar em chunks quando o workspace nao tem base", async () => {
    kbRows = [];
    const mod = await import("@/services/knowledgeManagementService");
    const health = await mod.getEmbeddingHealth("ws-vazio");
    expect(health).toEqual({ pending: 0, failed_retryable: 0, dead_letter: 0 });
    expect(calls.filter((c) => c.table === "chunks").length).toBe(0);
  });

  it("para antes de collections quando nao ha knowledge_base", async () => {
    kbRows = [];
    const mod = await import("@/services/knowledgeManagementService");
    await mod.getEmbeddingHealth("ws-x");
    expect(calls.some((c) => c.table === "documents")).toBe(false);
  });
});