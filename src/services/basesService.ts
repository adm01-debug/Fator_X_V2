/**
 * basesService — "Bases" estilo Obsidian 1.9+.
 *
 * Constrói uma tabela relacional a partir das notas do notebook, expondo
 * cada chave de frontmatter como coluna virtual + colunas built-in
 * (title, updated_at, created_at, tags, wikilinks_out).
 *
 * Filtros suportados (operadores):
 *   eq, ne, contains, in, gt, lt, gte, lte, exists, not_exists
 *
 * A execução é 100% client-side sobre o array já retornado por listNotes,
 * portanto RLS continua garantida no fetch original.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listNotes, type NotebookNote } from "./notesService";
import { parseFrontmatter, type FrontmatterValue } from "@/lib/frontmatter";

// ─── Tipos ──────────────────────────────────────────────────────────────
export type Scalar = string | number | boolean | null;
export type CellValue = Scalar | Scalar[];

export type Operator =
  | "eq"
  | "ne"
  | "contains"
  | "in"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "exists"
  | "not_exists";

export interface FilterRule {
  column: string;
  op: Operator;
  value?: string | number | boolean;
}

export type SortDir = "asc" | "desc";

export interface BaseView {
  id: string;
  name: string;
  columns: string[];
  filters: FilterRule[];
  sortBy: string | null;
  sortDir: SortDir;
}

export interface BaseRow {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  tags: string[];
  wikilinks_out: string[];
  is_archived: boolean;
  /** Bag de propriedades vindas do frontmatter. */
  props: Record<string, CellValue>;
}

export const BUILTIN_COLUMNS = [
  "title",
  "updated_at",
  "created_at",
  "tags",
  "wikilinks_out",
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────
function toScalar(v: FrontmatterValue): CellValue {
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return v as Scalar;
  }
  if (Array.isArray(v)) {
    const arr: Scalar[] = [];
    for (const item of v) {
      const s = toScalar(item);
      if (Array.isArray(s)) continue; // achata 1 nível apenas
      arr.push(s);
    }
    return arr;
  }
  // objetos aninhados viram JSON serializado (raro)
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

const TAG_RE = /(?:^|\s)#([\p{L}\p{N}_/-]+)/gu;
const WIKI_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

function extractTags(body: string): string[] {
  const set = new Set<string>();
  for (const m of body.matchAll(TAG_RE)) set.add(m[1].toLowerCase());
  return Array.from(set);
}

function extractWikilinks(body: string): string[] {
  const set = new Set<string>();
  for (const m of body.matchAll(WIKI_RE)) set.add(m[1].trim());
  return Array.from(set);
}

/** Converte uma nota em BaseRow (frontmatter + campos derivados). */
export function noteToRow(note: NotebookNote): BaseRow {
  const parsed = parseFrontmatter(note.body_md ?? "");
  const props: Record<string, CellValue> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    props[k] = toScalar(v);
  }
  const tagsFromFm = props.tags;
  const tagsFinal = Array.isArray(tagsFromFm)
    ? tagsFromFm.map((t) => String(t).toLowerCase())
    : extractTags(parsed.body);
  return {
    id: note.id,
    title: note.title,
    updated_at: note.updated_at,
    created_at: note.created_at,
    tags: tagsFinal,
    wikilinks_out: extractWikilinks(parsed.body),
    is_archived: note.is_archived,
    props,
  };
}

/** Obtém o valor bruto de uma célula, resolvendo colunas built-in. */
export function getCell(row: BaseRow, column: string): CellValue {
  switch (column) {
    case "title":
      return row.title;
    case "updated_at":
      return row.updated_at;
    case "created_at":
      return row.created_at;
    case "tags":
      return row.tags;
    case "wikilinks_out":
      return row.wikilinks_out;
    default:
      return row.props[column] ?? null;
  }
}

// ─── Filtro ─────────────────────────────────────────────────────────────
function normalize(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function cmp(a: CellValue, b: string | number | boolean | undefined): number {
  const av = Array.isArray(a) ? a[0] ?? null : a;
  const bv = b ?? null;
  const an = Number(av);
  const bn = Number(bv);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  // datas ISO ordenam corretamente por string
  return String(av ?? "").localeCompare(String(bv ?? ""));
}

export function evalRule(row: BaseRow, rule: FilterRule): boolean {
  const cell = getCell(row, rule.column);
  switch (rule.op) {
    case "exists":
      return cell !== null && !(Array.isArray(cell) && cell.length === 0);
    case "not_exists":
      return cell === null || (Array.isArray(cell) && cell.length === 0);
    case "eq":
      if (Array.isArray(cell)) return cell.some((c) => normalize(c) === normalize(rule.value));
      return normalize(cell) === normalize(rule.value);
    case "ne":
      if (Array.isArray(cell)) return !cell.some((c) => normalize(c) === normalize(rule.value));
      return normalize(cell) !== normalize(rule.value);
    case "contains": {
      const needle = normalize(rule.value);
      if (!needle) return true;
      if (Array.isArray(cell)) return cell.some((c) => normalize(c).includes(needle));
      return normalize(cell).includes(needle);
    }
    case "in": {
      const list = String(rule.value ?? "")
        .split(",")
        .map((s) => normalize(s))
        .filter(Boolean);
      if (list.length === 0) return true;
      if (Array.isArray(cell)) return cell.some((c) => list.includes(normalize(c)));
      return list.includes(normalize(cell));
    }
    case "gt":
      return cmp(cell, rule.value) > 0;
    case "gte":
      return cmp(cell, rule.value) >= 0;
    case "lt":
      return cmp(cell, rule.value) < 0;
    case "lte":
      return cmp(cell, rule.value) <= 0;
    default:
      return true;
  }
}

export function applyView(rows: BaseRow[], view: BaseView): BaseRow[] {
  const filtered = rows.filter(
    (r) => !r.is_archived && view.filters.every((rule) => evalRule(r, rule)),
  );
  if (!view.sortBy) return filtered;
  const dir = view.sortDir === "asc" ? 1 : -1;
  return [...filtered].sort((a, b) => cmp(getCell(a, view.sortBy!), String(getCell(b, view.sortBy!) ?? "")) * dir);
}

/** Descobre colunas dinâmicas presentes em qualquer nota (frontmatter). */
export function discoverColumns(rows: BaseRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r.props)) set.add(k);
  return Array.from(set).sort();
}

// ─── Hook ───────────────────────────────────────────────────────────────
export function useBaseRows(collectionId: string | null) {
  const q = useQuery({
    queryKey: ["notes", collectionId],
    queryFn: () => listNotes(collectionId as string),
    enabled: !!collectionId,
  });
  const rows = useMemo(() => (q.data ?? []).map(noteToRow), [q.data]);
  const dynamicColumns = useMemo(() => discoverColumns(rows), [rows]);
  return { rows, dynamicColumns, isLoading: q.isLoading, error: q.error };
}

// ─── Persistência de views (localStorage por notebook) ──────────────────
const LS_PREFIX = "cerebro.bases.views.";

export function loadViews(collectionId: string): BaseView[] {
  try {
    const raw = localStorage.getItem(LS_PREFIX + collectionId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as BaseView[];
  } catch {
    return [];
  }
}

export function saveViews(collectionId: string, views: BaseView[]): void {
  try {
    localStorage.setItem(LS_PREFIX + collectionId, JSON.stringify(views));
  } catch {
    /* quota exceeded — ignora silenciosamente */
  }
}

export function defaultView(): BaseView {
  return {
    id: crypto.randomUUID(),
    name: "Nova view",
    columns: ["title", "tags", "updated_at"],
    filters: [],
    sortBy: "updated_at",
    sortDir: "desc",
  };
}
