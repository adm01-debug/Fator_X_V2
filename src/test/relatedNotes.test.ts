import { describe, it, expect } from "vitest";
import { findRelatedNotes } from "@/services/relatedNotesService";
import type { NotebookNote } from "@/services/notesService";

function makeNote(partial: Partial<NotebookNote>): NotebookNote {
  return {
    id: partial.id ?? crypto.randomUUID(),
    workspace_id: "w",
    collection_id: "c",
    title: partial.title ?? "",
    body_md: partial.body_md ?? "",
    tags: partial.tags ?? [],
    created_by: null,
    is_archived: partial.is_archived ?? false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("findRelatedNotes", () => {
  it("excludes the active note itself", () => {
    const a = makeNote({ id: "a", title: "IA generativa", body_md: "modelos llm rag" });
    const b = makeNote({ id: "b", title: "IA generativa", body_md: "modelos llm rag" });
    const r = findRelatedNotes(a, [a, b]);
    expect(r.every((x) => x.note.id !== "a")).toBe(true);
    expect(r[0]?.note.id).toBe("b");
  });

  it("skips archived notes", () => {
    const a = makeNote({ id: "a", body_md: "supabase edge functions rls" });
    const b = makeNote({ id: "b", body_md: "supabase edge functions rls", is_archived: true });
    expect(findRelatedNotes(a, [a, b])).toHaveLength(0);
  });

  it("boosts shared tags and wikilinks", () => {
    const a = makeNote({
      id: "a",
      body_md: "conteudo generico [[projeto-x]]",
      tags: ["ia", "produto"],
    });
    const b = makeNote({
      id: "b",
      body_md: "outro conteudo generico [[projeto-x]]",
      tags: ["ia", "produto"],
    });
    const c = makeNote({ id: "c", body_md: "texto sem qualquer relacao real" });
    const r = findRelatedNotes(a, [a, b, c]);
    expect(r[0]?.note.id).toBe("b");
    expect(r[0]?.sharedTags).toEqual(expect.arrayContaining(["ia", "produto"]));
    expect(r[0]?.sharedLinks).toContain("projeto-x");
  });

  it("returns empty when no meaningful overlap", () => {
    const a = makeNote({ id: "a", body_md: "abc def ghi" });
    const b = makeNote({ id: "b", body_md: "xyz uvw rst" });
    expect(findRelatedNotes(a, [a, b])).toHaveLength(0);
  });
});
