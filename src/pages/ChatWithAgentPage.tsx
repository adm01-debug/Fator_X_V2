/**
 * ChatWithAgentPage — interface tipo WhatsApp para conversar com agentes.
 * Persistência local por agente, streaming via llm-gateway, com:
 *  - cancel-on-switch (evita resposta cair no agente errado)
 *  - retry inline em falhas
 *  - agrupamento por dia
 *  - atalhos Cmd/Ctrl+K (buscar), Cmd/Ctrl+L (limpar), Esc (voltar mobile)
 *  - offline detection
 *  - exports .txt / .md / .json com timestamps ISO
 *  - modo compacto ≥1440px
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAgents } from '@/hooks/use-data';
import { useStreamingResponse } from '@/hooks/useStreamingResponse';
import { AgentListPane, type ChatAgentSummary, type ConversationPreview } from '@/components/chat/AgentListPane';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatBackground } from '@/components/chat/ChatBackground';
import { MessageBubble, type ChatMessage } from '@/components/chat/MessageBubble';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { EmptyChatState } from '@/components/chat/EmptyChatState';
import { DaySeparator } from '@/components/chat/DaySeparator';
import { ClearChatDialog } from '@/components/chat/ClearChatDialog';
import { ScrollToBottomButton } from '@/components/chat/ScrollToBottomButton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { buildEdgeUrl } from '@/lib/edgeUrl';

const STORAGE_PREFIX = 'nexus:chat:v1:';
const MAX_STORED = 50;
const TYPING_DELAY_MS = 400;

function storageKey(agentId: string): string {
  return `${STORAGE_PREFIX}${agentId}`;
}

function loadMessages(agentId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(agentId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.warn('Falha ao ler histórico local do chat', err);
    return [];
  }
}

function saveMessages(agentId: string, msgs: ChatMessage[]): void {
  try {
    const trimmed = msgs.slice(-MAX_STORED);
    localStorage.setItem(storageKey(agentId), JSON.stringify(trimmed));
  } catch (err) {
    logger.warn('Falha ao persistir histórico local do chat', err);
  }
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export default function ChatWithAgentPage() {
  const { agentId: routeAgentId } = useParams<{ agentId?: string }>();
  const navigate = useNavigate();
  const { data: rawAgents, isLoading } = useAgents();
  const online = useOnline();

  const agents = useMemo<ChatAgentSummary[]>(() => (rawAgents ?? []).map((a) => ({
    id: a.id,
    name: a.name ?? 'Agente',
    avatar_emoji: a.avatar_emoji,
    status: a.status,
    mission: a.mission,
    updated_at: a.updated_at,
    model: a.model,
  })), [rawAgents]);

  const [activeId, setActiveId] = useState<string | null>(routeAgentId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [previews, setPreviews] = useState<Record<string, ConversationPreview>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(activeId);
  activeIdRef.current = activeId;

  const { text: streamText, isStreaming, stream, cancel } = useStreamingResponse();

  // Auto-seleciona primeiro agente
  useEffect(() => {
    if (!activeId && agents.length > 0) {
      const first = agents[0].id;
      setActiveId(first);
      navigate(`/chat/${first}`, { replace: true });
    }
  }, [activeId, agents, navigate]);

  // Sincroniza URL ↔ activeId
  useEffect(() => {
    if (routeAgentId && routeAgentId !== activeId) {
      setActiveId(routeAgentId);
    }
  }, [routeAgentId, activeId]);

  // Ao trocar de agente: cancela stream em curso e recarrega histórico
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    if (isStreaming) cancel();
    setMessages(loadMessages(activeId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Popula previews
  useEffect(() => {
    if (!agents.length) return;
    const map: Record<string, ConversationPreview> = {};
    for (const a of agents) {
      const msgs = loadMessages(a.id);
      const last = msgs[msgs.length - 1];
      if (last) map[a.id] = { lastMessage: last.content.slice(0, 80), lastAt: last.timestamp, unread: 0 };
    }
    setPreviews(map);
  }, [agents]);

  // Auto scroll (só se usuário já está no fim)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setUnreadCount(0);
    } else {
      setUnreadCount((c) => c + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Detecta se o usuário está próximo do fim para exibir FAB
  useEffect(() => {
    const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!el) return;
    function onScroll() {
      if (!el) return;
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      const near = dist < 80;
      setAtBottom(near);
      if (near) setUnreadCount(0);
    }
    el.addEventListener('scroll', onScroll);
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [activeId]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setUnreadCount(0);
  }, []);

  // Delay do "digitando…" para evitar flicker
  useEffect(() => {
    if (!isStreaming) { setShowTyping(false); return; }
    if (streamText) { setShowTyping(false); return; }
    const t = setTimeout(() => setShowTyping(true), TYPING_DELAY_MS);
    return () => clearTimeout(t);
  }, [isStreaming, streamText]);

  const activeAgent = useMemo(() => agents.find((a) => a.id === activeId) ?? null, [agents, activeId]);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    navigate(`/chat/${id}`);
  }, [navigate]);

  const runStream = useCallback(async (agent: ChatAgentSummary, nextMsgs: ChatMessage[], userMsg: ChatMessage) => {
    const payload = {
      model: agent.model ?? 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: `Você é ${agent.name}. ${agent.mission ?? ''}`.trim() },
        ...nextMsgs.filter((m) => !m.failed).map((m) => ({ role: m.role, content: m.content })),
      ],
      agent_id: agent.id,
      temperature: 0.7,
      max_tokens: 1024,
    };

    await stream(buildEdgeUrl('llm-gateway'), payload, {
      onComplete: (fullText) => {
        // Descarta se o usuário trocou de agente durante o stream
        if (activeIdRef.current !== agent.id) return;
        const assistantMsg: ChatMessage = { id: newId(), role: 'assistant', content: fullText, timestamp: Date.now() };
        setMessages((prev) => {
          const updated = [
            ...prev.map((m) => m.id === userMsg.id ? { ...m, delivered: true, read: true, failed: false } : m),
            assistantMsg,
          ];
          saveMessages(agent.id, updated);
          setPreviews((p) => ({ ...p, [agent.id]: { lastMessage: fullText.slice(0, 80), lastAt: assistantMsg.timestamp, unread: 0 } }));
          return updated;
        });
      },
      onError: (err) => {
        toast.error(`Falha ao responder: ${err}`);
        setMessages((prev) => {
          const updated = prev.map((m) => m.id === userMsg.id ? { ...m, failed: true } : m);
          saveMessages(agent.id, updated);
          return updated;
        });
      },
    });
  }, [stream]);

  const handleSend = useCallback(async (text: string) => {
    if (!activeAgent) return;
    if (!online) { toast.error('Sem conexão.'); return; }
    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text, timestamp: Date.now() };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    saveMessages(activeAgent.id, nextMsgs);
    setPreviews((p) => ({ ...p, [activeAgent.id]: { lastMessage: text.slice(0, 80), lastAt: userMsg.timestamp, unread: 0 } }));
    await runStream(activeAgent, nextMsgs, userMsg);
  }, [activeAgent, messages, online, runStream]);

  const handleRetry = useCallback(async (msgId: string) => {
    if (!activeAgent || isStreaming) return;
    const target = messages.find((m) => m.id === msgId);
    if (!target || target.role !== 'user') return;
    // Remove todas as msgs após a target (respostas quebradas)
    const idx = messages.findIndex((m) => m.id === msgId);
    const upTo = messages.slice(0, idx + 1).map((m) => m.id === msgId ? { ...m, failed: false } : m);
    setMessages(upTo);
    saveMessages(activeAgent.id, upTo);
    await runStream(activeAgent, upTo, target);
  }, [activeAgent, isStreaming, messages, runStream]);

  const handleClear = useCallback(() => {
    if (!activeAgent) return;
    localStorage.removeItem(storageKey(activeAgent.id));
    setMessages([]);
    setPreviews((p) => ({ ...p, [activeAgent.id]: { lastMessage: undefined, lastAt: undefined, unread: 0 } }));
    setConfirmClear(false);
    toast.success('Conversa limpa.');
  }, [activeAgent]);

  const exportAs = useCallback((fmt: 'txt' | 'md' | 'json') => {
    if (!activeAgent) return;
    const stamp = Date.now();
    const safeName = activeAgent.name.replace(/\s+/g, '-').toLowerCase();
    let content = '';
    let mime = 'text/plain;charset=utf-8';
    if (fmt === 'json') {
      content = JSON.stringify({ agent: activeAgent.name, exported_at: new Date().toISOString(), messages }, null, 2);
      mime = 'application/json';
    } else if (fmt === 'md') {
      const header = `# Conversa com ${activeAgent.name}\n\n_Exportado em ${new Date().toISOString()}_\n\n---\n\n`;
      content = header + messages.map((m) =>
        `**${m.role === 'user' ? 'Você' : activeAgent.name}** — \`${new Date(m.timestamp).toISOString()}\`\n\n${m.content}\n`,
      ).join('\n---\n\n');
      mime = 'text/markdown;charset=utf-8';
    } else {
      content = messages.map((m) =>
        `[${new Date(m.timestamp).toISOString()}] ${m.role === 'user' ? 'Você' : activeAgent.name}: ${m.content}`,
      ).join('\n\n');
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversa-${safeName}-${stamp}.${fmt}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeAgent, messages]);

  // Atalhos globais Cmd/Ctrl+L (limpar), Esc (voltar mobile)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'l' && activeAgent) {
        e.preventDefault();
        setConfirmClear(true);
      }
      if (e.key === 'Escape' && activeAgent && window.matchMedia('(max-width: 767px)').matches) {
        setActiveId(null);
        navigate('/chat');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeAgent, navigate]);

  // Agrupamento por dia
  const messagesWithSeparators = useMemo(() => {
    const out: Array<{ type: 'sep'; ts: number; key: string } | { type: 'msg'; msg: ChatMessage }> = [];
    let lastTs = 0;
    for (const m of messages) {
      if (!lastTs || !sameDay(lastTs, m.timestamp)) {
        out.push({ type: 'sep', ts: m.timestamp, key: `sep-${m.timestamp}` });
      }
      out.push({ type: 'msg', msg: m });
      lastTs = m.timestamp;
    }
    return out;
  }, [messages]);

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Conversar com Agentes"
        description="Envie mensagens diretas aos seus agentes com respostas em tempo real."
      />

      <div className="h-[calc(100vh-14rem)] min-h-[520px] rounded-2xl overflow-hidden border border-border/60 bg-card/30 backdrop-blur-sm shadow-lg flex">
        <div className={activeAgent ? 'hidden md:flex' : 'flex flex-1 md:flex-none'}>
          <AgentListPane
            agents={agents}
            loading={isLoading}
            activeId={activeId}
            onSelect={handleSelect}
            previews={previews}
          />
        </div>

        <section className="flex-1 flex flex-col relative min-w-0">
          {activeAgent ? (
            <>
              <ChatHeader
                agent={activeAgent}
                onBack={() => { setActiveId(null); navigate('/chat'); }}
                onClear={() => setConfirmClear(true)}
                onOpenDetails={() => navigate(`/agents/${activeAgent.id}`)}
                onExport={() => exportAs('txt')}
              />

              {/* Menu extra de exportação */}
              <div className="hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger />
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => exportAs('txt')}>Exportar .txt</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => exportAs('md')}>Exportar .md</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => exportAs('json')}>Exportar .json</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex-1 relative overflow-hidden">
                <ChatBackground />
                <ScrollArea className="h-full">
                  <div
                    ref={scrollRef}
                    role="log"
                    aria-live="polite"
                    aria-atomic="false"
                    aria-label={`Conversa com ${activeAgent.name}`}
                    className="relative flex flex-col gap-2.5 px-4 py-4 md:px-6 mx-auto w-full 2xl:max-w-[820px]"
                  >
                    {messages.length === 0 && !isStreaming ? (
                      <div className="mx-auto my-8 max-w-md rounded-xl bg-muted/50 backdrop-blur-sm border border-border/50 px-4 py-3 text-center text-body-sm text-muted-foreground">
                        Diga olá para <span className="text-foreground font-medium">{activeAgent.name}</span> ✨
                      </div>
                    ) : (
                      messagesWithSeparators.map((item) => item.type === 'sep'
                        ? <DaySeparator key={item.key} timestamp={item.ts} />
                        : <MessageBubble key={item.msg.id} message={item.msg} onRetry={handleRetry} />,
                      )
                    )}

                    {isStreaming && (
                      streamText ? (
                        <MessageBubble
                          message={{ id: 'streaming', role: 'assistant', content: streamText, timestamp: Date.now() }}
                          streaming
                        />
                      ) : showTyping ? (
                        <div className="flex justify-start"><TypingIndicator /></div>
                      ) : null
                    )}
                  </div>
                </ScrollArea>
              </div>

              <ChatComposer
                disabled={!activeAgent}
                streaming={isStreaming}
                offline={!online}
                onSend={handleSend}
                onCancel={cancel}
                placeholder={`Mensagem para ${activeAgent.name}…`}
              />
            </>
          ) : (
            <div className="flex-1 relative flex">
              <ChatBackground />
              <EmptyChatState />
            </div>
          )}
        </section>
      </div>

      {activeAgent && (
        <ClearChatDialog
          open={confirmClear}
          agentName={activeAgent.name}
          onOpenChange={setConfirmClear}
          onConfirm={handleClear}
        />
      )}
    </div>
  );
}
