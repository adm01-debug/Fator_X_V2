/**
 * ═══════════════════════════════════════════════════════════════
 * Nexus Agents Studio — Chat Thread Service
 * ═══════════════════════════════════════════════════════════════
 * Persistência de conversas do AgentTalk em Postgres.
 *
 * Contexto da mudança: até aqui o histórico vivia apenas em
 * `localStorage` (`nexus:chat:v1:<agentId>`), com teto de 50
 * mensagens, preso a um único navegador e invisível para trilha
 * de auditoria. Este serviço move o histórico para as tabelas
 * `chat_threads` / `chat_messages`, protegidas por RLS por dono.
 *
 * Decisões de projeto:
 *  - `parent_id` em `chat_messages` modela um DAG, não uma lista.
 *    Hoje escrevemos apenas o caminho linear (cada mensagem aponta
 *    para a anterior), mas o schema já suporta ramificação sem
 *    exigir nova migração.
 *  - Contadores (`message_count`, `last_message_at`) são mantidos
 *    por trigger no banco, evitando round-trip extra e divergência
 *    entre abas.
 *  - Todo IO é defensivo: falha de rede nunca derruba a UI, apenas
 *    degrada para o estado em memória.
 */
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import type { ChatMessage } from '@/components/chat/MessageBubble';

/** Chave legada do localStorage, usada apenas na migração única. */
const LEGACY_STORAGE_PREFIX = 'nexus:chat:v1:';
const LEGACY_MIGRATED_FLAG = 'nexus:chat:migrated:v2';

/** Teto de mensagens carregadas por thread (as mais recentes). */
export const MESSAGE_PAGE_SIZE = 200;

export interface ChatThread {
  id: string;
  agentId: string;
  title: string;
  lastMessageAt: number;
  messageCount: number;
}

/** Linha crua de `chat_messages` que este serviço consome. */
interface ChatMessageRow {
  id: string;
  role: string;
  content: string;
  failed: boolean;
  created_at: string;
}

function rowToMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    // A tabela aceita 'system', mas a UI só renderiza user/assistant.
    role: row.role === 'user' ? 'user' : 'assistant',
    content: row.content,
    timestamp: new Date(row.created_at).getTime(),
    failed: row.failed,
    delivered: !row.failed,
    read: !row.failed,
  };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabaseExternal.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Devolve a thread padrão do agente, criando-a se ainda não existir.
 *
 * Mantemos uma thread por agente para preservar a UX atual (a lista
 * lateral é de agentes, não de conversas). O schema, porém, já aceita
 * N threads por agente — quando a UI de múltiplas conversas chegar,
 * basta deixar de filtrar pela mais recente.
 */
export async function getOrCreateThread(agentId: string): Promise<ChatThread | null> {
  try {
    const userId = await currentUserId();
    if (!userId) return null;

    const { data: existing, error: selectError } = await supabaseExternal
      .from('chat_threads')
      .select('id, agent_id, title, last_message_at, message_count')
      .eq('agent_id', agentId)
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing) {
      return {
        id: existing.id,
        agentId: existing.agent_id,
        title: existing.title,
        lastMessageAt: new Date(existing.last_message_at).getTime(),
        messageCount: existing.message_count,
      };
    }

    const { data: created, error: insertError } = await supabaseExternal
      .from('chat_threads')
      .insert({ agent_id: agentId, user_id: userId })
      .select('id, agent_id, title, last_message_at, message_count')
      .single();

    if (insertError) throw insertError;

    return {
      id: created.id,
      agentId: created.agent_id,
      title: created.title,
      lastMessageAt: new Date(created.last_message_at).getTime(),
      messageCount: created.message_count,
    };
  } catch (err) {
    logger.warn('Falha ao resolver thread de chat', err);
    return null;
  }
}

/** Carrega as mensagens mais recentes de uma thread, em ordem cronológica. */
export async function fetchMessages(threadId: string): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabaseExternal
      .from('chat_messages')
      .select('id, role, content, failed, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);

    if (error) throw error;
    // Buscamos DESC para pegar as N mais recentes; a UI precisa ASC.
    return (data ?? []).map(rowToMessage).reverse();
  } catch (err) {
    logger.warn('Falha ao carregar mensagens do chat', err);
    return [];
  }
}

export interface AppendMessageInput {
  threadId: string;
  parentId?: string | null;
  role: 'user' | 'assistant';
  content: string;
  model?: string | null;
  latencyMs?: number | null;
  failed?: boolean;
}

/**
 * Grava uma mensagem e devolve o id persistido.
 *
 * O id do banco substitui o id otimista gerado no cliente, para que
 * `parent_id` da mensagem seguinte referencie uma linha real.
 */
export async function appendMessage(input: AppendMessageInput): Promise<string | null> {
  try {
    const { data, error } = await supabaseExternal
      .from('chat_messages')
      .insert({
        thread_id: input.threadId,
        parent_id: input.parentId ?? null,
        role: input.role,
        content: input.content,
        model: input.model ?? null,
        latency_ms: input.latencyMs ?? null,
        failed: input.failed ?? false,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  } catch (err) {
    logger.warn('Falha ao persistir mensagem do chat', err);
    return null;
  }
}

/** Marca uma mensagem como falha (ou limpa a marcação, no retry). */
export async function markMessageFailed(messageId: string, failed: boolean): Promise<void> {
  try {
    const { error } = await supabaseExternal
      .from('chat_messages')
      .update({ failed })
      .eq('id', messageId);
    if (error) throw error;
  } catch (err) {
    logger.warn('Falha ao atualizar status da mensagem', err);
  }
}

/**
 * Remove todas as mensagens posteriores a `messageId` (inclusive
 * respostas quebradas), preparando o terreno para um retry limpo.
 */
export async function deleteMessagesAfter(threadId: string, createdAtMs: number): Promise<void> {
  try {
    const { error } = await supabaseExternal
      .from('chat_messages')
      .delete()
      .eq('thread_id', threadId)
      .gt('created_at', new Date(createdAtMs).toISOString());
    if (error) throw error;
  } catch (err) {
    logger.warn('Falha ao limpar mensagens posteriores', err);
  }
}

/** Apaga o histórico de uma thread, mantendo a thread em si. */
export async function clearThread(threadId: string): Promise<void> {
  try {
    const { error } = await supabaseExternal
      .from('chat_messages')
      .delete()
      .eq('thread_id', threadId);
    if (error) throw error;
  } catch (err) {
    logger.warn('Falha ao limpar conversa', err);
  }
}

/** Prévia da última mensagem de cada agente, para a lista lateral. */
export async function fetchThreadPreviews(): Promise<
  Record<string, { lastMessage?: string; lastAt?: number }>
> {
  try {
    const userId = await currentUserId();
    if (!userId) return {};

    const { data: threads, error } = await supabaseExternal
      .from('chat_threads')
      .select('id, agent_id, last_message_at')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .gt('message_count', 0)
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!threads?.length) return {};

    // Uma consulta para as últimas mensagens de todas as threads visíveis,
    // em vez de N consultas — a lista lateral pode ter dezenas de agentes.
    const { data: messages, error: msgError } = await supabaseExternal
      .from('chat_messages')
      .select('thread_id, content, created_at')
      .in('thread_id', threads.map((t) => t.id))
      .order('created_at', { ascending: false })
      .limit(500);

    if (msgError) throw msgError;

    const latestByThread = new Map<string, { content: string; created_at: string }>();
    for (const m of messages ?? []) {
      if (!latestByThread.has(m.thread_id)) {
        latestByThread.set(m.thread_id, { content: m.content, created_at: m.created_at });
      }
    }

    const result: Record<string, { lastMessage?: string; lastAt?: number }> = {};
    for (const t of threads) {
      const last = latestByThread.get(t.id);
      if (!last) continue;
      result[t.agent_id] = {
        lastMessage: last.content.slice(0, 80),
        lastAt: new Date(last.created_at).getTime(),
      };
    }
    return result;
  } catch (err) {
    logger.warn('Falha ao carregar prévias de conversas', err);
    return {};
  }
}

/**
 * Migração única do histórico em `localStorage` para o banco.
 *
 * Executa no máximo uma vez por navegador (flag em localStorage) e
 * só importa threads ainda vazias, de forma que rodar duas vezes em
 * paralelo não duplica mensagens. Falhas são silenciosas: o pior
 * caso é o usuário perder um histórico local que já era efêmero.
 */
export async function migrateLegacyLocalHistory(agentIds: string[]): Promise<number> {
  if (typeof localStorage === 'undefined') return 0;
  if (localStorage.getItem(LEGACY_MIGRATED_FLAG) === '1') return 0;

  let imported = 0;
  try {
    for (const agentId of agentIds) {
      const raw = localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${agentId}`);
      if (!raw) continue;

      let legacy: ChatMessage[];
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) continue;
        legacy = parsed as ChatMessage[];
      } catch {
        continue;
      }
      if (legacy.length === 0) continue;

      const thread = await getOrCreateThread(agentId);
      // Só importa se a thread ainda não tem conteúdo — evita duplicar
      // quando o usuário já conversou em outro dispositivo.
      if (!thread || thread.messageCount > 0) continue;

      let parentId: string | null = null;
      for (const msg of legacy) {
        if (typeof msg?.content !== 'string' || !msg.content) continue;
        const id = await appendMessage({
          threadId: thread.id,
          parentId,
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
          failed: Boolean(msg.failed),
        });
        if (!id) break;
        parentId = id;
        imported += 1;
      }
    }
    localStorage.setItem(LEGACY_MIGRATED_FLAG, '1');
  } catch (err) {
    logger.warn('Falha na migração do histórico local do chat', err);
  }
  return imported;
}
