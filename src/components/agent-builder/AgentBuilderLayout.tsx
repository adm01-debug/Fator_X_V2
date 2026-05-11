import { useNavigate } from 'react-router-dom';
import { useAgentBuilderStore } from '@/stores/agentBuilderStore';
import { TABS } from '@/data/agentBuilderData';
import { AgentPlayground } from './AgentPlayground';
import { TabNavigation } from './TabNavigation';
import { ReadinessBadge } from './ReadinessBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Save, Plus, Loader2, Check, History, Sparkles, FileClock, Bot } from 'lucide-react';
import { useEffect, useState } from 'react';
import { VersionDiffDialog } from '@/components/agents/VersionDiffDialog';
import { useAgentVersions } from '@/hooks/useAgentVersions';
import { ConversationalBuilder } from './ConversationalBuilder';
import { DraftVersionsDialog } from './DraftVersionsDialog';
import { listDraftVersions } from '@/services/agentDraftVersionsService';

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
    <div className="flex flex-col h-full min-h-0">
      {/* ═══ HEADER ═══ */}
      <header
        className="shrink-0 px-5 py-4 flex items-center justify-between border-b"
        style={{
          background: 'linear-gradient(180deg, hsl(var(--nexus-surface-1)) 0%, hsl(var(--background)) 100%)',
          borderColor: 'hsl(var(--nexus-border, var(--border)))',
        }}
      >
        <div className="flex items-center gap-5 min-w-0">
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => navigate('/agents')}>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15 group-hover:bg-primary/20 transition-colors">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-base font-extrabold tracking-tight text-foreground">
              Builder
            </h1>
          </div>
          <div className="h-4 w-px bg-border hidden lg:block" />
          <span className="text-[11px] text-muted-foreground hidden lg:block font-medium">
            Fator X Operations
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {agent.name && (
            <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
              {agent.avatar_emoji} {agent.name}
            </span>
          )}
          <Badge variant={statusInfo.variant} className="text-[11px]">
            {statusInfo.label}
          </Badge>

          <ReadinessBadge />

          {/* Save indicator */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-[80px] justify-end">
            {isSaving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : lastSaved ? (
              <>
                <Check className="h-3 w-3 text-nexus-emerald" />
                <span>Salvo {lastSaved}</span>
              </>
            ) : null}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => saveAgent()}
            disabled={!isDirty || isSaving}
            className={isDirty ? 'animate-pulse border-primary/50' : ''}
            aria-label="Salvar agente"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Salvar</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setConvOpen(true)}
            aria-label="Builder Conversacional"
            title="Montar agente conversando com IA"
            className="border-primary/40 text-primary hover:bg-primary/10"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">IA Builder</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setDraftsOpen(true)}
            aria-label="Rascunhos de versão"
            title="Snapshots locais (não persistidos)"
          >
            <FileClock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rascunhos</span>
            {draftsCount > 0 && (
              <span className="text-[10px] text-muted-foreground ml-0.5">{draftsCount}</span>
            )}
          </Button>

          {agent.id && versions.length >= 2 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHistoryOpen(true)}
              aria-label="Histórico de versões"
              title={`${versions.length} versões`}
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Histórico</span>
              <span className="text-[10px] text-muted-foreground ml-0.5">{versions.length}</span>
            </Button>
          )}

          <Button size="sm" onClick={() => resetAgent()} aria-label="Novo agente">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Novo</span>
          </Button>
        </div>
      </header>

      {/* ═══ TABS ═══ */}
      <TabNavigation />

      {/* ═══ CONTENT ═══ */}
      <main className="flex-1 overflow-y-auto bg-secondary/5">
        <div className="max-w-[1024px] mx-auto px-5 py-6 sm:px-6 sm:py-7">
          {children}
        </div>
      </main>

      {/* ═══ FOOTER NAV ═══ */}
      <footer
        className="shrink-0 sticky bottom-0 px-5 py-3 flex items-center justify-between border-t border-border bg-background"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={prevTab}
          disabled={isFirst}
          aria-label="Tab anterior"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Anterior</span>
        </Button>

        <span className="text-xs text-muted-foreground font-mono">
          {currentIndex + 1} / {TABS.length}
        </span>

        <Button
          size="sm"
          onClick={nextTab}
          disabled={isLast}
          className="nexus-gradient-bg text-primary-foreground hover:opacity-90"
          aria-label="Próxima tab"
        >
          <span className="hidden sm:inline">Próximo</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </footer>
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
