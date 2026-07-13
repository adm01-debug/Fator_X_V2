/**
 * ResearchHistoryPanel — Histórico das execuções do oracle-research.
 * Mostra status (sucesso/parcial/falha), duração, iterações, fontes e erros.
 */
import { useEffect, useState, useCallback } from 'react';
import { fetchOracleHistory, deleteOracleHistory, type OracleHistoryEntry } from '@/lib/oracleHistory';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2, AlertTriangle, XCircle, Clock, RefreshCw, Trash2,
  FileText, Layers, Link2, Loader2, ChevronDown, ChevronUp,
  Settings2, Compass, Zap, Coins, Timer, Hash, Brain, Globe2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { DbRow } from '@/types/dbRow';

type Status = 'success' | 'partial' | 'error';

interface RunConfig {
  depth?: string;
  strategy?: string;
  maxIterations?: number;
  queriesPerIteration?: number;
  synthesisModel?: string;
  language?: string;
  includeInternal?: boolean;
  stopOnNoGaps?: boolean;
  maxTokens?: number;
  maxSources?: number;
  maxLatencySec?: number;
  maxCostUsd?: number;
  stoppedReason?: string;
}

interface ParsedRun {
  entry: OracleHistoryEntry;
  status: Status;
  iterations: number;
  sourcesCount: number;
  reportPreview: string;
  errorMessage?: string;
  config: RunConfig;
}

function extractConfig(r: Record<string, unknown>): RunConfig {
  const budgets = (r.budgets ?? {}) as Record<string, unknown>;
  const num = (v: DbRow): number | undefined => (typeof v === 'number' ? v : undefined);
  const str = (v: DbRow): string | undefined => (typeof v === 'string' ? v : undefined);
  const bool = (v: DbRow): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
  return {
    depth: str(r.depth),
    strategy: str(r.strategy),
    maxIterations: num(r.max_iterations) ?? num(r.maxIterations),
    queriesPerIteration: num(r.queries_per_iteration) ?? num(r.queriesPerIteration),
    synthesisModel: str(r.synthesis_model) ?? str(r.synthesisModel),
    language: str(r.language),
    includeInternal: bool(r.include_internal) ?? bool(r.includeInternal),
    stopOnNoGaps: bool(r.stop_on_no_gaps) ?? bool(r.stopOnNoGaps),
    maxTokens: num(budgets.max_tokens) ?? num(r.max_tokens),
    maxSources: num(budgets.max_sources) ?? num(r.max_sources),
    maxLatencySec:
      num(budgets.max_latency_sec) ??
      (num(budgets.max_latency_ms) !== undefined ? Math.round((budgets.max_latency_ms as number) / 1000) : undefined),
    maxCostUsd: num(budgets.max_cost_usd) ?? num(r.max_cost_usd),
    stoppedReason: str(r.stopped_reason),
  };
}

function parseRun(entry: OracleHistoryEntry): ParsedRun {
  const r = (entry.results ?? {}) as unknown as Record<string, unknown> & {
    report?: string;
    iterations?: number;
    sources?: DbRow[];
    steps?: DbRow[];
    error?: string;
  };
  const report = typeof r.report === 'string' ? r.report : '';
  const errorMessage = typeof r.error === 'string' ? r.error : undefined;
  let status: Status = 'success';
  if (errorMessage) status = 'error';
  else if (!report || report.trim().length < 40) status = 'partial';
  return {
    entry,
    status,
    iterations: Number(r.iterations ?? (Array.isArray(r.steps) ? r.steps.length : 0)),
    sourcesCount: Array.isArray(r.sources) ? r.sources.length : 0,
    reportPreview: report.slice(0, 220),
    errorMessage,
    config: extractConfig(r),
  };
}

const STATUS_META: Record<Status, { label: string; icon: typeof CheckCircle2; cls: string; ring: string }> = {
  success: { label: 'Sucesso', icon: CheckCircle2, cls: 'text-nexus-emerald', ring: 'bg-nexus-emerald/10 border-nexus-emerald/25' },
  partial: { label: 'Parcial', icon: AlertTriangle, cls: 'text-nexus-amber', ring: 'bg-nexus-amber/10 border-nexus-amber/25' },
  error:   { label: 'Falha',   icon: XCircle,        cls: 'text-destructive', ring: 'bg-destructive/10 border-destructive/25' },
};

function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const STRATEGY_LABEL: Record<string, string> = {
  broad: 'Ampla',
  balanced: 'Equilibrada',
  focused: 'Focada',
};

const DEPTH_LABEL: Record<string, string> = {
  quick: 'Rápida',
  standard: 'Padrão',
  deep: 'Profunda',
};

const STOP_REASON_LABEL: Record<string, string> = {
  completed: 'Concluído',
  no_gaps: 'Sem novos gaps',
  budget_tokens: 'Limite de tokens',
  budget_time: 'Limite de latência',
  budget_sources: 'Limite de fontes',
  budget_cost: 'Limite de custo',
};

function ConfigItem({ icon: Icon, label, value }: { icon: typeof Settings2; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-meta uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-body-sm font-semibold text-foreground truncate">{value}</div>
      </div>
    </div>
  );
}

function ConfigSummary({ config }: { config: RunConfig }) {
  const items: React.ReactNode[] = [];
  if (config.depth)
    items.push(<ConfigItem key="depth" icon={Zap} label="Profundidade" value={DEPTH_LABEL[config.depth] ?? config.depth} />);
  if (config.strategy)
    items.push(<ConfigItem key="strategy" icon={Compass} label="Estratégia" value={STRATEGY_LABEL[config.strategy] ?? config.strategy} />);
  if (typeof config.maxIterations === 'number')
    items.push(<ConfigItem key="iter" icon={Layers} label="Máx. iterações" value={String(config.maxIterations)} />);
  if (typeof config.queriesPerIteration === 'number')
    items.push(<ConfigItem key="qpi" icon={Hash} label="Queries/iteração" value={String(config.queriesPerIteration)} />);
  if (config.synthesisModel)
    items.push(<ConfigItem key="model" icon={Brain} label="Modelo síntese" value={config.synthesisModel} />);
  if (config.language)
    items.push(<ConfigItem key="lang" icon={Globe2} label="Idioma" value={config.language.toUpperCase()} />);
  if (typeof config.maxTokens === 'number')
    items.push(<ConfigItem key="tokens" icon={FileText} label="Máx. tokens" value={config.maxTokens.toLocaleString('pt-BR')} />);
  if (typeof config.maxSources === 'number')
    items.push(<ConfigItem key="sources" icon={Link2} label="Máx. fontes" value={String(config.maxSources)} />);
  if (typeof config.maxLatencySec === 'number')
    items.push(<ConfigItem key="lat" icon={Timer} label="Latência máx." value={`${config.maxLatencySec}s`} />);
  if (typeof config.maxCostUsd === 'number')
    items.push(<ConfigItem key="cost" icon={Coins} label="Custo máx." value={`US$ ${config.maxCostUsd.toFixed(2)}`} />);

  if (items.length === 0 && !config.stoppedReason) {
    return (
      <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 text-meta text-muted-foreground italic">
        Configuração não registrada para esta execução.
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-meta font-bold uppercase tracking-widest text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5 text-primary" /> Configuração usada
        </div>
        {config.stoppedReason && (
          <Badge variant="outline" className="text-meta font-bold">
            Encerrado: {STOP_REASON_LABEL[config.stoppedReason] ?? config.stoppedReason}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5">
        {items}
      </div>
      {(config.includeInternal !== undefined || config.stopOnNoGaps !== undefined) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {config.includeInternal !== undefined && (
            <Badge variant="outline" className="text-meta">
              Base interna: {config.includeInternal ? 'sim' : 'não'}
            </Badge>
          )}
          {config.stopOnNoGaps !== undefined && (
            <Badge variant="outline" className="text-meta">
              Parar sem gaps: {config.stopOnNoGaps ? 'sim' : 'não'}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

type FilterKey = 'all' | Status;


export function ResearchHistoryPanel() {
  const [runs, setRuns] = useState<ParsedRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchOracleHistory({ mode: 'deep_research' as never });
    setRuns(data.map(parseRun));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (id: string) => {
    const ok = await deleteOracleHistory(id);
    if (ok) {
      setRuns(prev => prev.filter(r => r.entry.id !== id));
      toast.success('Execução removida do histórico');
    } else {
      toast.error('Falha ao remover execução');
    }
  };

  const filtered = filter === 'all' ? runs : runs.filter(r => r.status === filter);
  const counts = {
    all: runs.length,
    success: runs.filter(r => r.status === 'success').length,
    partial: runs.filter(r => r.status === 'partial').length,
    error: runs.filter(r => r.status === 'error').length,
  };

  return (
    <Card className="p-6 rounded-2xl bg-card border border-border/60 shadow-nexus-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/15">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-title-sm font-bold text-foreground">Histórico do Deep Research</h3>
            <p className="text-meta text-muted-foreground">Últimas execuções com status, duração e erros</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2 h-9 rounded-xl">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {([
          { k: 'all',     label: 'Todas' },
          { k: 'success', label: 'Sucesso' },
          { k: 'partial', label: 'Parcial' },
          { k: 'error',   label: 'Falhas'  },
        ] as const).map(f => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className={`px-3 py-1.5 text-meta font-bold rounded-lg uppercase tracking-widest transition-all border ${
              filter === f.k
                ? 'bg-primary text-primary-foreground border-primary shadow-nexus-sm'
                : 'bg-secondary/40 text-muted-foreground border-border/50 hover:text-foreground'
            }`}
          >
            {f.label} · {counts[f.k]}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading && runs.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando execuções...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14 text-meta text-muted-foreground">
          Nenhuma execução {filter !== 'all' ? `com status "${STATUS_META[filter].label.toLowerCase()}"` : ''} encontrada.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(run => {
            const meta = STATUS_META[run.status];
            const Icon = meta.icon;
            const isOpen = expanded === run.entry.id;
            return (
              <Card key={run.entry.id} className={`p-4 rounded-xl border transition-all ${meta.ring}`}>
                <div className="flex items-start gap-4">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${meta.ring}`}>
                    <Icon className={`h-5 w-5 ${meta.cls}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-body-sm font-semibold text-foreground truncate">{run.entry.query}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-meta text-muted-foreground">
                          <span className="font-mono">{formatDate(run.entry.created_at)}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDuration(run.entry.total_latency_ms)}</span>
                          <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {run.iterations} iter.</span>
                          <span className="flex items-center gap-1"><Link2 className="h-3 w-3" /> {run.sourcesCount} fontes</span>
                          <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {(run.entry.total_tokens ?? 0).toLocaleString('pt-BR')} tokens</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={`${meta.cls} bg-transparent border ${meta.ring} font-bold text-meta`}>{meta.label}</Badge>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setExpanded(isOpen ? null : run.entry.id)}
                          className="h-8 w-8 p-0"
                          aria-label={isOpen ? 'Recolher' : 'Expandir'}
                        >
                          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => handleDelete(run.entry.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          aria-label="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-300">
                        <ConfigSummary config={run.config} />
                        {run.errorMessage && (
                          <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-meta text-destructive">
                            <strong className="font-bold">Erro:</strong> {run.errorMessage}
                          </div>
                        )}
                        {run.reportPreview && (
                          <div className="p-3 rounded-lg bg-secondary/40 border border-border/50 text-meta text-foreground/80 whitespace-pre-wrap leading-relaxed">
                            {run.reportPreview}{run.reportPreview.length >= 220 ? '...' : ''}
                          </div>
                        )}
                        {!run.reportPreview && !run.errorMessage && (
                          <div className="text-meta text-muted-foreground italic">Sem relatório disponível.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Card>
  );
}
