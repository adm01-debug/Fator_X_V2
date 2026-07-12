import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabaseExternal } from "@/integrations/supabase/externalClient";

interface RollbackStats {
  commits: number;
  rollbacks: number;
  rollback_rate_pct: number;
  deadlocks: number;
}

interface RatePerMin {
  rate_per_min: number;
  rollback_delta: number;
  minutes: number;
}

/**
 * Exibe o rollback rate do banco (transações abortadas / total) + taxa por minuto.
 * Threshold saudável < 1% acumulado e < 10/min. Refresh a cada 60s.
 */
export function RollbackRateCard() {
  const [stats, setStats] = useState<RollbackStats | null>(null);
  const [ratePerMin, setRatePerMin] = useState<RatePerMin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [cumul, perMin] = await Promise.all([
        supabaseExternal.rpc("get_db_rollback_rate"),
        supabaseExternal.rpc("get_rollback_rate_per_min", { window_minutes: 60 }),
      ]);
      if (!cancelled) {
        if (!cumul.error && Array.isArray(cumul.data) && cumul.data.length > 0) {
          setStats(cumul.data[0] as RollbackStats);
        }
        if (!perMin.error && Array.isArray(perMin.data) && perMin.data.length > 0) {
          const row = perMin.data[0] as {
            rate_per_min: number | string;
            rollback_delta: number;
            minutes: number | string;
          };
          setRatePerMin({
            rate_per_min: Number(row.rate_per_min),
            rollback_delta: Number(row.rollback_delta),
            minutes: Number(row.minutes),
          });
        }
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const rate = stats?.rollback_rate_pct ?? 0;
  const healthy = rate < 1;
  const warning = rate >= 1 && rate < 5;

  return (
    <Card className="border-border/40 shadow-sm bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-title-sm font-bold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Rollback Rate
            </CardTitle>
            <CardDescription className="text-body-sm">
              Percentual de transações abortadas
            </CardDescription>
          </div>
          {loading ? (
            <Badge variant="outline">…</Badge>
          ) : healthy ? (
            <Badge className="bg-nexus-emerald/20 text-nexus-emerald border-nexus-emerald/30 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Saudável
            </Badge>
          ) : warning ? (
            <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 gap-1">
              <AlertTriangle className="h-3 w-3" /> Atenção
            </Badge>
          ) : (
            <Badge className="bg-destructive/20 text-destructive border-destructive/30 gap-1">
              <AlertTriangle className="h-3 w-3" /> Crítico
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-black tracking-tight text-foreground tabular-nums">
            {rate.toFixed(3)}
          </span>
          <span className="text-body-sm text-muted-foreground font-medium">%</span>
        </div>
        {ratePerMin && (
          <div className="mt-3 flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
            <span className="text-meta text-muted-foreground uppercase tracking-widest">
              Rollbacks / min (60min)
            </span>
            <span
              className={`text-body-sm font-bold tabular-nums ${
                ratePerMin.rate_per_min > 10
                  ? "text-destructive"
                  : ratePerMin.rate_per_min > 1
                    ? "text-yellow-500"
                    : "text-nexus-emerald"
              }`}
            >
              {ratePerMin.rate_per_min.toFixed(2)}
            </span>
          </div>
        )}
        {stats && (
          <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-border/30">
            <div>
              <p className="text-meta text-muted-foreground uppercase tracking-widest">Commits</p>
              <p className="text-body-sm font-bold tabular-nums">{stats.commits.toLocaleString("pt-BR")}</p>
            </div>
            <div>
              <p className="text-meta text-muted-foreground uppercase tracking-widest">Rollbacks</p>
              <p className="text-body-sm font-bold tabular-nums">{stats.rollbacks.toLocaleString("pt-BR")}</p>
            </div>
            <div>
              <p className="text-meta text-muted-foreground uppercase tracking-widest">Deadlocks</p>
              <p className="text-body-sm font-bold tabular-nums">{stats.deadlocks.toLocaleString("pt-BR")}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
