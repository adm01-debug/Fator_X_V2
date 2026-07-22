/**
 * AgentListPane — lista estilo WhatsApp com busca debounced case-insensitive.
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, Bot, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDebounce } from '@/hooks/use-debounce';

export interface ChatAgentSummary {
  id: string;
  name: string;
  avatar_emoji?: string | null;
  status?: string | null;
  mission?: string | null;
  updated_at?: string | null;
  model?: string | null;
}

export interface ConversationPreview {
  lastMessage?: string;
  lastAt?: number;
  unread?: number;
}

interface AgentListPaneProps {
  agents: ChatAgentSummary[];
  loading?: boolean;
  activeId?: string | null;
  onSelect: (id: string) => void;
  previews: Record<string, ConversationPreview>;
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const idx = text.toLowerCase().indexOf(term);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/25 text-foreground rounded px-0.5">{text.slice(idx, idx + term.length)}</mark>
      {text.slice(idx + term.length)}
    </>
  );
}

export function AgentListPane({ agents, loading, activeId, onSelect, previews }: AgentListPaneProps) {
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q, 200);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = document.activeElement?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const term = debouncedQ.trim().toLowerCase();

  const filtered = useMemo(() => {
    const list = term
      ? agents.filter((a) => a.name.toLowerCase().includes(term) || (a.mission ?? '').toLowerCase().includes(term))
      : agents;
    return [...list].sort((a, b) => {
      const pa = previews[a.id]?.lastAt ?? new Date(a.updated_at ?? 0).getTime();
      const pb = previews[b.id]?.lastAt ?? new Date(b.updated_at ?? 0).getTime();
      return pb - pa;
    });
  }, [agents, term, previews]);

  function relTime(ts?: number | null): string {
    if (!ts) return '';
    try {
      return formatDistanceToNowStrict(new Date(ts), { addSuffix: false, locale: ptBR });
    } catch {
      return '';
    }
  }

  return (
    <aside className="flex flex-col border-r border-border/60 bg-card/40 backdrop-blur-sm w-full md:w-[320px] shrink-0">
      <div className="p-3 border-b border-border/60">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Buscar agente… (tecle "/")'
            className="pl-8 text-body-sm bg-muted/40 border-border/50 focus-visible:ring-primary/40"
            aria-label="Buscar agente"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-body-sm">Carregando…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-meta text-muted-foreground">
            <Bot className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Nenhum agente encontrado.
          </div>
        ) : (
          <ul role="listbox" aria-label="Agentes disponíveis" className="py-1">
            {filtered.map((a) => {
              const preview = previews[a.id];
              const active = a.id === activeId;
              const online = (a.status ?? '').toLowerCase() === 'active' || (a.status ?? '').toLowerCase() === 'published';
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => onSelect(a.id)}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 text-left',
                      'transition-colors border-l-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                      active ? 'bg-primary/10 border-l-primary' : 'border-l-transparent hover:bg-muted/50',
                    )}
                  >
                    <div className="relative shrink-0">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-nexus-purple flex items-center justify-center text-primary-foreground text-body-sm font-semibold shadow-sm">
                        {a.avatar_emoji ? <span className="text-lg">{a.avatar_emoji}</span> : initials(a.name)}
                      </div>
                      {online && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-nexus-green border-2 border-card" aria-label="Online" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn('font-medium text-body-sm truncate', active && 'text-primary')}>
                          {highlight(a.name, term)}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                          {relTime(preview?.lastAt ?? (a.updated_at ? new Date(a.updated_at).getTime() : null))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-meta text-muted-foreground truncate">
                          {preview?.lastMessage ?? a.mission ?? 'Toque para conversar'}
                        </p>
                        {preview?.unread ? (
                          <Badge className="h-4 min-w-4 rounded-full bg-nexus-green text-[10px] px-1.5 text-background">{preview.unread}</Badge>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </aside>
  );
}
