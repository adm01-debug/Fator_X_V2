/**
 * BacklinksList — lista de "Linked mentions" (padrão Obsidian).
 * Clicar num item ativa a nota de origem no workspace.
 */
import { Loader2, StickyNote, FileText } from "lucide-react";
import { useBacklinks } from "@/services/notesService";
import { useCerebroStore } from "@/stores/cerebroStore";

interface Props {
  targetType: "note" | "document";
  targetId: string;
}

export function BacklinksList({ targetType, targetId }: Props) {
  const { data = [], isLoading } = useBacklinks(targetType, targetId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-meta text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="p-3 text-meta text-muted-foreground">
        Nenhum backlink ainda. Referencie esta nota em outro lugar com{" "}
        <code className="text-meta">[[Título]]</code>.
      </div>
    );
  }
  return (
    <div className="p-2 space-y-1">
      {data.map((bl) => {
        const Icon = bl.source_type === "note" ? StickyNote : FileText;
        return (
          <button
            key={bl.id}
            onClick={() => bl.source_type === "note" && setActiveNote(bl.source_id)}
            className="w-full text-left rounded hover:bg-secondary/60 p-2"
          >
            <div className="flex items-center gap-2 text-meta font-medium">
              <Icon className="h-3 w-3 text-nexus-primary" />
              <span className="truncate">{bl.source_title}</span>
              <span className="ml-auto text-[9px] uppercase text-muted-foreground">{bl.link_kind}</span>
            </div>
            {bl.context && (
              <p className="text-meta text-muted-foreground mt-1 line-clamp-2">{bl.context}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
