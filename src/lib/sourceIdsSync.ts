/**
 * sourceIdsSync — utilidades puras para serializar/desserializar
 * a lista de `source_ids` na query string do deep-link do workspace.
 * - Aceita apenas UUIDs válidos (v4-ish, mas tolerante).
 * - Dedup e cap em 50.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_SOURCES = 50;

export function parseSourceIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => UUID_RE.test(s));
  const unique = Array.from(new Set(parts));
  return unique.slice(0, MAX_SOURCES);
}

export function serializeSourceIds(ids: string[]): string {
  const cleaned = Array.from(
    new Set(ids.filter((id) => UUID_RE.test(id)).map((s) => s.toLowerCase())),
  ).slice(0, MAX_SOURCES);
  return cleaned.join(",");
}

/** Atualiza a query string do window sem empilhar histórico duplicado. */
export function writeSourcesToUrl(ids: string[]): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const serialized = serializeSourceIds(ids);
  const current = url.searchParams.get("sources") ?? "";
  if (serialized === current) return;
  if (serialized) url.searchParams.set("sources", serialized);
  else url.searchParams.delete("sources");
  window.history.replaceState({}, "", url.toString());
}

export function readSourcesFromUrl(): string[] {
  if (typeof window === "undefined") return [];
  const url = new URL(window.location.href);
  return parseSourceIds(url.searchParams.get("sources"));
}
