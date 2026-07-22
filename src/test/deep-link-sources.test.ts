/**
 * Testes puros do parser/serializer de `?sources=`.
 */
import { describe, it, expect } from "vitest";
import {
  parseSourceIds,
  serializeSourceIds,
  MAX_SOURCES,
} from "@/lib/sourceIdsSync";

const uuid = (n: number) =>
  `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;

describe("sourceIdsSync", () => {
  it("parse vazio/nulo", () => {
    expect(parseSourceIds(null)).toEqual([]);
    expect(parseSourceIds("")).toEqual([]);
    expect(parseSourceIds(undefined)).toEqual([]);
  });

  it("filtra IDs inválidos", () => {
    const good = uuid(1);
    const bad = "abc";
    expect(parseSourceIds(`${bad},${good}`)).toEqual([good]);
  });

  it("deduplica", () => {
    const a = uuid(1);
    expect(parseSourceIds(`${a},${a},${a}`)).toEqual([a]);
  });

  it("respeita cap de 50", () => {
    const many = Array.from({ length: 80 }, (_, i) => uuid(i + 1)).join(",");
    expect(parseSourceIds(many)).toHaveLength(MAX_SOURCES);
  });

  it("case-insensitive normaliza para minúsculo", () => {
    const raw = uuid(1).toUpperCase();
    expect(parseSourceIds(raw)).toEqual([uuid(1)]);
  });

  it("serialize round-trip", () => {
    const ids = [uuid(1), uuid(2), uuid(3)];
    expect(parseSourceIds(serializeSourceIds(ids))).toEqual(ids);
  });

  it("serialize dedup e filtra inválidos", () => {
    const a = uuid(1);
    expect(serializeSourceIds([a, "bad", a])).toBe(a);
  });
});
