/**
 * MessageBubble — balão com cauda, Markdown sanitizado, ações no hover e check duplo.
 */
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AlertCircle, Check, CheckCheck, Copy, FileText, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabaseExternal } from '@/integrations/supabase/externalClient';

export interface ChatAttachment {
  /** Nome original do arquivo, para exibição no balão. */
  name: string;
  /** Tamanho em bytes. */
  size: number;
  /** Tipo MIME declarado pelo navegador. */
  mime: string;
  /** Caminho no Storage (`{userId}/{uuid}.{ext}`). Presente após o upload. */
  storagePath?: string;
  /** URL assinada (temporária) para abrir o anexo — gerada sob demanda no clique. */
  url?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: ChatAttachment[];
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

  async function openAttachment(att: ChatAttachment) {
    if (!att.storagePath) return;
    if (att.url) {
      window.open(att.url, '_blank', 'noopener,noreferrer');
      return;
    }
    const { data, error } = await supabaseExternal.storage
      .from('chat-attachments')
      .createSignedUrl(att.storagePath, 3600);
    if (error || !data?.signedUrl) {
      toast.error('Não foi possível abrir o anexo.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

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

        <div
          className={cn(
            'prose prose-invert prose-sm max-w-none',
            'prose-p:my-1 prose-pre:my-2 prose-code:text-body-sm',
          )}
        >
          <ReactMarkdown skipHtml disallowedElements={MARKDOWN_DISALLOWED}>
            {message.content || (streaming ? '…' : '')}
          </ReactMarkdown>
          {streaming && (
            <span className="inline-block ml-0.5 w-1.5 h-3.5 align-middle bg-current opacity-60 animate-pulse" />
          )}
        </div>

        {(message.attachments?.length ?? 0) > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5" aria-label="Anexos">
            {message.attachments!.map((att, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => openAttachment(att)}
                  aria-label={`Abrir anexo ${att.name}`}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border border-border/50 px-2.5 py-1.5 text-left',
                    'bg-background/40 hover:bg-background/70 transition-colors',
                    isUser ? 'text-primary-foreground/90' : 'text-foreground',
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  <span className="flex-1 truncate text-meta font-medium">{att.name}</span>
                  <span className="text-meta opacity-70 tabular-nums">{formatBytes(att.size)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div
          className={cn(
            'mt-1 flex items-center gap-1 justify-end',
            isUser ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          <span className="text-meta tabular-nums">{formatTime(message.timestamp)}</span>
          {isUser &&
            !message.failed &&
            (message.read ? (
              <CheckCheck className="h-3 w-3 text-nexus-cyan" aria-label="Lida" />
            ) : message.delivered ? (
              <CheckCheck className="h-3 w-3" aria-label="Entregue" />
            ) : (
              <Check className="h-3 w-3" aria-label="Enviada" />
            ))}
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
