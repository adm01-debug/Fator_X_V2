/**
 * PodcastPanel — geração/listagem/reprodução de podcasts do notebook ativo.
 * Renderizado dentro do StudioPanel como aba dedicada.
 */
import { useEffect, useState } from "react";
import {
  useNotebookPodcasts,
  useGeneratePodcast,
  useCancelPodcast,
  useDeletePodcast,
  resolvePodcastAudioUrl,
  type NotebookPodcast,
} from "@/services/notebookPodcastsService";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, StopCircle, RefreshCw, Trash2, Play } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  notebookId: string | null;
}

export function PodcastPanel({ notebookId }: Props) {
  const { data: podcasts = [], isLoading } = useNotebookPodcasts(notebookId);
  const gen = useGeneratePodcast(notebookId);
  const cancel = useCancelPodcast(notebookId);
  const del = useDeletePodcast(notebookId);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const ready = podcasts.filter((p) => p.status === "ready" && p.audio_path);
    ready.forEach(async (p) => {
      if (audioUrls[p.id]) return;
      const url = await resolvePodcastAudioUrl(p);
      if (url) setAudioUrls((prev) => ({ ...prev, [p.id]: url }));
    });
  }, [podcasts, audioUrls]);

  const inFlight = podcasts.some((p) => p.status === "queued" || p.status === "generating");

  return (
    <div className="p-3 space-y-3">
      <Button
        onClick={() =>
          gen.mutate(
            { voice: "alloy" },
            {
              onSuccess: (r) => toast.success(r.cached ? "Podcast reutilizado do cache" : "Podcast gerado"),
              onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao gerar"),
            },
          )
        }
        disabled={!notebookId || gen.isPending || inFlight}
        size="sm"
        className="w-full gap-2"
      >
        {gen.isPending || inFlight ? (
          <><Loader2 className="h-3 w-3 animate-spin" /> Gerando podcast…</>
        ) : (
          <><Mic className="h-3 w-3" /> Gerar podcast do notebook</>
        )}
      </Button>

      {isLoading && <p className="text-meta text-muted-foreground">Carregando…</p>}
      {!isLoading && podcasts.length === 0 && (
        <p className="text-meta text-muted-foreground">
          Nenhum podcast ainda. Gere um resumo em áudio das notas e documentos.
        </p>
      )}

      <ul className="space-y-2">
        {podcasts.map((p) => (
          <PodcastRow
            key={p.id}
            podcast={p}
            audioUrl={audioUrls[p.id]}
            onCancel={() => cancel.mutate(p.id)}
            onDelete={() => del.mutate(p)}
            onRegen={() =>
              gen.mutate(
                { voice: p.voice, force: true },
                { onSuccess: () => toast.success("Nova geração iniciada") },
              )
            }
          />
        ))}
      </ul>
    </div>
  );
}

function PodcastRow({
  podcast,
  audioUrl,
  onCancel,
  onDelete,
  onRegen,
}: {
  podcast: NotebookPodcast;
  audioUrl?: string;
  onCancel: () => void;
  onDelete: () => void;
  onRegen: () => void;
}) {
  const statusColor: Record<NotebookPodcast["status"], string> = {
    queued: "text-muted-foreground",
    generating: "text-nexus-primary",
    ready: "text-nexus-success",
    failed: "text-destructive",
    canceled: "text-muted-foreground",
  };

  return (
    <li className="rounded-md border border-border/50 p-2 space-y-2 bg-card/40">
      <div className="flex items-center gap-2">
        <span className={`text-meta font-medium ${statusColor[podcast.status]}`}>
          {podcast.status}
        </span>
        <span className="text-meta text-muted-foreground">
          {formatDistanceToNow(new Date(podcast.created_at), { locale: ptBR, addSuffix: true })}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {podcast.status === "generating" && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCancel} title="Cancelar">
              <StopCircle className="h-3 w-3" />
            </Button>
          )}
          {(podcast.status === "ready" || podcast.status === "failed") && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onRegen} title="Regenerar">
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onDelete} title="Excluir">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {podcast.status === "ready" && audioUrl && (
        <audio controls preload="none" className="w-full h-8" src={audioUrl}>
          <track kind="captions" />
        </audio>
      )}
      {podcast.status === "ready" && !audioUrl && (
        <div className="flex items-center gap-1 text-meta text-muted-foreground">
          <Play className="h-3 w-3" /> preparando áudio…
        </div>
      )}
      {podcast.status === "failed" && podcast.error && (
        <p className="text-meta text-destructive truncate" title={podcast.error}>
          {podcast.error}
        </p>
      )}
    </li>
  );
}
