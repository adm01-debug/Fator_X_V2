/**
 * UnlinkedMentions — varre outras notas do notebook procurando menções ao
 * título da nota ativa que NÃO estão em `[[wikilinks]]`. Clique converte
 * a menção crua em `[[Título]]` (indexa como backlink) — comportamento
 * idêntico ao "Unlinked mentions" do Obsidian.
 */
import { useMemo, useState } from "react";
import { Loader2, Link2Off, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNotes, useNote, useUpdateNote } from "@/services/notesService";
import { useCerebroStore } from "@/stores/cerebroStore";
import { foldForSearch } from "@/lib/normalize";
import { parseWikilinks } from "@/lib/wikilink";

interface Props {
  noteId: string;
  collectionId: string;
}

interface Hit {
  sourceId: string;
  sourceTitle: string;
  snippet: string;
  matchStart: number;
  matchEnd: number;
}

/** Regex-escape helper. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function UnlinkedMentions({ noteId, collectionId }: Props) {
  const { data: note } = useNote(noteId);
  const { data: notes = [], isLoading } = useNotes(collectionId);
  const update = useUpdateNote(collectionId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);
  const [converting, setConverting] = useState<string | null>(null);

  const hits: Hit[] = useMemo(() => {
    if (!note?.title || note.title.trim().length < 3) return [];
    const target = note.title.trim();
    const targetFolded = foldForSearch(target);
    // busca insensível a caixa e acentos, com word boundary aproximado
    const pattern = new RegExp(`(^|[^\\w\\[])(${escapeRe(target)})(?=[^\\w\\]]|$)`, "gi");
    const list: Hit[] = [];

    for (const other of notes) {
      if (other.id === note.id || other.is_archived) continue;
      const body = other.body_md ?? "";
      if (!body) continue;
      // Regiões já cobertas por `[[…]]` — evitamos flagrar links existentes.
      const linkRanges = parseWikilinks(body).map((w) => [w.index, w.index + w.raw.length] as const);

      // Passada acento-insensível: aplicamos regex simples e depois fallback folded.
      const seen = new Set<number>();
      let m: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((m = pattern.exec(body)) !== null) {
        const start = m.index + m[1].length;
        const end = start + m[2].length;
        if (linkRanges.some(([a, b]) => start >= a && end <= b)) continue;
        seen.add(start);
        list.push({
          sourceId: other.id,
          sourceTitle: other.title,
          snippet: snippetAround(body, start, end),
          matchStart: start,
          matchEnd: end,
        });
      }
      // Fallback acento-insensível (só se não achou nada pelo regex direto)
      if (![...seen].length && targetFolded !== target.toLowerCase()) {
        const foldedBody = foldForSearch(body);
        let idx = foldedBody.indexOf(targetFolded);
        while (idx !== -1) {
          const end = idx + target.length;
          const inLink = linkRanges.some(([a, b]) => idx >= a && end <= b);
          if (!inLink) {
            list.push({
              sourceId: other.id,
              sourceTitle: other.title,
              snippet: snippetAround(body, idx, end),
              matchStart: idx,
              matchEnd: end,
            });
          }
          idx = foldedBody.indexOf(targetFolded, end);
        }
      }
    }
    return list.slice(0, 100);
  }, [note?.id, note?.title, notes]);

  const convert = async (hit: Hit) => {
    const src = notes.find((n) => n.id === hit.sourceId);
    if (!src || !note) return;
    setConverting(`${hit.sourceId}:${hit.matchStart}`);
    try {
      const before = src.body_md.slice(0, hit.matchStart);
      const after = src.body_md.slice(hit.matchEnd);
      const replacement = `[[${note.title}]]`;
      const nextBody = before + replacement + after;
      await update.mutateAsync({
        id: src.id,
        patch: { body_md: nextBody },
        syncLinks: true,
      });
      toast.success(`Convertido em wikilink na nota "${src.title}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao converter menção");
    } finally {
      setConverting(null);
    }
  };

  if (!note) return null;
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Varrendo notas…
      </div>
    );
  }
  if (hits.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground text-center flex flex-col items-center gap-2">
        <Link2Off className="h-5 w-5 opacity-50" />
        Nenhuma menção não linkada. Todas as ocorrências do título já estão em <code>[[wikilinks]]</code>.
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      <p className="px-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {hits.length} menção{hits.length === 1 ? "" : "es"} não linkada{hits.length === 1 ? "" : "s"}
      </p>
      {hits.map((h, i) => {
        const key = `${h.sourceId}:${h.matchStart}:${i}`;
        return (
          <div key={key} className="rounded p-2 hover:bg-secondary/60 group">
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setActiveNote(h.sourceId)}
            >
              <div className="flex items-center gap-2 text-xs font-medium">
                <FileText className="h-3 w-3 text-nexus-primary" />
                <span className="truncate">{h.sourceTitle}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{h.snippet}</p>
            </button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] mt-1 opacity-70 group-hover:opacity-100"
              disabled={converting === `${h.sourceId}:${h.matchStart}`}
              onClick={() => void convert(h)}
            >
              {converting === `${h.sourceId}:${h.matchStart}`
                ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                : null}
              Converter em [[wikilink]]
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function snippetAround(text: string, start: number, end: number, radius = 50): string {
  const s = Math.max(0, start - radius);
  const e = Math.min(text.length, end + radius);
  const before = text.slice(s, start);
  const match = text.slice(start, end);
  const after = text.slice(end, e);
  return `${s > 0 ? "…" : ""}${before}【${match}】${after}${e < text.length ? "…" : ""}`.replace(/\s+/g, " ");
}
