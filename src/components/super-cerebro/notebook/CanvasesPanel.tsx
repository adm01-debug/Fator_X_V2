/**
 * CanvasesPanel — coluna esquerda com lista de canvases do notebook +
 * ações de criar/renomear/deletar. Seleção controlada por prop.
 */
import { Loader2, Plus, Trash2, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanvases, useCreateCanvas, useDeleteCanvas } from "@/services/canvasesService";
import { toast } from "sonner";

interface Props {
  notebookId: string;
  workspaceId: string;
  activeCanvasId: string | null;
  onSelect: (id: string) => void;
}

export function CanvasesPanel({ notebookId, workspaceId, activeCanvasId, onSelect }: Props) {
  const { data: canvases = [], isLoading } = useCanvases(notebookId);
  const createCanvas = useCreateCanvas();
  const deleteCanvas = useDeleteCanvas();

  const handleCreate = async () => {
    try {
      const c = await createCanvas.mutateAsync({ notebookId, workspaceId });
      onSelect(c.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar canvas");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este canvas? A ação é irreversível.")) return;
    try {
      await deleteCanvas.mutateAsync({ id, notebookId });
      if (activeCanvasId === id) onSelect("");
      toast.success("Canvas excluído");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    }
  };

  return (
    <div className="border-r border-border/50 h-full flex flex-col bg-secondary/10">
      <div className="p-2 border-b border-border/50 flex items-center gap-2">
        <LayoutDashboard className="h-3.5 w-3.5 text-nexus-primary" />
        <span className="text-xs font-semibold">Canvases</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 ml-auto"
          onClick={handleCreate}
          disabled={createCanvas.isPending}
          aria-label="Novo canvas"
        >
          {createCanvas.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-1">
        {isLoading ? (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
          </div>
        ) : canvases.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            Nenhum canvas ainda. Crie o primeiro com o botão <Plus className="inline h-3 w-3" />.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {canvases.map((c) => (
              <li key={c.id}>
                <div
                  className={`group flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer ${
                    activeCanvasId === c.id ? "bg-secondary" : "hover:bg-secondary/60"
                  }`}
                  onClick={() => onSelect(c.id)}
                >
                  <LayoutDashboard className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate flex-1">{c.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleDelete(c.id); }}
                    className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive"
                    aria-label="Excluir canvas"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
