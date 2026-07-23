/**
 * kanbanService — agrupa notas por propriedade frontmatter (default `status`),
 * expõe hook React Query e mutação de mover card (atualiza frontmatter da nota).
 * RLS-safe: reutiliza notesService.updateNote, que herda policies de notebook_notes.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listNotes, updateNote, type NotebookNote } from "./notesService";
import {
  parseFrontmatter,
  upsertFrontmatter,
  type FrontmatterValue,
} from "@/lib/frontmatter";

export const UNSTATUSED = "__none__";
export const DEFAULT_COLUMNS = ["backlog", "doing", "review", "done"] as const;

export interface KanbanColumn {
  key: string;
  label: string;
  color?: string;
  notes: NotebookNote[];
}

function firstScalar(v: FrontmatterValue | undefined): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? firstScalar(v[0]) : null;
  if (typeof v === "object") return null;
  return String(v);
}

/** Extrai o valor da propriedade de agrupamento de uma nota. */
export function getGroupValue(note: NotebookNote, property: string): string {
  const { data } = parseFrontmatter(note.body_md ?? "");
  const raw = firstScalar(data[property]);
  const norm = (raw ?? "").trim().toLowerCase();
  return norm === "" ? UNSTATUSED : norm;
}

/** Constrói colunas garantindo ordem + coluna de "sem status". */
export function buildColumns(
  notes: NotebookNote[],
  property: string,
  desiredColumns: readonly string[] = DEFAULT_COLUMNS,
): KanbanColumn[] {
  const buckets = new Map<string, NotebookNote[]>();
  for (const key of desiredColumns) buckets.set(key, []);
  buckets.set(UNSTATUSED, []);

  for (const n of notes) {
    if (n.is_archived) continue;
    const key = getGroupValue(n, property);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(n);
  }

  for (const arr of buckets.values()) {
    arr.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }

  const ordered: KanbanColumn[] = [];
  for (const key of desiredColumns) {
    ordered.push({ key, label: labelize(key), notes: buckets.get(key) ?? [] });
  }
  for (const [key, arr] of buckets) {
    if (desiredColumns.includes(key as (typeof DEFAULT_COLUMNS)[number])) continue;
    if (key === UNSTATUSED) continue;
    ordered.push({ key, label: labelize(key), notes: arr });
  }
  ordered.push({
    key: UNSTATUSED,
    label: "Sem status",
    notes: buckets.get(UNSTATUSED) ?? [],
  });
  return ordered;
}

function labelize(key: string): string {
  if (key === UNSTATUSED) return "Sem status";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Atualiza (ou remove) a propriedade de status no frontmatter da nota. */
export async function moveNoteToColumn(
  note: NotebookNote,
  property: string,
  targetKey: string,
): Promise<NotebookNote> {
  const nextValue: FrontmatterValue = targetKey === UNSTATUSED ? null : targetKey;
  const nextBody = upsertFrontmatter(note.body_md ?? "", { [property]: nextValue });
  return updateNote(note.id, { body_md: nextBody });
}

// ─── Hooks ──────────────────────────────────────────────────────────────
export function useKanbanColumns(
  collectionId: string | null,
  property: string,
  desiredColumns: readonly string[] = DEFAULT_COLUMNS,
) {
  const q = useQuery({
    queryKey: ["notes", collectionId],
    queryFn: () => listNotes(collectionId as string),
    enabled: !!collectionId,
  });
  const columns = useMemo(
    () => buildColumns(q.data ?? [], property, desiredColumns),
    [q.data, property, desiredColumns],
  );
  return { columns, isLoading: q.isLoading, error: q.error };
}

export function useMoveNote(collectionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      note,
      property,
      targetKey,
    }: {
      note: NotebookNote;
      property: string;
      targetKey: string;
    }) => moveNoteToColumn(note, property, targetKey),
    onMutate: async ({ note, property, targetKey }) => {
      await qc.cancelQueries({ queryKey: ["notes", collectionId] });
      const prev = qc.getQueryData<NotebookNote[]>(["notes", collectionId]);
      if (prev) {
        const nextValue: FrontmatterValue = targetKey === UNSTATUSED ? null : targetKey;
        const nextBody = upsertFrontmatter(note.body_md ?? "", {
          [property]: nextValue,
        });
        qc.setQueryData<NotebookNote[]>(
          ["notes", collectionId],
          prev.map((n) =>
            n.id === note.id
              ? { ...n, body_md: nextBody, updated_at: new Date().toISOString() }
              : n,
          ),
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notes", collectionId], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["notes", collectionId] });
    },
  });
}
