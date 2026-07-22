/**
 * MessageBubble — balão de mensagem com cauda, Markdown e check duplo.
 * Design tokens Nexus (sem hardcode).
 */
import ReactMarkdown from 'react-markdown';
import { Check, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** true quando resposta do agente chegou após envio do user */
  delivered?: boolean;
  read?: boolean;
}

interface MessageBubbleProps {
  message: ChatMessage;
  streaming?: boolean;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message, streaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex w-full animate-fade-in',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'relative max-w-[78%] md:max-w-[65%] rounded-2xl px-3.5 py-2.5 shadow-sm',
          'text-body-sm leading-relaxed break-words',
          isUser
            ? 'bg-gradient-to-br from-primary to-nexus-purple text-primary-foreground rounded-br-sm'
            : 'bg-muted/85 backdrop-blur-sm border border-border/50 text-foreground rounded-bl-sm',
        )}
      >
        {/* Cauda do balão */}
        <span
          aria-hidden
          className={cn(
            'absolute bottom-0 h-3 w-3',
            isUser
              ? '-right-1 bg-nexus-purple [clip-path:polygon(0_0,100%_100%,0_100%)]'
              : '-left-1 bg-muted/85 border-l border-b border-border/50 [clip-path:polygon(100%_0,100%_100%,0_100%)]',
          )}
        />

        <div className={cn('prose prose-invert prose-sm max-w-none', 'prose-p:my-1 prose-pre:my-2 prose-code:text-body-sm')}>
          <ReactMarkdown>{message.content || (streaming ? '…' : '')}</ReactMarkdown>
          {streaming && <span className="inline-block ml-0.5 w-1.5 h-3.5 align-middle bg-current opacity-60 animate-pulse" />}
        </div>

        <div className={cn('mt-1 flex items-center gap-1 justify-end', isUser ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
          <span className="text-[10px] tabular-nums">{formatTime(message.timestamp)}</span>
          {isUser && (
            message.read ? (
              <CheckCheck className="h-3 w-3 text-nexus-cyan" aria-label="Lida" />
            ) : message.delivered ? (
              <CheckCheck className="h-3 w-3" aria-label="Entregue" />
            ) : (
              <Check className="h-3 w-3" aria-label="Enviada" />
            )
          )}
        </div>
      </div>
    </div>
  );
}
