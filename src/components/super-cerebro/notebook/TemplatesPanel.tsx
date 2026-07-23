/**
 * TemplatesPanel — gerenciamento e uso de templates de nota.
 * Lista templates do workspace (+ notebook), permite criar novo template
 * a partir da nota ativa, editar, excluir (exceto built-ins) e instanciar
 * um novo documento a partir de um template.
 */
import { useState } from "react";
import {
  useTemplates,
  useCreateTemplate,
  useDeleteTemplate,
  instantiateTemplate,
  type NoteTemplate,
} from "@/services/noteTemplatesService";
import { useNote } from "@/services/notesService";
import { useCerebroStore } from "@/stores/cerebroStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FilePlus2, Trash2, Sparkles, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  workspaceId: string;
  collectionId: string;
  activeNoteId: string | null;
  userEmail?: string;
}

export function TemplatesPanel({ workspaceId, collectionId, activeNoteId, userEmail }: Props) {
  const { data: templates = [], isLoading } = useTemplates(workspaceId, collectionId);
  const { data: activeNote } = useNote(activeNoteId);
  const create = useCreateTemplate();
  const del = useDeleteTemplate();
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);

  const [newTitle, setNewTitle] = useState("");
  const [creatingFromNote, setCreatingFromNote] = useState(false);

  async function handleCreateFromNote() {
    if (!activeNote) {
      toast.error("Abra uma nota para transformá-la em template.");
      return;
    }
    const name = prompt("Nome do template:", activeNote.title);
    if (!name?.trim()) return;
    setCreatingFromNote(true);
    try {
      await create.mutateAsync({
        workspace_id: workspaceId,
        collection_id: collectionId,
        name: name.trim(),
        description: null,
        title_pattern: "{{title}}",
        body_md: activeNote.body_md,
        tags: activeNote.tags ?? [],
        scope: "notebook",
      });
      toast.success("Template criado a partir da nota");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar template");
    } finally {
      setCreatingFromNote(false);
    }
  }

  async function handleUse(tpl: NoteTemplate) {
    try {
      const note = await instantiateTemplate({
        template: tpl,
        workspaceId,
        collectionId,
        titleInput: newTitle,
        userEmail,
      });
      setActiveNote(note.id);
      setNewTitle("");
      toast.success(`Nota criada a partir de "${tpl.name}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao instanciar template");
    }
  }

  async function handleDelete(tpl: NoteTemplate) {
    if (tpl.is_builtin) return;
    if (!confirm(`Excluir template "${tpl.name}"?`)) return;
    try {
      await del.mutateAsync(tpl.id);
      toast.success("Template excluído");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    }
  }

  return (
    <div className="p-3 space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="tpl-next-title" className="text-meta font-semibold text-muted-foreground">
          Título para a próxima nota (opcional)
        </label>
        <Input
          id="tpl-next-title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Ex.: Kickoff Projeto X"
          className="h-8 text-meta"
        />
        <p className="text-meta text-muted-foreground">
          Placeholders <code>{"{{title}}"}</code>, <code>{"{{date}}"}</code>, <code>{"{{user}}"}</code> e{" "}
          <code>{"{{weekday}}"}</code> serão substituídos automaticamente.
        </p>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="w-full h-8 text-meta gap-1"
        onClick={handleCreateFromNote}
        disabled={creatingFromNote || !activeNote}
      >
        {creatingFromNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <FilePlus2 className="h-3 w-3" />}
        Criar template a partir da nota ativa
      </Button>

      {isLoading ? (
        <div className="text-meta text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Carregando templates…
        </div>
      ) : templates.length === 0 ? (
        <p className="text-meta text-muted-foreground">
          Nenhum template ainda. Crie um a partir da nota ativa ou use os built-in do workspace.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {templates.map((tpl) => (
            <li
              key={tpl.id}
              className="border border-border/50 rounded-md p-2 hover:bg-secondary/20 space-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-meta font-medium truncate">{tpl.name}</span>
                    {tpl.is_builtin && (
                      <Badge variant="secondary" className="text-meta">built-in</Badge>
                    )}
                    <Badge variant="outline" className="text-meta">{tpl.scope}</Badge>
                  </div>
                  {tpl.description && (
                    <p className="text-meta text-muted-foreground truncate">{tpl.description}</p>
                  )}
                  {tpl.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tpl.tags.slice(0, 4).map((t) => (
                        <Badge key={t} variant="outline" className="text-[9px]">#{t}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-meta gap-1"
                    onClick={() => handleUse(tpl)}
                  >
                    <Sparkles className="h-3 w-3" /> Usar
                  </Button>
                  {!tpl.is_builtin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-meta"
                      onClick={() => handleDelete(tpl)}
                      aria-label="Excluir template"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-2 border-t border-border/50">
        <p className="text-meta text-muted-foreground flex items-center gap-1">
          <Plus className="h-3 w-3" />
          Dica: use o Command Palette (⌘P) → "Nova Daily Note" para criar a nota do dia.
        </p>
      </div>
    </div>
  );
}
