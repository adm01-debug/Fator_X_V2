import { useState } from 'react';
import {
  Loader2,
  Sparkles,
  GitCompare,
  XCircle,
  Trophy,
  Download,
  DollarSign,
  Hash,
  Activity,
  Zap,
  Cpu,
  Clock,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { invokeTracedFunction } from '@/services/llmGatewayService';
import {
  ORACLE_MODES,
  ORACLE_PRESETS,
  type OracleMode,
  type OracleResult,
} from '@/stores/oracleStore';

interface ComparisonRun {
  mode: OracleMode;
  preset_id: string;
  result: OracleResult | null;
  error?: string;
  duration_ms: number;
  status: 'pending' | 'running' | 'success' | 'failed';
}

const COMPARISON_MODES: Array<{ mode: OracleMode; preset_id: string }> = [
  { mode: 'council', preset_id: 'executive' },
  { mode: 'researcher', preset_id: 'deep-research' },
  { mode: 'advisor', preset_id: 'decision' },
];

export function OracleComparisonPanel() {
  const [query, setQuery] = useState('');
  const [selectedModes, setSelectedModes] = useState<OracleMode[]>([
    'council',
    'researcher',
    'advisor',
  ]);
  const [runs, setRuns] = useState<ComparisonRun[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const toggleMode = (mode: OracleMode) => {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  };

  const handleCompare = async () => {
    if (!query.trim()) {
      toast.error('Digite uma query primeiro');
      return;
    }
    if (selectedModes.length < 2) {
      toast.error('Selecione pelo menos 2 modos');
      return;
    }

    setIsRunning(true);

    const initial: ComparisonRun[] = COMPARISON_MODES.filter((c) =>
      selectedModes.includes(c.mode),
    ).map((c) => ({
      mode: c.mode,
      preset_id: c.preset_id,
      result: null,
      duration_ms: 0,
      status: 'pending' as const,
    }));
    setRuns(initial);

    // Run sequentially to avoid overloading the orchestrator
    const collected: ComparisonRun[] = [];
    for (const cfg of initial) {
      const start = Date.now();
      const updated = { ...cfg, status: 'running' as const };
      collected.push(updated);
      setRuns([...collected]);

      try {
        const preset = ORACLE_PRESETS.find((p) => p.id === cfg.preset_id) || ORACLE_PRESETS[0];
        const data = await invokeTracedFunction<OracleResult>(
          'oracle-council',
          {
            query,
            mode: cfg.mode,
            members: preset.members,
            chairman_model: preset.chairman,
            enable_peer_review: preset.enablePeerReview,
            enable_thinking: preset.enableThinking,
            preset_id: preset.id,
          },
          {
            spanKind: 'llm',
            extractCostUsd: (d) => (d as OracleResult)?.metrics?.total_cost_usd,
            extractModel: (b) => (b as { chairman_model?: string }).chairman_model,
          },
        );

        const idx = collected.findIndex((c) => c.mode === cfg.mode);
        if (idx >= 0) {
          collected[idx] = {
            ...collected[idx],
            result: data,
            duration_ms: Date.now() - start,
            status: 'success',
          };
        }
        setRuns([...collected]);
      } catch (e) {
        const idx = collected.findIndex((c) => c.mode === cfg.mode);
        if (idx >= 0) {
          collected[idx] = {
            ...collected[idx],
            error: e instanceof Error ? e.message : String(e),
            duration_ms: Date.now() - start,
            status: 'failed',
          };
        }
        setRuns([...collected]);
      }
    }

    setIsRunning(false);
    const successCount = collected.filter((c) => c.status === 'success').length;
    if (successCount === collected.length) {
      toast.success(`Comparação completa: ${successCount} modos`);
    } else {
      toast.warning(`${successCount}/${collected.length} modos completaram`);
    }
  };

  // "Winner" = highest confidence_score among successful runs (more meaningful than fastest)
  const successfulRuns = runs.filter((r) => r.status === 'success' && r.result);
  const winnerMode =
    successfulRuns.length > 0
      ? successfulRuns.reduce((best, r) =>
          (r.result!.confidence_score ?? 0) > (best.result!.confidence_score ?? 0) ? r : best,
        ).mode
      : null;

  const aggregate = successfulRuns.reduce(
    (acc, r) => ({
      cost: acc.cost + (r.result?.metrics?.total_cost_usd ?? 0),
      tokens: acc.tokens + (r.result?.metrics?.total_tokens ?? 0),
      avgLatency: acc.avgLatency + r.duration_ms,
    }),
    { cost: 0, tokens: 0, avgLatency: 0 },
  );
  if (successfulRuns.length > 0) {
    aggregate.avgLatency = aggregate.avgLatency / successfulRuns.length;
  }

  const handleExport = () => {
    if (runs.length === 0) {
      toast.error('Nada para exportar');
      return;
    }
    const payload = {
      query,
      timestamp: new Date().toISOString(),
      runs: runs.map((r) => ({
        mode: r.mode,
        preset_id: r.preset_id,
        status: r.status,
        duration_ms: r.duration_ms,
        error: r.error,
        confidence_score: r.result?.confidence_score,
        consensus_degree: r.result?.consensus_degree,
        final_response: r.result?.final_response,
        metrics: r.result?.metrics,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oracle-comparison-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Comparação exportada');
  };

  return (
    <Card className="p-8 bg-card border-border rounded-3xl shadow-nexus-sm relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-64 h-64 bg-primary/[0.02] rounded-full -translate-y-1/2 -translate-x-1/2" />

      <div className="flex items-center justify-between mb-8 relative">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/15">
            <GitCompare className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">Modo Benchmarking</h3>
            <p className="text-meta text-muted-foreground max-w-lg leading-relaxed">
              Compare a eficácia e o custo de múltiplos algoritmos do conselho simultaneamente para
              o mesmo dilema.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 relative">
        {/* Query input */}
        <div className="relative">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Qual cenário você deseja comparar?"
            rows={2}
            className="bg-secondary/40 border-border/60 rounded-2xl p-4 text-title-sm focus:ring-primary shadow-nexus-inner italic"
          />
        </div>

        <div className="space-y-3">
          <span className="text-meta font-extrabold text-muted-foreground uppercase tracking-widest ml-1">
            Estratégias para Confronto:
          </span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {COMPARISON_MODES.map((cfg) => {
              const modeInfo = ORACLE_MODES[cfg.mode];
              const checked = selectedModes.includes(cfg.mode);
              return (
                <label
                  key={cfg.mode}
                  htmlFor={`oracle-mode-${cfg.mode}`}
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    checked
                      ? 'bg-primary/5 border-primary/40 shadow-nexus-sm'
                      : 'bg-card text-muted-foreground hover:bg-secondary/50 border-border/60'
                  }`}
                >
                  <Checkbox
                    id={`oracle-mode-${cfg.mode}`}
                    checked={checked}
                    onCheckedChange={() => toggleMode(cfg.mode)}
                    disabled={isRunning}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-title-sm">{modeInfo.icon}</span>
                      <span className="text-meta font-bold uppercase tracking-tight">
                        {modeInfo.label}
                      </span>
                    </div>
                    <p className="text-meta leading-relaxed mt-1 line-clamp-2">
                      {modeInfo.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleCompare}
            disabled={isRunning || !query.trim() || selectedModes.length < 2}
            className="nexus-gradient-bg h-11 px-10 rounded-xl shadow-nexus-lg shadow-primary/20 hover:scale-[1.02] transition-all font-bold group"
          >
            {isRunning ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5 group-hover:rotate-12 transition-transform" />
            )}
            {isRunning ? 'EXECUTANDO ARENA...' : 'INICIAR BENCHMARK'}
          </Button>
        </div>
      </div>

      {/* Summary metrics + export */}
      {successfulRuns.length > 0 && (
        <div className="mt-10 space-y-6 animate-in fade-in duration-700">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-meta font-extrabold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" /> Performance Consolidada
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="h-8 rounded-lg gap-2 text-meta font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Exportar Análise JSON
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                icon: <DollarSign className="h-4 w-4" />,
                label: 'Custo Total',
                value: `$${aggregate.cost.toFixed(4)}`,
                cls: 'text-nexus-emerald',
              },
              {
                icon: <Hash className="h-4 w-4" />,
                label: 'Volume Tokens',
                value: aggregate.tokens.toLocaleString(),
                cls: 'text-foreground',
              },
              {
                icon: <Zap className="h-4 w-4" />,
                label: 'Latência Média',
                value: `${(aggregate.avgLatency / 1000).toFixed(1)}s`,
                cls: 'text-nexus-amber',
              },
              {
                icon: <Trophy className="h-4 w-4" />,
                label: 'Melhor Algoritmo',
                value: winnerMode ? ORACLE_MODES[winnerMode].label : '—',
                cls: 'text-primary font-bold',
              },
            ].map((m) => (
              <Card key={m.label} className="p-4 bg-secondary/20 border-border/40 text-center">
                <div className="flex justify-center mb-1.5 opacity-60">{m.icon}</div>
                <p className={`text-body-sm font-extrabold ${m.cls}`}>{m.value}</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                  {m.label}
                </p>
              </Card>
            ))}
          </div>

          {/* Results grid */}
          <div className={`grid gap-4 ${runs.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
            {runs.map((run) => {
              const modeInfo = ORACLE_MODES[run.mode];
              const isWinner = winnerMode === run.mode && run.status === 'success';
              return (
                <Card
                  key={run.mode}
                  className={`p-5 space-y-4 relative transition-all ${
                    isWinner
                      ? 'border-primary/50 shadow-nexus-md shadow-primary/5 ring-1 ring-primary/20'
                      : 'border-border/60 bg-card/60'
                  }`}
                >
                  {isWinner && (
                    <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-nexus-lg border-2 border-background">
                      <Trophy className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl">{modeInfo.icon}</span>
                      <p className="text-meta font-bold uppercase tracking-tight truncate">
                        {modeInfo.label}
                      </p>
                    </div>
                    {run.status === 'pending' && (
                      <Badge
                        variant="outline"
                        className="text-[9px] uppercase font-bold opacity-40"
                      >
                        Turno 0
                      </Badge>
                    )}
                    {run.status === 'running' && (
                      <Badge
                        variant="outline"
                        className="text-[9px] gap-1.5 bg-primary/5 text-primary border-primary/20 animate-pulse font-bold uppercase"
                      >
                        <Loader2 className="h-2.5 w-2.5 animate-spin" /> Em Sessão
                      </Badge>
                    )}
                    {run.status === 'success' && (
                      <Badge
                        variant="outline"
                        className="text-[9px] border-nexus-emerald/30 bg-nexus-emerald/5 text-nexus-emerald font-bold uppercase"
                      >
                        {(run.duration_ms / 1000).toFixed(1)}s OK
                      </Badge>
                    )}
                    {run.status === 'failed' && (
                      <Badge
                        variant="outline"
                        className="text-[9px] border-destructive/30 bg-destructive/5 text-destructive font-bold uppercase"
                      >
                        ERRO
                      </Badge>
                    )}
                  </div>

                  {run.status === 'success' && run.result && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-1">
                        <div className="text-center p-1.5 rounded-lg bg-secondary/40 border border-border/30">
                          <p className="text-[9px] font-bold text-muted-foreground uppercase mb-0.5">
                            Conf.
                          </p>
                          <p className="text-meta font-mono font-extrabold text-foreground">
                            {((run.result.confidence_score ?? 0) * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div className="text-center p-1.5 rounded-lg bg-secondary/40 border border-border/30">
                          <p className="text-[9px] font-bold text-muted-foreground uppercase mb-0.5">
                            Cons.
                          </p>
                          <p className="text-meta font-mono font-extrabold text-foreground">
                            {((run.result.consensus_degree ?? 0) * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div className="text-center p-1.5 rounded-lg bg-secondary/40 border border-border/30">
                          <p className="text-[9px] font-bold text-muted-foreground uppercase mb-0.5">
                            Custo
                          </p>
                          <p className="text-meta font-mono font-extrabold text-foreground">
                            ${(run.result.metrics?.total_cost_usd ?? 0).toFixed(4)}
                          </p>
                        </div>
                      </div>

                      <div className="text-meta text-foreground/80 leading-relaxed max-h-[200px] overflow-y-auto pr-1 bg-secondary/20 p-3 rounded-xl border border-border/40 scrollbar-hide italic">
                        "{run.result.final_response ?? 'Nenhuma resposta sintetizada.'}"
                      </div>

                      <div className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
                        <Cpu className="h-3 w-3 opacity-60" />{' '}
                        {run.result.metrics?.models_used || 0} Especialistas Consultados
                      </div>
                    </div>
                  )}

                  {run.status === 'failed' && (
                    <div className="py-10 text-center">
                      <XCircle className="h-8 w-8 text-destructive/30 mx-auto mb-2" />
                      <p className="text-meta text-destructive font-bold uppercase tracking-tight">
                        Falha Crítica
                      </p>
                      <p className="text-[9px] text-muted-foreground mt-1 line-clamp-3">
                        {run.error ?? 'Orquestrador Offline'}
                      </p>
                    </div>
                  )}

                  {run.status === 'pending' && (
                    <div className="py-10 text-center opacity-40">
                      <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-meta font-bold uppercase tracking-widest">
                        Aguardando Fila
                      </p>
                    </div>
                  )}

                  {run.status === 'running' && (
                    <div className="py-10 text-center">
                      <Loader2 className="h-8 w-8 text-primary/40 animate-spin mx-auto mb-2" />
                      <p className="text-meta font-bold uppercase tracking-widest animate-pulse">
                        Sintetizando...
                      </p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
