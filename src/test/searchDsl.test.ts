import { describe, it, expect } from "vitest";
import { parseQuery, matchNote, type EvaluatableNote } from "@/lib/searchDsl";

const base: EvaluatableNote = {
  id: "1",
  title: "Plano de Ação Comercial",
  body_md: "---\nstatus: doing\nowner: ana\n---\nRoadmap alpha e beta.",
  tags: ["comercial", "planejamento"],
  created_at: "2026-07-01T10:00:00Z",
  updated_at: "2026-07-20T10:00:00Z",
  is_archived: false,
  collection_id: "c1",
};

describe("searchDsl", () => {
  it("faz match por termo livre insensível a acento", () => {
    expect(matchNote(base, parseQuery("acao"))).toBe(true);
    expect(matchNote(base, parseQuery("Ação"))).toBe(true);
  });

  it("filtra por tag", () => {
    expect(matchNote(base, parseQuery("tag:comercial"))).toBe(true);
    expect(matchNote(base, parseQuery("tag:juridico"))).toBe(false);
  });

  it("nega filtros com prefixo -", () => {
    expect(matchNote(base, parseQuery("-tag:draft"))).toBe(true);
    expect(matchNote(base, parseQuery("-tag:comercial"))).toBe(false);
  });

  it("filtra por propriedade de frontmatter", () => {
    expect(matchNote(base, parseQuery("prop:status=doing"))).toBe(true);
    expect(matchNote(base, parseQuery("prop:status=done"))).toBe(false);
  });

  it("compara datas com >=", () => {
    expect(matchNote(base, parseQuery("created:>=2026-06-01"))).toBe(true);
    expect(matchNote(base, parseQuery("created:<2026-06-01"))).toBe(false);
  });

  it("suporta frase exata entre aspas", () => {
    expect(matchNote(base, parseQuery('"roadmap alpha"'))).toBe(true);
    expect(matchNote(base, parseQuery('"roadmap gama"'))).toBe(false);
  });

  it("is:daily detecta título com data ISO", () => {
    const daily = { ...base, title: "2026-07-22" };
    expect(matchNote(daily, parseQuery("is:daily"))).toBe(true);
    expect(matchNote(base, parseQuery("is:daily"))).toBe(false);
  });
});
