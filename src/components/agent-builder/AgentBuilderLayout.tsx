import { useNavigate } from 'react-router-dom';
import { useAgentBuilderStore } from '@/stores/agentBuilderStore';
import { TABS } from '@/data/agentBuilderData';
import { AgentPlayground } from './AgentPlayground';
import { TabNavigation } from './TabNavigation';
import { ReadinessBadge } from './ReadinessBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Save, Plus, Loader2, History, Sparkles, FileClock, Bot } from 'lucide-react';
import { useEffect, useState } from 'react';
import { VersionDiffDialog } from '@/components/agents/VersionDiffDialog';
import { useAgentVersions } from '@/hooks/useAgentVersions';
import { ConversationalBuilder } from './ConversationalBuilder';
import { DraftVersionsDialog } from './DraftVersionsDialog';
import { listDraftVersions } from '@/services/agentDraftVersionsService';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  configured: { label: 'Configurado', variant: 'outline' },
  testing: { label: 'Testando', variant: 'outline' },
  staging: { label: 'Staging', variant: 'outline' },
  review: { label: 'Em Revisão', variant: 'outline' },
  production: { label: 'Produção', variant: 'default' },
  monitoring: { label: 'Monitorando', variant: 'default' },
  deprecated: { label: 'Deprecado', variant: 'destructive' },
  archived: { label: 'Arquivado', variant: 'secondary' },
};

interface AgentBuilderLayoutProps {
  children: React.ReactNode;
}

export function AgentBuilderLayout({ children }: AgentBuilderLayoutProps) {
  const navigate = useNavigate();
  const { agent, activeTab, isDirty, isSaving, lastSaved, saveAgent, resetAgent, nextTab, prevTab } =
    useAgentBuilderStore();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [convOpen, setConvOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftsCount, setDraftsCount] = useState(0);
  const { data: versions = [] } = useAgentVersions(agent.id as string | undefined);

  useEffect(() => {
    setDraftsCount(listDraftVersions(agent.id as string | undefined).length);
  }, [agent.id, draftsOpen]);

  const currentIndex = TABS.findIndex((t) => t.id === activeTab);
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === TABS.length - 1;
  const statusInfo = STATUS_LABELS[agent.status] ?? STATUS_LABELS.draft;

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* ═══ HEADER ELEVADO 10/10 ═══ */}
      <header
        className="shrink-0 px-6 py-4 flex items-center justify-between border-b relative z-30"
        style={{
          background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)',
          borderColor: 'hsl(var(--border) / 0.4)',
        }}
      >
        <div className="flex items-center gap-6 min-w-0">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => navigate('/agents')}>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-primary/10">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-title-sm font-black tracking-tight text-foreground leading-none">
                Agent Forge
              </h1>
              <span className="text-meta text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
                Nexus Industrial
              </span>
            </div>
          </div>
          
          <div className="hidden lg:flex items-center gap-4 pl-4 border-l border-border/40">
            {agent.name && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary/30 border border-border/20 max-w-[200px]">
                <span className="text-title-sm leading-none">{agent.avatar_emoji}</span>
                <span className="text-meta font-bold text-foreground truncate">{agent.name}</span>
              </div>
            )}
            <Badge variant={statusInfo.variant} className="text-meta font-black uppercase tracking-widest px-2.5 py-0.5 border-none shadow-sm">
              {statusInfo.label}
            </Badge>
            <ReadinessBadge />
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Status dinâmico de salvamento */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-background/50 border border-border/30 mr-2 min-w-[120px] justify-center">
            {isSaving ? (
              <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-300">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                <span className="text-meta font-bold text-primary uppercase tracking-tighter">Sincronizando...</span>
              </div>
            ) : lastSaved ? (
              <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-300">
                <div className="h-1.5 w-1.5 rounded-full bg-nexus-emerald shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-meta font-bold text-muted-foreground uppercase tracking-tighter">Salvo {lastSaved}</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 bg-secondary/20 p-1 rounded-2xl border border-border/40">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => saveAgent()}
              disabled={!isDirty || isSaving}
              className={cn(
                "h-9 px-4 rounded-xl font-bold text-meta gap-2 transition-all duration-300",
                isDirty ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-105" : "text-muted-foreground"
              )}
            >
              <Save className="h-4 w-4" />
              <span className="hidden xl:inline">Salvar</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConvOpen(true)}
              className="h-9 px-4 rounded-xl font-bold text-meta gap-2 text-primary hover:bg-primary/10 transition-all"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden xl:inline">IA Forge</span>
            </Button>

            <div className="w-px h-4 bg-border/40 mx-1" />

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDraftsOpen(true)}
              className="h-9 w-9 xl:w-auto xl:px-4 rounded-xl font-bold text-meta gap-2 text-muted-foreground hover:bg-secondary/50 p-0"
            >
              <FileClock className="h-4 w-4" />
              <span className="hidden xl:inline">Drafts</span>
              {draftsCount > 0 && (
                <Badge className="h-4 min-w-[16px] px-1 bg-primary/20 text-primary border-none text-[9px] font-black">{draftsCount}</Badge>
              )}
            </Button>

            {agent.id && versions.length >= 2 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setHistoryOpen(true)}
                className="h-9 w-9 xl:w-auto xl:px-4 rounded-xl font-bold text-meta gap-2 text-muted-foreground hover:bg-secondary/50 p-0"
              >
                <History className="h-4 w-4" />
                <span className="hidden xl:inline">Versões</span>
                <Badge className="h-4 min-w-[16px] px-1 bg-muted text-muted-foreground border-none text-[9px] font-black">{versions.length}</Badge>
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => resetAgent()}
              className="h-9 w-9 xl:w-auto xl:px-4 rounded-xl font-bold text-meta gap-2 text-muted-foreground hover:bg-secondary/50 p-0"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden xl:inline">Novo</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ═══ NAVEGAÇÃO DE ABAS REFINADA ═══ */}
      <div className="bg-background/80 backdrop-blur-md border-b border-border/30 sticky top-0 z-20">
        <TabNavigation />
      </div>

      {/* ═══ ÁREA DE CONSTRUÇÃO ═══ */}
      <main className="flex-1 overflow-y-auto bg-gradient-to-b from-secondary/5 to-background">
        <div className="max-w-[1200px] mx-auto px-6 py-8 sm:px-8 sm:py-10">
          <div className="bg-card/30 border border-border/40 p-8 rounded-[2.5rem] shadow-sm relative overflow-hidden group/content">
             {/* Background glow for the content area */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
            {children}
          </div>
        </div>
      </main>

      {/* ═══ FOOTER DE ORQUESTRAÇÃO ═══ */}
      <footer
        className="shrink-0 px-8 py-4 flex items-center justify-between border-t border-border/40 bg-card/80 backdrop-blur-lg relative z-30"
      >
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="lg"
            onClick={prevTab}
            disabled={isFirst}
            className="h-12 px-6 rounded-2xl border-border/40 font-bold hover:bg-secondary/50 transition-all disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5 mr-2" />
            Anterior
          </Button>
          
          <div className="hidden sm:flex items-center gap-1">
            {TABS.map((_, i) => (
              <div 
                key={i} 
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === currentIndex ? "w-8 bg-primary" : i < currentIndex ? "w-2 bg-primary/40" : "w-2 bg-border"
                )} 
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-meta font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-0.5">Módulo</span>
          <span className="text-body-sm font-bold text-foreground font-mono">
            {String(currentIndex + 1).padStart(2, '0')} <span className="text-muted-foreground mx-1">/</span> {String(TABS.length).padStart(2, '0')}
          </span>
        </div>

        <Button
          size="lg"
          onClick={nextTab}
          disabled={isLast}
          className="h-12 px-8 rounded-2xl nexus-gradient-bg text-primary-foreground font-bold shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Próximo Passo
          <ChevronRight className="h-5 w-5 ml-2" />
        </Button>
      </footer>
      
      {/* ═══ OVERLAYS ═══ */}
      <AgentPlayground />
      <VersionDiffDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        versions={versions as any}
        agentId={agent.id as string | undefined}
      />
      <ConversationalBuilder open={convOpen} onOpenChange={setConvOpen} />
      <DraftVersionsDialog open={draftsOpen} onOpenChange={setDraftsOpen} />
    </div>
  );
}
