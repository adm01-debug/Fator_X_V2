/**
 * CanvasWorkspace — layout 2 colunas (lista | editor) para os canvases
 * de um notebook. Persistência via `notebook_canvases`.
 */
import { useEffect, useState } from "react";
import { CanvasesPanel } from "./CanvasesPanel";
import { CanvasEditor, CanvasEmpty } from "./CanvasEditor";
import { useCanvases } from "@/services/canvasesService";

interface Props {
  notebookId: string;
  workspaceId: string;
}

export function CanvasWorkspace({ notebookId, workspaceId }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const { data: canvases = [] } = useCanvases(notebookId);

  // Auto-seleciona o primeiro canvas quando disponível
  useEffect(() => {
    if (!activeId && canvases.length > 0) setActiveId(canvases[0].id);
    if (activeId && !canvases.some((c) => c.id === activeId) && canvases.length > 0) {
      setActiveId(canvases[0].id);
    }
  }, [activeId, canvases]);

  return (
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: "220px 1fr" }}>
      <CanvasesPanel
        notebookId={notebookId}
        workspaceId={workspaceId}
        activeCanvasId={activeId}
        onSelect={(id) => setActiveId(id || null)}
      />
      <div className="min-w-0 min-h-0 relative">
        {activeId ? (
          <CanvasEditor canvasId={activeId} notebookId={notebookId} />
        ) : (
          <CanvasEmpty />
        )}
      </div>
    </div>
  );
}
