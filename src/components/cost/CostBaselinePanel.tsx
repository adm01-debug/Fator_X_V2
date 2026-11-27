/**
 * CostBaselinePanel — o "normal" do detector de anomalias.
 *
 * `public.cost_baselines` é escrita exclusivamente por `compute_cost_baselines()`
 * (SECURITY DEFINER, recalculando os últimos 14 dias de `agent_traces`) e não
 * tinha nenhuma tela: dava para ver as anomalias disparadas, nunca contra o que
 * elas foram comparadas. A RLS limita a leitura aos workspaces do usuário.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRBAC } from "@/hooks/useRBAC";
import {
  listBaselines,
  recomputeBaselines,
  type CostBaselineRow,
} from "@/services/costAnomalyService";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const SCOPE_LABELS: Record<CostBaselineRow["scope"], string> = {
  workspace: "Workspace",
  agent: "Agente",
  model: "Modelo",
};

function windowLabel(b: CostBaselineRow) {
  return `${WEEKDAYS[b.day_of_week] ?? `Dia ${b.day_of_week}`} ${String(b.hour_of_day).padStart(2, "0")}h`;
}

export function CostBaselinePanel() {
  const qc = useQueryClient();
  const { isAdmin, loading: rbacLoading } = useRBAC();
  const [scope, setScope] = useState<string>("all");

  const { data: baselines, isLoading, isError } = useQuery({
    queryKey: ["cost-baselines", scope],
    queryFn: () =>
      listBaselines({
        scope: scope === "all" ? undefined : (scope as CostBaselineRow["scope"]),
        limit: 200,
      }),
  });

  const recomputeMut = useMutation({
    mutationFn: recomputeBaselines,
    onSuccess: () => {
      toast.success("Baselines recalculados com os últimos 14 dias de execuções");
      qc.invalidateQueries({ queryKey: ["cost-baselines"] });
    },
    onError: (err: Error) => toast.error(`Falha ao recalcular baselines: ${err.message}`),
  });

  const rows = baselines ?? [];
  const latest = rows[0]?.computed_at;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle className="text-title-sm">Baseline do detector</CardTitle>
            {latest && (
              <Badge variant="secondary" className="text-meta">
                atualizado {new Date(latest).toLocaleString("pt-BR")}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-40 h-9" aria-label="Filtrar por escopo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os escopos</SelectItem>
                <SelectItem value="workspace">Workspace</SelectItem>
                <SelectItem value="agent">Agente</SelectItem>
                <SelectItem value="model">Modelo</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => recomputeMut.mutate()}
                disabled={recomputeMut.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${recomputeMut.isPending ? "animate-spin" : ""}`} />
                Recalcular
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || rbacLoading ? (
          <Skeleton className="h-24" />
        ) : isError ? (
          <p className="text-body-sm text-destructive py-6 text-center">
            Não foi possível ler os baselines deste workspace.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-body-sm text-muted-foreground py-6 text-center">
            Nenhum baseline calculado ainda
            {isAdmin ? " — clique em Recalcular para o detector ter com o que comparar." : "."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-meta text-muted-foreground uppercase tracking-wider">
                  <th className="text-left py-2">Escopo</th>
                  <th className="text-left py-2">Alvo</th>
                  <th className="text-left py-2">Janela</th>
                  <th className="text-right py-2">Custo médio</th>
                  <th className="text-right py-2">Desvio</th>
                  <th className="text-right py-2">Amostras</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((b) => (
                  <tr key={b.id} className="border-t border-border/40">
                    <td className="py-2">{SCOPE_LABELS[b.scope] ?? b.scope}</td>
                    <td className="py-2 font-mono text-meta">
                      {b.scope_id ? `${b.scope_id.slice(0, 8)}…` : "—"}
                    </td>
                    <td className="py-2">{windowLabel(b)}</td>
                    <td className="py-2 text-right">${b.avg_cost_usd.toFixed(4)}</td>
                    <td className="py-2 text-right text-muted-foreground">±${b.stddev_cost_usd.toFixed(4)}</td>
                    <td className="py-2 text-right">{b.sample_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && (
              <p className="text-meta text-muted-foreground mt-3 text-center">
                Mostrando 50 de {rows.length} janelas.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
