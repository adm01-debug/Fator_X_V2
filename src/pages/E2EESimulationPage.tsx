/**
 * E2EESimulationPage — Executa em massa cenários sintéticos de sync conflitante
 * e reporta quais falharam ou foram classificados incorretamente pelo
 * `planReconciliation`. Toda a lógica roda no navegador — nada é gravado.
 */
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, PlayCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  generateScenarios,
  runSimulation,
  type SimulationSummary,
  type ExpectedOutcome,
} from "@/services/e2eeSimulationService";

const OUTCOMES: ExpectedOutcome[] = ["insert", "update", "keep", "conflict"];

export default function E2EESimulationPage() {
  const [count, setCount] = useState(500);
  const [pctInsert, setPctInsert] = useState(25);
  const [pctUpdate, setPctUpdate] = useState(25);
  const [pctKeep, setPctKeep] = useState(25);
  const [pctConflict, setPctConflict] = useState(25);
  const [conflictWindowMs, setConflictWindowMs] = useState(60_000);
  const [cryptoRoundTrip, setCryptoRoundTrip] = useState(true);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<SimulationSummary | null>(null);

  const totalPct = pctInsert + pctUpdate + pctKeep + pctConflict;
  const totalPctInvalid = totalPct <= 0;

  const failures = useMemo(
    () => (summary ? summary.results.filter((r) => !r.pass).slice(0, 200) : []),
    [summary],
  );

  async function handleRun() {
    if (totalPctInvalid) {
      toast.error("Ao menos uma distribuição precisa ser maior que zero.");
      return;
    }
    setRunning(true);
    setSummary(null);
    try {
      // Cede uma frame para o loader aparecer antes do trabalho pesado.
      await new Promise((r) => setTimeout(r, 20));
      const scenarios = generateScenarios({
        count,
        pctInsert,
        pctUpdate,
        pctKeep,
        pctConflict,
        conflictWindowMs,
      });
      const result = await runSimulation(scenarios, {
        conflictWindowMs,
        cryptoRoundTrip,
      });
      setSummary(result);
      if (result.failed === 0 && result.cryptoRoundTripOk) {
        toast.success(`Todos os ${result.total} cenários passaram.`);
      } else {
        toast.warning(`${result.failed} falha(s) em ${result.total} cenários.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao rodar simulação.");
    } finally {
      setRunning(false);
    }
  }

  function exportReport() {
    if (!summary) return;
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `e2ee-simulation-${new Date().toISOString().slice(0, 19)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Simulação de Sync E2EE"
        description="Gere centenas ou milhares de cenários conflitantes e verifique quais casos falharam ou tiveram merge incorreto."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-body">Configuração</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="count">Quantidade de cenários</Label>
            <Input
              id="count"
              type="number"
              min={1}
              max={20000}
              value={count}
              onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 0))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="win">Janela de conflito (ms)</Label>
            <Input
              id="win"
              type="number"
              min={0}
              value={conflictWindowMs}
              onChange={(e) => setConflictWindowMs(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch id="crypto" checked={cryptoRoundTrip} onCheckedChange={setCryptoRoundTrip} />
              <Label htmlFor="crypto" className="cursor-pointer">
                Round-trip AES-GCM
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pi">% Insert</Label>
            <Input id="pi" type="number" min={0} max={100} value={pctInsert}
              onChange={(e) => setPctInsert(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pu">% Update</Label>
            <Input id="pu" type="number" min={0} max={100} value={pctUpdate}
              onChange={(e) => setPctUpdate(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pk">% Keep</Label>
            <Input id="pk" type="number" min={0} max={100} value={pctKeep}
              onChange={(e) => setPctKeep(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pc">% Conflict</Label>
            <Input id="pc" type="number" min={0} max={100} value={pctConflict}
              onChange={(e) => setPctConflict(Math.max(0, Number(e.target.value) || 0))} />
          </div>

          <div className="md:col-span-3 flex items-center justify-between pt-2">
            <p className="text-meta text-muted-foreground">
              Distribuição normalizada automaticamente. Soma atual: {totalPct}%.
            </p>
            <div className="flex gap-2">
              {summary && (
                <Button variant="outline" onClick={exportReport}>
                  Exportar relatório JSON
                </Button>
              )}
              <Button onClick={handleRun} disabled={running || totalPctInvalid}>
                <PlayCircle className="mr-2 h-4 w-4" />
                {running ? "Rodando…" : "Rodar simulação"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-body">Resultado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total" value={summary.total} />
                <StatCard label="Passaram" value={summary.passed} tone="ok" />
                <StatCard label="Falharam" value={summary.failed} tone={summary.failed ? "err" : "ok"} />
                <StatCard label="Tempo" value={`${summary.elapsedMs.toFixed(0)} ms`} />
              </div>

              <Separator />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {OUTCOMES.map((o) => {
                  const bucket = summary.byOutcome[o];
                  const pct = bucket.total === 0 ? 100 : Math.round((bucket.passed / bucket.total) * 100);
                  return (
                    <div key={o} className="rounded-lg border p-3">
                      <div className="text-meta uppercase text-muted-foreground">{o}</div>
                      <div className="text-title-sm font-semibold">
                        {bucket.passed}/{bucket.total}
                      </div>
                      <Badge variant={pct === 100 ? "default" : "destructive"} className="mt-1">
                        {pct}% ok
                      </Badge>
                    </div>
                  );
                })}
              </div>

              <Alert variant={summary.cryptoRoundTripOk ? "default" : "destructive"}>
                {summary.cryptoRoundTripOk ? (
                  <ShieldCheck className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertTitle>
                  Round-trip AES-GCM: {summary.cryptoRoundTripOk ? "íntegro" : "falhou"}
                </AlertTitle>
                <AlertDescription>
                  {summary.cryptoDetail ??
                    "Bundle cifrado → decifrado com sucesso; contagem e ordem de notas preservadas."}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-body flex items-center gap-2">
                {summary.failed === 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-nexus-emerald" />
                    Nenhuma falha detectada
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    Falhas ({summary.failed}) — mostrando até 200
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.failed === 0 ? (
                <p className="text-body-sm text-muted-foreground">
                  Todos os cenários foram classificados como esperado.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-body-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4">Cenário</th>
                        <th className="py-2 pr-4">Esperado</th>
                        <th className="py-2 pr-4">Obtido</th>
                        <th className="py-2 pr-4">Detalhe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failures.map((r) => (
                        <tr key={r.id} className="border-t border-border/50">
                          <td className="py-2 pr-4 font-mono text-meta">{r.name}</td>
                          <td className="py-2 pr-4">
                            <Badge variant="outline">{r.expected}</Badge>
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant="destructive">{r.actual}</Badge>
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">{r.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "err";
}) {
  const color =
    tone === "ok" ? "text-nexus-emerald" : tone === "err" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-meta uppercase text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
