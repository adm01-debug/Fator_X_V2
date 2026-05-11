import { CardGridSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { QuickActionsBar } from "@/components/shared/QuickActionsBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Search, BookOpen, ArrowRight, Database, Pencil, Trash2, Bot, 
  FileText, Activity, Layers, Zap, Shield, Sparkles, Filter, 
  BarChart3, BrainCircuit, Globe, RefreshCcw, LayoutGrid, List
} from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listKnowledgeBases, deleteKnowledgeBase, listVectorIndexes, getChunkEmbeddingStats } from "@/services/knowledgeService";
import { CreateKnowledgeBaseDialog } from "@/components/dialogs/CreateKnowledgeBaseDialog";
import { EditKnowledgeBaseDialog } from "@/components/dialogs/EditKnowledgeBaseDialog";
import { KnowledgeBaseDetail } from "@/components/knowledge/KnowledgeBaseDetail";
import { AudioUploadDialog } from "@/components/knowledge/AudioUploadDialog";
import { DocOcrDialog } from "@/components/knowledge/DocOcrDialog";
import { RagRerankTestDialog } from "@/components/knowledge/RagRerankTestDialog";
import { AccessControl, DangerousActionDialog } from "@/components/rbac";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const pipeline = [
  { name: 'Parsing', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { name: 'Chunking', icon: Layers, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { name: 'Metadata', icon: Shield, color: 'text-nexus-emerald', bg: 'bg-nexus-emerald/10' },
  { name: 'Embeddings', icon: BrainCircuit, color: 'text-nexus-amber', bg: 'bg-nexus-amber/10' },
  { name: 'Indexing', icon: Database, color: 'text-primary', bg: 'bg-primary/10' }
];

export default function KnowledgePage() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editKb, setEditKb] = useState<any>(null);
  const [selectedKb, setSelectedKb] = useState<{ id: string; name: string } | null>(null);
  const queryClient = useQueryClient();

  const { data: knowledgeBases = [], isLoading, refetch } = useQuery({
    queryKey: ['knowledge_bases'],
    queryFn: listKnowledgeBases,
  });

  const filtered = knowledgeBases.filter((kb: any) =>
    kb.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    try {
      await deleteKnowledgeBase(id);
      toast.success("Base removida com sucesso");
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin', 'knowledge_bases'] });
    } catch (err) {
      toast.error(`Erro ao deletar: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    }
  };

  if (selectedKb) {
    return (
      <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        <KnowledgeBaseDetail kbId={selectedKb.id} kbName={selectedKb.name} onBack={() => setSelectedKb(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <PageHeader
          title="Engine de Conhecimento & RAG"
          description="Arquitetura de dados para Retrieval-Augmented Generation em escala industrial"
          actions={
            <div className="flex items-center gap-3">
              <AudioUploadDialog />
              <DocOcrDialog />
              <RagRerankTestDialog />
              <CreateKnowledgeBaseDialog onCreated={() => refetch()} />
            </div>
          }
        />
        <div className="flex gap-2 mb-2">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1.5 py-1 px-3">
            <Sparkles className="h-3 w-3" /> Auto-Scaling Ingestion
          </Badge>
          <Badge variant="outline" className="bg-nexus-emerald/5 text-nexus-emerald border-nexus-emerald/20 gap-1.5 py-1 px-3">
            <Activity className="h-3 w-3" /> Vector DB Nominal
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 space-y-6">
          <QuickActionsBar actions={[
            { label: 'Agentes', icon: Bot, path: '/agents' },
            { label: 'Prompts', icon: FileText, path: '/prompts' },
            { label: 'Workflows', icon: Zap, path: '/workflows' },
          ]} />

          <div className="nexus-card bg-card/50 backdrop-blur-sm border-border/40 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <RefreshCcw className="h-4 w-4 text-primary animate-spin-slow" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Workflow de Ingestão Neural</h3>
              </div>
              <Badge variant="secondary" className="text-[10px] font-mono">Parallel Execution: Active</Badge>
            </div>
            
            <div className="relative">
              <div className="absolute top-5 left-0 right-0 h-0.5 bg-border/30 hidden md:block" />
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 relative">
                {pipeline.map((step, i) => (
                  <div key={step.name} className="flex flex-col items-center group">
                    <div className={`h-11 w-11 rounded-xl ${step.bg} flex items-center justify-center relative z-10 transition-all group-hover:scale-110 shadow-lg border border-border/20`}>
                      <step.icon className={`h-5 w-5 ${step.color}`} />
                      <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-background border border-border/40 flex items-center justify-center text-[10px] font-bold">
                        {i + 1}
                      </div>
                    </div>
                    <div className="mt-3 text-center">
                      <p className="text-xs font-bold text-foreground">{step.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">Pipeline Stage</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Filtrar ecossistema de conhecimento..." 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  className="pl-9 bg-card/50 border-border/40 focus:ring-primary/20" 
                />
              </div>
              <div className="flex border border-border/40 rounded-lg p-1 bg-card/50">
                <Button 
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                  size="icon" className="h-8 w-8" 
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button 
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                  size="icon" className="h-8 w-8" 
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs gap-1.5 border-border/40">
                <Filter className="h-3.5 w-3.5" /> Filtros Avançados
              </Button>
              <Button variant="outline" size="sm" className="text-xs gap-1.5 border-border/40">
                <BarChart3 className="h-3.5 w-3.5" /> Analytics
              </Button>
            </div>
          </div>

          {isLoading ? (
            <CardGridSkeleton count={6} cols={3} />
          ) : filtered.length === 0 ? (
            <div className="nexus-card flex flex-col items-center justify-center py-20 text-center bg-card/30 border-dashed">
              <div className="h-20 w-20 rounded-full bg-secondary/30 flex items-center justify-center mb-6 border border-border/20">
                <Database className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-2">Vácuo de Informação Detectado</h2>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">Sua infraestrutura RAG ainda não possui bases de dados ativas. Comece conectando uma fonte de conhecimento.</p>
              <CreateKnowledgeBaseDialog onCreated={() => refetch()} />
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((kb: any) => (
                <div key={kb.id}
                  className="nexus-card group cursor-pointer hover:border-primary/40 transition-all hover:shadow-2xl hover:shadow-primary/5 p-0 overflow-hidden"
                  onClick={() => setSelectedKb({ id: kb.id, name: kb.name })}
                >
                  <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10 group-hover:scale-110 transition-transform">
                          <BookOpen className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{kb.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-border/40 font-mono">{kb.vector_db}</Badge>
                            <span className="text-[10px] text-muted-foreground">{kb.embedding_model?.split('-').slice(-1)}</span>
                          </div>
                        </div>
                      </div>
                      <StatusBadge status={kb.status || 'active'} />
                    </div>
                    
                    <p className="text-xs text-muted-foreground line-clamp-2 h-8">{kb.description || 'Base de conhecimento ativa em produção'}</p>
                    
                    <div className="grid grid-cols-2 gap-4 bg-secondary/20 rounded-xl p-3 border border-border/10">
                      <div>
                        <p className="text-sm font-bold text-foreground">{kb.document_count ?? 0}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-tighter">Documentos</p>
                      </div>
                      <div className="border-l border-border/20 pl-4">
                        <p className="text-sm font-bold text-foreground">{(kb.chunk_count ?? 0).toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-tighter">Segmentos</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-secondary/10 border-t border-border/30 p-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="flex-1 h-8 text-[11px] gap-1.5 hover:bg-primary/5" onClick={() => setEditKb(kb)}>
                      <Pencil className="h-3 w-3" /> Configurar
                    </Button>
                    <AccessControl permission="knowledge.delete">
                      <DangerousActionDialog
                        trigger={
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/5">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        }
                        title={`Decompor Base Neural`}
                        description="Esta ação desativará permanentemente o índice vetorial e todos os chunks associados. Agentes vinculados perderão a habilidade de consulta."
                        action="delete"
                        resourceType="knowledge_base"
                        resourceId={kb.id}
                        resourceName={kb.name}
                        confirmText={kb.name}
                        minReasonLength={10}
                        confirmLabel="Confirmar Decomposição"
                        onConfirm={async () => await handleDelete(kb.id)}
                      />
                    </AccessControl>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="nexus-card p-0 overflow-hidden border-border/40">
              <table className="w-full text-left">
                <thead className="bg-secondary/30 border-b border-border/40">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Base de Dados</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Engine / Modelo</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Volume</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {filtered.map((kb: any) => (
                    <tr key={kb.id} className="hover:bg-primary/5 transition-colors cursor-pointer group" onClick={() => setSelectedKb({ id: kb.id, name: kb.name })}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <BookOpen className="h-4 w-4 text-primary" />
                          <span className="text-sm font-semibold">{kb.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-mono">{kb.vector_db}</span>
                          <span className="text-[10px] text-muted-foreground">{kb.embedding_model}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <span className="font-bold">{kb.document_count ?? 0}</span> docs • <span className="font-bold">{(kb.chunk_count ?? 0).toLocaleString()}</span> chunks
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={kb.status || 'active'} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 group-hover:text-primary"><ArrowRight className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <VectorIndexesStatus />
          
          <div className="nexus-card bg-gradient-to-br from-primary/10 to-transparent border-primary/20 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Performance RAG</h4>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
                  <span>Latência de Busca</span>
                  <span className="text-primary">12ms avg</span>
                </div>
                <Progress value={85} className="h-1 bg-primary/10" />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
                  <span>Precisão Semântica</span>
                  <span className="text-nexus-emerald">94.2%</span>
                </div>
                <Progress value={94} className="h-1 bg-nexus-emerald/10" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">Seu sistema está operando com otimização HNSW em tempo real.</p>
          </div>

          <div className="nexus-card p-5 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Infraestrutura Vetorial</h4>
            <div className="space-y-3">
              {[
                { label: 'Supabase Vector', status: 'Ativo', icon: Globe },
                { label: 'Pinecone Global', status: 'Disponível', icon: Database },
                { label: 'Milvus Cluster', status: 'Ativo', icon: Layers },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between p-2 rounded-lg bg-secondary/20 border border-border/10">
                  <div className="flex items-center gap-2">
                    <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-medium">{s.label}</span>
                  </div>
                  <div className="h-1.5 w-1.5 rounded-full bg-nexus-emerald shadow-[0_0_4px_rgba(16,185,129,0.5)]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <EditKnowledgeBaseDialog
        kb={editKb}
        open={!!editKb}
        onOpenChange={(open) => { if (!open) setEditKb(null); }}
        onUpdated={() => refetch()}
      />
    </div>
  );
}

function VectorIndexesStatus() {
  const { data: indexes = [] } = useQuery({
    queryKey: ['vector_indexes'],
    queryFn: listVectorIndexes,
  });

  const { data: chunkStats } = useQuery({
    queryKey: ['chunk_embedding_stats'],
    queryFn: getChunkEmbeddingStats,
  });

  return (
    <div className="nexus-card bg-card/50 backdrop-blur-sm border-border/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-primary" /> Monitoramento Neural
        </h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger><Activity className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
            <TooltipContent>Estatísticas em tempo real do processamento de embeddings</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {chunkStats ? (
        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-nexus-emerald/5 border border-nexus-emerald/20">
            <div>
              <p className="text-sm font-bold text-nexus-emerald">{chunkStats.done.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Sincronizados</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-nexus-emerald/10 flex items-center justify-center">
              <Shield className="h-4 w-4 text-nexus-emerald" />
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-nexus-amber/5 border border-nexus-amber/20">
            <div>
              <p className="text-sm font-bold text-nexus-amber">{chunkStats.pending.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Na Fila</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-nexus-amber/10 flex items-center justify-center animate-pulse">
              <RefreshCcw className="h-4 w-4 text-nexus-amber" />
            </div>
          </div>
        </div>
      ) : (
        <div className="h-20 flex items-center justify-center">
          <RefreshCcw className="h-5 w-5 animate-spin text-muted-foreground/30" />
        </div>
      )}

      {indexes.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border/20">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight mb-2">Índices Vetoriais</p>
          {indexes.map((idx: any) => (
            <div key={idx.id} className="group p-2.5 rounded-lg bg-secondary/30 border border-border/10 hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold truncate max-w-[120px]">{(idx.knowledge_bases as any)?.name || 'Índice Ativo'}</span>
                <Badge variant="outline" className="text-[8px] h-4 py-0 border-nexus-emerald/30 text-nexus-emerald">Nominal</Badge>
              </div>
              <div className="flex items-center gap-2 text-[9px] text-muted-foreground font-mono">
                <span className="bg-background/50 px-1 rounded">{idx.provider}</span>
                <span>{idx.dimensions}d</span>
                <span className="truncate">{idx.model}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

