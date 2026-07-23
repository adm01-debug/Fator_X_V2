/**
 * OutlinePanel — sumário (TOC) da nota ativa. Clique rola o editor até o
 * heading correspondente. Estilo Obsidian Outline pane.
 */
import { useMemo } from "react";
import { useNote } from "@/services/notesService";
import { parseOutline } from "@/lib/outline";
import { List } from "lucide-react";

interface Props {
  noteId: string;
  /** Scroll para uma linha específica do textarea do editor, quando disponível. */
  onJump?: (line: number, slug: string) => void;
}

export function OutlinePanel({ noteId, onJump }: Props) {
  const { data: note } = useNote(noteId);
  const outline = useMemo(() => parseOutline(note?.body_md ?? ""), [note?.body_md]);

  if (!note) {
    return <p className="p-3 text-xs text-muted-foreground">Carregando…</p>;
  }
  if (outline.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground flex flex-col items-center text-center gap-2">
        <List className="h-5 w-5 opacity-50" />
        <span>Adicione headings <code>#</code>, <code>##</code>, <code>###</code> para gerar um sumário.</span>
      </div>
    );
  }

  return (
    <nav aria-label="Sumário da nota" className="p-2">
      <ul className="space-y-0.5">
        {outline.map((h) => (
          <li key={`${h.line}-${h.slug}`}>
            <button
              type="button"
              onClick={() => onJump?.(h.line, h.slug)}
              className="w-full text-left rounded px-2 py-1 text-xs hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-primary/60 truncate"
              style={{ paddingLeft: `${8 + (h.level - 1) * 12}px` }}
              title={h.text}
            >
              <span className="text-muted-foreground mr-1 text-[10px]">H{h.level}</span>
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
