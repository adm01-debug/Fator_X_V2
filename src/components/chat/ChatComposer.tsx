/**
 * ChatComposer — textarea auto-resize, enviar/parar, suporte a offline.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip, Smile, Send, Square, WifiOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ChatComposerProps {
  disabled?: boolean;
  streaming?: boolean;
  offline?: boolean;
  onSend: (text: string) => void;
  onCancel?: () => void;
  placeholder?: string;
}

export function ChatComposer({ disabled, streaming, offline, onSend, onCancel, placeholder = 'Digite uma mensagem…' }: ChatComposerProps) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [value]);

  function send() {
    const text = value.trim();
    if (!text || disabled || streaming || offline) return;
    onSend(text);
    setValue('');
  }

  const isDisabled = disabled || offline;

  return (
    <div className="border-t border-border/60 bg-background/70 backdrop-blur-md">
      {offline && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive text-meta border-b border-destructive/20"
        >
          <WifiOff className="h-3 w-3" />
          Você está offline. Reconecte-se para enviar mensagens.
        </div>
      )}
      <div className="flex items-end gap-2 p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="Emoji" disabled>
              <Smile className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Emojis (em breve)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="Anexar arquivo" disabled>
              <Paperclip className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Anexar (em breve)</TooltipContent>
        </Tooltip>

        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          disabled={isDisabled}
          placeholder={offline ? 'Sem conexão…' : placeholder}
          aria-label="Mensagem"
          className={cn(
            'flex-1 resize-none rounded-2xl bg-muted/50 border border-border/50',
            'px-3.5 py-2.5 text-body-sm text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus:border-primary/60',
            'transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
          )}
        />

        {streaming ? (
          <Button onClick={onCancel} variant="destructive" size="icon" className="shrink-0 rounded-full" aria-label="Parar geração">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={send}
            disabled={isDisabled || !value.trim()}
            size="icon"
            className="shrink-0 rounded-full bg-gradient-to-br from-primary to-nexus-purple hover:opacity-90"
            aria-label="Enviar mensagem"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
