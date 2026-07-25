/**
 * NoteEditor — editor markdown com autosave (debounce 800ms), preview
 * lado-a-lado, tags, sincronização de wikilinks/backlinks, autocomplete
 * de `[[…` e `#…`, e hover preview de wikilinks no preview.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, Trash2, Eye, PencilLine, Bookmark, Share2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  useNote,
  useUpdateNote,
  useNotes,
  deleteNote,
  type NotebookNote,
} from "@/services/notesService";
import { extractLinks, renderWikilinksToMarkdown } from "@/lib/wikilink";
import { useCerebroStore } from "@/stores/cerebroStore";
import { EditorAutocomplete } from "./EditorAutocomplete";
import { WikilinkHoverCard } from "./WikilinkHoverCard";
import { isBookmarked, toggleBookmark, BOOKMARKS_EVENT } from "@/services/bookmarksService";
import { buildShareUrl } from "@/services/shareService";
import { cn } from "@/lib/utils";

interface Props {
  noteId: string;
  collectionId: string;
}

/** Handler global para jump-to-line no editor (usado pelo OutlinePanel). */
const JUMP_EVENT = "cerebro:jump-to-line";
// eslint-disable-next-line react-refresh/only-export-components
export function emitJumpToLine(noteId: string, line: number) {
  window.dispatchEvent(new CustomEvent(JUMP_EVENT, { detail: { noteId, line } }));
}

export function NoteEditor({ noteId, collectionId }: Props) {
  const { data: note, isLoading } = useNote(noteId);
  const { data: notes = [] } = useNotes(collectionId);
  const update = useUpdateNote(collectionId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | null>(null);
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const splitRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeTa, setActiveTa] = useState<HTMLTextAreaElement | null>(null);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    setBookmarked(isBookmarked(collectionId, noteId));
    const handler = () => setBookmarked(isBookmarked(collectionId, noteId));
    window.addEventListener(BOOKMARKS_EVENT, handler);
    return () => window.removeEventListener(BOOKMARKS_EVENT, handler);
  }, [collectionId, noteId]);

  useEffect(() => {
    if (!note) return;
    setTitle(note.title);
    setBody(note.body_md);
    setDirty(false);
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll do editor para uma linha específica (Outline)
  useEffect(() => {
    const onJump = (e: Event) => {
      const detail = (e as CustomEvent<{ noteId: string; line: number }>).detail;
      if (!detail || detail.noteId !== noteId) return;
      const ta = editRef.current ?? splitRef.current;
      if (!ta) return;
      const lines = body.split("\n");
      const pos = lines.slice(0, detail.line).reduce((acc, l) => acc + l.length + 1, 0);
      ta.focus();
      ta.setSelectionRange(pos, pos + (lines[detail.line]?.length ?? 0));
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 18;
      ta.scrollTop = Math.max(0, detail.line * lineHeight - ta.clientHeight / 2);
    };
    window.addEventListener(JUMP_EVENT, onJump);
    return () => window.removeEventListener(JUMP_EVENT, onJump);
  }, [noteId, body]);

  const doSave = async (n: NotebookNote, syncLinks: boolean) => {
    setSaving(true);
    try {
      await update.mutateAsync({
        id: n.id,
        patch: { title: title.trim() || "Nova nota", body_md: body },
        syncLinks,
      });
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!note || !dirty) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => doSave(note, false), 800);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, dirty]);

  const { tags } = useMemo(() => extractLinks(body), [body]);

  const previewMd = useMemo(
    () =>
      renderWikilinksToMarkdown(body, (label, type) => {
        return `#wl:${type}:${encodeURIComponent(label)}`;
      }),
    [body],
  );

  const handleDelete = async () => {
    if (!note) return;
    if (!confirm(`Excluir a nota "${note.title}"?`)) return;
    try {
      await deleteNote(note.id);
      setActiveNote(null);
      toast.success("Nota excluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    }
  };

  const insertAutocomplete = (text: string, start: number, end: number) => {
    const ta = activeTa;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    setDirty(true);
    // Recoloca o caret após o texto inserido
    requestAnimationFrame(() => {
      if (!ta) return;
      const newPos = start + text.length;
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    });
  };

  if (isLoading || !note) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-body-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando nota…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="p-3 border-b border-border/50 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            className="text-title-sm font-semibold border-0 shadow-none focus-visible:ring-0 px-0"
            placeholder="Título da nota…"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => doSave(note, true)}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            Salvar & indexar links
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn("h-8", bookmarked ? "text-nexus-amber" : "text-muted-foreground")}
            onClick={() => setBookmarked(toggleBookmark(collectionId, noteId))}
            aria-label={bookmarked ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            aria-pressed={bookmarked}
            title={bookmarked ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          >
            <Bookmark className={cn("h-3.5 w-3.5", bookmarked && "fill-current")} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-muted-foreground"
            onClick={async () => {
              if (!note) return;
              if (!body.trim()) { toast.error("Nada para compartilhar — a nota está vazia."); return; }
              try {
                const url = await buildShareUrl({
                  v: 1,
                  title: title || note.title,
                  body_md: body,
                  tags: note.tags ?? [],
                  publishedAt: new Date().toISOString(),
                });
                if (url.length > 12000) {
                  toast.warning("Link gerado é muito longo — alguns navegadores podem truncar.");
                }
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success("Link público copiado para a área de transferência");
                } catch {
                  window.prompt("Copie o link público:", url);
                }
              } catch {
                toast.error("Falha ao gerar link de compartilhamento");
              }
            }}
            aria-label="Compartilhar snapshot público"
            title="Compartilhar snapshot público (read-only)"
          >
            <Share2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={handleDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {tags.map((t) => (
            <Badge key={t} variant="outline" className="text-meta">#{t}</Badge>
          ))}
          <span className="text-meta text-muted-foreground ml-auto">
            {dirty ? "Alterações não salvas…" : saving ? "Salvando…" : "Sincronizado"}
          </span>
        </div>
      </div>

      <Tabs defaultValue="edit" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-2 self-start">
          <TabsTrigger value="edit" className="text-meta gap-1"><PencilLine className="h-3 w-3" /> Editor</TabsTrigger>
          <TabsTrigger value="preview" className="text-meta gap-1"><Eye className="h-3 w-3" /> Preview</TabsTrigger>
          <TabsTrigger value="split" className="text-meta">Split</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="flex-1 min-h-0 m-0 p-3">
          <Textarea
            ref={editRef}
            value={body}
            onChange={(e) => { setBody(e.target.value); setDirty(true); }}
            onFocus={(e) => setActiveTa(e.currentTarget)}
            placeholder="Escreva em markdown. Use [[Título]] para linkar outra nota, [[doc:Nome]] para documento, [[@Entidade]] para entidade, #tag para categorizar."
            className="h-full min-h-[300px] font-mono text-body-sm resize-none"
          />
        </TabsContent>

        <TabsContent value="preview" className="flex-1 min-h-0 m-0 p-3 overflow-auto">
          <article className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => {
                  const wl = /^#wl:(note|document|entity|tag):(.+)$/.exec(href ?? "");
                  if (wl) {
                    const type = wl[1] as "note" | "document" | "entity" | "tag";
                    const label = decodeURIComponent(wl[2]);
                    return (
                      <WikilinkHoverCard label={label} targetType={type}>
                        {children}
                      </WikilinkHoverCard>
                    );
                  }
                  return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
                },
              }}
            >
              {previewMd || "*(nota vazia)*"}
            </ReactMarkdown>
          </article>
        </TabsContent>

        <TabsContent value="split" className="flex-1 min-h-0 m-0 p-3">
          <div className="grid grid-cols-2 gap-3 h-full">
            <Textarea
              ref={splitRef}
              value={body}
              onChange={(e) => { setBody(e.target.value); setDirty(true); }}
              onFocus={(e) => setActiveTa(e.currentTarget)}
              className="h-full min-h-[300px] font-mono text-body-sm resize-none"
            />
            <div className="overflow-auto border rounded p-3 bg-secondary/20">
              <article className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => {
                      const wl = /^#wl:(note|document|entity|tag):(.+)$/.exec(href ?? "");
                      if (wl) {
                        const type = wl[1] as "note" | "document" | "entity" | "tag";
                        const label = decodeURIComponent(wl[2]);
                        return (
                          <WikilinkHoverCard label={label} targetType={type}>
                            {children}
                          </WikilinkHoverCard>
                        );
                      }
                      return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
                    },
                  }}
                >
                  {previewMd || "*(vazio)*"}
                </ReactMarkdown>
              </article>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <EditorAutocomplete
        textarea={activeTa}
        value={body}
        notes={notes}
        onInsert={insertAutocomplete}
      />
    </div>
  );
}
