import { describe, it, expect } from "vitest";
import { parseFrontmatter, stringifyFrontmatter, upsertFrontmatter } from "@/lib/frontmatter";

describe("frontmatter", () => {
  it("returns empty state when no fence", () => {
    const r = parseFrontmatter("apenas markdown\n# título");
    expect(r.present).toBe(false);
    expect(r.data).toEqual({});
    expect(r.body).toContain("# título");
  });

  it("parses scalars, booleans, numbers, null and inline lists", () => {
    const text = `---\ntitle: Reunião\ndone: true\ncount: 3\nnote: null\ntags: [a, "b c", ok]\n---\ncorpo`;
    const r = parseFrontmatter(text);
    expect(r.present).toBe(true);
    expect(r.data.title).toBe("Reunião");
    expect(r.data.done).toBe(true);
    expect(r.data.count).toBe(3);
    expect(r.data.note).toBeNull();
    expect(r.data.tags).toEqual(["a", "b c", "ok"]);
    expect(r.body).toBe("corpo");
  });

  it("parses block lists", () => {
    const text = `---\nitems:\n  - alpha\n  - beta\n---\nx`;
    const r = parseFrontmatter(text);
    expect(r.data.items).toEqual(["alpha", "beta"]);
  });

  it("stringify sorts keys and quotes strings with special chars", () => {
    const s = stringifyFrontmatter({ z: 1, a: "with: colon", b: [1, 2] });
    expect(s.split("\n")[1]).toMatch(/^a:/);
    expect(s).toContain(`"with: colon"`);
    expect(s).toMatch(/b:\n\s+- 1\n\s+- 2/);
  });

  it("upsert preserves body and adds/updates keys", () => {
    const src = `---\nstatus: draft\n---\ncorpo original`;
    const next = upsertFrontmatter(src, { status: "done", owner: "leo" });
    const parsed = parseFrontmatter(next);
    expect(parsed.data.status).toBe("done");
    expect(parsed.data.owner).toBe("leo");
    expect(parsed.body).toBe("corpo original");
  });

  it("upsert creates frontmatter when absent", () => {
    const next = upsertFrontmatter("só corpo", { pinned: true });
    expect(next.startsWith("---")).toBe(true);
    const p = parseFrontmatter(next);
    expect(p.data.pinned).toBe(true);
    expect(p.body).toBe("só corpo");
  });
});
