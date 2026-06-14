import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileJson, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface AuditRun {
  id: string;
  passed?: number;
  total_items?: number;
  avg_score?: number;
  avg_latency_ms?: number;
  total_cost_usd?: number;
}

interface AuditResult {
  input?: string;
  expected?: unknown;
  actual?: unknown;
  score?: number;
  passed?: boolean;
  latency_ms?: number;
  judge_reasoning?: string;
}

interface AuditReportProps {
  run: AuditRun;
  results: AuditResult[];
}

export function AuditReportDialog({ run, results }: AuditReportProps) {
  const [exporting, setExporting] = useState(false);

  const generateJSON = () => {
    const data = {
      run_metadata: run,
      results: results.map(r => ({
        input: r.input,
        expected: r.expected,
        actual: r.actual,
        score: r.score,
        passed: r.passed,
        latency: r.latency_ms,
        reasoning: r.judge_reasoning
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-report-${run.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('JSON exportado com sucesso');
  };

  const generatePDF = () => {
    setExporting(true);
    // Em um sistema real, usaríamos jspdf ou similar. 
    // Aqui simularemos a geração de um relatório formatado para impressão.
    setTimeout(() => {
      window.print();
      setExporting(false);
      toast.success('Relatório gerado para impressão');
    }, 1000);
  };

  return (
    <div className="space-y-6 print:p-0">
      <div className="flex items-center justify-between border-b pb-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold">Relatório de Auditoria</h2>
          <p className="text-xs text-muted-foreground">Auditoria detalhada da execução {run.id.slice(0, 8)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={generateJSON} className="gap-2">
            <FileJson className="h-4 w-4" /> JSON
          </Button>
          <Button variant="default" size="sm" onClick={generatePDF} disabled={exporting} className="gap-2 nexus-gradient-bg">
            <Download className="h-4 w-4" /> {exporting ? 'Gerando...' : 'Exportar PDF'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pass Rate" value={`${((run.passed / (run.total_items || 1)) * 100).toFixed(1)}%`} />
        <StatCard label="Score Médio" value={Number(run.avg_score ?? 0).toFixed(2)} />
        <StatCard label="Latência Média" value={`${run.avg_latency_ms}ms`} />
        <StatCard label="Custo Total" value={`$${Number(run.total_cost_usd ?? 0).toFixed(4)}`} />
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Evidências de Execução</h3>
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="p-3">Status</th>
                <th className="p-3">Input</th>
                <th className="p-3">Score</th>
                <th className="p-3">Latência</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {results.map((r, i) => (
                <tr key={i} className="hover:bg-muted/20 transition-colors">
                  <td className="p-3">
                    {r.passed ? <CheckCircle2 className="h-4 w-4 text-nexus-emerald" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  </td>
                  <td className="p-3 font-medium max-w-[300px] truncate">{r.input}</td>
                  <td className="p-3 font-mono">{(r.score * 100).toFixed(0)}%</td>
                  <td className="p-3 text-muted-foreground">{r.latency_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-dashed text-[10px] text-muted-foreground italic text-center">
        Este documento é uma trilha de auditoria digital gerada pelo Oráculo Nexus. 
        Dados verificados contra modelos de referência.
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-xl border bg-card/50">
      <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">{label}</p>
      <p className="text-lg font-black text-foreground">{value}</p>
    </div>
  );
}