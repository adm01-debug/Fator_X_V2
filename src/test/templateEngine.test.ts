import { describe, it, expect } from "vitest";
import { applyTemplate, formatDate, todayIso } from "@/lib/templateEngine";

describe("templateEngine", () => {
  const fixed = new Date(2026, 6, 23, 9, 5); // 23 jul 2026, quinta

  it("substitui placeholders conhecidos", () => {
    const out = applyTemplate("# {{title}} — {{date}} ({{weekday}}) por {{user}}", {
      title: "Kickoff",
      user: "ana@x.com",
      now: fixed,
    });
    expect(out).toBe("# Kickoff — 2026-07-23 (quinta) por ana@x.com");
  });

  it("preserva placeholders desconhecidos sem quebrar", () => {
    const out = applyTemplate("olá {{nome}} {{title}}", { title: "T", now: fixed });
    expect(out).toBe("olá {{nome}} T");
  });

  it("é insensível a caixa e espaços em placeholders", () => {
    expect(applyTemplate("{{ DATE }}", { now: fixed })).toBe("2026-07-23");
  });

  it("não executa HTML/JS — pura substituição textual", () => {
    const out = applyTemplate("<script>{{title}}</script>", { title: "x", now: fixed });
    expect(out).toBe("<script>x</script>");
  });

  it("todayIso é YYYY-MM-DD", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatDate(fixed)).toBe("2026-07-23");
  });
});
