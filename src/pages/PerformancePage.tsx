/**
 * PerformancePage — Fase 10
 * UI dedicada de performance: histórico de alertas de queries lentas
 * + Auto-EXPLAIN de SELECT com sugestão de índice.
 * Admin-only via RPCs SECURITY DEFINER.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Activity, AlertTriangle, Play, Loader2, Sparkles } from "lucide-react";
import { DbHealthCard } from "@/components/admin/DbHealthCard";
import { toast } from "sonner";

interface SlowAlert {
  id: string;
  severity: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  resolved_at: string | null;
}

interface ExplainResult {
  plan: unknown;
  seq_scans: number;
  suggestions: string[];
  captured_at: string;
}

export default function PerformancePage() {
  const [query, setQuery] = useState<string>(
    "SELECT id, created_at FROM public.agent_traces ORDER BY created_at DESC LIMIT 100"
  );
  const [explain, setExplain] = useState<ExplainResult | null>(null);

  const { data: alerts = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["slow-query-alerts-history"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<SlowAlert[]> => {
      const { data, error } = await supabase.rpc("get_slow_query_alerts_history" as never, { _days: 7 } as never);
      if (error) throw error;
      return (data ?? []) as unknown as SlowAlert[];
    },
  });

  const runExplain = useMutation({
    mutationFn: async (): Promise<ExplainResult> => {
      const { data, error } = await supabase.rpc("explain_query_plan" as never, { _query: query } as never);
      if (error) throw error;
      return data as unknown as ExplainResult;
    },
    onSuccess: (res) => {
      setExplain(res);
      toast.success("Plano de execução capturado");
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Falha ao gerar EXPLAIN");
    },
  });

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Performance do banco"
        description="Histórico de queries lentas, saúde ao vivo e auto-EXPLAIN com sugestão de índice."
        icon={Activity}
      />

      <DbHealthCard />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-nexus-primary" />
              Alertas de queries lentas (últimos 7 dias)
            </CardTitle>
            <CardDescription>
              Gerados automaticamente a cada 15 minutos quando a média de execução supera 5s.
            </CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            <Activity className={isFetching ? "h-3.5 w-3.5 animate-pulse" : "h-3.5 w-3.5"} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && alerts.length === 0 && (
            <p className="text-sm text-emerald-500">Nenhum alerta nos últimos 7 dias. 🎉</p>
          )}
          {alerts.map((a) => {
            const meta = a.metadata ?? {};
            const meanMs = typeof meta.mean_ms === "number" ? meta.mean_ms : null;
            const preview = typeof meta.query_preview === "string" ? meta.query_preview : a.message;
            return (
              <div key={a.id} className="rounded border p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={a.severity === "critical" ? "destructive" : "outline"}>
                      {a.severity}
                    </Badge>
                    {meanMs !== null && (
                      <span className="text-muted-foreground">
                        {Math.round(meanMs)} ms / chamada
                      </span>
                    )}
                    {a.resolved_at && <Badge variant="secondary">resolvido</Badge>}
                  </div>
                  <span className="text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                <code className="block text-[10px] text-muted-foreground line-clamp-3">
                  {preview}
                </code>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-nexus-primary" />
            Auto-EXPLAIN — sugestão de índice
          </CardTitle>
          <CardDescription>
            Cole uma consulta SELECT/WITH. Executamos <code>EXPLAIN (FORMAT JSON)</code> sem ANALYZE
            (sem tocar dados) e sugerimos índices quando detectarmos Seq Scans.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={6}
            className="font-mono text-xs"
            placeholder="SELECT ... FROM ... WHERE ..."
          />
          <div className="flex justify-end">
            <Button
              onClick={() => runExplain.mutate()}
              disabled={runExplain.isPending || query.trim().length < 10}
              size="sm"
            >
              {runExplain.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-2" />
              )}
              Gerar EXPLAIN
            </Button>
          </div>

          {explain && (
            <div className="space-y-3">
              {explain.suggestions.length > 0 ? (
                <Alert>
                  <Sparkles className="h-4 w-4" />
                  <AlertTitle>Sugestões automáticas</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-5 space-y-1 text-xs">
                      {explain.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <AlertTitle>Plano saudável</AlertTitle>
                  <AlertDescription className="text-xs">
                    Nenhum Seq Scan detectado. Nada a sugerir.
                  </AlertDescription>
                </Alert>
              )}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Plano (JSON)</h4>
                <pre className="text-[10px] bg-muted/40 rounded p-3 overflow-auto max-h-[400px]">
{JSON.stringify(explain.plan, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
