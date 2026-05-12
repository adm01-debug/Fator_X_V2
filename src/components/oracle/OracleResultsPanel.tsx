import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { 
  Copy, RefreshCw, FileText, ShieldCheck, Activity, DollarSign, Zap, 
  Cpu, Download, CheckCircle2, AlertTriangle, XCircle, Share, Code
} from 'lucide-react';
import { useOracleStore, ORACLE_MODES, ORACLE_PRESETS } from '@/stores/oracleStore';
import { ConsensusMatrix } from './ConsensusMatrix';
import { ModelCard } from './ModelCard';
import { exportToMarkdown, exportToJson, downloadText } from '@/lib/oracleExport';
import { toast } from 'sonner';

export function OracleResultsPanel() {
  const store = useOracleStore();
  const results = store.results;

  if (!results) return null;

  const currentPreset = ORACLE_PRESETS.find((p) => p.id === store.selectedPreset);
  const modeConfig = ORACLE_MODES[store.mode];

  const handleExportMd = () => {
    const md = exportToMarkdown(
      store.query,
      results,
      currentPreset?.name || store.selectedPreset,
      `${modeConfig.icon} ${modeConfig.label}`,
      store.chairmanModel,
    );
    downloadText(md, `oraculo_${Date.now()}.md`);
    toast.success('Markdown exportado!');
  };

  const handleExportJson = () => {
    const json = exportToJson(
      store.query,
      results,
      currentPreset?.name || store.selectedPreset,
      `${modeConfig.icon} ${modeConfig.label}`,
      store.chairmanModel,
    );
    downloadText(json, `oraculo_${Date.now()}.json`, 'application/json');
    toast.success('JSON exportado!');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Metrics cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            v: `${results.confidence_score}%`, l: 'Confiança',
            c: results.confidence_score >= 80 ? 'text-nexus-emerald' : results.confidence_score >= 50 ? 'text-nexus-amber' : 'text-nexus-rose',
            icon: <ShieldCheck className="h-4 w-4" />
          },
          {
            v: `${results.consensus_degree}%`, l: 'Consenso',
            c: results.consensus_degree >= 80 ? 'text-nexus-emerald' : results.consensus_degree >= 50 ? 'text-nexus-amber' : 'text-nexus-rose',
            icon: <Activity className="h-4 w-4" />
          },
          { v: `$${results.metrics.total_cost_usd.toFixed(4)}`, l: 'Investimento', c: 'text-foreground', icon: <DollarSign className="h-4 w-4" /> },
          { v: `${(results.metrics.total_latency_ms / 1000).toFixed(1)}s`, l: 'Tempo Global', c: 'text-foreground', icon: <Zap className="h-4 w-4" /> },
        ].map((m) => (
          <Card key={m.l} className="p-4 flex flex-col items-center justify-center text-center bg-card/60 backdrop-blur-sm border-border/60 shadow-sm group hover:border-primary/30 transition-all">
            <div className="p-2 rounded-lg bg-secondary/50 text-muted-foreground mb-2 group-hover:text-primary transition-colors">
              {m.icon}
            </div>
            <p className={`text-2xl font-heading font-extrabold tracking-tight ${m.c}`}>{m.v}</p>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{m.l}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="response" className="w-full">
        <TabsList className="bg-muted/50 p-1 rounded-2xl h-12 w-full max-w-[600px] mx-auto mb-8 border border-border/40">
          <TabsTrigger value="response" className="rounded-xl flex-1 gap-2 font-bold data-[state=active]:bg-card data-[state=active]:shadow-md">
            <FileText className="h-4 w-4" /> Síntese
          </TabsTrigger>
          <TabsTrigger value="individual" className="rounded-xl flex-1 gap-2 font-bold data-[state=active]:bg-card data-[state=active]:shadow-md">
            <Cpu className="h-4 w-4" /> Opiniões ({results.stage1_results.length})
          </TabsTrigger>
          <TabsTrigger value="consensus" className="rounded-xl flex-1 gap-2 font-bold data-[state=active]:bg-card data-[state=active]:shadow-md">
            <Activity className="h-4 w-4" /> Matriz
          </TabsTrigger>
          <TabsTrigger value="metrics" className="rounded-xl flex-1 gap-2 font-bold data-[state=active]:bg-card data-[state=active]:shadow-md">
            <Activity className="h-4 w-4" /> Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="response" className="mt-0 focus-visible:outline-none">
          <Card className="p-8 rounded-3xl border-border/60 bg-card/80 backdrop-blur-md shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            
            <div className="flex items-center justify-between mb-8 relative">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="rounded-lg px-2.5 py-1 bg-primary/5 text-primary border-primary/20 text-[10px] font-bold uppercase tracking-wider">
                  {modeConfig.icon} {modeConfig.label}
                </Badge>
                <Badge variant="outline" className="rounded-lg px-2.5 py-1 bg-muted/50 text-muted-foreground border-border/50 text-[10px] font-bold uppercase">
                  Presidente: {store.chairmanModel.split('/').pop()}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-9 rounded-xl gap-2" onClick={() => { navigator.clipboard.writeText(results.final_response); toast.success('Copiado!'); }}>
                  <Copy className="h-3.5 w-3.5" /> Copiar Resposta
                </Button>
                <Button size="sm" variant="outline" className="h-9 rounded-xl gap-2" onClick={handleExportMd}>
                  <Download className="h-3.5 w-3.5" /> MD
                </Button>
                <Button size="sm" variant="outline" className="h-9 rounded-xl gap-2" onClick={handleExportJson}>
                  <Code className="h-3.5 w-3.5" /> JSON
                </Button>
              </div>
            </div>

            <div className="text-foreground whitespace-pre-wrap text-base leading-relaxed prose prose-neutral max-w-none dark:prose-invert relative">
              {results.final_response}
            </div>

            <div className="mt-10 pt-6 border-t border-border/40 flex justify-center">
              <Button 
                variant="ghost" 
                size="sm" 
                className="rounded-xl gap-2 text-muted-foreground hover:text-primary transition-all font-bold uppercase tracking-widest text-[10px]" 
                onClick={() => { store.clearResults(); store.submitQuery(); }}
              >
                <RefreshCw className="h-4 w-4" /> Solicitar Nova Revisão ao Conselho
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="individual" className="mt-0 focus-visible:outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {results.stage1_results.map((r, i) => (
              <ModelCard key={i} response={r} rank={i + 1} showThinking={store.enableThinking} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="consensus" className="mt-0 focus-visible:outline-none">
          {results.consensus_points && results.consensus_points.length > 0 ? (
            <ConsensusMatrix points={results.consensus_points} overallConsensus={results.consensus_degree} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6 rounded-2xl border-nexus-emerald/20 bg-nexus-emerald/5">
                <p className="text-xs font-extrabold text-nexus-emerald uppercase tracking-wider mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Pontos de Consenso
                </p>
                <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed opacity-80">
                  {results.final_response.match(/## Pontos de Consenso[\s\S]*?(?=##|$)/)?.[0] || 'Análise de consenso disponível na síntese principal.'}
                </div>
              </Card>
              <Card className="p-6 rounded-2xl border-nexus-amber/20 bg-nexus-amber/5">
                <p className="text-xs font-extrabold text-nexus-amber uppercase tracking-wider mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Divergências Identificadas
                </p>
                <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed opacity-80">
                  {results.final_response.match(/## Divergências[\s\S]*?(?=##|$)/)?.[0] || 'Nenhuma divergência crítica encontrada pelo conselho.'}
                </div>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="metrics" className="mt-0 focus-visible:outline-none">
          <Card className="p-8 rounded-3xl border-border/60">
            <h4 className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest mb-6 flex items-center gap-2">
              <Activity className="h-4 w-4" /> Relatório de Auditoria da Sessão
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
              {[
                ['Modo Operacional', `${modeConfig.icon} ${modeConfig.label}`],
                ['Preset de Conselho', currentPreset?.name || store.selectedPreset],
                ['Presidente da Sessão', store.chairmanModel.split('/').pop()],
                ['Quorum Utilizado', `${results.metrics.models_used} especialistas`],
                ['Volume de Dados', `${results.metrics.total_tokens.toLocaleString()} tokens`],
                ['Custo Operacional', `$${results.metrics.total_cost_usd.toFixed(4)}`],
                ...ORACLE_MODES[store.mode].stages.map((s, i) => {
                  const latencies = [results.metrics.stage1_latency_ms, results.metrics.stage2_latency_ms, results.metrics.stage3_latency_ms];
                  return [`Latência: ${s}`, `${((latencies[i] || 0) / 1000).toFixed(1)}s`];
                }),
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">{k}</span>
                  <span className="text-xs font-bold text-foreground font-mono">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 flex justify-between items-center p-4 bg-primary/5 rounded-xl border border-primary/20">
              <span className="text-sm font-bold text-primary uppercase tracking-wider">Tempo Total de Processamento</span>
              <span className="text-2xl font-heading font-extrabold text-primary font-mono">{(results.metrics.total_latency_ms / 1000).toFixed(1)}s</span>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
