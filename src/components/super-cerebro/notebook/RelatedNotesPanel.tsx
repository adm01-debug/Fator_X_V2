/**
 * RelatedNotesPanel — Sugere notas relacionadas à nota ativa via
 * similaridade textual + tags e wikilinks compartilhados. Wave H.
 */
import { useNote } from "@/services/notesService";
import { useRelatedNotes } from "@/services/relatedNotesService";
import { useCerebroStore } from "@/stores/cerebroStore";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, ArrowRight } from "lucide-react";

interface Props {
  noteId: string;
  collectionId: string;
}

export function RelatedNotesPanel({ noteId, collectionId }: Props) {
  const { data: note } = useNote(noteId);
  const { data: related, isLoading } = useRelatedNotes(note, collectionId, 10);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (!related || related.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        <Sparkles className="h-4 w-4 mb-2 text-nexus-primary" />
        Nenhuma nota similar encontrada. Escreva mais conteúdo, adicione tags
        ou wikilinks <code>[[como este]]</code> para gerar conexões.
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1.5">
      {related.map(({ note: r, score, sharedTags, sharedLinks }) => (
        <button
          key={r.id}
          onClick={() => setActiveNote(r.id)}
          className="w-full text-left p-2.5 rounded-md border border-border/50 hover:border-nexus-primary/60 hover:bg-secondary/40 transition-colors group"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{r.title || "Sem título"}</p>
              <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                {(r.body_md || "").slice(0, 140)}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Badge variant="secondary" className="text-[9px]">
                {(score * 100).toFixed(0)}%
              </Badge>
              <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-nexus-primary transition-colors" />
            </div>
          </div>
          {(sharedTags.length > 0 || sharedLinks.length > 0) && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {sharedTags.slice(0, 4).map((t) => (
                <Badge key={`t-${t}`} variant="outline" className="text-[9px] gap-0.5">
                  #{t}
                </Badge>
              ))}
              {sharedLinks.slice(0, 3).map((l) => (
                <Badge key={`l-${l}`} variant="outline" className="text-[9px]">
                  [[{l}]]
                </Badge>
              ))}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
