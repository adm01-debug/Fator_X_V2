/**
 * Deep Research Panel — UI para o oracle-research Edge Function
 * Pesquisa iterativa profunda com progresso em tempo real.
 */

import { useState, useCallback } from 'react';
import { invokeOracleResearch } from '@/services/llmGatewayService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Loader2, Search, FileText, ChevronDown, ChevronUp, AlertTriangle, Download } from 'lucide-react';
import { ResearchProgress } from './ResearchProgress';

interface ResearchResult {
  report: string;
  iterations: number;
  sources: string[];
  total_tokens: number;
  latency_ms: number;
  steps: Array<{ iteration: number; findings: string; gaps_identified: string[] }>;
}

const MAX_ITER: Record<'quick' | 'standard' | 'deep', number> = { quick: 2, standard: 5, deep: 10 };

export function DeepResearchPanel() {
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState<'quick' | 'standard' | 'deep'>('standard');
  const [isResearching, setIsResearching] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  const startResearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsResearching(true);
    setStartedAt(Date.now());
    setError(null);
    setResult(null);

    try {
      const data = await invokeOracleResearch({
        query: query.trim(),
        depth,
        max_iterations: MAX_ITER[depth],
        language: 'pt',
      });
      setResult(data as ResearchResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na pesquisa');
    } finally {
      setIsResearching(false);
    }
  }, [query, depth]);

  return (
    <Card className="p-8 bg-card border-border rounded-3xl shadow-sm relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/[0.02] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      
      <div className="flex items-center gap-4 mb-6 relative">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/15">
          <Search className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            Deep Research v2
            <Badge className="bg-primary/20 text-primary border-none text-meta font-bold px-2 py-0">EXPERIMENTAL</Badge>
          </h3>
          <p className="text-meta text-muted-foreground max-w-lg leading-relaxed">
            Pesquisa iterativa profunda com agentes autônomos que buscam, validam e sintetizam relatórios técnicos em múltiplos domínios.
          </p>
        </div>
      </div>

      <div className="relative mb-6">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ex: Análise completa do mercado de semicondutores e tendências para chips de IA em 2027..."
          rows={3}
          className="w-full bg-secondary/40 border border-border/60 rounded-2xl p-4 text-title-sm text-foreground placeholder-muted-foreground/60 resize-none focus:ring-primary focus:border-primary transition-all shadow-inner"
        />
        <div className="absolute bottom-3 right-3 text-meta font-mono text-muted-foreground/50 uppercase tracking-widest">
          Protocolo Web-Browsing Ativo
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-4 bg-secondary/30 rounded-2xl border border-border/40">
        <div className="flex items-center gap-4">
          <span className="text-meta font-extrabold text-muted-foreground uppercase tracking-widest ml-1">Profundidade:</span>
          <div className="flex gap-1">
            {(['quick', 'standard', 'deep'] as const).map(d => (
              <button
                key={d}
                onClick={() => setDepth(d)}
                className={`px-4 py-1.5 text-meta font-bold rounded-lg uppercase tracking-tighter transition-all ${
                  depth === d 
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' 
                    : 'bg-card text-muted-foreground hover:bg-secondary hover:text-foreground border border-border/60'
                }`}
              >
                {d === 'quick' ? '⚡ Rápido' : d === 'standard' ? '📊 Padrão' : '🔬 Profundo'}
              </button>
            ))}
          </div>
        </div>

        <Button onClick={startResearch} disabled={isResearching || !query.trim()} className="nexus-gradient-bg h-10 px-8 rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all font-bold group" size="sm">
          {isResearching ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />ANALISANDO GAPS...</>
          ) : (
            <><Search className="w-4 h-4 mr-2 group-hover:scale-125 transition-transform" />INICIAR PESQUISA</>
          )}
        </Button>
      </div>

      {isResearching && (
        <div className="mt-6">
          <ResearchProgress depth={depth} maxIterations={MAX_ITER[depth]} startedAt={startedAt} />
        </div>
      )}

      {error && (
        <Card className="mt-6 bg-destructive/5 border-destructive/20 p-4 animate-in shake-1 duration-500">
          <p className="text-meta text-destructive font-medium flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </p>
        </Card>
      )}

      {result && (
        <div className="space-y-6 mt-8 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Ciclos IA', value: result.iterations, cls: 'text-primary' },
              { label: 'Fontes Web', value: result.sources.length, cls: 'text-nexus-cyan' },
              { label: 'Quorum Tokens', value: result.total_tokens.toLocaleString(), cls: 'text-nexus-emerald' },
              { label: 'Tempo Est.', value: `${Math.round(result.latency_ms / 1000)}s`, cls: 'text-nexus-amber' },
            ].map(m => (
              <Card key={m.label} className="bg-card border-border/60 p-4 text-center">
                <div className={`text-2xl font-heading font-extrabold ${m.cls}`}>{m.value}</div>
                <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{m.label}</div>
              </Card>
            ))}
          </div>

          <Card className="p-8 rounded-3xl border-border/60 bg-card/60 relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <h4 className="text-body-sm font-bold text-foreground">Relatório Executivo Gerado</h4>
              </div>
              <Button variant="ghost" size="sm" className="h-8 rounded-lg gap-2 text-meta font-bold uppercase tracking-widest text-muted-foreground">
                <Download className="h-3.5 w-3.5" /> Salvar Relatório
              </Button>
            </div>
            <div className="text-body-sm text-foreground whitespace-pre-wrap leading-relaxed prose prose-neutral max-w-none dark:prose-invert">
              {result.report}
            </div>
          </Card>

          {result.steps && result.steps.length > 0 && (
            <div className="space-y-4">
              <button 
                onClick={() => setShowSteps(!showSteps)} 
                className="flex items-center gap-2 text-meta font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest px-1"
              >
                {showSteps ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showSteps ? 'Ocultar' : 'Ver'} Log de Iterações ({result.steps.length})
              </button>

              {showSteps && (
                <div className="grid grid-cols-1 gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
                  {result.steps.map((step, i) => (
                    <Card key={i} className="p-4 bg-secondary/20 border-border/40 flex gap-4">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-meta font-bold text-primary shrink-0">
                        {step.iteration}
                      </div>
                      <div className="space-y-2">
                        <p className="text-meta text-foreground/80 leading-relaxed italic">"{step.findings.substring(0, 250)}..."</p>
                        {step.gaps_identified.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {step.gaps_identified.map((gap, j) => (
                              <Badge key={j} variant="outline" className="text-[9px] bg-nexus-amber/5 text-nexus-amber border-nexus-amber/20 font-bold px-2 py-0">
                                GAP: {gap}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {result.sources.length > 0 && (
            <div className="p-4 bg-muted/30 rounded-2xl border border-border/40">
              <p className="text-meta font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">Referências Consultadas</p>
              <div className="flex flex-wrap gap-2">
                {result.sources.slice(0, 8).map((src, i) => (
                  <Badge key={i} variant="outline" className="text-meta bg-card border-border/60 text-muted-foreground font-mono">
                    {src.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                  </Badge>
                ))}
                {result.sources.length > 8 && <span className="text-meta text-muted-foreground font-bold ml-1">+{result.sources.length - 8} fontes</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
