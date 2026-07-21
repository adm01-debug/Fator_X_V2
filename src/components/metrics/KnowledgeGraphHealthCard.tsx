/**
 * KnowledgeGraphHealthCard — score 0-100 do knowledge graph (autograph-style).
 *
 * Sub-scores (cada 0-20):
 *  - orphans_score       : % de entities com relações
 *  - broken_links_score  : % de relations com destino existente
 *  - dedup_score         : ausência de duplicatas por (nome, tipo)
 *  - freshness_score     : % de entities atualizadas em 90 dias
 *  - coverage_score      : % de entities com tipo + tags
 *
 * Fonte: RPC `get_knowledge_graph_health(workspace_id)` que lê a MV
 * `knowledge_graph_health` (refresh diário via pg_cron).
 */
import { useEffect, useState } from "react";
import { HeartPulse, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface HealthRow {
  workspace_id: string;
  orphans_score: number;
  broken_links_score: number;
  dedup_score: number;
  freshness_score: number;
  coverage_score: number;
  total_score: number;
  computed_at: string;
}

interface KnowledgeGraphHealthCardProps {
  workspaceId: string | null | undefined;
}

const SUB_SCORES: Array<{ key: keyof HealthRow; label: string; hint: string }> = [
  { key: "orphans_score", label: "Sem órfãos", hint: "Entidades conectadas por relações" },
  { key: "broken_links_score", label: "Links íntegros", hint: "Relações com destino existente" },
  { key: "dedup_score", label: "Sem duplicatas", hint: "Entidades únicas por nome + tipo" },
  { key: "freshness_score", label: "Frescor", hint: "Atualizadas nos últimos 90 dias" },
  { key: "coverage_score", label: "Cobertura", hint: "Tipo + tags preenchidos" },
];

function scoreTone(total: number): string {
  if (total >= 80) return "text-success";
  if (total >= 60) return "text-warning";
  return "text-destructive";
}

export function KnowledgeGraphHealthCard({ workspaceId }: KnowledgeGraphHealthCardProps) {
  const [data, setData] = useState<HealthRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // @ts-expect-error — RPC nova, gerada no próximo types.ts sync
        const { data: rows, error: rpcErr } = await supabaseExternal.rpc(
          "get_knowledge_graph_health",
          { p_workspace_id: workspaceId },
        );
        if (cancelled) return;
        if (rpcErr) throw rpcErr;
        const row = Array.isArray(rows) ? (rows[0] as HealthRow | undefined) : null;
        setData(row ?? null);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        logger.error("KnowledgeGraphHealthCard rpc failed", { error: msg });
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-primary" />
          Saúde do Knowledge Graph
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Calculando…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-body-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        ) : !data ? (
          <p className="text-meta text-muted-foreground">
            Sem dados ainda — a materialized view roda diariamente. Rode
            <code className="px-1"> select refresh_knowledge_graph_health(); </code>
            para forçar.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-meta text-muted-foreground">Score global</span>
              <span className={cn("text-heading-lg font-heading font-semibold", scoreTone(data.total_score))}>
                {data.total_score.toFixed(1)}
                <span className="text-body-sm text-muted-foreground ml-1">/100</span>
              </span>
            </div>
            <Progress value={data.total_score} className="h-2" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {SUB_SCORES.map(({ key, label, hint }) => {
                const val = Number(data[key] ?? 0);
                return (
                  <div key={String(key)} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm font-medium">{label}</span>
                      <span className="text-body-sm tabular-nums">{val.toFixed(1)}/20</span>
                    </div>
                    <Progress value={(val / 20) * 100} className="h-1.5 mt-2" />
                    <p className="text-meta text-muted-foreground mt-2">{hint}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-meta text-muted-foreground">
              Atualizado em {new Date(data.computed_at).toLocaleString("pt-BR")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
