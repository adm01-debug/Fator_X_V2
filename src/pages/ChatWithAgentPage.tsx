/**
 * ChatWithAgentPage — interface tipo WhatsApp para conversar com agentes.
 * Persistência em nuvem (chat_threads/chat_messages, RLS por dono), com:
 *  - histórico multi-dispositivo e sem teto de 50 mensagens
 *  - migração única e idempotente do histórico legado em localStorage
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
import {
  AgentListPane,
  type ChatAgentSummary,
  type ConversationPreview,
} from '@/components/chat/AgentListPane';
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
import { buildEdgeUrl } from '@/lib/edgeUrl';
import {
  appendMessage,
  clearThread,
  deleteMessagesAfter,
  fetchMessages,
  fetchThreadPreviews,
  getOrCreateThread,
  markMessageFailed,
  migrateLegacyLocalHistory,
} from '@/services/chatThreadService';

const TYPING_DELAY_MS = 400;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
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

  const agents = useMemo<ChatAgentSummary[]>(
    () =>
      (rawAgents ?? []).map((a) => ({
        id: a.id,
        name: a.name ?? 'Agente',
        avatar_emoji: a.avatar_emoji,
        status: a.status,
        mission: a.mission,
        updated_at: a.updated_at,
        model: a.model,
      })),
    [rawAgents],
  );

  const [activeId, setActiveId] = useState<string | null>(routeAgentId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [previews, setPreviews] = useState<Record<string, ConversationPreview>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [threadId, setThreadId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(activeId);
  activeIdRef.current = activeId;
  /** Último id persistido da thread ativa — vira o `parent_id` da próxima mensagem. */
  const lastPersistedIdRef = useRef<string | null>(null);

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

  // Ao trocar de agente: cancela stream em curso e recarrega histórico da nuvem.
  // `cancelled` protege contra troca rápida de agente enquanto o fetch está no ar.
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setThreadId(null);
      lastPersistedIdRef.current = null;
      return;
    }
    if (isStreaming) cancel();
    setMessages([]);
    setThreadId(null);
    lastPersistedIdRef.current = null;

    let cancelled = false;
    void (async () => {
      const thread = await getOrCreateThread(activeId);
      if (cancelled || activeIdRef.current !== activeId) return;
      if (!thread) {
        toast.error('Não foi possível abrir a conversa.');
        return;
      }
      setThreadId(thread.id);
      const history = await fetchMessages(thread.id);
      if (cancelled || activeIdRef.current !== activeId) return;
      setMessages(history);
      lastPersistedIdRef.current = history.length ? history[history.length - 1].id : null;
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Migra histórico legado do localStorage e popula as prévias da lista lateral.
  useEffect(() => {
    if (!agents.length) return;
    let cancelled = false;
    void (async () => {
      const imported = await migrateLegacyLocalHistory(agents.map((a) => a.id));
      if (cancelled) return;
      if (imported > 0) {
        toast.success(`${imported} mensagens do histórico local migradas para a nuvem.`);
      }
      const previewMap = await fetchThreadPreviews();
      if (cancelled) return;
      const map: Record<string, ConversationPreview> = {};
      for (const [agentId, p] of Object.entries(previewMap)) {
        map[agentId] = { lastMessage: p.lastMessage, lastAt: p.lastAt, unread: 0 };
      }
      setPreviews(map);
    })();
    return () => {
      cancelled = true;
    };
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
    const el = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]',
    ) as HTMLElement | null;
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
    if (!isStreaming) {
      setShowTyping(false);
      return;
    }
    if (streamText) {
      setShowTyping(false);
      return;
    }
    const t = setTimeout(() => setShowTyping(true), TYPING_DELAY_MS);
    return () => clearTimeout(t);
  }, [isStreaming, streamText]);

  const activeAgent = useMemo(
    () => agents.find((a) => a.id === activeId) ?? null,
    [agents, activeId],
  );

  const handleSelect = useCallback(
    (id: string) => {
      setActiveId(id);
      navigate(`/chat/${id}`);
    },
    [navigate],
  );

  const runStream = useCallback(
    async (
      agent: ChatAgentSummary,
      activeThreadId: string,
      nextMsgs: ChatMessage[],
      userMsg: ChatMessage,
    ) => {
      const payload = {
        model: agent.model ?? 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: `Você é ${agent.name}. ${agent.mission ?? ''}`.trim() },
          ...nextMsgs.filter((m) => !m.failed).map((m) => ({ role: m.role, content: m.content })),
        ],
        agent_id: agent.id,
        // O gateway só grava o ciclo de vida em `sessions`/`session_traces` quando
        // recebe `session_id` (o `user_id` ele extrai do JWT). Sem isto, todo o
        // tráfego de /chat ficava invisível para a observabilidade. A thread
        // persistida é o identificador natural e estável desta conversa.
        session_id: activeThreadId,
        temperature: 0.7,
        max_tokens: 1024,
      };

      const startedAt = Date.now();

      await stream(buildEdgeUrl('llm-gateway'), payload, {
        onComplete: (fullText) => {
          // Descarta se o usuário trocou de agente durante o stream
          if (activeIdRef.current !== agent.id) return;
          const timestamp = Date.now();
          const tempId = newId();
          setMessages((prev) => [
            ...prev.map((m) =>
              m.id === userMsg.id ? { ...m, delivered: true, read: true, failed: false } : m,
            ),
            { id: tempId, role: 'assistant', content: fullText, timestamp },
          ]);
          setPreviews((p) => ({
            ...p,
            [agent.id]: { lastMessage: fullText.slice(0, 80), lastAt: timestamp, unread: 0 },
          }));

          // Persiste fora do reducer: efeitos colaterais dentro de setState
          // rodam duas vezes em StrictMode e duplicariam a linha no banco.
          void (async () => {
            const persistedId = await appendMessage({
              threadId: activeThreadId,
              parentId: lastPersistedIdRef.current,
              role: 'assistant',
              content: fullText,
              model: agent.model ?? null,
              latencyMs: timestamp - startedAt,
            });
            if (!persistedId) return;
            lastPersistedIdRef.current = persistedId;
            setMessages((prev) =>
              prev.map((m) => (m.id === tempId ? { ...m, id: persistedId } : m)),
            );
          })();
        },
        onError: (err) => {
          toast.error(`Falha ao responder: ${err}`);
          setMessages((prev) =>
            prev.map((m) => (m.id === userMsg.id ? { ...m, failed: true } : m)),
          );
          void markMessageFailed(userMsg.id, true);
        },
      });
    },
    [stream],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!activeAgent) return;
      if (!online) {
        toast.error('Sem conexão.');
        return;
      }
      if (!threadId) {
        toast.error('Conversa ainda carregando, tente novamente.');
        return;
      }

      const timestamp = Date.now();
      const tempId = newId();
      const optimistic: ChatMessage = { id: tempId, role: 'user', content: text, timestamp };
      setMessages((prev) => [...prev, optimistic]);
      setPreviews((p) => ({
        ...p,
        [activeAgent.id]: { lastMessage: text.slice(0, 80), lastAt: timestamp, unread: 0 },
      }));

      const persistedId = await appendMessage({
        threadId,
        parentId: lastPersistedIdRef.current,
        role: 'user',
        content: text,
      });

      // Troca o id otimista pelo id real para que o retry e o encadeamento
      // de `parent_id` apontem para a linha que existe no banco.
      const userMsg: ChatMessage = { ...optimistic, id: persistedId ?? tempId };
      if (persistedId) {
        lastPersistedIdRef.current = persistedId;
        setMessages((prev) => prev.map((m) => (m.id === tempId ? userMsg : m)));
      }

      await runStream(activeAgent, threadId, [...messages, userMsg], userMsg);
    },
    [activeAgent, messages, online, runStream, threadId],
  );

  const handleRetry = useCallback(
    async (msgId: string) => {
      if (!activeAgent || isStreaming || !threadId) return;
      const target = messages.find((m) => m.id === msgId);
      if (!target || target.role !== 'user') return;

      // Descarta o que veio depois da mensagem alvo (respostas quebradas),
      // no estado local e no banco, antes de reexecutar o stream.
      const idx = messages.findIndex((m) => m.id === msgId);
      const upTo = messages
        .slice(0, idx + 1)
        .map((m) => (m.id === msgId ? { ...m, failed: false } : m));
      setMessages(upTo);
      lastPersistedIdRef.current = msgId;

      await deleteMessagesAfter(threadId, target.timestamp);
      await markMessageFailed(msgId, false);
      await runStream(activeAgent, threadId, upTo, { ...target, failed: false });
    },
    [activeAgent, isStreaming, messages, runStream, threadId],
  );

  const handleClear = useCallback(async () => {
    if (!activeAgent || !threadId) return;
    setMessages([]);
    lastPersistedIdRef.current = null;
    setPreviews((p) => ({
      ...p,
      [activeAgent.id]: { lastMessage: undefined, lastAt: undefined, unread: 0 },
    }));
    setConfirmClear(false);
    await clearThread(threadId);
    toast.success('Conversa limpa.');
  }, [activeAgent, threadId]);

  const exportAs = useCallback(
    (fmt: 'txt' | 'md' | 'json') => {
      if (!activeAgent) return;
      const stamp = Date.now();
      const safeName = activeAgent.name.replace(/\s+/g, '-').toLowerCase();
      let content = '';
      let mime = 'text/plain;charset=utf-8';
      if (fmt === 'json') {
        content = JSON.stringify(
          { agent: activeAgent.name, exported_at: new Date().toISOString(), messages },
          null,
          2,
        );
        mime = 'application/json';
      } else if (fmt === 'md') {
        const header = `# Conversa com ${activeAgent.name}\n\n_Exportado em ${new Date().toISOString()}_\n\n---\n\n`;
        content =
          header +
          messages
            .map(
              (m) =>
                `**${m.role === 'user' ? 'Você' : activeAgent.name}** — \`${new Date(m.timestamp).toISOString()}\`\n\n${m.content}\n`,
            )
            .join('\n---\n\n');
        mime = 'text/markdown;charset=utf-8';
      } else {
        content = messages
          .map(
            (m) =>
              `[${new Date(m.timestamp).toISOString()}] ${m.role === 'user' ? 'Você' : activeAgent.name}: ${m.content}`,
          )
          .join('\n\n');
      }
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversa-${safeName}-${stamp}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [activeAgent, messages],
  );

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
    const out: Array<{ type: 'sep'; ts: number; key: string } | { type: 'msg'; msg: ChatMessage }> =
      [];
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

      <div className="h-[calc(100vh-14rem)] min-h-[520px] rounded-2xl overflow-hidden border border-border/60 bg-card/30 backdrop-blur-sm shadow-nexus-lg flex">
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
                onBack={() => {
                  setActiveId(null);
                  navigate('/chat');
                }}
                onClear={() => setConfirmClear(true)}
                onOpenDetails={() => navigate(`/agents/${activeAgent.id}`)}
                onExport={(fmt) => exportAs(fmt ?? 'txt')}
                typing={isStreaming && !streamText && showTyping}
              />

              {/* Menu extra de exportação */}
              <div className="hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger />
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => exportAs('txt')}>
                      Exportar .txt
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => exportAs('md')}>
                      Exportar .md
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => exportAs('json')}>
                      Exportar .json
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex-1 relative overflow-hidden">
                <ChatBackground />
                <ScrollArea className="h-full" ref={scrollAreaRef}>
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
                        Diga olá para{' '}
                        <span className="text-foreground font-medium">{activeAgent.name}</span> ✨
                      </div>
                    ) : (
                      messagesWithSeparators.map((item) =>
                        item.type === 'sep' ? (
                          <DaySeparator key={item.key} timestamp={item.ts} />
                        ) : (
                          <MessageBubble
                            key={item.msg.id}
                            message={item.msg}
                            onRetry={handleRetry}
                          />
                        ),
                      )
                    )}

                    {isStreaming &&
                      (streamText ? (
                        <MessageBubble
                          message={{
                            id: 'streaming',
                            role: 'assistant',
                            content: streamText,
                            timestamp: Date.now(),
                          }}
                          streaming
                        />
                      ) : showTyping ? (
                        <div className="flex justify-start">
                          <TypingIndicator />
                        </div>
                      ) : null)}
                  </div>
                </ScrollArea>
                <ScrollToBottomButton
                  visible={!atBottom}
                  onClick={scrollToBottom}
                  unread={unreadCount}
                />
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
