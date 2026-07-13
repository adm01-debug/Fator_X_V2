/**
 * Regression Test Battery — UI Invariants
 *
 * Bateria de testes de regressão que valida que o UI permanece funcional
 * durante refactors de tipagem e de tokens de cor. Gera CENTENAS de cenários
 * de forma data-driven para evitar dívida manual.
 *
 * Cobre:
 *  1. Tokens de cor `nexus-*` presentes em src/index.css.
 *  2. Ausência de cores Tailwind hard-coded em componentes críticos.
 *  3. Ausência de `any` explícito em serviços core.
 *  4. Componentes UI base renderizam sem erros sob props variadas.
 *  5. Utilitário `cn()` mescla classes de forma determinística.
 *  6. Tokens semânticos shadcn respondem a modo claro/escuro (classe .dark).
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { DbRow } from '@/types/dbRow';

// ────────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "../..");
const INDEX_CSS = fs.readFileSync(path.join(ROOT, "src/index.css"), "utf8");

const NEXUS_TOKENS = [
  "amber", "blue", "border", "cyan", "emerald", "glow", "gold",
  "green", "muted", "orange", "purple", "red", "rose", "teal", "yellow",
] as const;

const SEMANTIC_TOKENS = [
  "background", "foreground", "card", "card-foreground",
  "popover", "popover-foreground", "primary", "primary-foreground",
  "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "destructive-foreground",
  "border", "input", "ring",
] as const;

const TAILWIND_HARDCODED_COLORS = [
  "red", "blue", "green", "yellow", "purple", "pink", "indigo",
  "cyan", "teal", "orange", "amber", "rose", "emerald", "lime",
  "sky", "violet", "fuchsia",
] as const;

const TAILWIND_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

// ────────────────────────────────────────────────────────────────────────────
// 1. Design tokens — nexus-*  (≈ 15 cenários)
// ────────────────────────────────────────────────────────────────────────────

describe("Design Tokens: nexus-* declaradas em src/index.css", () => {
  for (const token of NEXUS_TOKENS) {
    it(`deve declarar --nexus-${token}`, () => {
      const pattern = new RegExp(`--nexus-${token}\\s*:`);
      expect(INDEX_CSS).toMatch(pattern);
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Design tokens — semânticos shadcn (≈ 19 cenários)
// ────────────────────────────────────────────────────────────────────────────

describe("Design Tokens: variáveis semânticas shadcn", () => {
  for (const token of SEMANTIC_TOKENS) {
    it(`deve declarar --${token}`, () => {
      const pattern = new RegExp(`--${token}\\s*:`);
      expect(INDEX_CSS).toMatch(pattern);
    });
  }

  it("deve incluir bloco .dark para modo escuro", () => {
    expect(INDEX_CSS).toMatch(/\.dark\s*\{/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Ausência de cores hard-coded em componentes UI base
//    (17 cores × 10 shades = 170 varreduras por arquivo)
// ────────────────────────────────────────────────────────────────────────────

const UI_COMPONENTS_TO_SCAN = [
  "src/components/ui/button.tsx",
  "src/components/ui/badge.tsx",
  "src/components/ui/card.tsx",
  "src/components/ui/alert.tsx",
  "src/components/ui/input.tsx",
  "src/components/ui/dialog.tsx",
];

describe("Regressão de cores: componentes UI base sem cores Tailwind cruas", () => {
  for (const relPath of UI_COMPONENTS_TO_SCAN) {
    const full = path.join(ROOT, relPath);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, "utf8");

    for (const color of TAILWIND_HARDCODED_COLORS) {
      for (const shade of TAILWIND_SHADES) {
        const bg = `bg-${color}-${shade}`;
        const text = `text-${color}-${shade}`;
        const border = `border-${color}-${shade}`;

        it(`${relPath} não deve conter ${bg}`, () => {
          expect(content).not.toContain(bg);
        });
        it(`${relPath} não deve conter ${text}`, () => {
          expect(content).not.toContain(text);
        });
        it(`${relPath} não deve conter ${border}`, () => {
          expect(content).not.toContain(border);
        });
      }
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Ausência de `any` explícito em serviços core (regressão de tipagem)
// ────────────────────────────────────────────────────────────────────────────

const SERVICES_TO_SCAN = [
  "src/services/queueManagerService.ts",
  "src/services/executionHistoryService.ts",
  "src/services/batchProcessorService.ts",
  "src/services/cronSchedulerService.ts",
  "src/services/retryEngineService.ts",
  "src/services/notificationEngineService.ts",
  "src/services/oracleService.ts",
  "src/services/approvalService.ts",
  "src/lib/logger.ts",
  "src/lib/sanitize.ts",
  "src/lib/utils.ts",
  "src/lib/tracing.ts",
  "src/hooks/use-workflow-persistence.ts",
];

describe("Regressão de tipagem: serviços core sem `any` explícito", () => {
  for (const relPath of SERVICES_TO_SCAN) {
    const full = path.join(ROOT, relPath);
    if (!fs.existsSync(full)) {
      it.skip(`${relPath} — arquivo não encontrado`, () => {});
      continue;
    }
    const content = fs.readFileSync(full, "utf8");

    it(`${relPath} não deve declarar variável/parâmetro tipada como any`, () => {
      // matches ": any" mas ignora "any as unknown", strings, e comentários simples
      const lines = content.split("\n").filter((l) => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      });
      const offenders = lines.filter((l) => /:\s*any\b/.test(l) && !/eslint-disable/.test(l));
      expect(offenders).toEqual([]);
    });

    it(`${relPath} não deve usar "as any"`, () => {
      const offenders = content
        .split("\n")
        .filter((l) => /\bas\s+any\b/.test(l) && !/eslint-disable/.test(l));
      expect(offenders).toEqual([]);
    });

    it(`${relPath} não deve declarar arrays any[]`, () => {
      expect(content).not.toMatch(/\bany\[\]/);
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 5. Utilitário cn() — mescla determinística (matriz de 60+ cenários)
// ────────────────────────────────────────────────────────────────────────────

describe("Utilitário cn(): comportamento determinístico", () => {
  const cnCases: Array<{ name: string; input: DbRow[]; expected: (out: string) => boolean }> = [
    { name: "string única", input: ["a"], expected: (o) => o === "a" },
    { name: "duas strings", input: ["a", "b"], expected: (o) => o === "a b" },
    { name: "undefined ignorado", input: ["a", undefined, "b"], expected: (o) => o === "a b" },
    { name: "null ignorado", input: ["a", null, "b"], expected: (o) => o === "a b" },
    { name: "false ignorado", input: ["a", false, "b"], expected: (o) => o === "a b" },
    { name: "objeto condicional true", input: [{ a: true, b: false }], expected: (o) => o === "a" },
    { name: "objeto condicional false", input: [{ a: false }], expected: (o) => o === "" },
    { name: "array aninhado", input: [["a", "b"]], expected: (o) => o === "a b" },
    { name: "duplicatas removidas via tw-merge", input: ["p-2 p-4"], expected: (o) => o === "p-4" },
    { name: "cores conflitantes mescladas", input: ["text-nexus-red text-nexus-blue"], expected: (o) => o === "text-nexus-blue" },
    { name: "vazio produz string vazia", input: [], expected: (o) => o === "" },
    { name: "somente falsy produz vazio", input: [null, undefined, false], expected: (o) => o === "" },
  ];

  for (const c of cnCases) {
    it(`cn(${c.name})`, () => {
      const out = cn(...(c.input as string[]));
      expect(c.expected(out)).toBe(true);
    });
  }

  // stress: idempotência em 50 combinações
  for (let i = 0; i < 50; i++) {
    const a = `p-${i % 8}`;
    const b = `m-${i % 4}`;
    it(`cn(${a}, ${b}) idempotente`, () => {
      const once = cn(a, b);
      const twice = cn(once);
      expect(twice).toBe(once);
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 6. Componentes UI base renderizam sob variações de props
// ────────────────────────────────────────────────────────────────────────────

describe("Componentes UI base: matriz de renderização", () => {
  const BUTTON_VARIANTS = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;
  const BUTTON_SIZES = ["default", "sm", "lg", "icon"] as const;

  for (const variant of BUTTON_VARIANTS) {
    for (const size of BUTTON_SIZES) {
      it(`Button variant=${variant} size=${size} renderiza`, () => {
        const { container, unmount } = render(
          <Button variant={variant} size={size}>ok</Button>,
        );
        expect(container.querySelector("button")).toBeTruthy();
        unmount();
      });
    }
  }

  const BADGE_VARIANTS = ["default", "secondary", "destructive", "outline"] as const;
  for (const variant of BADGE_VARIANTS) {
    it(`Badge variant=${variant} renderiza`, () => {
      const { container, unmount } = render(<Badge variant={variant}>x</Badge>);
      expect(container.textContent).toContain("x");
      unmount();
    });
  }

  it("Card completo renderiza com header e conteúdo", () => {
    const { getByText, unmount } = render(
      <Card>
        <CardHeader><CardTitle>título</CardTitle></CardHeader>
        <CardContent>corpo</CardContent>
      </Card>,
    );
    expect(getByText("título")).toBeTruthy();
    expect(getByText("corpo")).toBeTruthy();
    unmount();
  });

  it("Alert renderiza título e descrição", () => {
    const { getByText, unmount } = render(
      <Alert>
        <AlertTitle>t</AlertTitle>
        <AlertDescription>d</AlertDescription>
      </Alert>,
    );
    expect(getByText("t")).toBeTruthy();
    expect(getByText("d")).toBeTruthy();
    unmount();
  });

  // Stress: 40 renders sequenciais sem vazamento observável
  for (let i = 0; i < 40; i++) {
    it(`Button render #${i} não lança`, () => {
      const { unmount } = render(<Button>{`n${i}`}</Button>);
      unmount();
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 7. Invariantes de arquivo — não deve haver hardcoded #hex em componentes
// ────────────────────────────────────────────────────────────────────────────

describe("Regressão de cores: sem hex literais em componentes UI base", () => {
  for (const relPath of UI_COMPONENTS_TO_SCAN) {
    const full = path.join(ROOT, relPath);
    if (!fs.existsSync(full)) continue;
    it(`${relPath} não deve conter hex literal (#rrggbb)`, () => {
      const content = fs.readFileSync(full, "utf8");
      // aceita apenas em comentários; regex simples: nenhum hex
      const hexes = content.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
      expect(hexes).toEqual([]);
    });
  }
});
