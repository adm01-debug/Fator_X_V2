/**
 * KanbanBoard — visão em colunas estilo Obsidian Kanban.
 * Drag-and-drop nativo HTML5, otimista, com rollback em erro.
 * Colunas derivadas de uma propriedade frontmatter (default `status`).
 */
import { useCallback, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { GripVertical, Plus, LayoutList } from "lucide-react";
import { useCerebroStore } from "@/stores/cerebroStore";
import { useKanbanColumns, useMoveNote, UNSTATUSED } from "@/services/kanbanService";
import type { NotebookNote } from "@/services/notesService";
import { cn } from "@/lib/utils";

interface Props {
  collectionId: string | null;
  onOpenNote?: (noteId: string) => void;
}

export function KanbanBoard({ collectionId, onOpenNote }: Props) {
  const [property, setProperty] = useState<string>("status");
  const [draftProperty, setDraftProperty] = useState<string>("status");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);

  const { columns, isLoading, error } = useKanbanColumns(collectionId, property);
  const move = useMoveNote(collectionId);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetKey: string) => {
      e.preventDefault();
      setDragOver(null);
      const raw = e.dataTransfer.getData("application/x-nexus-note");
      if (!raw) return;
      try {
        const note = JSON.parse(raw) as NotebookNote;
        // se já está na coluna, ignora
        // (buildColumns já normaliza para lowercase trim)
        move.mutate(
          { note, property, targetKey },
          {
            onError: (err) => {
              toast.error(
                err instanceof Error ? err.message : "Falha ao mover nota",
              );
            },
          },
        );
      } catch {
        /* payload inválido → ignora */
      }
    },
    [move, property],
  );

  if (!collectionId) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Selecione um notebook para visualizar o Kanban.
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center text-sm text-destructive">
        Erro ao carregar notas: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-3 border-b border-border/50 bg-secondary/20">
        <LayoutList className="h-4 w-4 text-nexus-primary" />
        <span className="text-xs font-semibold">Agrupar por propriedade</span>
        <div className="flex items-center gap-2">
          <Label htmlFor="kanban-prop" className="sr-only">
            Propriedade
          </Label>
          <Input
            id="kanban-prop"
            value={draftProperty}
            onChange={(e) => setDraftProperty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setProperty(draftProperty.trim() || "status");
            }}
            className="h-7 w-32 text-xs"
            placeholder="status"
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={() => setProperty(draftProperty.trim() || "status")}
          >
            Aplicar
          </Button>
        </div>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Arraste os cards entre as colunas — a propriedade{" "}
          <code className="rounded bg-muted px-1">{property}</code> é atualizada no
          frontmatter.
        </span>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 p-3 h-full min-w-max">
          {columns.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.key);
              }}
              onDragLeave={() => setDragOver((c) => (c === col.key ? null : c))}
              onDrop={(e) => handleDrop(e, col.key)}
              className={cn(
                "w-72 shrink-0 flex flex-col rounded-lg border border-border/50 bg-secondary/10 transition-colors",
                dragOver === col.key && "border-nexus-primary bg-nexus-primary/5",
              )}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      col.key === UNSTATUSED ? "bg-muted-foreground" : "bg-nexus-primary",
                    )}
                    aria-hidden
                  />
                  <span className="text-xs font-semibold">{col.label}</span>
                  <Badge variant="secondary" className="h-5 text-[10px]">
                    {col.notes.length}
                  </Badge>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[6rem]">
                {col.notes.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-4">
                    Solte um card aqui
                  </p>
                ) : (
                  col.notes.map((note) => (
                    <Card
                      key={note.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/x-nexus-note",
                          JSON.stringify(note),
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => {
                        setActiveNote(note.id);
                        onOpenNote?.(note.id);
                      }}
                      className="p-2.5 cursor-grab active:cursor-grabbing hover:border-nexus-primary/60 transition-colors group"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActiveNote(note.id);
                          onOpenNote?.(note.id);
                        }
                      }}
                    >
                      <div className="flex items-start gap-1.5">
                        <GripVertical className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {note.title || "Sem título"}
                          </p>
                          {note.tags?.length ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {note.tags.slice(0, 3).map((t) => (
                                <span
                                  key={t}
                                  className="text-[9px] text-muted-foreground"
                                >
                                  #{t}
                                </span>
                              ))}
                              {note.tags.length > 3 && (
                                <span className="text-[9px] text-muted-foreground">
                                  +{note.tags.length - 3}
                                </span>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          ))}
          <div className="w-72 shrink-0 flex items-start justify-center pt-4 text-[10px] text-muted-foreground">
            <Plus className="h-3 w-3 mr-1" />
            Novas colunas surgem automaticamente ao usar novos valores da propriedade.
          </div>
        </div>
      </div>
    </div>
  );
}
