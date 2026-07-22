/**
 * StudioPanel — coluna direita do workspace: backlinks, tags, grafo
 * local, resumo IA e perguntas sugeridas.
 */
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Link2, Tag, Sparkles, Network } from "lucide-react";
import { useNote } from "@/services/notesService";
import { useCerebroStore } from "@/stores/cerebroStore";
import { BacklinksList } from "./BacklinksList";
import { LocalGraphView } from "./LocalGraphView";
import { AiStudio } from "./AiStudio";

interface Props { noteId: string | null; notebookId?: string | null }

export function StudioPanel({ noteId, notebookId }: Props) {
  const { data: note } = useNote(noteId);
  const studioTab = useCerebroStore((s) => s.studioTab);
  const setStudioTab = useCerebroStore((s) => s.setStudioTab);

  if (!noteId || !note) {
    return (
      <div className="p-4 text-xs text-muted-foreground border-l border-border/50 h-full">
        Selecione uma nota para ver backlinks, tags, grafo e resumos.
      </div>
    );
  }

  return (
    <div className="border-l border-border/50 h-full flex flex-col bg-secondary/10">
      <Tabs value={studioTab} onValueChange={setStudioTab} className="flex-1 flex flex-col">
        <TabsList className="mx-2 mt-2 self-start flex-wrap h-auto">
          <TabsTrigger value="backlinks" className="text-xs gap-1"><Link2 className="h-3 w-3" /> Backlinks</TabsTrigger>
          <TabsTrigger value="graph" className="text-xs gap-1"><Network className="h-3 w-3" /> Grafo</TabsTrigger>
          <TabsTrigger value="studio" className="text-xs gap-1"><Sparkles className="h-3 w-3" /> Studio IA</TabsTrigger>
          <TabsTrigger value="tags" className="text-xs gap-1"><Tag className="h-3 w-3" /> Tags</TabsTrigger>
        </TabsList>

        <TabsContent value="backlinks" className="flex-1 overflow-auto m-0">
          <BacklinksList targetType="note" targetId={note.id} />
        </TabsContent>

        <TabsContent value="graph" className="flex-1 overflow-auto m-0">
          <LocalGraphView noteId={note.id} />
        </TabsContent>

        <TabsContent value="studio" className="flex-1 overflow-auto m-0">
          {notebookId ? (
            <AiStudio noteId={note.id} notebookId={notebookId} />
          ) : (
            <p className="p-3 text-xs text-muted-foreground">Notebook não identificado.</p>
          )}
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

