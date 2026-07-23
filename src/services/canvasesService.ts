/**
 * canvasesService — CRUD para `notebook_canvases` (whiteboards).
 * Cada canvas guarda nodes/edges/viewport em JSONB e é escopado por workspace.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export interface CanvasNodeData {
  id: string;
  type: "note" | "text" | "image";
  position: { x: number; y: number };
  data: {
    label?: string;
    body?: string;
    noteId?: string | null;
    imageUrl?: string | null;
    color?: string;
    width?: number;
    height?: number;
  };
}

export interface CanvasEdgeData {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface NotebookCanvas {
  id: string;
  notebook_id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  description: string | null;
  nodes: CanvasNodeData[];
  edges: CanvasEdgeData[];
  viewport: CanvasViewport;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

const KEY = (notebookId: string | null) => ["canvases", notebookId];

export function useCanvases(notebookId: string | null) {
  return useQuery({
    queryKey: KEY(notebookId),
    enabled: !!notebookId,
    queryFn: async (): Promise<NotebookCanvas[]> => {
      const { data, error } = await supabaseExternal
        .from("notebook_canvases")
        .select("*")
        .eq("notebook_id", notebookId!)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as NotebookCanvas[];
    },
  });
}

export function useCanvas(canvasId: string | null) {
  return useQuery({
    queryKey: ["canvas", canvasId],
    enabled: !!canvasId,
    queryFn: async (): Promise<NotebookCanvas | null> => {
      const { data, error } = await supabaseExternal
        .from("notebook_canvases")
        .select("*")
        .eq("id", canvasId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as NotebookCanvas) ?? null;
    },
  });
}

export function useCreateCanvas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      notebookId: string;
      workspaceId: string;
      name?: string;
    }): Promise<NotebookCanvas> => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) throw new Error("Não autenticado");
      const { data, error } = await supabaseExternal
        .from("notebook_canvases")
        .insert({
          notebook_id: input.notebookId,
          workspace_id: input.workspaceId,
          created_by: uid,
          name: input.name ?? "Novo canvas",
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        })
        .select("*")
        .single();
      if (error) throw error;
      logger.info("cerebro.canvas.created", { canvas_id: data.id });
      return data as unknown as NotebookCanvas;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: KEY(row.notebook_id) });
    },
  });
}

export function useUpdateCanvas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<Pick<NotebookCanvas, "name" | "description" | "nodes" | "edges" | "viewport" | "is_archived">>;
    }): Promise<NotebookCanvas> => {
      const { data, error } = await supabaseExternal
        .from("notebook_canvases")
        .update(input.patch)
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as NotebookCanvas;
    },
    onSuccess: (row) => {
      qc.setQueryData(["canvas", row.id], row);
      qc.invalidateQueries({ queryKey: KEY(row.notebook_id) });
    },
  });
}

export function useDeleteCanvas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; notebookId: string }) => {
      const { error } = await supabaseExternal
        .from("notebook_canvases")
        .delete()
        .eq("id", input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: KEY(input.notebookId) });
    },
  });
}
