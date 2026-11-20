/**
 * ChatComposer — textarea auto-resize, emoji picker, contador de caracteres,
 * enviar/parar e suporte a offline.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Image, Paperclip, Send, Square, WifiOff, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { EmojiPicker } from './EmojiPicker';

const MAX_LEN = 4000;
const WARN_AT = 3600;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB (alinhado ao bucket)

export interface PendingAttachment {
  file: File;
  /** Id local para o <li key />. */
  key: string;
  status: 'pending' | 'uploading' | 'error';
}

interface ChatComposerProps {
  disabled?: boolean;
  streaming?: boolean;
  offline?: boolean;
  onSend: (text: string, attachments?: PendingAttachment[]) => void;
  onCancel?: () => void;
  placeholder?: string;
}

export function ChatComposer({
  disabled,
  streaming,
  offline,
  onSend,
  onCancel,
  placeholder = 'Digite uma mensagem…',
}: ChatComposerProps) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFiles(files: FileList | null) {
    if (!files || files.length === 0 || disabled || offline) return;
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.error(`Máximo de ${MAX_ATTACHMENTS} anexos por mensagem.`);
      return;
    }
    const room = MAX_ATTACHMENTS - attachments.length;
    const picked = Array.from(files).slice(0, room);
    const oversized = picked.filter((f) => f.size > MAX_ATTACHMENT_SIZE);
    if (oversized.length > 0) {
      toast.error(`Anexo acima de 25 MB: ${oversized.map((f) => f.name).join(', ')}.`);
    }
    const ok = picked.filter((f) => f.size <= MAX_ATTACHMENT_SIZE);
    if (ok.length === 0) return;
    setAttachments((prev) => [
      ...prev,
      ...ok.map((file) => ({
        file,
        key: `${Date.now()}-${file.name}-${file.size}`,
        status: 'pending' as const,
      })),
    ]);
  }

  function isImage(mime: string): boolean {
    return mime.startsWith('image/');
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [value]);

  function send() {
    const text = value.trim();
    if ((!text && attachments.length === 0) || disabled || streaming || offline) return;
    if (text.length > MAX_LEN) return;
    const files = attachments;
    onSend(text, files);
    setValue('');
    setAttachments([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  function insertEmoji(emoji: string) {
    const el = ref.current;
    if (!el) {
      setValue((v) => v + emoji);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    if (next.length > MAX_LEN) return;
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const isDisabled = disabled || offline;
  const len = value.length;
  const showCounter = len >= WARN_AT;
  const overLimit = len > MAX_LEN;

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
        <EmojiPicker onPick={insertEmoji} disabled={isDisabled} />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label="Anexar arquivo"
              disabled={isDisabled}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {attachments.length > 0 ? 'Adicionar mais anexos' : 'Anexar arquivo'}
          </TooltipContent>
        </Tooltip>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            pickFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {attachments.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 px-3 pb-1" aria-label="Anexos pendentes">
            {attachments.map((att) => (
              <li
                key={att.key}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 px-2 py-1',
                  att.status === 'error' && 'border-destructive/60 text-destructive',
                )}
              >
                {isImage(att.file.type) ? (
                  <Image className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                )}
                <span className="max-w-[160px] truncate text-meta">{att.file.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.key !== att.key))}
                  aria-label={`Remover anexo ${att.file.name}`}
                  className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-border/60 hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex-1 relative">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN + 200))}
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
            aria-invalid={overLimit || undefined}
            className={cn(
              'w-full resize-none rounded-2xl bg-muted/50 border border-border/50',
              'px-3.5 py-2.5 text-body-sm text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus:border-primary/60',
              'transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
              overLimit && 'border-destructive/70 focus:border-destructive',
            )}
          />
          {showCounter && (
            <span
              aria-live="polite"
              className={cn(
                'absolute -top-5 right-1 text-meta tabular-nums',
                overLimit ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {len}/{MAX_LEN}
            </span>
          )}
        </div>

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
            disabled={isDisabled || (!value.trim() && attachments.length === 0) || overLimit}
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
