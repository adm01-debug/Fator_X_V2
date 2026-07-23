/**
 * TagsGlobalPanel — painel global de tags do notebook, com contagem e
 * filtro que lista as notas onde cada tag aparece. Equivalente ao Tags
 * Pane do Obsidian.
 */
import { useMemo, useState } from "react";
import { Hash, Loader2, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useNotes } from "@/services/notesService";
import { useCerebroStore } from "@/stores/cerebroStore";
import { parseTags } from "@/lib/wikilink";
import { foldForSearch } from "@/lib/normalize";

interface Props {
  collectionId: string;
}

export function TagsGlobalPanel({ collectionId }: Props) {
  const { data: notes = [], isLoading } = useNotes(collectionId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { tagCounts, notesByTag } = useMemo(() => {
    const counts = new Map<string, number>();
    const byTag = new Map<string, Array<{ id: string; title: string }>>();
    for (const n of notes) {
      if (n.is_archived) continue;
      const tagsFromBody = parseTags(n.body_md ?? "");
      const merged = new Set<string>([...(n.tags ?? []), ...tagsFromBody]);
      for (const t of merged) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
        const arr = byTag.get(t) ?? [];
        arr.push({ id: n.id, title: n.title });
        byTag.set(t, arr);
      }
    }
    return { tagCounts: counts, notesByTag: byTag };
  }, [notes]);

  const filteredTags = useMemo(() => {
    const q = foldForSearch(query.trim());
    const list = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (!q) return list;
    return list.filter(([t]) => foldForSearch(t).includes(q));
  }, [tagCounts, query]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-meta text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando tags…
      </div>
    );
  }

  if (tagCounts.size === 0) {
    return (
      <div className="p-3 text-meta text-muted-foreground text-center flex flex-col items-center gap-2">
        <Hash className="h-5 w-5 opacity-50" />
        Nenhuma tag ainda. Adicione <code>#minha-tag</code> em qualquer nota.
      </div>
    );
  }

  const selectedNotes = selected ? (notesByTag.get(selected) ?? []) : [];

  return (
    <div className="p-2 space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar tags…"
          className="h-7 pl-7 text-meta"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filteredTags.map(([tag, count]) => {
          const active = selected === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => setSelected(active ? null : tag)}
              className={`rounded-full px-2 py-0.5 text-meta border transition-colors ${
                active
                  ? "bg-nexus-primary text-primary-foreground border-nexus-primary"
                  : "border-border/60 hover:bg-secondary/60"
              }`}
              aria-pressed={active}
            >
              #{tag} <span className="opacity-70 ml-1">{count}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="border-t border-border/50 pt-2 space-y-1">
          <div className="flex items-center gap-2 px-1">
            <Badge variant="secondary" className="text-meta">#{selected}</Badge>
            <span className="text-meta text-muted-foreground">
              {selectedNotes.length} nota{selectedNotes.length === 1 ? "" : "s"}
            </span>
          </div>
          {selectedNotes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setActiveNote(n.id)}
              className="w-full text-left rounded hover:bg-secondary/60 p-2 flex items-center gap-2"
            >
              <FileText className="h-3 w-3 text-nexus-primary" />
              <span className="text-meta truncate">{n.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
