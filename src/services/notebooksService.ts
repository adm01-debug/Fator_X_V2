/**
 * notebooksService — CRUD para "Notebooks Temáticos" do Super Cérebro.
 * Modelo: cada notebook é uma linha em `public.collections`, escopado por workspace.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export interface Notebook {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  is_archived: boolean;
  workspace_id: string | null;
  knowledge_base_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  document_count?: number;
}

export interface NotebookInput {
  name: string;
  description?: string | null;
  icon?: string;
  color?: string;
  knowledge_base_id?: string | null;
}

export const NOTEBOOK_PALETTE = [
  { name: "Azul Nexus", value: "nexus-primary" },
  { name: "Esmeralda", value: "nexus-emerald" },
  { name: "Âmbar", value: "nexus-amber" },
  { name: "Violeta", value: "nexus-violet" },
  { name: "Rosa", value: "nexus-pink" },
  { name: "Ciano", value: "nexus-cyan" },
];

export const NOTEBOOK_ICONS = [
  "BookOpen", "Briefcase", "Scale", "Users", "DollarSign",
  "Package", "Heart", "Rocket", "Shield", "Wrench", "Cpu", "GraduationCap",
];

export const NOTEBOOK_SUGGESTIONS: NotebookInput[] = [
  { name: "Comercial", description: "Propostas, cotações, negociações e clientes.", icon: "Briefcase", color: "nexus-primary" },
  { name: "Jurídico", description: "Contratos, pareceres e compliance.", icon: "Scale", color: "nexus-amber" },
  { name: "Financeiro", description: "Balanços, notas, políticas de custo.", icon: "DollarSign", color: "nexus-emerald" },
  { name: "RH", description: "Políticas, colaboradores, treinamentos.", icon: "Users", color: "nexus-violet" },
  { name: "Produto", description: "Especificações, roadmap, changelog.", icon: "Rocket", color: "nexus-cyan" },
];

async function ensureWorkspaceKb(workspaceId: string): Promise<string> {
  const { data: kb } = await supabaseExternal
    .from("knowledge_bases")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1)
    .maybeSingle();
  if (kb?.id) return kb.id as string;
  const { data: created, error } = await supabaseExternal
    .from("knowledge_bases")
    .insert({ workspace_id: workspaceId, name: "Super Cérebro", description: "KB padrão" })
    .select("id")
    .single();
  if (error) throw error;
  return created!.id as string;
}

export async function listNotebooks(workspaceId: string | null): Promise<Notebook[]> {
  if (!workspaceId) return [];
  const { data, error } = await supabaseExternal
    .from("collections")
    .select("id,name,description,icon,color,is_archived,workspace_id,knowledge_base_id,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .order("is_archived", { ascending: true })
    .order("name");
  if (error) throw error;
  const notebooks = (data ?? []) as Notebook[];

  // Contagem de documentos por notebook (best-effort, um único round-trip)
  const ids = notebooks.map((n) => n.id);
  if (ids.length > 0) {
    const { data: docs } = await supabaseExternal
      .from("documents")
      .select("collection_id")
      .in("collection_id", ids);
    const counts = new Map<string, number>();
    for (const row of (docs ?? []) as Array<{ collection_id: string | null }>) {
      if (row.collection_id) counts.set(row.collection_id, (counts.get(row.collection_id) ?? 0) + 1);
    }
    for (const n of notebooks) n.document_count = counts.get(n.id) ?? 0;
  }
  return notebooks;
}

export async function createNotebook(workspaceId: string, input: NotebookInput): Promise<Notebook> {
  const kbId = input.knowledge_base_id ?? (await ensureWorkspaceKb(workspaceId));
  const { data, error } = await supabaseExternal
    .from("collections")
    .insert({
      workspace_id: workspaceId,
      knowledge_base_id: kbId,
      name: input.name.trim(),
      description: input.description ?? null,
      icon: input.icon ?? "BookOpen",
      color: input.color ?? "nexus-primary",
    })
    .select("*")
    .single();
  if (error) throw error;
  await logAudit("notebook.created", data!.id, { name: input.name });
  return data as Notebook;
}

export async function updateNotebook(id: string, patch: Partial<NotebookInput> & { is_archived?: boolean }): Promise<Notebook> {
  const { data, error } = await supabaseExternal
    .from("collections")
    .update({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.icon !== undefined && { icon: patch.icon }),
      ...(patch.color !== undefined && { color: patch.color }),
      ...(patch.is_archived !== undefined && { is_archived: patch.is_archived }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  await logAudit("notebook.updated", id, patch);
  return data as Notebook;
}

export async function archiveNotebook(id: string, archived = true): Promise<void> {
  await updateNotebook(id, { is_archived: archived });
}

async function logAudit(action: string, resourceId: string, meta: Record<string, unknown>): Promise<void> {
  try {
    await supabase.rpc("log_audit_entry", {
      p_action: action,
      p_resource_type: "notebook",
      p_resource_id: resourceId,
      p_metadata: JSON.parse(JSON.stringify(meta)),
    });
  } catch (e) {
    logger.warn("audit.notebook.failed", { action, error: e instanceof Error ? e.message : String(e) });
  }
}

// ─── React Query hooks ────────────────────────────────────────────────
export function useNotebooks(workspaceId: string | null) {
  return useQuery({
    queryKey: ["notebooks", workspaceId],
    queryFn: () => listNotebooks(workspaceId),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useCreateNotebook(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NotebookInput) => {
      if (!workspaceId) throw new Error("Workspace não carregado");
      return createNotebook(workspaceId, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notebooks", workspaceId] }),
  });
}

export function useUpdateNotebook(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<NotebookInput> & { is_archived?: boolean } }) =>
      updateNotebook(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notebooks", workspaceId] }),
  });
}
