/**
 * SlackHealthCard
 * Mostra métricas de despacho Slack nas últimas 24h por workspace.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Activity, CheckCircle2, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface HealthRow {
  workspace_id: string;
  successes: number;
  failures: number;
  total_dispatches: number;
  last_dispatch_at: string | null;
}

export function SlackHealthCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["slack-dispatch-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slack_dispatch_health" as never)
        .select("*")
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data ?? null) as HealthRow | null;
    },
    refetchInterval: 60_000,
  });

  const total = data?.total_dispatches ?? 0;
  const failures = data?.failures ?? 0;
  const successes = data?.successes ?? 0;
  const errorRate = total > 0 ? (failures / total) * 100 : 0;
  const isDegraded = errorRate > 5;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-body">
          <Activity className="h-4 w-4" />
          Saúde do Despacho Slack — 24h
        </CardTitle>
        <CardDescription>
          Métricas em tempo real de alertas enviados ao Slack.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-body-sm text-muted-foreground">Carregando…</div>
        ) : total === 0 ? (
          <div className="text-body-sm text-muted-foreground">
            Nenhum despacho registrado nas últimas 24h.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <MetricBlock
              label="Sucessos"
              value={successes}
              icon={<CheckCircle2 className="h-4 w-4 text-nexus-emerald" />}
            />
            <MetricBlock
              label="Falhas"
              value={failures}
              icon={<AlertCircle className={`h-4 w-4 ${isDegraded ? "text-destructive" : "text-muted-foreground"}`} />}
            />
            <MetricBlock
              label="Taxa de erro"
              value={`${errorRate.toFixed(1)}%`}
              highlight={isDegraded ? "destructive" : undefined}
            />
            {data?.last_dispatch_at && (
              <div className="col-span-3 text-meta text-muted-foreground">
                Último despacho{" "}
                {formatDistanceToNow(new Date(data.last_dispatch_at), {
                  addSuffix: true,
                  locale: ptBR,
                })}
                .
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricBlock({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  highlight?: "destructive";
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-meta text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          highlight === "destructive" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
