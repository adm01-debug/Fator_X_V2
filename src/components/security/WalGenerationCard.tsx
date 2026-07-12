import { useEffect, useState } from "react";
import { HardDrive, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabaseExternal } from "@/integrations/supabase/externalClient";

interface WalSample {
  captured_at: string;
  bytes_per_min: number;
  mb_per_min: number;
}

/**
 * Monitor de geração de WAL (Write-Ahead Log).
 * Thresholds: < 50 MB/min saudável, 50-200 atenção, 200-500 alto, > 500 crítico.
 */
export function WalGenerationCard() {
  const [samples, setSamples] = useState<WalSample[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabaseExternal.rpc("get_wal_generation_rate", { _minutes: 60 });
      if (!cancelled && !error && Array.isArray(data)) {
        setSamples(
          (data as Array<{ captured_at: string; bytes_per_min: number | string; mb_per_min: number | string }>).map(
            (r) => ({
              captured_at: r.captured_at,
              bytes_per_min: Number(r.bytes_per_min),
              mb_per_min: Number(r.mb_per_min),
            }),
          ),
        );
        setLoading(false);
      } else if (!cancelled) {
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

  const latest = samples[0]?.mb_per_min ?? 0;
  const avg = samples.length > 0 ? samples.reduce((s, x) => s + x.mb_per_min, 0) / samples.length : 0;
  const peak = samples.length > 0 ? Math.max(...samples.map((s) => s.mb_per_min)) : 0;

  const level =
    latest > 500 ? "critical" : latest > 200 ? "high" : latest > 50 ? "medium" : "healthy";

  const badge =
    level === "healthy" ? (
      <Badge className="bg-nexus-emerald/20 text-nexus-emerald border-nexus-emerald/30 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Saudável
      </Badge>
    ) : level === "medium" ? (
      <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 gap-1">
        <AlertTriangle className="h-3 w-3" /> Atenção
      </Badge>
    ) : level === "high" ? (
      <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30 gap-1">
        <AlertTriangle className="h-3 w-3" /> Alto
      </Badge>
    ) : (
      <Badge className="bg-destructive/20 text-destructive border-destructive/30 gap-1">
        <AlertTriangle className="h-3 w-3" /> Crítico
      </Badge>
    );

  return (
    <Card className="border-border/40 shadow-sm bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-title-sm font-bold flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" />
              Geração de WAL
            </CardTitle>
            <CardDescription className="text-body-sm">Volume de write-ahead log por minuto</CardDescription>
          </div>
          {loading ? <Badge variant="outline">…</Badge> : badge}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-black tracking-tight text-foreground tabular-nums">
            {latest.toFixed(2)}
          </span>
          <span className="text-body-sm text-muted-foreground font-medium">MB/min</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-border/30">
          <div>
            <p className="text-meta text-muted-foreground uppercase tracking-widest">Média 60min</p>
            <p className="text-body-sm font-bold tabular-nums">{avg.toFixed(2)} MB/min</p>
          </div>
          <div>
            <p className="text-meta text-muted-foreground uppercase tracking-widest">Pico 60min</p>
            <p className="text-body-sm font-bold tabular-nums">{peak.toFixed(2)} MB/min</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
