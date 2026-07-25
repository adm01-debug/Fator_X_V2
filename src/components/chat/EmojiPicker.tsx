/**
 * EmojiPicker — grid leve, sem dependências, com categorias e busca simples.
 */
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Smile } from 'lucide-react';

const CATEGORIES: Record<string, string[]> = {
  Rostos: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤗','🤔','🤨','😐','😑','😶','🙄','😏','😴','🤤','😪','😌','🤯','🥳'],
  Gestos: ['👍','👎','👌','✌️','🤞','🤝','🙏','👏','🙌','👐','🤲','💪','🫰','🤟','🤘','👋','🫶','✊','👊','🖖'],
  Coração: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝'],
  Objetos: ['✨','⚡','🔥','💯','🎉','🎊','🎁','🏆','🥇','⭐','🌟','💡','🔔','📌','📎','🔗','💬','💭','🧠','🚀','🛠️','⚙️','🔧','🔨','🧩','📊','📈','📉','💰','💸'],
  Símbolos: ['✅','☑️','✔️','❌','⛔','⚠️','🚫','❓','❗','‼️','⁉️','💤','♻️','🔒','🔓','🔑','🎯','🧭','🕐','⏰'],
};

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  disabled?: boolean;
}

export function EmojiPicker({ onPick, disabled }: EmojiPickerProps) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!q.trim()) return CATEGORIES;
    // Busca simples: se o termo é 1+ char, filtra por igualdade textual do emoji
    const term = q.trim().toLowerCase();
    const result: Record<string, string[]> = {};
    for (const [cat, list] of Object.entries(CATEGORIES)) {
      const hit = list.filter((e) => e.includes(term) || cat.toLowerCase().includes(term));
      if (hit.length) result[cat] = hit;
    }
    return result;
  }, [q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0" aria-label="Escolher emoji" disabled={disabled}>
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar categoria…"
          className="h-8 text-body-sm mb-2"
          aria-label="Buscar emoji"
        />
        <ScrollArea className="h-56">
          <div className="space-y-3 pr-2">
            {Object.entries(filtered).map(([cat, list]) => (
              <div key={cat}>
                <p className="text-meta uppercase tracking-wide text-muted-foreground mb-1 px-0.5">{cat}</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {list.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => { onPick(e); setOpen(false); }}
                      className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-title-sm leading-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                      aria-label={`Inserir ${e}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
