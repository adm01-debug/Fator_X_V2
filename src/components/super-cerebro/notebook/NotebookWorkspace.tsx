/**
 * NotebookWorkspace — shell de 3 colunas (Sources | Nota | Studio),
 * inspirado no NotebookLM com backlinks estilo Obsidian.
 */
import { useEffect } from "react";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { useCerebroStore } from "@/stores/cerebroStore";
import { useNotebooks } from "@/services/notebooksService";
import { useNotes } from "@/services/notesService";
import { SourcesPanel } from "./SourcesPanel";
import { NoteEditor } from "./NoteEditor";
import { StudioPanel } from "./StudioPanel";
import { NoteQuickOpen } from "./NoteQuickOpen";
import { NotebookSelector } from "../NotebookSelector";
import { NotebookPen } from "lucide-react";

export function NotebookWorkspace() {
  const { workspaceId } = useCurrentWorkspace();
  const activeNotebookId = useCerebroStore((s) => s.activeNotebookId);
  const activeNoteId = useCerebroStore((s) => s.activeNoteId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);
  const setActiveNotebook = useCerebroStore((s) => s.setActiveNotebook);

  const { data: notebooks = [] } = useNotebooks(workspaceId);
  const { data: notes = [] } = useNotes(activeNotebookId);

  // Auto-select primeiro notebook se nenhum ativo
  useEffect(() => {
    if (!activeNotebookId && notebooks.length > 0) {
      setActiveNotebook(notebooks.find((n) => !n.is_archived)?.id ?? null);
    }
  }, [activeNotebookId, notebooks, setActiveNotebook]);

  // Reset nota ativa se ela sumir do notebook atual
  useEffect(() => {
    if (activeNoteId && notes.length > 0 && !notes.some((n) => n.id === activeNoteId)) {
      setActiveNote(null);
    }
  }, [activeNoteId, notes, setActiveNote]);

  if (!workspaceId) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando workspace…</div>;
  }
  if (!activeNotebookId) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-muted-foreground">
          Selecione um notebook para abrir o workspace.
        </p>
        <NotebookSelector allowAll={false} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-16rem)] border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-2 border-b border-border/50 bg-secondary/30">
        <NotebookPen className="h-4 w-4 text-nexus-primary" />
        <span className="text-xs font-semibold">Workspace</span>
        <div className="ml-auto"><NotebookSelector allowAll={false} /></div>
      </div>

      <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: "260px 1fr 300px" }}>
        <SourcesPanel workspaceId={workspaceId} collectionId={activeNotebookId} />

        <div className="min-w-0 border-r border-border/50">
          {activeNoteId ? (
            <NoteEditor noteId={activeNoteId} collectionId={activeNotebookId} />
          ) : (
            <div className="h-full flex items-center justify-center text-center p-6">
              <div className="max-w-sm space-y-2">
                <NotebookPen className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Selecione uma nota à esquerda ou crie uma nova. Use{" "}
                  <code className="text-[11px]">[[Título]]</code> para linkar,{" "}
                  <code className="text-[11px]">#tag</code> para categorizar.
                </p>
              </div>
            </div>
          )}
        </div>

        <StudioPanel noteId={activeNoteId} notebookId={activeNotebookId} />
      </div>
      <NoteQuickOpen />
    </div>
  );
}
