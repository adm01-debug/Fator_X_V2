/**
 * DbHealthCard — Fase 7
 * Snapshot de saúde do banco (WAL, conexões, long queries, bloat).
 * Admin-only: RPC get_db_health_snapshot valida via workspace_members.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Database, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LongQuery {
  pid: number;
  duration_sec: number;
  state: string;
  query_preview: string;
}
interface BloatedTable {
  table: string;
  dead_tuples: number;
  live_tuples: number;
  dead_ratio: number;
}
interface SlowQuery {
  mean_ms: number;
  calls: number;
  total_sec: number;
  query_preview: string;
}
interface HealthSnapshot {
  captured_at: string;
  wal_bytes: number;
  connections_used: number;
  connections_max: number;
  connections_pct: number;
  long_running_queries: LongQuery[];
  bloated_tables: BloatedTable[];
  slow_queries?: SlowQuery[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function DbHealthCard() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["db-health-snapshot"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<HealthSnapshot | null> => {
      const { data, error } = await supabase.rpc("get_db_health_snapshot" as never);
      if (error) throw error;
      return data as unknown as HealthSnapshot;
    },
  });

  const connPctTone =
    !data ? "muted"
    : data.connections_pct >= 80 ? "danger"
    : data.connections_pct >= 60 ? "warning"
    : "success";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-nexus-primary" />
            Saúde do banco de dados
          </CardTitle>
          <CardDescription>
            Snapshot em tempo real: WAL, conexões, consultas longas e bloat.
          </CardDescription>
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <Activity className={isFetching ? "h-3.5 w-3.5 animate-pulse" : "h-3.5 w-3.5"} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {error && (
          <p className="text-sm text-destructive">
            Sem permissão ou falha na leitura. Requer admin do workspace.
          </p>
        )}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Metric
                label="WAL total"
                value={formatBytes(data.wal_bytes)}
                tone="muted"
              />
              <Metric
                label="Conexões"
                value={`${data.connections_used} / ${data.connections_max} (${data.connections_pct}%)`}
                tone={connPctTone}
              />
            </div>

            <section>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Consultas longas (&gt; 5 min)
              </h4>
              {data.long_running_queries.length === 0 ? (
                <p className="text-xs text-emerald-500">Nenhuma consulta longa detectada.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.long_running_queries.map((q) => (
                    <li key={q.pid} className="rounded border p-2">
                      <div className="flex justify-between">
                        <span className="font-mono">PID {q.pid}</span>
                        <Badge variant="destructive">{q.duration_sec}s</Badge>
                      </div>
                      <code className="text-[10px] text-muted-foreground line-clamp-2">
                        {q.query_preview}
                      </code>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Tabelas com bloat (&gt; 20% dead tuples)
              </h4>
              {data.bloated_tables.length === 0 ? (
                <p className="text-xs text-emerald-500">Nenhuma tabela com bloat crítico.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.bloated_tables.map((t) => (
                    <li key={t.table} className="flex justify-between rounded border p-2">
                      <span className="font-mono">{t.table}</span>
                      <Badge variant="outline">{t.dead_ratio}%</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="text-[10px] text-muted-foreground">
              Capturado em {new Date(data.captured_at).toLocaleString("pt-BR")}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "muted" | "warning" | "danger" | "success" }) {
  const cls =
    tone === "danger" ? "text-destructive" :
    tone === "warning" ? "text-amber-500" :
    tone === "success" ? "text-emerald-500" : "text-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
