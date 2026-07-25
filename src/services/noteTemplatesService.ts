/**
 * noteTemplatesService — CRUD e hooks React Query para
 * `notebook_note_templates`, além do utilitário para instanciar
 * uma nova nota a partir de um template.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { applyTemplate, todayIso } from "@/lib/templateEngine";
import { createNote, updateNote, type NotebookNote } from "@/services/notesService";

export interface NoteTemplate {
  id: string;
  workspace_id: string;
  collection_id: string | null;
  name: string;
  description: string | null;
  title_pattern: string;
  body_md: string;
  tags: string[];
  scope: "workspace" | "notebook";
  is_builtin: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listTemplates(
  workspaceId: string,
  collectionId?: string | null,
): Promise<NoteTemplate[]> {
  let q = supabaseExternal
    .from("notebook_note_templates")
    .select("*")
    .eq("workspace_id", workspaceId);
  if (collectionId) {
    q = q.or(`collection_id.eq.${collectionId},collection_id.is.null`);
  }
  const { data, error } = await q.order("is_builtin", { ascending: false }).order("name");
  if (error) throw error;
  return (data ?? []) as NoteTemplate[];
}

export async function createTemplate(
  input: Omit<NoteTemplate, "id" | "created_at" | "updated_at" | "is_builtin" | "created_by">,
): Promise<NoteTemplate> {
  const { data, error } = await supabaseExternal
    .from("notebook_note_templates")
    .insert({ ...input, is_builtin: false })
    .select("*")
    .single();
  if (error) throw error;
  return data as NoteTemplate;
}

export async function updateTemplate(
  id: string,
  patch: Partial<Pick<NoteTemplate, "name" | "description" | "title_pattern" | "body_md" | "tags" | "scope" | "collection_id">>,
): Promise<NoteTemplate> {
  const { data, error } = await supabaseExternal
    .from("notebook_note_templates")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as NoteTemplate;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabaseExternal.from("notebook_note_templates").delete().eq("id", id);
  if (error) throw error;
}

// ─── Instanciação a partir do template ────────────────────────────────
export async function instantiateTemplate(params: {
  template: NoteTemplate;
  workspaceId: string;
  collectionId: string;
  titleInput?: string;
  userEmail?: string;
}): Promise<NotebookNote> {
  const ctx = {
    title: params.titleInput?.trim() || params.template.name,
    user: params.userEmail ?? "",
  };
  const title = applyTemplate(params.template.title_pattern, ctx);
  const body = applyTemplate(params.template.body_md, ctx);
  const note = await createNote({
    workspaceId: params.workspaceId,
    collectionId: params.collectionId,
    title,
    body_md: body,
  });
  if (params.template.tags.length > 0) {
    await updateNote(note.id, { tags: params.template.tags });
  }
  return note;
}

// ─── Daily Note ───────────────────────────────────────────────────────
export async function openOrCreateDailyNote(params: {
  workspaceId: string;
  collectionId: string;
  userEmail?: string;
}): Promise<NotebookNote> {
  const today = todayIso();
  const { data: existing, error: findErr } = await supabaseExternal
    .from("notebook_notes")
    .select("*")
    .eq("collection_id", params.collectionId)
    .eq("is_daily", true)
    .eq("note_date", today)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing as NotebookNote;

  // Procurar template Daily Note built-in do workspace
  const { data: tpl } = await supabaseExternal
    .from("notebook_note_templates")
    .select("*")
    .eq("workspace_id", params.workspaceId)
    .eq("name", "Daily Note")
    .maybeSingle();

  const template = (tpl as NoteTemplate | null) ?? {
    id: "",
    workspace_id: params.workspaceId,
    collection_id: null,
    name: "Daily Note",
    description: null,
    title_pattern: "{{date}}",
    body_md: `# {{date}}\n\n## 🎯 Foco do dia\n- \n\n## ✅ Tarefas\n- [ ] \n`,
    tags: ["daily"],
    scope: "workspace" as const,
    is_builtin: true,
    created_by: null,
    created_at: "",
    updated_at: "",
  };

  const note = await instantiateTemplate({
    template,
    workspaceId: params.workspaceId,
    collectionId: params.collectionId,
    userEmail: params.userEmail,
  });

  const { data: updated, error: upErr } = await supabaseExternal
    .from("notebook_notes")
    .update({ is_daily: true, note_date: today })
    .eq("id", note.id)
    .select("*")
    .single();
  if (upErr) {
    logger.warn("daily.mark.failed", { error: upErr.message });
    return note;
  }
  try {
    await supabase.rpc("log_audit_entry", {
      p_action: "note.daily.opened",
      p_entity_type: "note",
      p_entity_id: note.id,
      p_metadata: { date: today },
    });
  } catch {
    /* audit best-effort */
  }
  return updated as NotebookNote;
}

// ─── React Query hooks ────────────────────────────────────────────────
export function useTemplates(workspaceId: string | null, collectionId: string | null) {
  return useQuery({
    queryKey: ["note-templates", workspaceId, collectionId],
    queryFn: () =>
      workspaceId ? listTemplates(workspaceId, collectionId) : Promise.resolve([]),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["note-templates"] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof updateTemplate>[1] }) =>
      updateTemplate(v.id, v.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["note-templates"] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["note-templates"] }),
  });
}
