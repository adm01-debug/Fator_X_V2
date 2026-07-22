/**
 * ChatHeader — barra superior da conversa com avatar, status e ações.
 */
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Trash2, ExternalLink, Download, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatAgentSummary } from './AgentListPane';

interface ChatHeaderProps {
  agent: ChatAgentSummary;
  onBack?: () => void;
  onClear: () => void;
  onOpenDetails: () => void;
  onExport: () => void;
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function ChatHeader({ agent, onBack, onClear, onOpenDetails, onExport }: ChatHeaderProps) {
  const online = (agent.status ?? '').toLowerCase() === 'active' || (agent.status ?? '').toLowerCase() === 'published';

  return (
    <header className={cn(
      'flex items-center gap-3 px-4 py-3 border-b border-border/60',
      'bg-card/60 backdrop-blur-md',
    )}>
      {onBack && (
        <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden" aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}

      <div className="relative shrink-0">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-nexus-purple flex items-center justify-center text-primary-foreground font-semibold shadow-sm">
          {agent.avatar_emoji ? <span className="text-lg">{agent.avatar_emoji}</span> : initials(agent.name)}
        </div>
        {online && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-nexus-green border-2 border-card" aria-hidden />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h2 className="text-body-sm font-semibold truncate">{agent.name}</h2>
        <p className="text-meta text-muted-foreground truncate">
          {online ? <span className="text-nexus-green">● online</span> : <span>offline</span>}
          {agent.model ? <span className="ml-2 opacity-70">· {agent.model}</span> : null}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Mais opções">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={onOpenDetails}>
            <ExternalLink className="h-3.5 w-3.5 mr-2" /> Ver detalhes do agente
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onExport}>
            <Download className="h-3.5 w-3.5 mr-2" /> Exportar transcrição
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onClear} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Limpar conversa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
