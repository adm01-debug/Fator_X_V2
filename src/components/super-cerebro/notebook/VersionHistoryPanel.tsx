/**
 * VersionHistoryPanel — lista snapshots da nota, permite ver diff contra
 * o estado atual e restaurar uma versão anterior (com snapshot automático
 * do estado atual antes da sobrescrita).
 */
import { useState } from "react";
import { useVersions, useRestoreVersion, diffAgainstCurrent, type DiffLine } from "@/services/noteVersionsService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, RotateCcw, GitCompare, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  noteId: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function VersionHistoryPanel({ noteId }: Props) {
  const { data: versions = [], isLoading } = useVersions(noteId);
  const restore = useRestoreVersion();
  const [diffing, setDiffing] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffLine[] | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string>("");

  async function handleDiff(versionId: string, title: string) {
    setDiffing(versionId);
    setSelectedTitle(title);
    try {
      const lines = await diffAgainstCurrent(versionId);
      setDiff(lines);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao calcular diff");
    } finally {
      setDiffing(null);
    }
  }

  async function handleRestore(versionId: string) {
    if (!confirm("Restaurar esta versão? O estado atual será salvo como uma nova versão antes.")) return;
    try {
      await restore.mutateAsync(versionId);
      toast.success("Versão restaurada");
      setDiff(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao restaurar");
    }
  }

  if (isLoading) {
    return (
      <div className="p-3 text-meta text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando histórico…
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="p-3 text-meta text-muted-foreground">
        <History className="h-3 w-3 inline mr-1" />
        Nenhuma versão histórica ainda. Snapshots são criados automaticamente a cada edição.
      </div>
    );
  }

  if (diff) {
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-meta font-semibold">
            Diff: {selectedTitle} → atual
          </span>
          <Button size="sm" variant="ghost" onClick={() => setDiff(null)} className="h-6 text-meta">
            Voltar
          </Button>
        </div>
        <pre className="text-meta font-mono bg-secondary/30 rounded p-2 max-h-[420px] overflow-auto whitespace-pre-wrap">
          {diff.map((l, i) => (
            <div
              key={i}
              className={
                l.kind === "added"
                  ? "text-nexus-emerald"
                  : l.kind === "removed"
                    ? "text-nexus-red"
                    : "text-muted-foreground"
              }
            >
              {l.kind === "added" ? "+ " : l.kind === "removed" ? "- " : "  "}
              {l.text || " "}
            </div>
          ))}
        </pre>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/50">
      {versions.map((v) => (
        <li key={v.id} className="p-3 flex items-start justify-between gap-2 hover:bg-secondary/20">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-meta">
              <Badge variant="outline" className="text-meta">v{v.version_number}</Badge>
              <span className="font-medium truncate">{v.title}</span>
            </div>
            <p className="text-meta text-muted-foreground mt-0.5">{formatDate(v.created_at)}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-meta gap-1"
              onClick={() => handleDiff(v.id, `v${v.version_number}`)}
              disabled={diffing === v.id}
            >
              {diffing === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitCompare className="h-3 w-3" />}
              Diff
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-meta gap-1"
              onClick={() => handleRestore(v.id)}
              disabled={restore.isPending}
            >
              <RotateCcw className="h-3 w-3" /> Restaurar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
