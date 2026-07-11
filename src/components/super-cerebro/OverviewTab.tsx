import { Loader2, Network, Activity, TrendingUp, Database, Zap, GitMerge, TrendingDown, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { invokeCerebroBrain, getHealthScore } from "@/services/cerebroService";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { compactMemories } from "@/services/memoryService";
import { useState } from "react";

interface MemoryEntry {
  id: string;
  memory_type: string;
  content: string;
  created_at: string;
  agent_id?: string;
}

interface CerebroStats {
  agents?: number;
  knowledge_bases?: number;
  chunks?: number;
  memories?: number;
  entities?: number;
  relations?: number;
  tools?: number;
  workflows?: number;
  traces?: number;
  today_traces?: number;
  recent_memories?: MemoryEntry[];
}

export function OverviewTab() {
  const queryClient = useQueryClient();
  const [compacting, setCompacting] = useState(false);

  const handleCompact = async () => {
    setCompacting(true);
    try {
      await compactMemories('episodic');
      toast.success('Memórias episódicas compactadas');
      queryClient.invalidateQueries({ queryKey: ['cerebro_stats'] });
    } catch (e: any) {
      toast.error('Erro na compactação: ' + e.message);
    } finally {
      setCompacting(false);
    }
  };
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['cerebro_stats'],
    queryFn: async () => {
      const data = await invokeCerebroBrain({ action: 'stats' });
      // If we have enhanced memories, use them
      const memoryManager = await invokeCerebroBrain({ action: 'memory_manager' });
      return { 
        ...data, 
        recent_memories: memoryManager?.memories?.slice(0, 5) || data?.recent_memories || [] 
      } as CerebroStats;
    },
  });

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['cerebro_health'],
    queryFn: getHealthScore,
  });

  const isLoading = statsLoading || healthLoading;

  const metrics = [
    { label: 'Agentes', value: stats?.agents ?? 0, icon: '🤖', color: 'text-primary' },
    { label: 'Bases', value: stats?.knowledge_bases ?? 0, icon: '📚', color: 'text-nexus-emerald' },
    { label: 'Memórias', value: stats?.memories ?? 0, icon: '💾', color: 'text-nexus-purple' },
    { label: 'Entidades', value: stats?.entities ?? 0, icon: '🏢', color: 'text-nexus-blue' },
    { label: 'Relações', value: stats?.relations ?? 0, icon: '🔗', color: 'text-nexus-amber' },
    { label: 'Traces', value: stats?.traces ?? 0, icon: '📊', color: 'text-nexus-rose' },
    { label: 'Consultas Hoje', value: stats?.today_traces ?? 0, icon: '🔍', color: 'text-teal-400' },
    { label: 'Ferramentas', value: stats?.tools ?? 0, icon: '🔧', color: 'text-nexus-amber' },
  ];

  const healthScore = health?.score ?? 0;
  const healthColor =
    healthScore >= 80 ? 'text-nexus-emerald' :
    healthScore >= 60 ? 'text-nexus-amber' :
    healthScore >= 40 ? 'text-nexus-orange' :
    'text-destructive';
  const healthLabel =
    healthScore >= 80 ? 'Excelente' :
    healthScore >= 60 ? 'Saudável' :
    healthScore >= 40 ? 'Atenção' :
    'Crítico';

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Health Score Hero */}
          <div className="nexus-card">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
                    <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="6" fill="none" className="text-secondary/40" />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      stroke="currentColor"
                      strokeWidth="6"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 34}`}
                      strokeDashoffset={`${2 * Math.PI * 34 * (1 - healthScore / 100)}`}
                      className={healthColor}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-xl font-bold ${healthColor}`}>{healthScore}</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-body-sm font-heading font-semibold text-foreground flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" /> Health Score
                  </h3>
                  <p className={`text-meta font-medium mt-0.5 ${healthColor}`}>{healthLabel}</p>
                  <p className="text-meta text-muted-foreground mt-0.5">
                    {health?.collections ?? 0} coleções · {health?.docs ?? 0} docs · {health?.chunks ?? 0} chunks
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 text-right">
                <Badge variant="outline" className="border-nexus-emerald/30 text-nexus-emerald gap-1">
                  <TrendingUp className="h-3 w-3" /> Cérebro online
                </Badge>
                <span className="text-meta text-muted-foreground">
                  {stats?.today_traces ?? 0} consultas nas últimas 24h
                </span>
              </div>
            </div>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {metrics.map((m) => (
              <div key={m.label} className="nexus-card text-center py-4">
                <p className="text-2xl mb-1">{m.icon}</p>
                <p className={`text-xl font-heading font-bold ${m.color}`}>{m.value}</p>
                <p className="text-meta text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Memory architecture */}
          <div className="nexus-card">
            <h3 className="text-body-sm font-heading font-semibold text-foreground mb-3 flex items-center gap-2">
              <Network className="h-4 w-4 text-primary" /> Arquitetura de Memória
            </h3>
            <div className="grid md:grid-cols-3 gap-3">
              {[
                { icon: '💾', title: 'Memória Semântica', desc: 'Embeddings vetoriais de documentos e conhecimento', count: stats?.chunks ?? 0, unit: 'chunks' },
                { icon: '🕸️', title: 'Grafo de Conhecimento', desc: 'Relações entre agentes, KBs, ferramentas e workflows', count: (stats?.agents ?? 0) + (stats?.knowledge_bases ?? 0) + (stats?.tools ?? 0) + (stats?.workflows ?? 0), unit: 'nós' },
                { icon: '🧠', title: 'Memórias Episódicas', desc: 'Histórico de interações e eventos por agente', count: stats?.memories ?? 0, unit: 'entradas' },
              ].map((l) => (
                <div key={l.title} className="p-3 rounded-lg bg-secondary/30 border border-border/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{l.icon}</span>
                    <span className="text-meta font-semibold text-foreground">{l.title}</span>
                    <Badge variant="outline" className="text-meta ml-auto border-nexus-emerald/30 text-nexus-emerald">Ativo</Badge>
                  </div>
                  <p className="text-meta text-muted-foreground mb-2">{l.desc}</p>
                  <p className="text-body-sm font-bold text-foreground">
                    {l.count.toLocaleString('pt-BR')} <span className="text-meta text-muted-foreground font-normal">{l.unit}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Telemetria Neural — Real-time stream */}
          <div className="nexus-card">
            <h3 className="text-body-sm font-heading font-semibold text-foreground mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-nexus-amber" /> Telemetria Neural (Memórias Recentes)
            </h3>
            <div className="space-y-2">
              {stats?.recent_memories && stats.recent_memories.length > 0 ? (
                stats.recent_memories.map((m) => (
                  <div key={m.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-secondary/30 border border-border/30 animate-pulse-once">
                    <div className="mt-0.5">
                      {m.memory_type === 'semantic' ? '🧠' : m.memory_type === 'episodic' ? '📽️' : '💾'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-nexus-purple/30 text-nexus-purple">
                          {m.memory_type}
                        </Badge>
                        <span className="text-[9px] text-muted-foreground">
                          {new Date(m.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-meta text-foreground line-clamp-2 leading-relaxed">
                        {m.content}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 border border-dashed border-border/50 rounded-lg">
                  <p className="text-meta text-muted-foreground italic">Aguardando novos impulsos sinápticos...</p>
                </div>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-nexus-emerald animate-pulse" />
                <span className="text-meta text-muted-foreground">Monitoramento em tempo real ativo</span>
              </div>
              <Badge variant="outline" className="text-[9px] border-primary/20 text-primary">
                v10.0-PROD
              </Badge>
            </div>
          </div>

          {/* Quick Management */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="nexus-card">
              <h3 className="text-body-sm font-heading font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-nexus-emerald" /> Insights de Operação
              </h3>
              <div className="grid grid-cols-1 gap-2">
              {(() => {
                const insights: Array<{ msg: string; type: 'good' | 'warn' | 'info' }> = [];
                if ((stats?.knowledge_bases ?? 0) === 0) {
                  insights.push({ msg: 'Nenhuma base de conhecimento criada ainda', type: 'warn' });
                } else if ((stats?.chunks ?? 0) === 0) {
                  insights.push({ msg: 'Bases criadas, mas sem documentos indexados', type: 'warn' });
                } else {
                  insights.push({ msg: `${stats?.chunks ?? 0} chunks indexados em ${stats?.knowledge_bases ?? 0} bases`, type: 'good' });
                }
                if ((stats?.agents ?? 0) === 0) {
                  insights.push({ msg: 'Nenhum agente criado — comece pela página Agentes', type: 'warn' });
                } else {
                  insights.push({ msg: `${stats?.agents ?? 0} agentes ativos no workspace`, type: 'good' });
                }
                if ((stats?.today_traces ?? 0) > 100) {
                  insights.push({ msg: `Alto volume hoje: ${stats?.today_traces ?? 0} consultas`, type: 'info' });
                }
                return insights.map((insight, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 p-2 rounded text-meta ${
                      insight.type === 'good' ? 'bg-nexus-emerald/10 border border-nexus-emerald/20 text-nexus-emerald' :
                      insight.type === 'warn' ? 'bg-nexus-amber/10 border border-nexus-amber/20 text-nexus-amber' :
                      'bg-primary/10 border border-primary/20 text-primary'
                    }`}
                  >
                    <Database className="h-3 w-3 shrink-0 mt-0.5" />
                    <span>{insight.msg}</span>
                  </div>
                ));
              })()}
              </div>
            </div>
            
            <div className="nexus-card">
              <h3 className="text-body-sm font-heading font-semibold text-foreground mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Manutenção de Memória
              </h3>
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-secondary/30 border border-border/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-nexus-purple" />
                      <span className="text-meta font-semibold">Compactação Automática</span>
                    </div>
                    <Badge variant="outline" className="text-meta border-nexus-emerald/30 text-nexus-emerald">Otimizado</Badge>
                  </div>
                  <p className="text-meta text-muted-foreground mb-3">Reduza o custo de contexto fundindo memórias episódicas similares em fatos canônicos.</p>
                  <Button 
                    size="sm" 
                    className="w-full h-8 gap-2 text-meta" 
                    variant="outline" 
                    onClick={handleCompact}
                    disabled={compacting}
                  >
                    {compacting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
                    Compactar Memórias Episódicas
                  </Button>
                </div>

                <div className="p-3 rounded-lg bg-secondary/30 border border-border/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-nexus-orange" />
                      <span className="text-meta font-semibold">Temporal Decay</span>
                    </div>
                    <Badge variant="outline" className="text-meta">Ativo</Badge>
                  </div>
                  <p className="text-meta text-muted-foreground">O Super Cérebro esquece gradualmente informações irrelevantes para manter a precisão.</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
