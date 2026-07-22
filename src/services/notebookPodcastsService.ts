/**
 * notebookPodcastsService — CRUD + geração/cancelamento de podcasts do Super Cérebro.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { logger } from "@/lib/logger";
import { getCachedSignedUrl } from "@/lib/signedUrlCache";

export interface NotebookPodcast {
  id: string;
  notebook_id: string;
  workspace_id: string;
  title: string;
  script_md: string | null;
  audio_url: string | null;
  audio_path: string | null;
  duration_seconds: number | null;
  voice: string;
  status: "queued" | "generating" | "ready" | "failed" | "canceled";
  error: string | null;
  cancel_requested: boolean;
  content_hash: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const KEY = (nb: string | null) => ["notebook-podcasts", nb] as const;

export function useNotebookPodcasts(notebookId: string | null) {
  return useQuery({
    queryKey: KEY(notebookId),
    enabled: !!notebookId,
    queryFn: async () => {
      const { data, error } = await supabaseExternal
        .from("notebook_podcasts")
        .select("*")
        .eq("notebook_id", notebookId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotebookPodcast[];
    },
    refetchInterval: (query) => {
      const items = query.state.data as NotebookPodcast[] | undefined;
      const hasInFlight = items?.some((p) => p.status === "queued" || p.status === "generating");
      return hasInFlight ? 4000 : false;
    },
  });
}

export function useGeneratePodcast(notebookId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts: { voice?: string; force?: boolean } = {}) => {
      if (!notebookId) throw new Error("Notebook não selecionado");
      const { data, error } = await supabase.functions.invoke("notebook-podcast-generate", {
        body: {
          notebook_id: notebookId,
          voice: opts.voice ?? "alloy",
          force: opts.force ?? false,
        },
      });
      if (error) throw error;
      return data as { podcast: NotebookPodcast; cached: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(notebookId) }),
    onError: (err) => logger.error("Falha ao gerar podcast", err),
  });
}

export function useCancelPodcast(notebookId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (podcastId: string) => {
      const { error } = await supabaseExternal
        .from("notebook_podcasts")
        .update({ cancel_requested: true })
        .eq("id", podcastId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(notebookId) }),
  });
}

export function useDeletePodcast(notebookId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (podcast: NotebookPodcast) => {
      if (podcast.audio_path) {
        await supabaseExternal.storage.from("knowledge-uploads").remove([podcast.audio_path]);
      }
      const { error } = await supabaseExternal
        .from("notebook_podcasts")
        .delete()
        .eq("id", podcast.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(notebookId) }),
  });
}

/** Resolve signed URL cacheado para reprodução. */
export async function resolvePodcastAudioUrl(podcast: NotebookPodcast): Promise<string | null> {
  if (!podcast.audio_path) return null;
  return getCachedSignedUrl("knowledge-uploads", podcast.audio_path);
}
