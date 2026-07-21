import { describe, it, expect } from "vitest";
import { computeTier, MEMORY_TIERS } from "@/lib/memory/tiers";

describe("computeTier (Autograph)", () => {
  it("pinned sempre retorna core", () => {
    expect(computeTier(0, true)).toBe("core");
    expect(computeTier(-5, true)).toBe("core");
    expect(computeTier(100, true)).toBe("core");
  });

  it("mapeia relevância aos 5 tiers", () => {
    expect(computeTier(5)).toBe("core");
    expect(computeTier(3.0)).toBe("core");
    expect(computeTier(2.0)).toBe("active");
    expect(computeTier(1.5)).toBe("active");
    expect(computeTier(0.9)).toBe("warm");
    expect(computeTier(0.5)).toBe("warm");
    expect(computeTier(0.2)).toBe("cold");
    expect(computeTier(0.1)).toBe("cold");
    expect(computeTier(0.05)).toBe("archive");
    expect(computeTier(0)).toBe("archive");
  });

  it("valores inválidos caem em archive", () => {
    expect(computeTier(NaN)).toBe("archive");
    expect(computeTier(-1)).toBe("archive");
    expect(computeTier(Infinity)).toBe("archive"); // não finito → archive
  });

  it("expõe a lista canônica de tiers", () => {
    expect(MEMORY_TIERS).toEqual(["core", "active", "warm", "cold", "archive"]);
  });
});
