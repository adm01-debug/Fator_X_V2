/**
 * notesService — CRUD para `notebook_notes` + sincronização de `knowledge_links`
 * (backlinks estilo Obsidian). Também expõe hooks React Query.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { extractLinks, type ParsedWikilink, type WikilinkTargetType } from "@/lib/wikilink";

export interface NotebookNote {
  id: string;
  workspace_id: string;
  collection_id: string;
  title: string;
  body_md: string;
  tags: string[];
  created_by: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeLink {
  id: string;
  workspace_id: string;
  source_type: "note" | "document" | "entity" | "chunk";
  source_id: string;
  target_type: "note" | "document" | "entity" | "chunk" | "tag";
  target_id: string | null;
  target_label: string | null;
  link_kind: "wikilink" | "mention" | "tag" | "semantic" | "manual";
  context: string | null;
  created_at: string;
}

// ─── CRUD ──────────────────────────────────────────────────────────────
export async function listNotes(collectionId: string): Promise<NotebookNote[]> {
  const { data, error } = await supabaseExternal
    .from("notebook_notes")
    .select("*")
    .eq("collection_id", collectionId)
    .order("is_archived", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as NotebookNote[];
}

export async function getNote(id: string): Promise<NotebookNote | null> {
  const { data, error } = await supabaseExternal
    .from("notebook_notes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as NotebookNote | null) ?? null;
}

export async function createNote(input: {
  workspaceId: string;
  collectionId: string;
  title: string;
  body_md?: string;
}): Promise<NotebookNote> {
  const { data, error } = await supabaseExternal
    .from("notebook_notes")
    .insert({
      workspace_id: input.workspaceId,
      collection_id: input.collectionId,
      title: input.title.trim() || "Nova nota",
      body_md: input.body_md ?? "",
    })
    .select("*")
    .single();
  if (error) throw error;
  await logAudit("note.created", data!.id, { title: input.title });
  return data as NotebookNote;
}

export async function updateNote(
  id: string,
  patch: Partial<Pick<NotebookNote, "title" | "body_md" | "tags" | "is_archived">>,
): Promise<NotebookNote> {
  const { data, error } = await supabaseExternal
    .from("notebook_notes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as NotebookNote;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabaseExternal.from("notebook_notes").delete().eq("id", id);
  if (error) throw error;
  await logAudit("note.deleted", id, {});
}

// ─── Link sync ─────────────────────────────────────────────────────────

/** Resolve label→id conforme tipo dentro do escopo do workspace/notebook. */
async function resolveTarget(
  _workspaceId: string,
  collectionId: string,
  link: ParsedWikilink,
): Promise<{ id: string | null; label: string }> {
  const label = link.label.trim();
  if (link.targetType === "note") {
    const { data } = await supabaseExternal
      .from("notebook_notes")
      .select("id")
      .eq("collection_id", collectionId)
      .ilike("title", label)
      .limit(1)
      .maybeSingle();
    return { id: (data?.id as string | undefined) ?? null, label };
  }
  if (link.targetType === "document") {
    const { data } = await supabaseExternal
      .from("documents")
      .select("id")
      .ilike("title", `%${label}%`)
      .limit(1)
      .maybeSingle();
    return { id: (data?.id as string | undefined) ?? null, label };
  }
  if (link.targetType === "entity") {
    const { data } = await supabaseExternal
      .from("knowledge_entities")
      .select("id")
      .ilike("name", label)
      .limit(1)
      .maybeSingle();
    return { id: (data?.id as string | undefined) ?? null, label };
  }
  return { id: null, label };
}

const TYPE_MAP: Record<WikilinkTargetType, KnowledgeLink["target_type"]> = {
  note: "note",
  document: "document",
  entity: "entity",
  tag: "tag",
};

/**
 * Reprocessa a rede de links da nota: apaga arestas antigas e insere as
 * novas com base no markdown atual. Também sincroniza `tags` na própria
 * nota (persistência denormalizada para filtros rápidos).
 */
export async function syncNoteLinks(note: NotebookNote): Promise<void> {
  const { wikilinks, tags } = extractLinks(note.body_md);

  await supabaseExternal
    .from("knowledge_links")
    .delete()
    .eq("source_type", "note")
    .eq("source_id", note.id);

  const rows: Array<Omit<KnowledgeLink, "id" | "created_at">> = [];
  for (const l of wikilinks) {
    const { id, label } = await resolveTarget(note.workspace_id, note.collection_id, l);
    rows.push({
      workspace_id: note.workspace_id,
      source_type: "note",
      source_id: note.id,
      target_type: TYPE_MAP[l.targetType],
      target_id: id,
      target_label: label,
      link_kind: "wikilink",
      context: l.context,
    });
  }
  for (const t of tags) {
    rows.push({
      workspace_id: note.workspace_id,
      source_type: "note",
      source_id: note.id,
      target_type: "tag",
      target_id: null,
      target_label: t,
      link_kind: "tag",
      context: null,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabaseExternal.from("knowledge_links").insert(rows);
    if (error) logger.warn("syncNoteLinks.insert.failed", { error: error.message });
  }

  // Persistir tags denormalizadas na nota
  if (JSON.stringify(tags) !== JSON.stringify(note.tags ?? [])) {
    await supabaseExternal.from("notebook_notes").update({ tags }).eq("id", note.id);
  }

  await logAudit("note.linked", note.id, { wikilinks: wikilinks.length, tags: tags.length });
}

// ─── Backlinks ─────────────────────────────────────────────────────────
export interface Backlink {
  id: string;
  source_type: KnowledgeLink["source_type"];
  source_id: string;
  source_title: string;
  link_kind: KnowledgeLink["link_kind"];
  context: string | null;
  created_at: string;
}

export async function listBacklinks(targetType: "note" | "document", targetId: string): Promise<Backlink[]> {
  const { data, error } = await supabaseExternal
    .from("knowledge_links")
    .select("id, source_type, source_id, link_kind, context, created_at")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Array<Omit<Backlink, "source_title">>;
  if (rows.length === 0) return [];

  // Hidratar títulos das notas de origem (documento raramente é source)
  const noteIds = rows.filter((r) => r.source_type === "note").map((r) => r.source_id);
  const docIds = rows.filter((r) => r.source_type === "document").map((r) => r.source_id);
  const titles = new Map<string, string>();

  if (noteIds.length > 0) {
    const { data: notes } = await supabaseExternal
      .from("notebook_notes")
      .select("id,title")
      .in("id", noteIds);
    for (const n of (notes ?? []) as Array<{ id: string; title: string }>) titles.set(n.id, n.title);
  }
  if (docIds.length > 0) {
    const { data: docs } = await supabaseExternal
      .from("documents")
      .select("id,title")
      .in("id", docIds);
    for (const d of (docs ?? []) as Array<{ id: string; title: string }>) titles.set(d.id, d.title);
  }

  return rows.map((r) => ({ ...r, source_title: titles.get(r.source_id) ?? "(sem título)" }));
}

// ─── Auditoria ─────────────────────────────────────────────────────────
async function logAudit(action: string, resourceId: string, meta: Record<string, unknown>): Promise<void> {
  try {
    await supabase.rpc("log_audit_entry", {
      p_action: action,
      p_entity_type: "note",
      p_entity_id: resourceId,
      p_metadata: JSON.parse(JSON.stringify(meta)),
    });
  } catch (e) {
    logger.warn("audit.note.failed", { action, error: e instanceof Error ? e.message : String(e) });
  }
}

// ─── React Query hooks ────────────────────────────────────────────────
export function useNotes(collectionId: string | null) {
  return useQuery({
    queryKey: ["notes", collectionId],
    queryFn: () => (collectionId ? listNotes(collectionId) : Promise.resolve([])),
    enabled: !!collectionId,
    staleTime: 15_000,
  });
}

export function useNote(id: string | null) {
  return useQuery({
    queryKey: ["note", id],
    queryFn: () => (id ? getNote(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useBacklinks(targetType: "note" | "document", targetId: string | null) {
  return useQuery({
    queryKey: ["backlinks", targetType, targetId],
    queryFn: () => (targetId ? listBacklinks(targetType, targetId) : Promise.resolve([])),
    enabled: !!targetId,
    staleTime: 15_000,
  });
}

export function useCreateNote(collectionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { workspaceId: string; title: string; body_md?: string }) => {
      if (!collectionId) throw new Error("Notebook não selecionado");
      return createNote({ ...input, collectionId });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", collectionId] }),
  });
}

export function useUpdateNote(collectionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, syncLinks }: { id: string; patch: Partial<NotebookNote>; syncLinks?: boolean }) => {
      const updated = await updateNote(id, patch);
      if (syncLinks) await syncNoteLinks(updated);
      return updated;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["notes", collectionId] });
      qc.invalidateQueries({ queryKey: ["note", n.id] });
      qc.invalidateQueries({ queryKey: ["backlinks"] });
    },
  });
}
