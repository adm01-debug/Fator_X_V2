import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Database, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Snapshot = {
  parent_table: string;
  total_partitions: number;
  future_runway_months: number;
  latest_partition: string | null;
  latest_partition_end: string | null;
  total_size_bytes: number;
  total_size_pretty: string;
  largest_partition: string | null;
  largest_partition_bytes: number;
};

const RUNWAY_WARN = 3;
const RUNWAY_CRIT = 1;

export function PartitionHealthCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["partition-health-snapshot"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_partition_health_snapshot" as never
      );
      if (error) throw error;
      return (data ?? []) as unknown as Snapshot[];
    },
    refetchInterval: 60_000,
  });

  const rows = data ?? [];
  const worstRunway = rows.reduce(
    (m, r) => Math.min(m, r.future_runway_months),
    Number.POSITIVE_INFINITY
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          Saúde das partições
        </CardTitle>
        {rows.length > 0 && Number.isFinite(worstRunway) && (
          <Badge
            variant="outline"
            className={
              worstRunway <= RUNWAY_CRIT
                ? "text-destructive border-destructive/40"
                : worstRunway <= RUNWAY_WARN
                ? "text-nexus-amber border-nexus-amber/40"
                : "text-nexus-emerald border-nexus-emerald/40"
            }
          >
            {worstRunway <= RUNWAY_CRIT ? (
              <AlertTriangle className="h-3 w-3 mr-1" />
            ) : (
              <CheckCircle2 className="h-3 w-3 mr-1" />
            )}
            Runway mínimo: {worstRunway} {worstRunway === 1 ? "mês" : "meses"}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Sem permissão</AlertTitle>
            <AlertDescription>
              Requer papel de administrador para consultar a saúde das partições.
            </AlertDescription>
          </Alert>
        ) : rows.length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Nenhuma família particionada</AlertTitle>
            <AlertDescription>
              Ainda não há tabelas particionadas monitoradas.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const runwayColor =
                r.future_runway_months <= RUNWAY_CRIT
                  ? "text-destructive border-destructive/40"
                  : r.future_runway_months <= RUNWAY_WARN
                  ? "text-nexus-amber border-nexus-amber/40"
                  : "text-nexus-emerald border-nexus-emerald/40";
              return (
                <div
                  key={r.parent_table}
                  className="p-3 border rounded-lg bg-card hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium text-body-sm font-mono">
                      {r.parent_table}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {r.total_partitions} partições
                      </Badge>
                      <Badge variant="outline" className={runwayColor}>
                        Runway: {r.future_runway_months}{" "}
                        {r.future_runway_months === 1 ? "mês" : "meses"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-meta text-muted-foreground">
                    <span>Tamanho total: {r.total_size_pretty}</span>
                    <span>
                      Maior:{" "}
                      <span className="font-mono">
                        {r.largest_partition ?? "—"}
                      </span>
                    </span>
                    <span>
                      Última:{" "}
                      <span className="font-mono">
                        {r.latest_partition ?? "—"}
                      </span>
                      {r.latest_partition_end
                        ? ` (até ${formatDistanceToNow(
                            new Date(r.latest_partition_end),
                            { addSuffix: true, locale: ptBR }
                          )})`
                        : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
