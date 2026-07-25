/**
 * MessageBubble — balão com cauda, Markdown sanitizado, ações no hover e check duplo.
 */
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, CheckCheck, Copy, RotateCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  delivered?: boolean;
  read?: boolean;
  failed?: boolean;
}

interface MessageBubbleProps {
  message: ChatMessage;
  streaming?: boolean;
  onRetry?: (id: string) => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const MARKDOWN_DISALLOWED = ['script', 'iframe', 'style', 'object', 'embed', 'link', 'meta'];

export function MessageBubble({ message, streaming, onRetry }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [hover, setHover] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success('Mensagem copiada.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={cn('flex w-full animate-fade-in group', isUser ? 'justify-end' : 'justify-start')}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="article"
      aria-label={`${isUser ? 'Sua mensagem' : 'Resposta do agente'} às ${formatTime(message.timestamp)}`}
    >
      <div
        className={cn(
          'relative max-w-[78%] md:max-w-[65%] rounded-2xl px-3.5 py-2.5 shadow-nexus-sm',
          'text-body-sm leading-relaxed break-words',
          isUser
            ? 'bg-gradient-to-br from-primary to-nexus-purple text-primary-foreground rounded-br-sm'
            : 'bg-muted/85 backdrop-blur-sm border border-border/50 text-foreground rounded-bl-sm',
          message.failed && 'ring-1 ring-destructive/60',
        )}
      >
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
          <ReactMarkdown skipHtml disallowedElements={MARKDOWN_DISALLOWED}>
            {message.content || (streaming ? '…' : '')}
          </ReactMarkdown>
          {streaming && <span className="inline-block ml-0.5 w-1.5 h-3.5 align-middle bg-current opacity-60 animate-pulse" />}
        </div>

        <div className={cn('mt-1 flex items-center gap-1 justify-end', isUser ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
          <span className="text-meta tabular-nums">{formatTime(message.timestamp)}</span>
          {isUser && !message.failed && (
            message.read ? (
              <CheckCheck className="h-3 w-3 text-nexus-cyan" aria-label="Lida" />
            ) : message.delivered ? (
              <CheckCheck className="h-3 w-3" aria-label="Entregue" />
            ) : (
              <Check className="h-3 w-3" aria-label="Enviada" />
            )
          )}
          {message.failed && (
            <AlertCircle className="h-3 w-3 text-destructive" aria-label="Falha ao entregar" />
          )}
        </div>

        {/* Ações no hover */}
        {(hover || message.failed) && !streaming && (
          <div
            className={cn(
              'absolute -top-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
              isUser ? 'right-2' : 'left-2',
              message.failed && 'opacity-100',
            )}
          >
            <button
              type="button"
              onClick={copy}
              aria-label="Copiar mensagem"
              className="h-6 w-6 flex items-center justify-center rounded-full bg-card border border-border/60 shadow-nexus-md hover:bg-muted"
            >
              <Copy className="h-3 w-3" />
            </button>
            {message.failed && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(message.id)}
                aria-label="Reenviar mensagem"
                className="h-6 w-6 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-nexus-md hover:opacity-90"
              >
                <RotateCw className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
