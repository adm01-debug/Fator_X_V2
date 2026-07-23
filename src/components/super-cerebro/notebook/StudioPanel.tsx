/**
 * StudioPanel — coluna direita do workspace: properties, backlinks,
 * unlinked mentions, tags globais, grafo local, resumo IA e podcast.
 */
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Link2, Tag, Sparkles, Network, Mic, List, Settings2, Link2Off, Hash, History, FileStack, Zap, Pencil } from "lucide-react";
import { useNote } from "@/services/notesService";
import { useCerebroStore } from "@/stores/cerebroStore";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { BacklinksList } from "./BacklinksList";
import { LocalGraphView } from "./LocalGraphView";
import { AiStudio } from "./AiStudio";
import { PodcastPanel } from "./PodcastPanel";
import { OutlinePanel } from "./OutlinePanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { UnlinkedMentions } from "./UnlinkedMentions";
import { TagsGlobalPanel } from "./TagsGlobalPanel";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import { TemplatesPanel } from "./TemplatesPanel";
import { RelatedNotesPanel } from "./RelatedNotesPanel";
import { SketchPanel } from "./SketchPanel";
import { emitJumpToLine } from "./NoteEditor";

interface Props { noteId: string | null; notebookId?: string | null }

export function StudioPanel({ noteId, notebookId }: Props) {
  const { data: note } = useNote(noteId);
  const studioTab = useCerebroStore((s) => s.studioTab);
  const setStudioTab = useCerebroStore((s) => s.setStudioTab);
  const { workspaceId } = useCurrentWorkspace();

  if (!noteId || !note) {
    return (
      <div className="border-l border-border/50 h-full flex flex-col bg-secondary/10">
        <div className="p-3 border-b border-border/50">
          <p className="text-meta text-muted-foreground">
            Selecione uma nota para ver backlinks, tags, grafo e resumos — ou explore as tags do notebook abaixo.
          </p>
        </div>
        {notebookId && (
          <div className="flex-1 overflow-auto">
            <div className="px-3 py-2 border-b border-border/50 flex items-center gap-1 text-meta font-semibold">
              <Hash className="h-3 w-3 text-nexus-primary" /> Tags do notebook
            </div>
            <TagsGlobalPanel collectionId={notebookId} />
            <div className="px-3 py-2 border-y border-border/50 flex items-center gap-1 text-meta font-semibold">
              <Mic className="h-3 w-3 text-nexus-primary" /> Podcast
            </div>
            <PodcastPanel notebookId={notebookId} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-l border-border/50 h-full flex flex-col bg-secondary/10">
      <Tabs value={studioTab} onValueChange={setStudioTab} className="flex-1 flex flex-col">
        <TabsList className="mx-2 mt-2 self-start flex-wrap h-auto">
          <TabsTrigger value="properties" className="text-meta gap-1"><Settings2 className="h-3 w-3" /> Props</TabsTrigger>
          <TabsTrigger value="backlinks" className="text-meta gap-1"><Link2 className="h-3 w-3" /> Backlinks</TabsTrigger>
          <TabsTrigger value="unlinked" className="text-meta gap-1"><Link2Off className="h-3 w-3" /> Não linkadas</TabsTrigger>
          <TabsTrigger value="outline" className="text-meta gap-1"><List className="h-3 w-3" /> Outline</TabsTrigger>
          <TabsTrigger value="graph" className="text-meta gap-1"><Network className="h-3 w-3" /> Grafo</TabsTrigger>
          <TabsTrigger value="tagsGlobal" className="text-meta gap-1"><Hash className="h-3 w-3" /> Tags</TabsTrigger>
          <TabsTrigger value="studio" className="text-meta gap-1"><Sparkles className="h-3 w-3" /> IA</TabsTrigger>
          <TabsTrigger value="podcast" className="text-meta gap-1"><Mic className="h-3 w-3" /> Podcast</TabsTrigger>
          <TabsTrigger value="versions" className="text-meta gap-1"><History className="h-3 w-3" /> Versões</TabsTrigger>
          <TabsTrigger value="templates" className="text-meta gap-1"><FileStack className="h-3 w-3" /> Templates</TabsTrigger>
          <TabsTrigger value="related" className="text-meta gap-1"><Zap className="h-3 w-3" /> Similares</TabsTrigger>
          <TabsTrigger value="sketch" className="text-meta gap-1"><Pencil className="h-3 w-3" /> Sketch</TabsTrigger>
          <TabsTrigger value="tags" className="text-meta gap-1"><Tag className="h-3 w-3" /> #Nota</TabsTrigger>
        </TabsList>

        <TabsContent value="properties" className="flex-1 overflow-auto m-0">
          {notebookId ? (
            <PropertiesPanel noteId={note.id} collectionId={notebookId} />
          ) : (
            <p className="p-3 text-meta text-muted-foreground">Notebook não identificado.</p>
          )}
        </TabsContent>

        <TabsContent value="backlinks" className="flex-1 overflow-auto m-0">
          <BacklinksList targetType="note" targetId={note.id} />
        </TabsContent>

        <TabsContent value="unlinked" className="flex-1 overflow-auto m-0">
          {notebookId ? (
            <UnlinkedMentions noteId={note.id} collectionId={notebookId} />
          ) : (
            <p className="p-3 text-meta text-muted-foreground">Notebook não identificado.</p>
          )}
        </TabsContent>

        <TabsContent value="outline" className="flex-1 overflow-auto m-0">
          <OutlinePanel noteId={note.id} onJump={(line) => emitJumpToLine(note.id, line)} />
        </TabsContent>

        <TabsContent value="graph" className="flex-1 overflow-auto m-0">
          <LocalGraphView noteId={note.id} />
        </TabsContent>

        <TabsContent value="tagsGlobal" className="flex-1 overflow-auto m-0">
          {notebookId ? (
            <TagsGlobalPanel collectionId={notebookId} />
          ) : (
            <p className="p-3 text-meta text-muted-foreground">Notebook não identificado.</p>
          )}
        </TabsContent>

        <TabsContent value="studio" className="flex-1 overflow-auto m-0">
          {notebookId ? (
            <AiStudio noteId={note.id} notebookId={notebookId} />
          ) : (
            <p className="p-3 text-meta text-muted-foreground">Notebook não identificado.</p>
          )}
        </TabsContent>

        <TabsContent value="podcast" className="flex-1 overflow-auto m-0">
          <PodcastPanel notebookId={notebookId ?? null} />
        </TabsContent>

        <TabsContent value="versions" className="flex-1 overflow-auto m-0">
          <VersionHistoryPanel noteId={note.id} />
        </TabsContent>

        <TabsContent value="templates" className="flex-1 overflow-auto m-0">
          {workspaceId && notebookId ? (
            <TemplatesPanel
              workspaceId={workspaceId}
              collectionId={notebookId}
              activeNoteId={note.id}
            />
          ) : (
            <p className="p-3 text-meta text-muted-foreground">Notebook não identificado.</p>
          )}
        </TabsContent>

        <TabsContent value="related" className="flex-1 overflow-auto m-0">
          {notebookId ? (
            <RelatedNotesPanel noteId={note.id} collectionId={notebookId} />
          ) : (
            <p className="p-3 text-meta text-muted-foreground">Notebook não identificado.</p>
          )}
        </TabsContent>

        <TabsContent value="sketch" className="flex-1 overflow-auto m-0">
          <SketchPanel noteId={note.id} />
        </TabsContent>

        <TabsContent value="tags" className="m-0 p-3">
          {note.tags?.length === 0 ? (
            <p className="text-meta text-muted-foreground">
              Adicione tags escrevendo <code>#minha-tag</code> no corpo da nota.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {note.tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-meta">#{t}</Badge>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

