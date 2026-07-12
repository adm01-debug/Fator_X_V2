/**
 * Cost Simulator — Widget standalone para simular custos de LLM
 * consumindo `costCalculatorService`. Compara modelos lado a lado
 * e formata em USD + BRL.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Loader2, TrendingDown, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  getAllPricing,
  calculateCost,
  formatCostUsd,
  formatCostBrl,
  formatTokenCount,
  type ActualCost,
  type ModelPricing,
} from "@/services/costCalculatorService";
import { toast } from "sonner";

export default function CostSimulatorPage() {
  const { data: pricing = [], isLoading } = useQuery({
    queryKey: ["model_pricing_all"],
    queryFn: getAllPricing,
  });

  const [modelA, setModelA] = useState<string>("");
  const [modelB, setModelB] = useState<string>("");
  const [inputTokens, setInputTokens] = useState<number>(1000);
  const [outputTokens, setOutputTokens] = useState<number>(500);
  const [callsPerMonth, setCallsPerMonth] = useState<number>(10_000);
  const [resultA, setResultA] = useState<ActualCost | null>(null);
  const [resultB, setResultB] = useState<ActualCost | null>(null);
  const [simulating, setSimulating] = useState(false);

  // Default selection once pricing loads
  useMemo(() => {
    if (!modelA && pricing.length) setModelA(pricing[0].model);
    if (!modelB && pricing.length > 1) setModelB(pricing[1].model);
  }, [pricing, modelA, modelB]);

  const simulate = async () => {
    if (!modelA) return;
    setSimulating(true);
    try {
      const [a, b] = await Promise.all([
        calculateCost(modelA.split("/")[0] || "auto", modelA, inputTokens, outputTokens),
        modelB
          ? calculateCost(modelB.split("/")[0] || "auto", modelB, inputTokens, outputTokens)
          : Promise.resolve(null),
      ]);
      setResultA(a);
      setResultB(b);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao calcular custo");
    } finally {
      setSimulating(false);
    }
  };

  const savingsPct = useMemo(() => {
    if (!resultA || !resultB || resultA.totalCostUsd === 0) return null;
    return ((resultA.totalCostUsd - resultB.totalCostUsd) / resultA.totalCostUsd) * 100;
  }, [resultA, resultB]);

  const monthlyA = resultA ? resultA.totalCostUsd * callsPerMonth : 0;
  const monthlyB = resultB ? resultB.totalCostUsd * callsPerMonth : 0;

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Simulador de Custos"
        description="Estime custos de LLM por chamada e projete o gasto mensal. Compare dois modelos lado a lado com preços reais em USD e BRL."
      />

      <Card className="p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="in-tokens">Tokens de entrada</Label>
            <Input
              id="in-tokens"
              type="number"
              min={0}
              value={inputTokens}
              onChange={(e) => setInputTokens(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="out-tokens">Tokens de saída</Label>
            <Input
              id="out-tokens"
              type="number"
              min={0}
              value={outputTokens}
              onChange={(e) => setOutputTokens(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calls">Chamadas / mês</Label>
            <Input
              id="calls"
              type="number"
              min={0}
              value={callsPerMonth}
              onChange={(e) => setCallsPerMonth(Math.max(0, Number(e.target.value)))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ModelPicker label="Modelo A" value={modelA} onChange={setModelA} pricing={pricing} loading={isLoading} />
          <ModelPicker label="Modelo B (comparação)" value={modelB} onChange={setModelB} pricing={pricing} loading={isLoading} allowNone />
        </div>

        <Button onClick={simulate} disabled={simulating || !modelA} className="w-full nexus-gradient-bg font-bold h-11">
          {simulating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
          Simular custo
        </Button>
      </Card>

      {(resultA || resultB) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {resultA && <ResultCard label="Modelo A" cost={resultA} monthly={monthlyA} />}
          {resultB && <ResultCard label="Modelo B" cost={resultB} monthly={monthlyB} highlight={savingsPct !== null && savingsPct > 0} />}
        </div>
      )}

      {savingsPct !== null && Math.abs(savingsPct) > 0.01 && (
        <Card className={`p-5 border ${savingsPct > 0 ? "border-nexus-emerald/30 bg-nexus-emerald/5" : "border-destructive/30 bg-destructive/5"}`}>
          <div className="flex items-center gap-3">
            <TrendingDown className={`h-6 w-6 ${savingsPct > 0 ? "text-nexus-emerald" : "text-destructive rotate-180"}`} />
            <div>
              <p className="text-body-sm font-bold text-foreground">
                {savingsPct > 0 ? "Economia" : "Custo adicional"} com Modelo B:{" "}
                <span className={savingsPct > 0 ? "text-nexus-emerald" : "text-destructive"}>
                  {Math.abs(savingsPct).toFixed(1)}%
                </span>
              </p>
              <p className="text-meta text-muted-foreground">
                Diferença mensal projetada: {formatCostUsd(Math.abs(monthlyA - monthlyB))} ({formatCostBrl(Math.abs(monthlyA - monthlyB))})
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="text-body font-bold text-foreground mb-4 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" /> Tabela de Preços ({pricing.length} modelos)
        </h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border/40 text-meta font-bold text-muted-foreground uppercase tracking-widest">
                  <th className="text-left py-2 px-3">Modelo</th>
                  <th className="text-right py-2 px-3">Input / M</th>
                  <th className="text-right py-2 px-3">Output / M</th>
                </tr>
              </thead>
              <tbody>
                {pricing.map((p) => (
                  <tr key={p.model} className="border-b border-border/20 hover:bg-secondary/30">
                    <td className="py-2 px-3 font-mono text-foreground">{p.model}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">{formatCostUsd(p.inputPricePerMToken)}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">{formatCostUsd(p.outputPricePerMToken)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ModelPicker({
  label,
  value,
  onChange,
  pricing,
  loading,
  allowNone,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  pricing: ModelPricing[];
  loading: boolean;
  allowNone?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value || (allowNone ? "__none__" : "")} onValueChange={(v) => onChange(v === "__none__" ? "" : v)} disabled={loading}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? "Carregando..." : "Selecione um modelo"} />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {allowNone && <SelectItem value="__none__">— Nenhum —</SelectItem>}
          {pricing.map((p) => (
            <SelectItem key={p.model} value={p.model}>
              <span className="font-mono">{p.model}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ResultCard({ label, cost, monthly, highlight }: { label: string; cost: ActualCost; monthly: number; highlight?: boolean }) {
  return (
    <Card className={`p-6 space-y-4 ${highlight ? "border-nexus-emerald/40 shadow-lg shadow-nexus-emerald/10" : ""}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-meta font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
          <p className="text-body font-mono font-bold text-foreground truncate">{cost.model}</p>
        </div>
        {highlight && <Badge className="bg-nexus-emerald/15 text-nexus-emerald border-none font-bold">Mais barato</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Custo por chamada" value={formatCostUsd(cost.totalCostUsd)} sub={formatCostBrl(cost.totalCostUsd)} />
        <Metric label="Projeção mensal" value={formatCostUsd(monthly)} sub={formatCostBrl(monthly)} strong />
        <Metric label="Input" value={formatCostUsd(cost.inputCostUsd)} sub={`${formatTokenCount(cost.inputTokens)} tok`} />
        <Metric label="Output" value={formatCostUsd(cost.outputCostUsd)} sub={`${formatTokenCount(cost.outputTokens)} tok`} />
      </div>
    </Card>
  );
}

function Metric({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="bg-secondary/30 rounded-xl p-3">
      <p className="text-meta font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`font-heading font-black ${strong ? "text-2xl text-primary" : "text-title-sm text-foreground"}`}>{value}</p>
      {sub && <p className="text-meta text-muted-foreground">{sub}</p>}
    </div>
  );
}
