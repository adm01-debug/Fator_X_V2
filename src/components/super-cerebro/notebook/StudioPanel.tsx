/**
 * StudioPanel — coluna direita do workspace: backlinks, tags e (futuro)
 * grafo local, resumo IA, perguntas sugeridas.
 */
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Link2, Tag, Sparkles } from "lucide-react";
import { useNote } from "@/services/notesService";
import { BacklinksList } from "./BacklinksList";

interface Props { noteId: string | null; }

export function StudioPanel({ noteId }: Props) {
  const { data: note } = useNote(noteId);

  if (!noteId || !note) {
    return (
      <div className="p-4 text-xs text-muted-foreground border-l border-border/50 h-full">
        Selecione uma nota para ver backlinks, tags e resumos.
      </div>
    );
  }

  return (
    <div className="border-l border-border/50 h-full flex flex-col bg-secondary/10">
      <Tabs defaultValue="backlinks" className="flex-1 flex flex-col">
        <TabsList className="mx-2 mt-2 self-start">
          <TabsTrigger value="backlinks" className="text-xs gap-1"><Link2 className="h-3 w-3" /> Backlinks</TabsTrigger>
          <TabsTrigger value="tags" className="text-xs gap-1"><Tag className="h-3 w-3" /> Tags</TabsTrigger>
          <TabsTrigger value="studio" className="text-xs gap-1"><Sparkles className="h-3 w-3" /> Studio</TabsTrigger>
        </TabsList>

        <TabsContent value="backlinks" className="flex-1 overflow-auto m-0">
          <BacklinksList targetType="note" targetId={note.id} />
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

        <TabsContent value="studio" className="m-0 p-3 text-xs text-muted-foreground space-y-2">
          <p>
            <strong>Em breve:</strong> resumo executivo com citações, perguntas
            sugeridas e grafo local a 2 níveis de distância.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
