/**
 * bookmarksService — favoritos de notas por notebook (persistência localStorage).
 * Paridade com Obsidian: paleta ⌘P + panel dedicado + toggle no editor.
 */
const KEY_PREFIX = "sc.bm.";
const EVT = "cerebro:bookmarks-changed";

function keyOf(notebookId: string) {
  return `${KEY_PREFIX}${notebookId}`;
}

export function listBookmarks(notebookId: string): string[] {
  if (!notebookId) return [];
  try {
    const raw = localStorage.getItem(keyOf(notebookId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function persist(notebookId: string, ids: string[]) {
  try {
    localStorage.setItem(keyOf(notebookId), JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent(EVT, { detail: { notebookId } }));
  } catch {
    /* quota / privacy mode — ignora silenciosamente */
  }
}

export function isBookmarked(notebookId: string, noteId: string): boolean {
  return listBookmarks(notebookId).includes(noteId);
}

export function toggleBookmark(notebookId: string, noteId: string): boolean {
  const current = listBookmarks(notebookId);
  const idx = current.indexOf(noteId);
  if (idx >= 0) {
    current.splice(idx, 1);
    persist(notebookId, current);
    return false;
  }
  current.unshift(noteId);
  persist(notebookId, current);
  return true;
}

export function removeBookmark(notebookId: string, noteId: string) {
  const current = listBookmarks(notebookId).filter((id) => id !== noteId);
  persist(notebookId, current);
}

/** Remove IDs que não existem mais na lista de notas (chamado ao carregar o panel). */
export function pruneBookmarks(notebookId: string, validIds: Set<string>) {
  const current = listBookmarks(notebookId);
  const filtered = current.filter((id) => validIds.has(id));
  if (filtered.length !== current.length) persist(notebookId, filtered);
  return filtered;
}

export const BOOKMARKS_EVENT = EVT;
