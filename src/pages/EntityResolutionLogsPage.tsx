import { useEffect, useState, useCallback } from "react";
import { supabaseExternal as supabase } from "@/integrations/supabase/externalClient";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Merge } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Row {
  id: string;
  primary_entity_id: string | null;
  merged_entity_id: string | null;
  resolution_method: string | null;
  confidence: number | null;
  created_at: string;
  primary_name?: string;
}

export default function EntityResolutionLogsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("entity_resolution_logs")
      .select("*, knowledge_entities!entity_resolution_logs_primary_entity_id_fkey(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      logger.error("entity_resolution_logs.load", error);
      toast.error("Falha ao carregar logs de resolução");
      setLoading(false);
      return;
    }
    const mapped: Row[] = (data ?? []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      primary_entity_id: (d.primary_entity_id as string) ?? null,
      merged_entity_id: (d.merged_entity_id as string) ?? null,
      resolution_method: (d.resolution_method as string) ?? null,
      confidence: (d.confidence as number) ?? null,
      created_at: d.created_at as string,
      primary_name: (d.knowledge_entities as { name?: string } | null)?.name,
    }));
    setRows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const avgConfidence = rows.length
    ? (rows.reduce((s, r) => s + (r.confidence ?? 0), 0) / rows.length) * 100
    : 0;
  const highConf = rows.filter((r) => (r.confidence ?? 0) >= 0.9).length;
  const lowConf = rows.filter((r) => (r.confidence ?? 0) < 0.7).length;

  const confColor = (c: number | null) => {
    const v = c ?? 0;
    if (v >= 0.9) return "bg-nexus-green/15 text-nexus-green border-nexus-green/30";
    if (v >= 0.7) return "bg-nexus-amber/15 text-nexus-amber border-nexus-amber/30";
    return "bg-nexus-red/15 text-nexus-red border-nexus-red/30";
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Resolução de Entidades"
          description="Histórico de deduplicações e merges do grafo de conhecimento"
        />
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-body-sm text-muted-foreground">Total</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{rows.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-body-sm text-muted-foreground">Confiança média</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{avgConfidence.toFixed(1)}%</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-body-sm text-muted-foreground">Alta confiança</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-nexus-green">{highConf}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-body-sm text-muted-foreground">Revisar</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-nexus-red">{lowConf}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Últimos merges</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-body-sm text-muted-foreground py-8 text-center">Carregando…</div>
          ) : rows.length === 0 ? (
            <div className="text-body-sm text-muted-foreground py-8 text-center">Nenhum merge registrado.</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-md border border-border/40 hover:bg-accent/30 transition-colors">
                  <Merge className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-body-sm font-medium truncate">
                      {r.primary_name || r.primary_entity_id?.slice(0, 8) || "—"}
                      <span className="text-muted-foreground mx-2">←</span>
                      <span className="text-muted-foreground font-mono text-meta">{r.merged_entity_id?.slice(0, 8) ?? "—"}</span>
                    </div>
                    <div className="text-meta text-muted-foreground mt-0.5">
                      método: {r.resolution_method ?? "—"} • {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                    </div>
                  </div>
                  <Badge variant="outline" className={confColor(r.confidence)}>
                    {((r.confidence ?? 0) * 100).toFixed(1)}%
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
