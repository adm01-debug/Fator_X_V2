import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { useNotebooks, type Notebook } from "@/services/notebooksService";
import { useCerebroStore } from "@/stores/cerebroStore";
import * as Icons from "lucide-react";

interface Props {
  allowAll?: boolean;
}

export function NotebookSelector({ allowAll = true }: Props) {
  const { workspaceId } = useCurrentWorkspace();
  const { data: notebooks = [] } = useNotebooks(workspaceId);
  const activeNotebookId = useCerebroStore((s) => s.activeNotebookId);
  const setActiveNotebook = useCerebroStore((s) => s.setActiveNotebook);

  const active = notebooks.find((n) => n.id === activeNotebookId) ?? null;
  const visible = notebooks.filter((n) => !n.is_archived);

  // Auto-select first notebook if none active
  useEffect(() => {
    if (!activeNotebookId && visible.length > 0 && !allowAll) {
      setActiveNotebook(visible[0].id);
    }
  }, [activeNotebookId, visible, allowAll, setActiveNotebook]);

  const IconFor = (n: Notebook) =>
    (Icons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[n.icon] ?? Icons.BookOpen;

  return (
    <div className="flex items-center gap-2">
      <span className="text-meta text-muted-foreground shrink-0">Notebook:</span>
      <Select
        value={activeNotebookId ?? (allowAll ? "__all__" : "")}
        onValueChange={(v) => setActiveNotebook(v === "__all__" ? null : v)}
      >
        <SelectTrigger className="w-[260px]">
          <SelectValue placeholder="Selecione…">
            {active ? (
              <span className="flex items-center gap-2">
                {(() => { const I = IconFor(active); return <I className="h-3.5 w-3.5" style={{ color: `hsl(var(--${active.color}))` }} />; })()}
                <span className="truncate">{active.name}</span>
              </span>
            ) : allowAll ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Icons.Layers className="h-3.5 w-3.5" /> Todos os notebooks
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {allowAll && (
            <SelectItem value="__all__">
              <span className="flex items-center gap-2">
                <Icons.Layers className="h-3.5 w-3.5" /> Todos os notebooks
              </span>
            </SelectItem>
          )}
          {visible.length === 0 && (
            <div className="p-2 text-meta text-muted-foreground">
              Nenhum notebook. Crie um na aba "Notebooks".
            </div>
          )}
          {visible.map((n) => {
            const I = IconFor(n);
            return (
              <SelectItem key={n.id} value={n.id}>
                <span className="flex items-center gap-2 w-full">
                  <I className="h-3.5 w-3.5" style={{ color: `hsl(var(--${n.color}))` }} />
                  <span className="truncate flex-1">{n.name}</span>
                  <Badge variant="outline" className="text-[10px] ml-2">{n.document_count ?? 0}</Badge>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
