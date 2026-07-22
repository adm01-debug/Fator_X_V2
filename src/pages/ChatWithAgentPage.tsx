/**
 * ChatWithAgentPage — interface tipo WhatsApp para conversar com agentes.
 * Persistência local (localStorage) por agente, streaming via llm-gateway.
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

const STORAGE_PREFIX = 'nexus:chat:v1:';
const MAX_STORED = 50;

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

export default function ChatWithAgentPage() {
  const { agentId: routeAgentId } = useParams<{ agentId?: string }>();
  const navigate = useNavigate();
  const { data: rawAgents, isLoading } = useAgents();
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const { text: streamText, isStreaming, stream, cancel } = useStreamingResponse();

  // Auto-seleciona primeiro agente quando abre sem :agentId
  useEffect(() => {
    if (!activeId && agents.length > 0) {
      const first = agents[0].id;
      setActiveId(first);
      navigate(`/chat/${first}`, { replace: true });
    }
  }, [activeId, agents, navigate]);

  // Sincroniza URL <-> activeId
  useEffect(() => {
    if (routeAgentId && routeAgentId !== activeId) {
      setActiveId(routeAgentId);
    }
  }, [routeAgentId, activeId]);

  // Carrega histórico ao trocar de agente
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    setMessages(loadMessages(activeId));
  }, [activeId]);

  // Popula previews a partir do storage de cada agente
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

  // Auto scroll no fim
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, streamText, isStreaming]);

  const activeAgent = useMemo(() => agents.find((a) => a.id === activeId) ?? null, [agents, activeId]);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    navigate(`/chat/${id}`);
  }, [navigate]);

  const handleSend = useCallback(async (text: string) => {
    if (!activeAgent) return;
    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text, timestamp: Date.now() };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    saveMessages(activeAgent.id, nextMsgs);
    setPreviews((p) => ({ ...p, [activeAgent.id]: { lastMessage: text.slice(0, 80), lastAt: userMsg.timestamp, unread: 0 } }));

    const payload = {
      model: activeAgent.model ?? 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: `Você é ${activeAgent.name}. ${activeAgent.mission ?? ''}`.trim() },
        ...nextMsgs.map((m) => ({ role: m.role, content: m.content })),
      ],
      agent_id: activeAgent.id,
      temperature: 0.7,
      max_tokens: 1024,
    };

    await stream('/functions/v1/llm-gateway', payload, {
      onComplete: (fullText) => {
        const assistantMsg: ChatMessage = { id: newId(), role: 'assistant', content: fullText, timestamp: Date.now() };
        setMessages((prev) => {
          const updated = [...prev.map((m) => m.id === userMsg.id ? { ...m, delivered: true, read: true } : m), assistantMsg];
          saveMessages(activeAgent.id, updated);
          setPreviews((p) => ({ ...p, [activeAgent.id]: { lastMessage: fullText.slice(0, 80), lastAt: assistantMsg.timestamp, unread: 0 } }));
          return updated;
        });
      },
      onError: (err) => {
        toast.error(`Falha ao responder: ${err}`);
      },
    });
  }, [activeAgent, messages, stream]);

  const handleClear = useCallback(() => {
    if (!activeAgent) return;
    if (!confirm('Limpar toda a conversa com este agente?')) return;
    localStorage.removeItem(storageKey(activeAgent.id));
    setMessages([]);
    setPreviews((p) => ({ ...p, [activeAgent.id]: { lastMessage: undefined, lastAt: undefined, unread: 0 } }));
    toast.success('Conversa limpa.');
  }, [activeAgent]);

  const handleExport = useCallback(() => {
    if (!activeAgent) return;
    const lines = messages.map((m) => `[${new Date(m.timestamp).toLocaleString('pt-BR')}] ${m.role === 'user' ? 'Você' : activeAgent.name}: ${m.content}`);
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversa-${activeAgent.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeAgent, messages]);

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Conversar com Agentes"
        description="Envie mensagens diretas aos seus agentes com respostas em tempo real."
      />

      <div className="h-[calc(100vh-14rem)] min-h-[520px] rounded-2xl overflow-hidden border border-border/60 bg-card/30 backdrop-blur-sm shadow-lg flex">
        {/* Lista de agentes — some no mobile quando há conversa aberta */}
        <div className={activeAgent ? 'hidden md:flex' : 'flex flex-1 md:flex-none'}>
          <AgentListPane
            agents={agents}
            loading={isLoading}
            activeId={activeId}
            onSelect={handleSelect}
            previews={previews}
          />
        </div>

        {/* Painel de conversa */}
        <section className="flex-1 flex flex-col relative min-w-0">
          {activeAgent ? (
            <>
              <ChatHeader
                agent={activeAgent}
                onBack={() => { setActiveId(null); navigate('/chat'); }}
                onClear={handleClear}
                onOpenDetails={() => navigate(`/agents/${activeAgent.id}`)}
                onExport={handleExport}
              />

              <div className="flex-1 relative overflow-hidden">
                <ChatBackground />
                <ScrollArea className="h-full">
                  <div
                    ref={scrollRef}
                    role="log"
                    aria-live="polite"
                    aria-label={`Conversa com ${activeAgent.name}`}
                    className="relative flex flex-col gap-2.5 px-4 py-4 md:px-6"
                  >
                    {messages.length === 0 && !isStreaming ? (
                      <div className="mx-auto my-8 max-w-md rounded-xl bg-muted/50 backdrop-blur-sm border border-border/50 px-4 py-3 text-center text-body-sm text-muted-foreground">
                        Diga olá para <span className="text-foreground font-medium">{activeAgent.name}</span> ✨
                      </div>
                    ) : (
                      messages.map((m) => <MessageBubble key={m.id} message={m} />)
                    )}

                    {isStreaming && (
                      streamText ? (
                        <MessageBubble
                          message={{ id: 'streaming', role: 'assistant', content: streamText, timestamp: Date.now() }}
                          streaming
                        />
                      ) : (
                        <div className="flex justify-start"><TypingIndicator /></div>
                      )
                    )}
                  </div>
                </ScrollArea>
              </div>

              <ChatComposer
                disabled={!activeAgent}
                streaming={isStreaming}
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
    </div>
  );
}
