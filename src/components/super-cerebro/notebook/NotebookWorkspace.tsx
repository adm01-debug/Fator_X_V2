/**
 * NotebookWorkspace — shell 3 colunas (Sources | Nota | Studio) em desktop
 * e tabs empilhadas em mobile. Inspirado no NotebookLM com backlinks
 * estilo Obsidian.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { useCerebroStore } from "@/stores/cerebroStore";
import { useNotebooks } from "@/services/notebooksService";
import { useNotes } from "@/services/notesService";
import { SourcesPanel } from "./SourcesPanel";
import { NoteEditor } from "./NoteEditor";
import { StudioPanel } from "./StudioPanel";
import { NoteQuickOpen } from "./NoteQuickOpen";
import { NotebookSelector } from "../NotebookSelector";
import { NotebookPen, FolderTree, FileText, Sparkles } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { readSourcesFromUrl, writeSourcesToUrl } from "@/lib/sourceIdsSync";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { logger } from "@/lib/logger";

export function NotebookWorkspace() {
  const { workspaceId } = useCurrentWorkspace();
  const params = useParams<{ notebookId?: string; noteId?: string }>();
  const activeNotebookId = useCerebroStore((s) => s.activeNotebookId);
  const activeNoteId = useCerebroStore((s) => s.activeNoteId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);
  const setActiveNotebook = useCerebroStore((s) => s.setActiveNotebook);
  const selectedSourceIds = useCerebroStore((s) => s.selectedSourceIds);
  const toggleSource = useCerebroStore((s) => s.toggleSource);

  const { data: notebooks = [] } = useNotebooks(workspaceId);
  const { data: notes = [] } = useNotes(activeNotebookId);
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<"sources" | "note" | "studio">("note");

  // Deep-link: /super-cerebro/n/:notebookId/note/:noteId
  useEffect(() => {
    if (params.notebookId && params.notebookId !== activeNotebookId) {
      setActiveNotebook(params.notebookId);
    }
    if (params.noteId && params.noteId !== activeNoteId) {
      setActiveNote(params.noteId);
    }
  }, [params.notebookId, params.noteId, activeNotebookId, activeNoteId, setActiveNotebook, setActiveNote]);

  // Deep-link: ?sources=uuid1,uuid2 — hidrata store no mount validando contra o notebook.
  // Segurança: IDs de outros notebooks/workspaces são descartados e logados em audit_events.
  useEffect(() => {
    const initial = readSourcesFromUrl();
    if (initial.length === 0 || !activeNotebookId) return;

    (async () => {
      // Busca IDs válidos (documentos deste notebook) — RLS já garante escopo por workspace.
      const { data: docs } = await supabaseExternal
        .from("document_ingestions")
        .select("id")
        .eq("collection_id", activeNotebookId);
      const validIds = new Set((docs ?? []).map((d) => d.id));

      const accepted: string[] = [];
      const rejected: string[] = [];
      for (const id of initial) {
        if (validIds.has(id)) accepted.push(id);
        else rejected.push(id);
      }

      if (rejected.length > 0) {
        logger.warn("cerebro.deep_link.foreign_source_rejected", {
          notebook_id: activeNotebookId,
          rejected_count: rejected.length,
        });
        // Best-effort audit — falha silenciosa se tabela indisponível.
        await supabaseExternal.from("audit_events").insert({
          event_type: "cerebro.deep_link.foreign_source_rejected",
          resource_type: "notebook",
          resource_id: activeNotebookId,
          metadata: { rejected, accepted_count: accepted.length },
        }).then(() => undefined, () => undefined);
      }

      const missing = accepted.filter((id) => !selectedSourceIds.includes(id));
      for (const id of missing) toggleSource(id);
    })();
    // Executa uma vez por notebook — trocar de notebook zera sources
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNotebookId]);

  // Sync store → URL sempre que a seleção mudar
  useEffect(() => {
    writeSourcesToUrl(selectedSourceIds);
  }, [selectedSourceIds]);

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

  const NoteArea = activeNoteId ? (
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
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-16rem)] border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-2 border-b border-border/50 bg-secondary/30">
        <NotebookPen className="h-4 w-4 text-nexus-primary" />
        <span className="text-xs font-semibold">Workspace</span>
        <div className="ml-auto"><NotebookSelector allowAll={false} /></div>
      </div>

      {isMobile ? (
        <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as typeof mobileTab)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-2 mt-2 grid grid-cols-3">
            <TabsTrigger value="sources" className="text-xs gap-1"><FolderTree className="h-3 w-3" /> Fontes</TabsTrigger>
            <TabsTrigger value="note" className="text-xs gap-1"><FileText className="h-3 w-3" /> Nota</TabsTrigger>
            <TabsTrigger value="studio" className="text-xs gap-1"><Sparkles className="h-3 w-3" /> Studio</TabsTrigger>
          </TabsList>
          <TabsContent value="sources" className="flex-1 overflow-auto m-0">
            <SourcesPanel workspaceId={workspaceId} collectionId={activeNotebookId} />
          </TabsContent>
          <TabsContent value="note" className="flex-1 overflow-auto m-0 min-w-0">
            {NoteArea}
          </TabsContent>
          <TabsContent value="studio" className="flex-1 overflow-auto m-0">
            <StudioPanel noteId={activeNoteId} notebookId={activeNotebookId} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: "260px 1fr 300px" }}>
          <SourcesPanel workspaceId={workspaceId} collectionId={activeNotebookId} />
          <div className="min-w-0 border-r border-border/50">{NoteArea}</div>
          <StudioPanel noteId={activeNoteId} notebookId={activeNotebookId} />
        </div>
      )}
      <NoteQuickOpen />
    </div>
  );
}
