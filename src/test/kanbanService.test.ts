import { describe, it, expect } from "vitest";
import { buildColumns, getGroupValue, UNSTATUSED } from "@/services/kanbanService";
import type { NotebookNote } from "@/services/notesService";

function n(id: string, body: string, extra: Partial<NotebookNote> = {}): NotebookNote {
  return {
    id,
    workspace_id: "w",
    collection_id: "c",
    title: `n-${id}`,
    body_md: body,
    tags: [],
    created_by: null,
    is_archived: false,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...extra,
  };
}

describe("kanbanService", () => {
  it("getGroupValue returns UNSTATUSED when property missing", () => {
    expect(getGroupValue(n("1", "corpo"), "status")).toBe(UNSTATUSED);
  });

  it("getGroupValue normalizes case and trims", () => {
    const body = "---\nstatus: Doing\n---\ncorpo";
    expect(getGroupValue(n("1", body), "status")).toBe("doing");
  });

  it("buildColumns preserves order and appends 'Sem status'", () => {
    const notes = [
      n("a", "---\nstatus: doing\n---\n"),
      n("b", "---\nstatus: done\n---\n"),
      n("c", "sem fm"),
    ];
    const cols = buildColumns(notes, "status");
    expect(cols.map((c) => c.key)).toEqual(["backlog", "doing", "review", "done", UNSTATUSED]);
    expect(cols.find((c) => c.key === "doing")?.notes).toHaveLength(1);
    expect(cols.find((c) => c.key === UNSTATUSED)?.notes).toHaveLength(1);
  });

  it("buildColumns skips archived notes", () => {
    const notes = [n("a", "---\nstatus: done\n---\n", { is_archived: true })];
    const cols = buildColumns(notes, "status");
    for (const c of cols) expect(c.notes).toHaveLength(0);
  });

  it("buildColumns adds custom columns from unseen values", () => {
    const notes = [n("a", "---\nstatus: blocked\n---\n")];
    const cols = buildColumns(notes, "status");
    expect(cols.some((c) => c.key === "blocked")).toBe(true);
  });
});
