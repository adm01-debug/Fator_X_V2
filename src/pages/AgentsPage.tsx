import { logger } from '@/lib/logger';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bot, Plus, Search, Filter, BookOpen, GitBranch, Activity,
  Download, Upload, Trash2, Archive, CheckSquare, X, Network,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAgents, cloneAgent, autoTagAgent } from "@/lib/agentService";
import { useAgents } from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { exportAgentToJSON, downloadJSON, importAgentFromJSON, readFileAsText } from "@/lib/agentExportImport";
import { bulkUpdateStatus, bulkDelete } from "@/lib/agentBulkActions";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AccessControl, DangerousActionDialog } from "@/components/rbac";
import { AgentCard } from "@/components/agents/AgentCard";
import { SharedEmptyState } from "@/components/shared/SharedEmptyState";
import { SkeletonLoader } from "@/components/shared/SkeletonLoader";
import { cn } from "@/lib/utils";



type AgentRow = Tables<"agents">;

const FAV_KEY = "nexus-fav-agents";
function getFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch (err) { logger.error("Operation failed:", err); return []; }
}
function toggleFavorite(id: string): string[] {
  const prev = getFavorites();
  const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
  try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

export default function AgentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [favorites, setFavorites] = useState<string[]>(getFavorites);
  const [cloning, setCloning] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectionMode = selectedIds.size > 0;

  // useAgents available for cross-component data sharing
  const { data: _allAgentsCache } = useAgents();

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents', statusFilter],
    queryFn: () => listAgents(statusFilter),
    enabled: !!user,
  });

  const handleToggleFav = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setFavorites(toggleFavorite(id));
  }, []);

  const handleClone = useCallback(async (e: React.MouseEvent, agent: AgentRow) => {
    e.stopPropagation();
    setCloning(agent.id);
    try {
      await cloneAgent(agent);
      toast.success('Agente clonado!');
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao clonar');
    } finally {
      setCloning(null);
    }
  }, [queryClient]);

  const handleAutoTag = useCallback(async (e: React.MouseEvent, agent: AgentRow) => {
    e.stopPropagation();
    try {
      const result = await autoTagAgent(agent);
      if (result.added === 0) { toast.info('Nenhuma tag nova detectada'); return; }
      toast.success(`${result.added} tags adicionadas automaticamente`);
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao auto-tag');
    }
  }, [queryClient]);

  const handleExport = useCallback((e: React.MouseEvent, agent: AgentRow) => {
    e.stopPropagation();
    const json = exportAgentToJSON(agent);
    const safeName = agent.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    downloadJSON(json, `agent_${safeName}.json`);
    toast.success(`"${agent.name}" exportado com sucesso`);
  }, []);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const id = await importAgentFromJSON(text);
      toast.success('Agente importado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      navigate(`/builder/${id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao importar');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [queryClient, navigate]);

  const toggleSelect = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map(a => a.id)));
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkArchive = useCallback(async () => {
    setBulkLoading(true);
    try {
      await bulkUpdateStatus(Array.from(selectedIds), 'archived');
      toast.success(`${selectedIds.size} agente(s) arquivado(s)`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro');
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, queryClient]);

  const handleBulkDelete = useCallback(async () => {
    setBulkLoading(true);
    try {
      await bulkDelete(Array.from(selectedIds));
      toast.success(`${selectedIds.size} agente(s) removido(s)`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro');
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, queryClient]);

  const handleBulkExport = useCallback(() => {
    const selected = agents.filter(a => selectedIds.has(a.id));
    selected.forEach(agent => {
      const json = exportAgentToJSON(agent);
      const safeName = agent.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      downloadJSON(json, `agent_${safeName}.json`);
    });
    toast.success(`${selected.length} agente(s) exportado(s)`);
  }, [selectedIds, agents]);

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.tags ?? []).some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const sorted = [...filtered].sort((a, b) => {
    const aFav = favorites.includes(a.id) ? 1 : 0;
    const bFav = favorites.includes(b.id) ? 1 : 0;
    if (aFav !== bFav) return bFav - aFav;
    return 0;
  });

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1440px] mx-auto animate-page-enter">
      {/* Header Elevated 10/10 */}
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-xl shadow-primary/5 mb-10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.04] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/[0.06] transition-colors duration-500" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/[0.03] rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-7">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-2xl shadow-primary/10 group-hover:scale-105 transition-transform duration-500">
              <Bot className="h-11 w-11 text-primary animate-float" />
            </div>
            <div className="space-y-1">
              <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-5xl">Agentes</h1>
              <p className="text-base text-muted-foreground max-w-xl font-medium leading-relaxed">
                Orquestre sua frota neural com precisão industrial. Gerencie, monitore e escale seus agentes autônomos.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AccessControl permission="agents.create">
              <Button variant="outline" size="lg" className="gap-2.5 h-12 px-6 rounded-2xl bg-background/50 border-border/50 hover:bg-background hover:border-primary/30 transition-all duration-300" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-5 w-5 text-muted-foreground" /> 
                <span className="font-bold">Importar</span>
              </Button>
            </AccessControl>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />

            
            <AccessControl permission="agents.create">
              <Button onClick={() => navigate('/agents/new')} className="nexus-gradient-bg text-primary-foreground gap-2.5 h-12 px-8 rounded-2xl shadow-xl shadow-primary/25 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 group">
                <Plus className="h-5 w-5 group-hover:rotate-90 transition-transform duration-300" /> 
                <span className="font-bold text-lg tracking-tight">Criar Agente</span>
              </Button>
            </AccessControl>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Conhecimento', icon: BookOpen, path: '/knowledge', color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Workflows', icon: GitBranch, path: '/workflows', color: 'text-purple-500', bg: 'bg-purple-500/10' },
          { label: 'Monitoramento', icon: Activity, path: '/monitoring', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Voz & Áudio', icon: Bot, path: '/voice-agents', color: 'text-orange-500', bg: 'bg-orange-500/10' },
          { label: 'Visão', icon: Search, path: '/vision', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
          { label: 'Templates', icon: BookOpen, path: '/agents/templates', color: 'text-pink-500', bg: 'bg-pink-500/10' },
          { label: 'Enxame (A2A)', icon: Network, path: '/agents/swarm', color: 'text-amber-500', bg: 'bg-amber-500/10' },
        ].map((action, i) => (
          <button
            key={i}
            onClick={() => navigate(action.path)}
            className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/40 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group text-left"
          >
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", action.bg)}>
              <action.icon className={cn("h-5 w-5", action.color)} />
            </div>
            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Bulk Actions Bar */}
      {selectionMode && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 animate-fade-in">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{selectedIds.size} selecionado(s)</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={selectAll}>Selecionar todos</Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={handleBulkExport} disabled={bulkLoading}>
            <Download className="h-3 w-3" /> Exportar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={handleBulkArchive} disabled={bulkLoading}>
            <Archive className="h-3 w-3" /> Arquivar
          </Button>
          <AccessControl permission="agents.delete">
            <DangerousActionDialog
              trigger={
                <Button variant="destructive" size="sm" className="gap-1.5 h-7 text-xs" disabled={bulkLoading}>
                  <Trash2 className="h-3 w-3" /> Excluir
                </Button>
              }
              title={`Excluir ${selectedIds.size} agente(s)`}
              description={<><p>Esta ação é irreversível.</p><p>Conversas e logs históricos ficarão órfãos.</p></>}
              action="bulk_delete"
              resourceType="agents"
              resourceName={`${selectedIds.size} agente(s)`}
              minReasonLength={15}
              requirePassword={true}
              confirmLabel="Excluir Permanentemente"
              metadata={{ count: selectedIds.size, ids: Array.from(selectedIds) }}
              onConfirm={async () => { await handleBulkDelete(); }}
            />
          </AccessControl>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearSelection}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          Sua Frota de Agentes
          <Badge variant="secondary" className="font-mono text-[10px]">{sorted.length}</Badge>
        </h2>
        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou tag..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 rounded-xl bg-card border-border shadow-sm focus:ring-primary" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-10 rounded-xl bg-card border-border shadow-sm">
              <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Filtrar Status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="configured">Configurado</SelectItem>
              <SelectItem value="testing">Testando</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="production">Produção</SelectItem>
              <SelectItem value="archived">Arquivado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <SkeletonLoader variant="card-grid" count={6} />

      ) : !user ? (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
          <div className="relative mb-6">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center border border-primary/10">
              <Bot className="h-10 w-10 text-primary" />
            </div>
          </div>
          <h2 className="text-lg font-heading font-semibold text-foreground mb-1">Faça login para ver seus agentes</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">Seus agentes são salvos na nuvem e vinculados à sua conta.</p>
          <Button onClick={() => navigate("/auth")} className="nexus-gradient-bg text-primary-foreground gap-2">Entrar</Button>
        </div>
      ) : sorted.length === 0 ? (
        <SharedEmptyState
          icon={search || statusFilter !== "all" ? Search : Bot}
          title={search || statusFilter !== "all" ? "Nenhum agente encontrado" : "Sua frota está vazia"}
          description={
            search || statusFilter !== "all" 
              ? "Tente ajustar os filtros ou o termo de busca para encontrar o que procura." 
              : "Comece sua jornada criando seu primeiro agente autônomo para automatizar processos complexos."
          }
          actionLabel="Criar Primeiro Agente"
          onAction={() => navigate('/agents/new')}
          secondaryActionLabel={search || statusFilter !== "all" ? "Limpar Filtros" : "Explorar Templates"}
          onSecondaryAction={() => {
            if (search || statusFilter !== "all") {
              setSearch("");
              setStatusFilter("all");
            } else {
              navigate('/agents/templates');
            }
          }}
        />

      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 stagger-children">
          {sorted.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isFav={favorites.includes(agent.id)}
              isSelected={selectedIds.has(agent.id)}
              selectionMode={selectionMode}
              cloning={cloning === agent.id}
              onToggleFav={handleToggleFav}
              onClone={handleClone}
              onAutoTag={handleAutoTag}
              onExport={handleExport}
              onToggleSelect={toggleSelect}
              onNavigate={() => navigate(`/builder/${agent.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
