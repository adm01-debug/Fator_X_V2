/**
 * NoteQuickOpen — paleta ⌘K para abrir rapidamente qualquer nota do
 * notebook ativo (estilo Obsidian Quick Switcher).
 */
import { useEffect, useState } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useCerebroStore } from "@/stores/cerebroStore";
import { useNotes } from "@/services/notesService";
import { FileText } from "lucide-react";

export function NoteQuickOpen() {
  const [open, setOpen] = useState(false);
  const activeNotebookId = useCerebroStore((s) => s.activeNotebookId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);
  const { data: notes = [] } = useNotes(activeNotebookId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar nota por título…" />
      <CommandList>
        <CommandEmpty>Nenhuma nota encontrada.</CommandEmpty>
        <CommandGroup heading="Notas do notebook ativo">
          {notes.map((n) => (
            <CommandItem
              key={n.id}
              value={n.title}
              onSelect={() => {
                setActiveNote(n.id);
                setOpen(false);
              }}
            >
              <FileText className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <span className="truncate">{n.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
