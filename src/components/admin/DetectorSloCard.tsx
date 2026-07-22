/**
 * DetectorSloCard — Fase 14
 * Painel SLO dos jobs de detecção: detector de tendência + 3 smoke tests.
 * Admin-only via RPC public.get_detector_slo_status().
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Gauge } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SloRow {
  job_name: string;
  schedule: string;
  active: boolean;
  last_run_at: string | null;
  last_status: string;
  seconds_since_last_run: number | null;
  slo_ok: boolean;
}

const LABELS: Record<string, string> = {
  "detect-health-trend-every-15min": "Detector de tendências",
  "smoke-test-health-alerts-every-6h": "Smoke: slow-query spike",
  "smoke-test-wal-every-6h": "Smoke: crescimento de WAL",
  "smoke-test-conn-every-6h": "Smoke: saturação de conexões",
};

export function DetectorSloCard() {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["detector-slo-status"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<SloRow[]> => {
      const { data, error } = await supabase.rpc("get_detector_slo_status" as never);
      if (error) throw error;
      return (data ?? []) as unknown as SloRow[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-nexus-primary" />
          SLO dos detectores
        </CardTitle>
        <CardDescription>
          Última execução de cada job de detecção e auto-teste. SLO = 2× a cadência agendada.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {error && (
          <p className="text-sm text-destructive">
            Sem permissão ou falha na leitura. Requer admin do workspace.
          </p>
        )}
        {!isLoading && !error && (
          <ul className="space-y-2">
            {data.map((row) => (
              <li
                key={row.job_name}
                className="flex items-center justify-between gap-3 rounded border p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {row.slo_ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {LABELS[row.job_name] ?? row.job_name}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {row.schedule} · {row.active ? "ativo" : "inativo"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={row.last_status === "succeeded" ? "outline" : "destructive"}>
                    {row.last_status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {row.last_run_at
                      ? formatDistanceToNow(new Date(row.last_run_at), { addSuffix: true, locale: ptBR })
                      : "nunca"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
