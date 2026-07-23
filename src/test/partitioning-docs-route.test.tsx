import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Partitioning docs route", () => {
  it("registra a rota /docs/partitioning no App.tsx", () => {
    const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    expect(app).toContain("/docs/partitioning");
    expect(app).toContain("PartitioningDocsPage");
  });

  it("expõe o playbook de particionamento no sidebar", () => {
    const sidebar = readFileSync(
      resolve(__dirname, "../components/layout/AppSidebar.tsx"),
      "utf8"
    );
    expect(sidebar).toContain("/docs/partitioning");
    expect(sidebar).toContain("Playbook Particionamento");
  });

  it("página de docs existe e tem conteúdo esperado", () => {
    const page = readFileSync(
      resolve(__dirname, "../pages/PartitioningDocsPage.tsx"),
      "utf8"
    );
    expect(page.length).toBeGreaterThan(500);
    expect(page).toMatch(/partition/i);
  });
});
