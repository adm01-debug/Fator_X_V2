/**
 * ChatComposer — textarea auto-resize, enviar/parar, atalhos de teclado.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip, Smile, Send, Square } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ChatComposerProps {
  disabled?: boolean;
  streaming?: boolean;
  onSend: (text: string) => void;
  onCancel?: () => void;
  placeholder?: string;
}

export function ChatComposer({ disabled, streaming, onSend, onCancel, placeholder = 'Digite uma mensagem…' }: ChatComposerProps) {
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
    if (!text || disabled || streaming) return;
    onSend(text);
    setValue('');
  }

  return (
    <div className="flex items-end gap-2 border-t border-border/60 bg-background/70 backdrop-blur-md p-3">
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
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Mensagem"
        className={cn(
          'flex-1 resize-none rounded-2xl bg-muted/50 border border-border/50',
          'px-3.5 py-2.5 text-body-sm text-foreground placeholder:text-muted-foreground',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus:border-primary/60',
          'transition-colors',
        )}
      />

      {streaming ? (
        <Button
          onClick={onCancel}
          variant="destructive"
          size="icon"
          className="shrink-0 rounded-full"
          aria-label="Parar geração"
        >
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          onClick={send}
          disabled={disabled || !value.trim()}
          size="icon"
          className="shrink-0 rounded-full bg-gradient-to-br from-primary to-nexus-purple hover:opacity-90"
          aria-label="Enviar mensagem"
        >
          <Send className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
