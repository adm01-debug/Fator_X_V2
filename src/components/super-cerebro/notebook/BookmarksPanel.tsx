/**
 * BookmarksPanel — lista favoritos do notebook ativo, com abrir / remover.
 * Paridade com Obsidian Bookmarks (subset: notas apenas, sem grupos).
 */
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkX, FileText, Inbox } from "lucide-react";
import { useNotes } from "@/services/notesService";
import { useCerebroStore } from "@/stores/cerebroStore";
import { pruneBookmarks, removeBookmark, BOOKMARKS_EVENT } from "@/services/bookmarksService";

interface Props {
  onOpenNote?: () => void;
}

export function BookmarksPanel({ onOpenNote }: Props) {
  const activeNotebookId = useCerebroStore((s) => s.activeNotebookId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);
  const { data: notes = [] } = useNotes(activeNotebookId);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const handler = () => setTick((n) => n + 1);
    window.addEventListener(BOOKMARKS_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(BOOKMARKS_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const items = useMemo(() => {
    if (!activeNotebookId) return [];
    const validIds = new Set(notes.map((n) => n.id));
    const ids = pruneBookmarks(activeNotebookId, validIds);
    return ids
      .map((id) => notes.find((n) => n.id === id))
      .filter((n): n is (typeof notes)[number] => Boolean(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNotebookId, notes, tick]);

  if (!activeNotebookId) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Selecione um notebook para ver seus favoritos.
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-8 flex flex-col items-center justify-center gap-3 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
        <div className="text-sm font-medium">Nenhum favorito ainda</div>
        <p className="text-xs text-muted-foreground max-w-sm">
          Abra uma nota e clique no ícone <Bookmark className="inline h-3 w-3" /> para adicioná-la aos favoritos.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((n) => (
        <Card key={n.id} className="p-3 flex items-center gap-3 hover:bg-accent/40 transition-colors">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          <button
            type="button"
            className="flex-1 text-left text-sm font-medium truncate hover:underline focus-visible:underline outline-none"
            onClick={() => {
              setActiveNote(n.id);
              onOpenNote?.();
            }}
          >
            {n.title || "Sem título"}
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => activeNotebookId && removeBookmark(activeNotebookId, n.id)}
            aria-label={`Remover ${n.title} dos favoritos`}
          >
            <BookmarkX className="h-4 w-4" />
          </Button>
        </Card>
      ))}
    </div>
  );
}
