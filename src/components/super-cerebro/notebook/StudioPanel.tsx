/**
 * StudioPanel — coluna direita do workspace: properties, backlinks,
 * unlinked mentions, tags globais, grafo local, resumo IA e podcast.
 */
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Link2, Tag, Sparkles, Network, Mic, List, Settings2, Link2Off, Hash } from "lucide-react";
import { useNote } from "@/services/notesService";
import { useCerebroStore } from "@/stores/cerebroStore";
import { BacklinksList } from "./BacklinksList";
import { LocalGraphView } from "./LocalGraphView";
import { AiStudio } from "./AiStudio";
import { PodcastPanel } from "./PodcastPanel";
import { OutlinePanel } from "./OutlinePanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { UnlinkedMentions } from "./UnlinkedMentions";
import { TagsGlobalPanel } from "./TagsGlobalPanel";
import { emitJumpToLine } from "./NoteEditor";

interface Props { noteId: string | null; notebookId?: string | null }

export function StudioPanel({ noteId, notebookId }: Props) {
  const { data: note } = useNote(noteId);
  const studioTab = useCerebroStore((s) => s.studioTab);
  const setStudioTab = useCerebroStore((s) => s.setStudioTab);

  if (!noteId || !note) {
    return (
      <div className="border-l border-border/50 h-full flex flex-col bg-secondary/10">
        <div className="p-3 border-b border-border/50">
          <p className="text-xs text-muted-foreground">
            Selecione uma nota para ver backlinks, tags, grafo e resumos — ou explore as tags do notebook abaixo.
          </p>
        </div>
        {notebookId && (
          <div className="flex-1 overflow-auto">
            <div className="px-3 py-2 border-b border-border/50 flex items-center gap-1 text-xs font-semibold">
              <Hash className="h-3 w-3 text-nexus-primary" /> Tags do notebook
            </div>
            <TagsGlobalPanel collectionId={notebookId} />
            <div className="px-3 py-2 border-y border-border/50 flex items-center gap-1 text-xs font-semibold">
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
          <TabsTrigger value="properties" className="text-xs gap-1"><Settings2 className="h-3 w-3" /> Props</TabsTrigger>
          <TabsTrigger value="backlinks" className="text-xs gap-1"><Link2 className="h-3 w-3" /> Backlinks</TabsTrigger>
          <TabsTrigger value="unlinked" className="text-xs gap-1"><Link2Off className="h-3 w-3" /> Não linkadas</TabsTrigger>
          <TabsTrigger value="outline" className="text-xs gap-1"><List className="h-3 w-3" /> Outline</TabsTrigger>
          <TabsTrigger value="graph" className="text-xs gap-1"><Network className="h-3 w-3" /> Grafo</TabsTrigger>
          <TabsTrigger value="tagsGlobal" className="text-xs gap-1"><Hash className="h-3 w-3" /> Tags</TabsTrigger>
          <TabsTrigger value="studio" className="text-xs gap-1"><Sparkles className="h-3 w-3" /> IA</TabsTrigger>
          <TabsTrigger value="podcast" className="text-xs gap-1"><Mic className="h-3 w-3" /> Podcast</TabsTrigger>
          <TabsTrigger value="tags" className="text-xs gap-1"><Tag className="h-3 w-3" /> #Nota</TabsTrigger>
        </TabsList>

        <TabsContent value="properties" className="flex-1 overflow-auto m-0">
          {notebookId ? (
            <PropertiesPanel noteId={note.id} collectionId={notebookId} />
          ) : (
            <p className="p-3 text-xs text-muted-foreground">Notebook não identificado.</p>
          )}
        </TabsContent>

        <TabsContent value="backlinks" className="flex-1 overflow-auto m-0">
          <BacklinksList targetType="note" targetId={note.id} />
        </TabsContent>

        <TabsContent value="unlinked" className="flex-1 overflow-auto m-0">
          {notebookId ? (
            <UnlinkedMentions noteId={note.id} collectionId={notebookId} />
          ) : (
            <p className="p-3 text-xs text-muted-foreground">Notebook não identificado.</p>
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
            <p className="p-3 text-xs text-muted-foreground">Notebook não identificado.</p>
          )}
        </TabsContent>

        <TabsContent value="studio" className="flex-1 overflow-auto m-0">
          {notebookId ? (
            <AiStudio noteId={note.id} notebookId={notebookId} />
          ) : (
            <p className="p-3 text-xs text-muted-foreground">Notebook não identificado.</p>
          )}
        </TabsContent>

        <TabsContent value="podcast" className="flex-1 overflow-auto m-0">
          <PodcastPanel notebookId={notebookId ?? null} />
        </TabsContent>

        <TabsContent value="tags" className="m-0 p-3">
          {note.tags?.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Adicione tags escrevendo <code>#minha-tag</code> no corpo da nota.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {note.tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">#{t}</Badge>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

