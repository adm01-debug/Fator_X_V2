/**
 * SlackDlqPanel — Fase 6
 * Mostra estatísticas de DLQ e permite reprocessar/descartar itens.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { AlertTriangle, RefreshCw, Trash2, Play } from "lucide-react";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { logger } from "@/lib/logger";

interface DlqStats {
  workspace_id: string;
  pending: number;
  dead: number;
  resolved: number;
  oldest_pending_at: string | null;
  max_attempts: number | null;
}

export function SlackDlqPanel() {
  const { workspaceId } = useCurrentWorkspace();
  const qc = useQueryClient();

  const statsQuery = useQuery({
    queryKey: ["slack", "dlq-stats", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<DlqStats | null> => {
      const { data, error } = await supabase
        .from("slack_dlq_stats" as never)
        .select("*")
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return (data as DlqStats | null) ?? null;
    },
  });

  const retryNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("slack-dlq-retry", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      toast.success(`Reprocessados: ${(d as { processed?: number })?.processed ?? 0}`);
      qc.invalidateQueries({ queryKey: ["slack", "dlq-stats", workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha no retry"),
  });

  const discardDead = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("slack-dlq-discard", {
        body: { workspace_id: workspaceId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      toast.success(`Descartados: ${(d as { discarded?: number })?.discarded ?? 0}`);
      qc.invalidateQueries({ queryKey: ["slack", "dlq-stats", workspaceId] });
    },
    onError: (err) => {
      logger.error("dlq discard failed", { error: err instanceof Error ? err.message : String(err) });
      toast.error(err instanceof Error ? err.message : "Falha ao descartar");
    },
  });

  const s = statsQuery.data;
  const hasDead = (s?.dead ?? 0) > 0;
  const hasPending = (s?.pending ?? 0) > 0;

  return (
    <Card className={hasDead ? "border-destructive/50" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-body">
          <AlertTriangle className={hasDead ? "h-4 w-4 text-destructive" : "h-4 w-4 text-muted-foreground"} />
          Fila de retentativas Slack (DLQ)
        </CardTitle>
        <CardDescription>Monitoramento e reprocessamento de despachos falhados.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pendentes" value={s?.pending ?? 0} tone={hasPending ? "warning" : "muted"} />
          <Stat label="Mortos" value={s?.dead ?? 0} tone={hasDead ? "danger" : "muted"} />
          <Stat label="Resolvidos" value={s?.resolved ?? 0} tone="success" />
        </div>
        {s?.oldest_pending_at && (
          <div className="text-meta text-muted-foreground">
            Mais antigo pendente: {new Date(s.oldest_pending_at).toLocaleString("pt-BR")}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => retryNow.mutate()}
            disabled={retryNow.isPending || !hasPending}
          >
            <Play className="h-3.5 w-3.5 mr-1" />
            Reprocessar agora
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => statsQuery.refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Atualizar
          </Button>
          {hasDead && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => discardDead.mutate()}
              disabled={discardDead.isPending}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Descartar mortos
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "muted" | "warning" | "danger" | "success" }) {
  const cls =
    tone === "danger" ? "text-destructive" :
    tone === "warning" ? "text-nexus-amber" :
    tone === "success" ? "text-nexus-emerald" : "text-muted-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="text-meta text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
