import { describe, it, expect } from "vitest";
import { stripDiacritics, foldForSearch } from "@/lib/normalize";

describe("stripDiacritics", () => {
  it("remove acentos comuns PT-BR", () => {
    expect(stripDiacritics("Ação")).toBe("Acao");
    expect(stripDiacritics("Reunião")).toBe("Reuniao");
    expect(stripDiacritics("Orçamento")).toBe("Orcamento");
    expect(stripDiacritics("João")).toBe("Joao");
  });

  it("preserva caracteres sem diacríticos", () => {
    expect(stripDiacritics("Hello World")).toBe("Hello World");
  });

  it("lida com null/undefined", () => {
    expect(stripDiacritics(null)).toBe("");
    expect(stripDiacritics(undefined)).toBe("");
  });
});

describe("foldForSearch", () => {
  it("normaliza para busca insensível a case e acento", () => {
    expect(foldForSearch("Ação")).toBe("acao");
    expect(foldForSearch("  REUNIÃO  ")).toBe("reuniao");
  });

  it("dois termos equivalentes normalizam igual", () => {
    expect(foldForSearch("Ação")).toBe(foldForSearch("acao"));
    expect(foldForSearch("Reunião Mensal")).toBe(foldForSearch("REUNIAO MENSAL"));
  });
});
