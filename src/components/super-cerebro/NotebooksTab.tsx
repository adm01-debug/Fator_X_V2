import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useNotebooks, useCreateNotebook, useUpdateNotebook,
  archiveNotebook, NOTEBOOK_SUGGESTIONS,
  type Notebook, type NotebookInput,
} from "@/services/notebooksService";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { useCerebroStore } from "@/stores/cerebroStore";
import { NotebookFormDialog } from "./NotebookFormDialog";
import { Plus, Pencil, Archive, ArchiveRestore, CheckCircle2, Sparkles } from "lucide-react";
import * as Icons from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";

export function NotebooksTab() {
  const { workspaceId } = useCurrentWorkspace();
  const { data: notebooks = [], isLoading } = useNotebooks(workspaceId);
  const create = useCreateNotebook(workspaceId);
  const update = useUpdateNotebook(workspaceId);
  const qc = useQueryClient();
  const activeNotebookId = useCerebroStore((s) => s.activeNotebookId);
  const setActiveNotebook = useCerebroStore((s) => s.setActiveNotebook);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Notebook | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const visible = notebooks.filter((n) => showArchived || !n.is_archived);
  const isEmpty = notebooks.length === 0 && !isLoading;

  const handleSubmit = async (input: NotebookInput) => {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: input });
        toast.success("Notebook atualizado");
      } else {
        const nb = await create.mutateAsync(input);
        setActiveNotebook(nb.id);
        toast.success(`Notebook "${nb.name}" criado`);
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    }
  };

  const handleArchive = async (nb: Notebook) => {
    try {
      await archiveNotebook(nb.id, !nb.is_archived);
      qc.invalidateQueries({ queryKey: ["notebooks", workspaceId] });
      if (activeNotebookId === nb.id && !nb.is_archived) setActiveNotebook(null);
      toast.success(nb.is_archived ? "Notebook restaurado" : "Notebook arquivado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao arquivar");
    }
  };

  const seedSuggestion = async (s: NotebookInput) => {
    try {
      const nb = await create.mutateAsync(s);
      setActiveNotebook(nb.id);
      toast.success(`Notebook "${nb.name}" criado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-lg">Notebooks Temáticos</CardTitle>
            <p className="text-meta text-muted-foreground mt-1">
              Isole conhecimento por contexto: cada notebook tem seus próprios documentos e buscas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Ocultar arquivados" : "Ver arquivados"}
            </Button>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Novo notebook
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {isEmpty ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 p-8 space-y-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-primary" />
                <div>
                  <h3 className="text-body font-semibold">Crie seu primeiro notebook</h3>
                  <p className="text-meta text-muted-foreground">
                    Comece com uma sugestão pronta ou clique em "Novo notebook".
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {NOTEBOOK_SUGGESTIONS.map((s) => {
                  const Ic = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[s.icon ?? "BookOpen"] ?? Icons.BookOpen;
                  return (
                    <Button key={s.name} variant="outline" size="sm" onClick={() => seedSuggestion(s)} className="gap-2"
                      disabled={create.isPending}>
                      <Ic className="h-3.5 w-3.5" style={{ color: `hsl(var(--${s.color}))` }} />
                      {s.name}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((nb) => {
                const Ic = (Icons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[nb.icon] ?? Icons.BookOpen;
                const isActive = activeNotebookId === nb.id;
                return (
                  <div
                    key={nb.id}
                    className={`rounded-xl border p-4 transition-all bg-card ${
                      isActive ? "border-primary shadow-nexus-md" : "border-border/50 hover:border-primary/40"
                    } ${nb.is_archived ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `hsl(var(--${nb.color}) / 0.15)` }}
                        >
                          <Ic className="h-5 w-5" style={{ color: `hsl(var(--${nb.color}))` }} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-body font-semibold truncate">{nb.name}</h4>
                          <p className="text-meta text-muted-foreground truncate">
                            {nb.description || "Sem descrição"}
                          </p>
                        </div>
                      </div>
                      {isActive && <Badge className="text-[10px] shrink-0">Ativo</Badge>}
                    </div>

                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      <Badge variant="outline" className="text-meta">
                        {nb.document_count ?? 0} doc{(nb.document_count ?? 0) === 1 ? "" : "s"}
                      </Badge>
                      {nb.updated_at && (
                        <span className="text-meta text-muted-foreground">
                          {formatDistanceToNow(new Date(nb.updated_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      )}
                      {nb.is_archived && <Badge variant="secondary" className="text-meta">Arquivado</Badge>}
                    </div>

                    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/40">
                      <Button size="sm" variant={isActive ? "default" : "ghost"} onClick={() => setActiveNotebook(nb.id)}
                        disabled={nb.is_archived} className="gap-1.5 flex-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {isActive ? "Ativo" : "Definir ativo"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(nb); setDialogOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleArchive(nb)}>
                        {nb.is_archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <NotebookFormDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}
        initial={editing}
        onSubmit={handleSubmit}
        submitting={create.isPending || update.isPending}
      />
    </div>
  );
}
