import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Star, Copy, Wand2, Download, Loader2, GitBranch, Zap, Activity, MessageSquare } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { AgentCardViewer } from './AgentCardViewer';
import { cn } from '@/lib/utils';
import { handleKeyboardClick } from "@/lib/a11y";

type AgentRow = Tables<'agents'>;

interface AgentCardProps {
  agent: AgentRow;
  isFav: boolean;
  isSelected: boolean;
  selectionMode: boolean;
  cloning: boolean;
  onNavigate: (id: string) => void;
  onToggleFav: (e: React.MouseEvent, id: string) => void;
  onClone: (e: React.MouseEvent, agent: AgentRow) => void;
  onAutoTag: (e: React.MouseEvent, agent: AgentRow) => void;
  onExport: (e: React.MouseEvent, agent: AgentRow) => void;
  onToggleSelect: (e: React.MouseEvent, id: string) => void;
}

export function AgentCard({
  agent, isFav, isSelected, selectionMode, cloning,
  onNavigate, onToggleFav, onClone, onAutoTag, onExport, onToggleSelect,
}: AgentCardProps) {
  const config = (agent.config as Record<string, unknown>) ?? {};
  const metrics = ((config.metrics as { calls?: number | string; accuracy?: number | string; latency?: number | string }) ?? { calls: 0, accuracy: 0, latency: 0 });

  return (
    <div role="button" tabIndex={0} onKeyDown={handleKeyboardClick}
      className={cn(
        "nexus-card nexus-card-interactive cursor-pointer group relative overflow-hidden flex flex-col transition-all duration-300",
        "bg-gradient-to-br from-card to-card/95 border-border/40 hover:border-primary/30",
        isSelected && "ring-2 ring-primary border-primary/40 bg-primary/[0.02]"
      )}
      onClick={() => selectionMode ? onToggleSelect({ stopPropagation: () => {} } as React.MouseEvent, agent.id) : onNavigate(agent.id)}
    >
      {/* Background patterns */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      
      <div role="button" tabIndex={0} onKeyDown={handleKeyboardClick} className={cn(
        "absolute top-3 left-3 z-10 transition-all duration-300",
        selectionMode ? "opacity-100 scale-100" : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"
      )} onClick={(e) => onToggleSelect(e, agent.id)}>
        <Checkbox checked={isSelected} className="h-4.5 w-4.5 rounded-md border-primary/30 data-[state=checked]:bg-primary" />
      </div>

      <div className={cn("flex items-start justify-between mb-4", selectionMode ? "ml-8" : "")}>
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/5 flex items-center justify-center text-2xl shadow-nexus-sm border border-primary/10 group-hover:shadow-nexus-md group-hover:scale-105 transition-all duration-300">
              {agent.avatar_emoji || '🤖'}
            </div>
            <span
              className={cn(
                "absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border-3 border-card",
                agent.status === 'production' || agent.status === 'monitoring' ? "bg-nexus-emerald animate-glow-pulse"
                : agent.status === 'deprecated' || agent.status === 'archived' ? "bg-destructive"
                : agent.status === 'draft' ? "bg-muted-foreground/40" : "bg-nexus-amber"
              )}
            />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-title-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">{agent.name}</h3>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-1.5 py-0 h-4 text-[9px] font-mono bg-primary/5 text-primary border-none">
                {agent.model?.split('-').slice(0, 2).join('-') || 'unknown'}
              </Badge>
              <span className="text-meta text-muted-foreground/60 font-medium uppercase tracking-wider">
                {(config.type as string) || agent.persona || 'Generalist'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <div role="button" tabIndex={0} onKeyDown={handleKeyboardClick} className="opacity-0 group-hover:opacity-100 transition-all" onClick={(e) => e.stopPropagation()}>
            <AgentCardViewer agentId={agent.id} agentName={agent.name} />
          </div>
          <button onClick={(e) => onExport(e, agent)} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-nexus-cyan hover:bg-nexus-cyan/10 opacity-0 group-hover:opacity-100 transition-all" title="Exportar JSON">
            <Download className="h-4 w-4" />
          </button>
          <button onClick={(e) => onAutoTag(e, agent)} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-nexus-purple hover:bg-nexus-purple/10 opacity-0 group-hover:opacity-100 transition-all" title="Auto-tag">
            <Wand2 className="h-4 w-4" />
          </button>
          <button onClick={(e) => onClone(e, agent)} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-secondary/50 opacity-0 group-hover:opacity-100 transition-all" disabled={cloning}>
            {cloning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
          </button>
          <button onClick={(e) => onToggleFav(e, agent.id)} className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center transition-all",
            isFav ? "text-nexus-amber" : "text-muted-foreground/30 opacity-0 group-hover:opacity-100",
            "hover:text-nexus-amber hover:bg-nexus-amber/10"
          )}>
            <Star className={cn("h-4 w-4", isFav && "fill-nexus-amber")} />
          </button>
        </div>
      </div>

      <p className="text-meta text-muted-foreground/80 line-clamp-2 mb-4 leading-relaxed min-h-[32px]">
        {agent.mission || 'Agente de inteligência autônoma orquestrado para alta performance no ecossistema Nexus.'}
      </p>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-2 mb-4 bg-muted/30 p-2.5 rounded-xl border border-border/30">
        <div className="flex flex-col items-center justify-center gap-1">
          <div className="flex items-center gap-1 text-muted-foreground/60">
            <MessageSquare className="h-3 w-3" />
            <span className="text-[9px] font-semibold uppercase tracking-tighter">Calls</span>
          </div>
          <span className="text-meta font-bold font-mono">{metrics.calls || '1.2k'}</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 border-x border-border/30">
          <div className="flex items-center gap-1 text-muted-foreground/60">
            <Activity className="h-3 w-3" />
            <span className="text-[9px] font-semibold uppercase tracking-tighter">Health</span>
          </div>
          <span className="text-meta font-bold font-mono text-nexus-emerald">{metrics.accuracy || '98'}%</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-1">
          <div className="flex items-center gap-1 text-muted-foreground/60">
            <Zap className="h-3 w-3" />
            <span className="text-[9px] font-semibold uppercase tracking-tighter">Lat</span>
          </div>
          <span className="text-meta font-bold font-mono">{metrics.latency || '240'}ms</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-auto pt-3 border-t border-border/20">
        <StatusBadge status={agent.status || 'draft'} />
        {(agent.tags ?? []).slice(0, 2).map(tag => (
          <Badge key={tag} variant="outline" className="text-meta h-5 bg-background/50 border-border/50 font-medium px-2 py-0">
            {tag}
          </Badge>
        ))}
        {(agent.tags ?? []).length > 2 && <span className="text-[9px] text-muted-foreground font-semibold">+{(agent.tags ?? []).length - 2}</span>}
        <div className="flex items-center gap-2 ml-auto text-meta text-muted-foreground font-mono font-medium">
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-muted/50">
            <GitBranch className="h-2.5 w-2.5" /> v{agent.version || 1}
          </div>
        </div>
      </div>
    </div>
  );
}
