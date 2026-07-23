/**
 * relatedNotesService — Descoberta de notas relacionadas via similaridade
 * client-side (Jaccard sobre tokens do corpo + boost por tags e wikilinks
 * compartilhados). RLS-safe: reutiliza `listNotes` do notesService.
 *
 * Simulação de gaps prevenida:
 *  - Notas vazias → similaridade 0 (não crash).
 *  - Duplicata de si mesma → filtrada.
 *  - Notas arquivadas → excluídas.
 *  - Stopwords PT/EN removidas para evitar falsos positivos triviais.
 */
import { useQuery } from "@tanstack/react-query";
import { listNotes, type NotebookNote } from "./notesService";
import { extractLinks } from "@/lib/wikilink";

const STOPWORDS = new Set([
  "a","o","e","de","da","do","das","dos","que","para","por","com","um","uma",
  "no","na","nos","nas","em","se","é","ao","à","às","aos","como","mais","mas",
  "the","and","of","to","in","is","it","for","on","with","as","at","by","an","be",
]);

function tokenize(text: string): Set<string> {
  const clean = (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  const tokens = clean.split(/\s+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface RelatedNote {
  note: NotebookNote;
  score: number;
  sharedTags: string[];
  sharedLinks: string[];
}

export function findRelatedNotes(
  active: NotebookNote,
  all: NotebookNote[],
  limit = 8,
): RelatedNote[] {
  const activeTokens = tokenize(`${active.title} ${active.body_md}`);
  const activeTags = new Set(active.tags ?? []);
  const activeLinks = new Set(
    extractLinks(active.body_md ?? "").map((l) => l.target.toLowerCase()),
  );

  const scored: RelatedNote[] = [];
  for (const n of all) {
    if (n.id === active.id || n.is_archived) continue;
    const tokens = tokenize(`${n.title} ${n.body_md}`);
    const base = jaccard(activeTokens, tokens);

    const sharedTags = (n.tags ?? []).filter((t) => activeTags.has(t));
    const nLinks = extractLinks(n.body_md ?? "").map((l) => l.target.toLowerCase());
    const sharedLinks = nLinks.filter((l) => activeLinks.has(l));

    // Boosts: cada tag/wikilink compartilhado adiciona sinal.
    const boost = sharedTags.length * 0.08 + sharedLinks.length * 0.05;
    const score = Math.min(1, base + boost);
    if (score <= 0.02) continue;

    scored.push({ note: n, score, sharedTags, sharedLinks: Array.from(new Set(sharedLinks)) });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function useRelatedNotes(
  activeNote: NotebookNote | null | undefined,
  collectionId: string | null | undefined,
  limit = 8,
) {
  return useQuery({
    queryKey: ["related-notes", collectionId, activeNote?.id, activeNote?.updated_at, limit],
    enabled: Boolean(activeNote && collectionId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!activeNote || !collectionId) return [] as RelatedNote[];
      const all = await listNotes(collectionId);
      return findRelatedNotes(activeNote, all, limit);
    },
  });
}
