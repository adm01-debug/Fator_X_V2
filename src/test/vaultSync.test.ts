import { describe, it, expect } from "vitest";
import { sanitizeFilename } from "@/services/vaultSyncService";

describe("vaultSync sanitizeFilename", () => {
  it("remove caracteres inválidos de filesystem", () => {
    expect(sanitizeFilename('foo/bar:baz*?"<>|', "abc12345")).toBe("foo_bar_baz______");
  });
  it("usa fallback quando título vazio", () => {
    expect(sanitizeFilename("", "abcdefgh99")).toBe("sem-titulo-abcdefgh");
    expect(sanitizeFilename("   ", "abcdefgh99")).toBe("sem-titulo-abcdefgh");
  });
  it("preserva acentos e emojis", () => {
    expect(sanitizeFilename("Reunião 🚀", "x")).toBe("Reunião 🚀");
  });
  it("trunca em 120 chars", () => {
    const long = "a".repeat(200);
    expect(sanitizeFilename(long, "x").length).toBe(120);
  });
});
