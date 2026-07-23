import { describe, it, expect } from "vitest";
import { applyView, evalRule, noteToRow, defaultView, type FilterRule } from "@/services/basesService";
import type { NotebookNote } from "@/services/notesService";

function mkNote(id: string, title: string, body: string, extra?: Partial<NotebookNote>): NotebookNote {
  return {
    id,
    title,
    body_md: body,
    is_archived: false,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
    collection_id: "c1",
    workspace_id: "w1",
    author_email: null,
    ...extra,
  } as unknown as NotebookNote;
}

describe("basesService", () => {
  const n1 = mkNote("1", "Alpha", "---\nstatus: doing\npriority: 3\ntags: [pt, work]\n---\ncorpo #ideia");
  const n2 = mkNote("2", "Beta", "---\nstatus: done\npriority: 1\n---\ntexto simples");
  const n3 = mkNote("3", "Gamma", "sem frontmatter #ideia [[Alpha]]");

  const rows = [n1, n2, n3].map(noteToRow);

  it("extrai frontmatter, tags e wikilinks", () => {
    expect(rows[0].props.status).toBe("doing");
    expect(rows[0].props.priority).toBe(3);
    expect(rows[0].tags).toContain("pt");
    expect(rows[2].tags).toContain("ideia");
    expect(rows[2].wikilinks_out).toContain("Alpha");
  });

  it("filtra por eq no frontmatter", () => {
    const r: FilterRule = { column: "status", op: "eq", value: "doing" };
    expect(rows.filter((row) => evalRule(row, r)).map((r) => r.id)).toEqual(["1"]);
  });

  it("filtra por contains no title (case-insensitive)", () => {
    const r: FilterRule = { column: "title", op: "contains", value: "GAM" };
    expect(rows.filter((row) => evalRule(row, r)).map((r) => r.id)).toEqual(["3"]);
  });

  it("filtra por in em tags (frontmatter substitui inline tags)", () => {
    const r: FilterRule = { column: "tags", op: "in", value: "ideia,foo" };
    const ids = rows.filter((row) => evalRule(row, r)).map((r) => r.id);
    // n1 declara `tags: [pt, work]` no frontmatter → sobrepõe #ideia inline; só n3 casa.
    expect(ids).toEqual(["3"]);
  });

  it("gt em valores numéricos", () => {
    const r: FilterRule = { column: "priority", op: "gt", value: 2 };
    expect(rows.filter((row) => evalRule(row, r)).map((r) => r.id)).toEqual(["1"]);
  });

  it("exists / not_exists respeita null e arrays vazios", () => {
    const exists: FilterRule = { column: "status", op: "exists" };
    expect(rows.filter((r) => evalRule(r, exists)).length).toBe(2);
    const missing: FilterRule = { column: "status", op: "not_exists" };
    expect(rows.filter((r) => evalRule(r, missing)).map((r) => r.id)).toEqual(["3"]);
  });

  it("applyView combina filtros AND + ordenação", () => {
    const view = {
      ...defaultView(),
      filters: [{ column: "status", op: "exists" as const }],
      sortBy: "title",
      sortDir: "asc" as const,
    };
    const out = applyView(rows, view);
    expect(out.map((r) => r.title)).toEqual(["Alpha", "Beta"]);
  });

  it("ignora notas arquivadas", () => {
    const archived = { ...rows[0], is_archived: true };
    const out = applyView([archived, rows[1]], defaultView());
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });
});
