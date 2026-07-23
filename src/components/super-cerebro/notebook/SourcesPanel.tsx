/**
 * SourcesPanel — coluna esquerda do NotebookWorkspace (padrão NotebookLM).
 * Lista notas + documentos do notebook ativo, com multi-seleção para
 * restringir o escopo do chat via `source_ids`.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Plus, StickyNote, Search } from "lucide-react";
import { useNotes, useCreateNote } from "@/services/notesService";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCerebroStore } from "@/stores/cerebroStore";

interface Props {
  workspaceId: string;
  collectionId: string;
}

interface DocRow { id: string; title: string; }

export function SourcesPanel({ workspaceId, collectionId }: Props) {
  const [q, setQ] = useState("");
  const { data: notes = [] } = useNotes(collectionId);
  const { data: docs = [] } = useQuery({
    queryKey: ["notebook-docs", collectionId],
    queryFn: async (): Promise<DocRow[]> => {
      const { data } = await supabaseExternal
        .from("documents")
        .select("id,title")
        .eq("collection_id", collectionId)
        .order("updated_at", { ascending: false })
        .limit(200);
      return (data ?? []) as DocRow[];
    },
    enabled: !!collectionId,
    staleTime: 30_000,
  });

  const activeNoteId = useCerebroStore((s) => s.activeNoteId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);
  const selected = useCerebroStore((s) => s.selectedSourceIds);
  const toggleSource = useCerebroStore((s) => s.toggleSource);
  const clearSources = useCerebroStore((s) => s.clearSources);

  const create = useCreateNote(collectionId);

  const filteredNotes = useMemo(
    () => notes.filter((n) => !q || n.title.toLowerCase().includes(q.toLowerCase())),
    [notes, q],
  );
  const filteredDocs = useMemo(
    () => docs.filter((d) => !q || d.title.toLowerCase().includes(q.toLowerCase())),
    [docs, q],
  );

  const handleNew = async () => {
    try {
      const n = await create.mutateAsync({ workspaceId, title: "Nova nota" });
      setActiveNote(n.id);
      toast.success("Nota criada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar nota");
    }
  };

  return (
    <div className="flex h-full flex-col border-r border-border/50 bg-secondary/20">
      <div className="p-3 space-y-2 border-b border-border/50">
        <div className="flex items-center justify-between gap-2">
          <span className="text-meta font-semibold">Fontes</span>
          <Button size="sm" variant="outline" onClick={handleNew} className="h-7">
            <Plus className="h-3 w-3 mr-1" /> Nova nota
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrar…"
            className="h-7 pl-7 text-meta"
          />
        </div>
        {selected.length > 0 && (
          <div className="flex items-center justify-between text-meta text-muted-foreground">
            <span>{selected.length} fontes selecionadas</span>
            <button className="underline" onClick={clearSources}>Limpar</button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          <section>
            <div className="text-meta uppercase tracking-wider text-muted-foreground px-2 mb-1">
              Notas ({filteredNotes.length})
            </div>
            {filteredNotes.map((n) => {
              const isActive = activeNoteId === n.id;
              const isSel = selected.includes(n.id);
              return (
                <div
                  key={n.id}
                  className={`group flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-secondary/60 ${
                    isActive ? "bg-secondary/80" : ""
                  }`}
                  onClick={() => setActiveNote(n.id)}
                >
                  <Checkbox
                    checked={isSel}
                    onCheckedChange={() => toggleSource(n.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <StickyNote className="h-3.5 w-3.5 text-nexus-primary shrink-0" />
                  <span className="text-meta truncate flex-1">{n.title}</span>
                  {n.tags?.length > 0 && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                      #{n.tags[0]}{n.tags.length > 1 ? ` +${n.tags.length - 1}` : ""}
                    </Badge>
                  )}
                </div>
              );
            })}
            {filteredNotes.length === 0 && (
              <div className="text-meta text-muted-foreground px-2 py-1">Nenhuma nota.</div>
            )}
          </section>

          <section>
            <div className="text-meta uppercase tracking-wider text-muted-foreground px-2 mb-1">
              Documentos ({filteredDocs.length})
            </div>
            {filteredDocs.map((d) => {
              const isSel = selected.includes(d.id);
              return (
                <div
                  key={d.id}
                  className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-secondary/60"
                >
                  <Checkbox checked={isSel} onCheckedChange={() => toggleSource(d.id)} />
                  <FileText className="h-3.5 w-3.5 text-nexus-cyan shrink-0" />
                  <span className="text-meta truncate flex-1">{d.title}</span>
                </div>
              );
            })}
            {filteredDocs.length === 0 && (
              <div className="text-meta text-muted-foreground px-2 py-1">Sem documentos.</div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
