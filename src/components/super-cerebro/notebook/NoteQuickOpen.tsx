/**
 * NoteQuickOpen — paleta ⌘K para abrir rapidamente qualquer nota do
 * notebook ativo (estilo Obsidian Quick Switcher).
 *
 * v1.5.0:
 *  - Busca insensível a acentos (NFD strip) via `foldForSearch`.
 *  - FAB flutuante em mobile para abrir o mesmo modal (⌘K é indisponível em touch).
 */
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useCerebroStore } from "@/stores/cerebroStore";
import { useNotes } from "@/services/notesService";
import { FileText, Search } from "lucide-react";
import { foldForSearch } from "@/lib/normalize";
import { Button } from "@/components/ui/button";

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
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        // cmdk filter — usa fold (NFD + lowercase) em ambos os lados para
        // que "acao" case com "Ação" e "reuniao" com "Reunião".
        filter={(value, search) => {
          const v = foldForSearch(value);
          const s = foldForSearch(search);
          if (!s) return 1;
          return v.includes(s) ? 1 : 0;
        }}
      >
        <CommandInput placeholder="Buscar nota por título…" />
        <CommandList>
          <CommandEmpty>Nenhuma nota encontrada.</CommandEmpty>
          <CommandGroup heading="Notas do notebook ativo">
            {notes.map((n) => (
              <CommandItem
                key={n.id}
                // O `value` alimenta o filter — indexa também a versão sem acentos
                // para dar match tanto em "Ação" quanto em "acao".
                value={`${n.title} ${foldForSearch(n.title)}`}
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

      {/* FAB mobile — visível somente em telas < md, onde ⌘K não existe */}
      <Button
        type="button"
        aria-label="Abrir busca de notas"
        onClick={() => setOpen(true)}
        className="md:hidden fixed bottom-20 right-4 h-12 w-12 rounded-full shadow-lg z-40 p-0"
      >
        <Search className="h-5 w-5" />
      </Button>
    </>
  );
}
