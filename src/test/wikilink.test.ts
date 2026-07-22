import { describe, expect, it } from "vitest";
import { extractLinks, parseTags, parseWikilinks, renderWikilinksToMarkdown } from "@/lib/wikilink";

describe("wikilink parser", () => {
  it("extrai wikilinks simples", () => {
    const links = parseWikilinks("Ver [[Contratos]] e [[Clientes VIP]].");
    expect(links.map((l) => l.label)).toEqual(["Contratos", "Clientes VIP"]);
    expect(links.every((l) => l.targetType === "note")).toBe(true);
  });

  it("suporta alias e seção", () => {
    const [a] = parseWikilinks("Ver [[Contratos#Rescisão|regras de saída]].");
    expect(a.label).toBe("Contratos");
    expect(a.section).toBe("Rescisão");
    expect(a.alias).toBe("regras de saída");
  });

  it("identifica documentos e entidades", () => {
    const links = parseWikilinks("Fonte [[doc:Política 2026.pdf]] cita [[@Fornecedor Alpha]].");
    expect(links[0].targetType).toBe("document");
    expect(links[0].label).toBe("Política 2026.pdf");
    expect(links[1].targetType).toBe("entity");
    expect(links[1].label).toBe("Fornecedor Alpha");
  });

  it("ignora [[]] vazio ou espaços puros", () => {
    expect(parseWikilinks("[[]] [[   ]]")).toHaveLength(0);
  });

  it("extrai tags respeitando delimitadores", () => {
    expect(parseTags("Falar sobre #vendas e #Comercial_2026, mas não sobre#erro"))
      .toEqual(["comercial_2026", "vendas"]);
  });

  it("extractLinks devolve wikilinks + tags", () => {
    const { wikilinks, tags } = extractLinks("Tema [[Onboarding]] #rh #onboarding.");
    expect(wikilinks).toHaveLength(1);
    expect(tags).toEqual(["onboarding", "rh"]);
  });

  it("renderWikilinksToMarkdown resolve href quando existir", () => {
    const md = renderWikilinksToMarkdown(
      "Ver [[Contratos]] e [[doc:X.pdf]].",
      (label, type) => (type === "note" ? `/n/${label}` : null),
    );
    expect(md).toContain("[Contratos](/n/Contratos)");
    expect(md).toContain("wikilink:new/document/X.pdf");
  });
});
